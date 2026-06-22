// =============================================================================
// Domain.AgentBridge.gs — SGA
// Ponte agentes (Sonnet/Opus) <-> Apps Script via JSON no Drive (sem webhook).
//
// Por que existe:
//   Webhook POST anonimo no Apps Script Web App tem sido bloqueado pelo Google
//   ("Page not found" em qualquer POST). Em vez de lidar com OAuth/setup GCP,
//   usamos o Drive (que ja esta sincronizado na maquina dos agentes) como fila.
//
// Como funciona:
//   1. Agente escreve um arquivo JSON em 00-Sistema/Pendentes/ no Drive
//      (ex: triagem-FB-00014-upsert.json) com { action, fb_id, payload }.
//   2. Trigger de 1 min em ScriptApp roda agentBridgeProcessarPendentes().
//   3. Cada JSON e lido, validado, despachado para a Api_* correspondente.
//   4. Sucesso -> arquivo movido para 00-Sistema/Pendentes/processados/.
//      Falha -> movido para 00-Sistema/Pendentes/falhas/ com erro_msg.
//
// Vantagens:
//   - Zero rede entre agente e Apps Script (Drive faz o transporte)
//   - Robusto a queda de internet (arquivo fica na fila ate o trigger pegar)
//   - Auditavel (arquivo JSON e o registro do que aconteceu)
//   - Sem secrets (Drive ja autentica por conta Google)
//
// Setup:
//   - drvGetFolder('SISTEMA_PENDENTES') sera criado pelo Core.Drive ao primeiro
//     acesso (ver DRIVE_TAXONOMY abaixo).
//   - Apos clasp push: rodar setupAll() para registrar o trigger.
// =============================================================================

/** Acoes aceitas pelo bridge. */
var AGENT_BRIDGE_ACTIONS = {
  TRIAGEM_ANALYSIS_UPSERT:    'triagemAnalysisUpsert',
  TRIAGEM_MARCAR_IMPLEMENTADO:'triagemMarcarImplementado',
  TRIAGEM_MARCAR_FALHA:       'triagemMarcarFalha'
};

/**
 * Processa todos os JSONs pendentes na pasta 00-Sistema/Pendentes do Drive.
 * Chamada pelo trigger de 1 min (ver instalarTriggerAgentBridge).
 * Idempotente: arquivo so e processado uma vez (movido apos).
 */
function agentBridgeProcessarPendentes() {
  var pasta = drvGetFolder('SISTEMA_PENDENTES');
  if (!pasta) { Logger.log('[AgentBridge] pasta SISTEMA_PENDENTES indisponivel'); return { ok: false, error: 'pasta_indisponivel' }; }

  var subPasta = function(nome) {
    var it = pasta.getFoldersByName(nome);
    return it.hasNext() ? it.next() : pasta.createFolder(nome);
  };
  var processados = subPasta('processados');
  var falhas      = subPasta('falhas');

  var arquivos = pasta.getFiles();
  var contador = { processados: 0, falhas: 0, ignorados: 0 };

  while (arquivos.hasNext()) {
    var f = arquivos.next();
    var nome = f.getName();
    if (!/^triagem-.+\.json$/i.test(nome)) { contador.ignorados++; continue; }

    var conteudo = '';
    try { conteudo = f.getBlob().getDataAsString('UTF-8'); }
    catch (e) {
      Logger.log('[AgentBridge] leitura falhou ' + nome + ': ' + e.message);
      _moverComErro(f, falhas, 'leitura: ' + e.message);
      contador.falhas++; continue;
    }

    var msg = null;
    try { msg = JSON.parse(conteudo); }
    catch (eJ) {
      _moverComErro(f, falhas, 'json invalido: ' + eJ.message);
      contador.falhas++; continue;
    }

    var resultado = _agentBridgeDispatch(msg);
    if (resultado && resultado.ok) {
      _moverArquivo(f, processados, nome.replace(/\.json$/i, '.ok.json'), conteudo + '\n\n// resultado: ' + JSON.stringify(resultado));
      contador.processados++;
    } else {
      _moverComErro(f, falhas, (resultado && resultado.error) || 'sem retorno');
      contador.falhas++;
    }
  }

  if (contador.processados || contador.falhas) {
    Logger.log('[AgentBridge] ' + JSON.stringify(contador));
  }
  return { ok: true, data: contador };
}

function _agentBridgeDispatch(msg) {
  if (!msg || typeof msg !== 'object') return { ok: false, error: 'mensagem invalida' };
  var acao = String(msg.action || '').trim();
  try {
    switch (acao) {
      case AGENT_BRIDGE_ACTIONS.TRIAGEM_ANALYSIS_UPSERT:
        return Api_triagemAnalysisUpsert(msg.fb_id, msg.payload);
      case AGENT_BRIDGE_ACTIONS.TRIAGEM_MARCAR_IMPLEMENTADO:
        return Api_triagemMarcarImplementado(msg.fb_id, msg.payload);
      case AGENT_BRIDGE_ACTIONS.TRIAGEM_MARCAR_FALHA:
        return Api_triagemMarcarFalha(msg.fb_id, msg.erro_msg);
      case 'triagemImplementarComCascata':
        return _triagemBridgeImplementarComCascata(msg.fb_id, msg.payload);
      default:
        return { ok: false, error: 'acao desconhecida: ' + acao };
    }
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Helper de cascata: faz TRIADO -> APROVADO -> EM_IMPLEMENTACAO -> IMPLEMENTADO
 * em uma chamada. Cada transicao gera entrada no TRIAGEM_LOG, preservando o
 * audit. Usado quando Claude (eu) ou Joao implementam direto sem passar pelo
 * botao Aprovar do UI (que ainda nao existe na Fase 1).
 */
function _triagemBridgeImplementarComCascata(fb_id, payload) {
  try {
    var atual = _trgRepoGetByFbId(fb_id);
    if (!atual) return { ok: false, error: 'FB sem triagem: ' + fb_id };
    var estado = String(atual.estado || '').trim();

    var ator = 'agent-bridge-cascata';
    if (estado === 'TRIADO') {
      _trgRepoTransitionState(fb_id, 'APROVADO', ator, 'Cascata implementacao');
      estado = 'APROVADO';
    }
    if (estado === 'APROVADO') {
      _trgRepoTransitionState(fb_id, 'EM_IMPLEMENTACAO', ator, 'Cascata implementacao');
      estado = 'EM_IMPLEMENTACAO';
    }
    if (estado === 'EM_IMPLEMENTACAO' || estado === 'IMPLEMENTADO') {
      return Api_triagemMarcarImplementado(fb_id, payload);
    }
    return { ok: false, error: 'estado inesperado na cascata: ' + estado };
  } catch (e) {
    return { ok: false, error: 'cascata falhou: ' + e.message };
  }
}

function _moverArquivo(file, destFolder, novoNome, novoConteudo) {
  try {
    if (novoConteudo) {
      var blob = Utilities.newBlob(novoConteudo, 'application/json', novoNome || file.getName());
      destFolder.createFile(blob);
      file.setTrashed(true);
    } else {
      file.moveTo(destFolder);
      if (novoNome) file.setName(novoNome);
    }
  } catch (e) { Logger.log('[AgentBridge] mover: ' + e.message); }
}

function _moverComErro(file, destFolder, erroMsg) {
  var conteudoOriginal = '';
  try { conteudoOriginal = file.getBlob().getDataAsString('UTF-8'); } catch (e) {}
  var wrapper = JSON.stringify({
    erro_msg: erroMsg,
    processado_em: nowISO(),
    original: conteudoOriginal
  }, null, 2);
  var nome = file.getName().replace(/\.json$/i, '.erro.json');
  try {
    var blob = Utilities.newBlob(wrapper, 'application/json', nome);
    destFolder.createFile(blob);
    file.setTrashed(true);
  } catch (e) { Logger.log('[AgentBridge] mover-erro: ' + e.message); }
}

/**
 * Instala trigger de 1 minuto para agentBridgeProcessarPendentes.
 * Idempotente: remove triggers antigos antes de criar.
 */
function instalarTriggerAgentBridge() {
  var existentes = ScriptApp.getProjectTriggers();
  for (var i = 0; i < existentes.length; i++) {
    if (existentes[i].getHandlerFunction() === 'agentBridgeProcessarPendentes') {
      ScriptApp.deleteTrigger(existentes[i]);
    }
  }
  ScriptApp.newTrigger('agentBridgeProcessarPendentes').timeBased().everyMinutes(1).create();
  Logger.log('[AgentBridge] trigger 1 min instalado.');
  return { ok: true, frequencia_min: 1 };
}
