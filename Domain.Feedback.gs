// =============================================================================
// Domain.Feedback.gs — SGA
// Ciclo de construção colaborativa (fase 1): captura → o .md do dia é
// reescrito A CADA relato (imediato, consolidado, com dedupe) na pasta do
// Drive → no fim do dia, e-mail de resumo para o João. Os agentes do Claude
// Code leem o .md do dia quando rodam a triagem.
//
// Entidades:
//   FEEDBACKS         um relato por linha (erro/sugestão/melhoria)
// Status do relato:
//   NOVO → COMPILADO → EM_ANALISE → APROVADO → IMPLEMENTADO | RECUSADO
//
// Entrega: o .md do dia é gravado na pasta 00-Sistema/Feedback do Drive.
// Com o Google Drive para Desktop sincronizando, o arquivo aparece local na
// máquina do João e os agentes do Claude Code (VS Code) o leem direto — sem
// GitHub, sem token, sem fluxo novo. Os agentes seguem com `clasp pull` para
// o CÓDIGO; o feedback é DADO e mora no Drive, junto com os prints.
//
// Configuração na aba CONFIG (padrão do SGA para dados não-sensíveis):
//   FEEDBACK_HORA  hora do lote diário 0-23 (default: 19)
//   ALERT_EMAIL    e-mail que recebe os relatos urgentes (já usado por Action Cards)
// =============================================================================

var FEEDBACK_SHEET = 'FEEDBACKS';
var FEEDBACK_HEADERS = [
  'id', 'tipo',          // ERRO | SUGESTAO | MELHORIA
  'titulo', 'descricao',
  'tela',                // seção ativa quando reportado
  'urgente',             // TRUE | FALSE
  'status',              // NOVO | COMPILADO | EM_ANALISE | APROVADO | IMPLEMENTADO | RECUSADO
  'anexo_url', 'anexo_name',
  'contexto_json',       // user-agent, papel, erros JS recentes, etc.
  'criado_por', 'criado_por_nome', 'criado_em',
  'compilado_em',        // data do .md em que entrou
  'camada',              // VERDE | AMARELO | VERMELHO (classificada pelo agente na triagem)
  'resolucao_nota',      // preenchido na triagem/implementação
  'atualizado_em'
];

var FEEDBACK_TIPOS = { ERRO: 'ERRO', SUGESTAO: 'SUGESTAO', MELHORIA: 'MELHORIA' };

function initFeedbackSheet() {
  getOrCreateSheet(FEEDBACK_SHEET, FEEDBACK_HEADERS);
}

/* ───────────────────────── Captura ───────────────────────── */

/**
 * Registra um relato do usuário.
 * @param {Object} data {tipo, titulo, descricao, tela, urgente, contexto,
 *                        anexo:{base64,mime,name}}
 */
function fbSvcCriar(data) {
  var user = requireAuth();
  if (!data || !data.descricao || !String(data.descricao).trim()) {
    throw new Error('Descreva o que aconteceu.');
  }
  var tipo = FEEDBACK_TIPOS[data.tipo] || 'SUGESTAO';

  // anexo (print) → pasta de feedback no Drive
  var anexoUrl = '', anexoName = '';
  if (data.anexo && data.anexo.base64) {
    try {
      var base = drvGetFolder('SISTEMA_FEEDBACK');
      if (base) {
        var blob = Utilities.newBlob(
          Utilities.base64Decode(data.anexo.base64),
          data.anexo.mime || 'image/png',
          data.anexo.name || ('feedback-' + new Date().getTime() + '.png'));
        var file = base.createFile(blob);
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        anexoUrl = file.getUrl();
        anexoName = data.anexo.name || file.getName();
      }
    } catch (eDrive) {
      Logger.log('fbSvcCriar anexo: ' + eDrive.message);
    }
  }

  var id = 'FB-' + String(getAndIncrementCounter('FEEDBACK_COUNTER')).padStart(5, '0');
  var now = nowISO();
  var rec = {
    id: id, tipo: tipo,
    titulo: String(data.titulo || '').trim() || String(data.descricao).trim().slice(0, 60),
    descricao: String(data.descricao).trim(),
    tela: String(data.tela || '').trim(),
    urgente: data.urgente ? 'TRUE' : 'FALSE',
    status: 'NOVO',
    anexo_url: anexoUrl, anexo_name: anexoName,
    contexto_json: JSON.stringify(data.contexto || {}),
    criado_por: user.id, criado_por_nome: user.name || user.id, criado_em: now,
    compilado_em: '', camada: '', resolucao_nota: '', atualizado_em: now
  };
  var sh = getOrCreateSheet(FEEDBACK_SHEET, FEEDBACK_HEADERS);
  var row = [];
  for (var i = 0; i < FEEDBACK_HEADERS.length; i++) row.push(rec[FEEDBACK_HEADERS[i]]);
  sh.appendRow(row);

  // urgente: e-mail imediato para o diretor técnico (não espera o lote)
  if (data.urgente) {
    try {
      var to = getConfigValue('ALERT_EMAIL');
      if (to) {
        MailApp.sendEmail(to, '🚨 SGA — feedback URGENTE de ' + rec.criado_por_nome,
          rec.titulo + '\n\n' + rec.descricao + '\n\nTela: ' + rec.tela + '\nRelato: ' + id +
          (anexoUrl ? '\nAnexo: ' + anexoUrl : ''));
      }
    } catch (eMail) { Logger.log('fbSvcCriar email: ' + eMail.message); }
  }

  // GERAÇÃO IMEDIATA: reescreve o .md do dia com TODOS os relatos de hoje,
  // já consolidado e deduplicado. O agente sempre tem o arquivo do dia
  // atualizado, sem esperar o fim do dia. (best-effort — não derruba o relato)
  try { _fbRegravarArquivoDoDia(); } catch (eMd) { Logger.log('fbSvcCriar md: ' + eMd.message); }

  return { id: id };
}

/** Os relatos do próprio usuário, com status (fecha o ciclo). */
function fbSvcMeus() {
  var user = requireAuth();
  var rows = sheetToObjects(FEEDBACK_SHEET).filter(function (r) { return r.criado_por === user.id; });
  rows.sort(function (a, b) { return String(b.criado_em).localeCompare(String(a.criado_em)); });
  return rows.slice(0, 50);
}

/* ──────────────── Geração imediata do .md (por ação) ──────────────── */

/**
 * Reescreve o feedback-AAAA-MM-DD.md do dia com TODOS os relatos de hoje
 * que ainda não foram triados (status NOVO). Chamado a cada novo relato:
 * o arquivo é sempre o consolidado do dia, com dedupe. Idempotente.
 */
function _fbRegravarArquivoDoDia() {
  var hoje = new Date();
  var dataStr = hoje.getFullYear() + '-' + ('0' + (hoje.getMonth() + 1)).slice(-2) + '-' + ('0' + hoje.getDate()).slice(-2);
  // relatos de hoje ainda não triados (NOVO). compilado_em vazio = não foi pego.
  var doDia = sheetToObjects(FEEDBACK_SHEET).filter(function (r) {
    return r.status === 'NOVO' && String(r.criado_em).slice(0, 10) === dataStr;
  });
  if (!doDia.length) return { ok: true, vazio: true };
  var md = _fbMontarMarkdown(doDia, dataStr);
  var nomeArq = 'feedback-' + dataStr + '.md';
  return _fbGravarNoDrive(nomeArq, md);
}

/* ──────────────── Resumo diário por e-mail (por tempo) ──────────────── */

/**
 * Resumo do dia por e-mail. NÃO gera mais o arquivo (isso agora é por ação,
 * em _fbRegravarArquivoDoDia). Só conta os relatos do dia por tipo e avisa o
 * João. Roda no trigger diário. Garante também que o .md do dia esteja gravado
 * (rede de segurança, caso alguma gravação por ação tenha falhado).
 */
function fbResumoDiario() {
  var hoje = new Date();
  var dataStr = hoje.getFullYear() + '-' + ('0' + (hoje.getMonth() + 1)).slice(-2) + '-' + ('0' + hoje.getDate()).slice(-2);
  var doDia = sheetToObjects(FEEDBACK_SHEET).filter(function (r) {
    return r.status === 'NOVO' && String(r.criado_em).slice(0, 10) === dataStr;
  });

  // rede de segurança: garante o arquivo do dia atualizado
  try { _fbRegravarArquivoDoDia(); } catch (e) { Logger.log('[Feedback] resumo md: ' + e.message); }

  if (!doDia.length) { Logger.log('[Feedback] resumo: nenhum relato hoje.'); return { ok: true, total: 0 }; }

  var cont = { ERRO: 0, SUGESTAO: 0, MELHORIA: 0, urgentes: 0 };
  for (var i = 0; i < doDia.length; i++) {
    cont[doDia[i].tipo] = (cont[doDia[i].tipo] || 0) + 1;
    if (doDia[i].urgente === 'TRUE') cont.urgentes++;
  }

  try {
    var to = getConfigValue('ALERT_EMAIL');
    if (to) {
      var corpo = 'Resumo do feedback de ' + dataStr + ':\n\n' +
        '🐛 Erros: ' + cont.ERRO + '\n' +
        '💡 Sugestões: ' + cont.SUGESTAO + '\n' +
        '⬆️ Melhorias: ' + cont.MELHORIA + '\n' +
        (cont.urgentes ? '\n🚨 ' + cont.urgentes + ' marcado(s) como urgente.\n' : '') +
        '\nTotal: ' + doDia.length + ' relato(s) aguardando triagem.\n' +
        'O arquivo do dia está na pasta 00-Sistema/Feedback do Drive.';
      MailApp.sendEmail(to, '📋 SGA — resumo do feedback (' + dataStr + ')', corpo);
    }
  } catch (eM) { Logger.log('[Feedback] resumo email: ' + eM.message); }

  Logger.log('[Feedback] resumo enviado: ' + doDia.length + ' relato(s).');
  return { ok: true, total: doDia.length, contagem: cont };
}

/** Compat: chamadas antigas a fbCompilarECommitar agora geram o arquivo do dia. */
function fbCompilarECommitar() {
  var r = _fbRegravarArquivoDoDia();
  return { ok: r.ok !== false, arquivo: 'feedback do dia atualizado' };
}

function _fbMontarMarkdown(relatos, dataStr) {
  // dedupe leve: agrupa por (tipo + título normalizado)
  var grupos = {};
  for (var i = 0; i < relatos.length; i++) {
    var r = relatos[i];
    var chave = r.tipo + '|' + String(r.titulo).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 30);
    if (!grupos[chave]) grupos[chave] = [];
    grupos[chave].push(r);
  }

  var emoji = { ERRO: '🐛', SUGESTAO: '💡', MELHORIA: '⬆️' };
  var ordem = ['ERRO', 'SUGESTAO', 'MELHORIA'];
  var porTipo = { ERRO: [], SUGESTAO: [], MELHORIA: [] };
  for (var k in grupos) {
    var g = grupos[k];
    porTipo[g[0].tipo].push(g);
  }

  var out = '# Feedback dos usuários — ' + dataStr + '\n\n';
  out += '> Gerado automaticamente pelo SGA. ' + relatos.length + ' relato(s). ';
  out += 'Triagem: ver `PROMPT_TRIAGEM.md`. Agente PROPÕE, decisão final é do João.\n\n';

  for (var t = 0; t < ordem.length; t++) {
    var tipo = ordem[t];
    if (!porTipo[tipo].length) continue;
    out += '## ' + emoji[tipo] + ' ' + tipo + ' (' + porTipo[tipo].length + ')\n\n';
    for (var gi = 0; gi < porTipo[tipo].length; gi++) {
      var grupo = porTipo[tipo][gi];
      var base = grupo[0];
      var ids = grupo.map(function (x) { return x.id; }).join(', ');
      out += '### ' + base.titulo + (grupo.length > 1 ? ' _(reportado ' + grupo.length + '×)_' : '') + '\n\n';
      out += '- **Relato(s):** ' + ids + (base.urgente === 'TRUE' ? ' · 🚨 **URGENTE**' : '') + '\n';
      out += '- **Tela:** ' + (base.tela || 'não informada') + '\n';
      out += '- **Por:** ' + grupo.map(function (x) { return x.criado_por_nome; }).join(', ') + '\n';
      for (var d = 0; d < grupo.length; d++) {
        out += '\n> ' + String(grupo[d].descricao).replace(/\n/g, '\n> ') + '\n';
        if (grupo[d].anexo_url) out += '\n  📎 [anexo](' + grupo[d].anexo_url + ')\n';
        var ctx = {};
        try { ctx = JSON.parse(grupo[d].contexto_json || '{}'); } catch (e) {}
        if (ctx.jsErrors && ctx.jsErrors.length) {
          out += '\n  <details><summary>erros JS capturados</summary>\n\n  ```\n  ' +
            ctx.jsErrors.join('\n  ').slice(0, 800) + '\n  ```\n  </details>\n';
        }
      }
      out += '\n---\n\n';
    }
  }
  return out;
}

/**
 * Grava o .md do dia na pasta 00-Sistema/Feedback do Drive (sobrescreve se
 * já existir o arquivo do mesmo dia). É isto que o Drive para Desktop
 * sincroniza para a máquina do João.
 */
function _fbGravarNoDrive(nomeArq, content) {
  try {
    var pasta = drvGetFolder('SISTEMA_FEEDBACK');
    if (!pasta) return { ok: false, error: 'Pasta de feedback indisponível — configure ROOT_FOLDER_ID (setupAll).' };
    // remove versão anterior do mesmo dia (idempotente)
    var existentes = pasta.getFilesByName(nomeArq);
    while (existentes.hasNext()) existentes.next().setTrashed(true);
    var file = pasta.createFile(nomeArq, content, 'text/markdown');
    return { ok: true, url: file.getUrl() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/** Cria o trigger diário do lote (idempotente). Hora via FEEDBACK_HORA. */
function instalarTriggerFeedback() {
  var hora = parseInt(getConfigValue('FEEDBACK_HORA') || '19', 10);
  var existentes = ScriptApp.getProjectTriggers();
  for (var i = 0; i < existentes.length; i++) {
    if (existentes[i].getHandlerFunction() === 'fbCompilarECommitar' ||
        existentes[i].getHandlerFunction() === 'fbResumoDiario') ScriptApp.deleteTrigger(existentes[i]);
  }
  ScriptApp.newTrigger('fbResumoDiario').timeBased().everyDays(1).atHour(hora).create();
  Logger.log('[Feedback] Trigger diário às ' + hora + 'h.');
  return { ok: true, hora: hora };
}
