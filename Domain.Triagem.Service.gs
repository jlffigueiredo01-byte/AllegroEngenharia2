// =============================================================================
// Domain.Triagem.Service.gs — SGA
// Lógica de negócio do ciclo de triagem. Camada que orquestra Repository,
// validações, sincronização com FEEDBACKS e auditoria.
//
// Quem chama este service:
//   - Domain.Triagem.Api.js (Api_triagem*) — endpoints expostos para SGA UI e clasp run
//   - Outros services (raro) — sempre via Service, nunca Repository direto
//
// Convenção: funções começam com "triagemSvc" (públicas) e "_triagemSvc" (helpers).
// =============================================================================

/* ───────────────────────── Listagem & leitura ───────────────────────── */

/**
 * Lista triagens (com filtros) — usado pela UI (kanban + filtros).
 * Retorna dados já sanitizados (sem Date crus).
 */
function triagemSvcList(filtros) {
  // Self-heal: cria card NOVO para qualquer FB do FEEDBACKS que ainda não tem
  // triagem (cobre FBs criados antes do create-on-submit, ou que escaparam).
  try { triagemSvcBackfillNovos(); } catch (e) { Logger.log('[Triagem] backfill no list: ' + e.message); }
  // Auto-instala o trigger do classificador na 1ª vez que a guia abre (sem setup manual).
  try { _triagemGarantirTriggerClassificador(); } catch (e) { /* best-effort */ }
  var rows = _trgRepoList(filtros || {});
  return sanitizeForClient(rows);
}

/**
 * Garante um card de triagem (estado NOVO) para todo FB do FEEDBACKS que ainda
 * não tem linha em TRIAGENS — exceto os já fechados (RECUSADO/IMPLEMENTADO).
 * Idempotente e barato em regime (após o 1º preenchimento, cria 0).
 * @return {number} quantos cards foram criados nesta passagem
 */
function triagemSvcBackfillNovos() {
  var created = 0;
  var fbs = sheetToObjects(FEEDBACK_SHEET);
  var trgs = sheetToObjects(TRIAGEM_SHEET);
  var have = {};
  for (var t = 0; t < trgs.length; t++) have[String(trgs[t].fb_id)] = true;
  for (var i = 0; i < fbs.length; i++) {
    var f = fbs[i];
    if (!f.id || have[String(f.id)]) continue;
    var st = String(f.status || '').toUpperCase();
    if (st === 'RECUSADO' || st === 'IMPLEMENTADO') continue; // não ressuscita resolvido
    try {
      triagemSvcCriarNovo(f.id, {
        titulo: f.titulo,
        autor_fb: f.criado_por_nome || f.criado_por,
        tela: f.tela
      });
      created++;
    } catch (e1) { Logger.log('[Triagem] backfill ' + f.id + ': ' + e1.message); }
  }
  return created;
}

/** Busca uma triagem por fb_id (página de detalhe). */
function triagemSvcGetByFbId(fb_id) {
  if (!fb_id) throw new Error('fb_id é obrigatório.');
  var row = _trgRepoGetByFbId(fb_id);
  if (!row) return null;
  var out = sanitizeForClient(row);
  // Enriquecimento em tempo de leitura: anexa a MENSAGEM ORIGINAL do usuário
  // (verbatim), que vive no FEEDBACKS — sem persistir/duplicar na TRIAGENS nem
  // mexer no schema da planilha. Garante que a classificação do Sonnet NUNCA
  // viaje sem o texto original (lição de campo: Opus se confundiu com o resumo).
  try {
    var fb = _triagemSvcGetFeedback(fb_id);
    if (fb) {
      out.descricao_original = fb.descricao || '';
      if (!out.anexo_url && fb.anexo_url) out.anexo_url = fb.anexo_url;
    }
  } catch (e) { /* best-effort — sem o original a UI ainda mostra a análise */ }
  return out;
}

/**
 * Cria o card de triagem em estado NOVO no momento em que o usuário submete o FB.
 * Chamado por fbSvcCriar (best-effort). Faz o card aparecer na guia Triagens
 * IMEDIATAMENTE — sem depender de watcher, Drive sync ou PLANO. O Sonnet depois
 * faz o upsert da análise (NOVO → TRIADO). Idempotente.
 *
 * @param {string} fb_id
 * @param {Object} [dados]  { titulo, autor_fb, tela }
 * @return {Object} a triagem (NOVO) sanitizada
 */
function triagemSvcCriarNovo(fb_id, dados) {
  if (!fb_id) throw new Error('fb_id é obrigatório.');
  dados = dados || {};
  var existente = _trgRepoGetByFbId(fb_id);
  if (existente) return sanitizeForClient(existente); // já existe — não recria

  var criada = _trgRepoUpsertByFbId(fb_id, {
    estado: TRIAGEM_ESTADOS.NOVO,
    titulo: dados.titulo || '',
    autor_fb: dados.autor_fb || '',
    tela: dados.tela || ''
  });
  _trgLogAppend(criada.id, fb_id, 'sga', 'CRIADO_NOVO', { origem: 'fbSvcCriar' });
  appendAuditLog('TRIAGEM_NOVO', TRIAGEM_SHEET, fb_id, 'card NOVO criado na submissão do FB');
  return sanitizeForClient(criada);
}

/* ───────────────────────── Sonnet (juiz) ───────────────────────── */

/**
 * Chamado pelo Sonnet via clasp run → Api_triagemAnalysisUpsert.
 * Recebe a análise estruturada (classificação + camada + análise em markdown)
 * e grava na aba TRIAGENS. Define estado=TRIADO.
 *
 * Idempotente: rodar 2× para o mesmo fb_id apenas atualiza a análise.
 *
 * @param {string} fb_id    FB-xxxxx — chave do FEEDBACKS
 * @param {Object} payload  {camada, tipo_confirmado, severidade, esforco,
 *                           titulo?, autor_fb?, tela?, analise_md}
 *                          (titulo/autor_fb/tela auto-preenchidos do FB se faltar)
 * @return {Object}         triagem atualizada (sanitizada)
 */
function triagemSvcUpsertAnalysis(fb_id, payload) {
  if (!fb_id) throw new Error('fb_id é obrigatório.');
  if (!payload || typeof payload !== 'object') throw new Error('payload é obrigatório.');

  // Valida inputs antes de tocar em sheets
  _triagemValidarCamada(payload.camada);
  _triagemValidarTipo(payload.tipo_confirmado);
  _triagemValidarSeveridade(payload.severidade);
  _triagemValidarEsforco(payload.esforco);
  if (!payload.analise_md || !String(payload.analise_md).trim()) {
    throw new Error('analise_md é obrigatório (análise estruturada do Sonnet).');
  }

  // Auto-fill de titulo/autor_fb/tela a partir do FEEDBACKS, se não vier no payload
  var titulo = payload.titulo;
  var autor_fb = payload.autor_fb;
  var tela = payload.tela;
  if (!titulo || !autor_fb || !tela) {
    var fb = _triagemSvcGetFeedback(fb_id);
    if (fb) {
      if (!titulo) titulo = fb.titulo || '';
      if (!autor_fb) autor_fb = fb.criado_por_nome || fb.criado_por || '';
      if (!tela) tela = fb.tela || '';
    }
  }

  var rec = {
    estado: TRIAGEM_ESTADOS.TRIADO,
    camada: payload.camada,
    tipo_confirmado: payload.tipo_confirmado,
    severidade: payload.severidade,
    esforco: payload.esforco,
    titulo: titulo || '',
    autor_fb: autor_fb || '',
    tela: tela || '',
    analise_md: String(payload.analise_md)
  };

  var existente = _trgRepoGetByFbId(fb_id);
  if (existente) {
    // Já existia — registrar transição se mudou estado
    if (String(existente.estado) !== TRIAGEM_ESTADOS.TRIADO) {
      _trgRepoUpsertByFbId(fb_id, rec);
      _trgRepoTransitionState(fb_id, TRIAGEM_ESTADOS.TRIADO, 'sonnet-juiz', 'Análise (re)gravada.');
    } else {
      _trgRepoUpsertByFbId(fb_id, rec);
      _trgLogAppend(existente.id, fb_id, 'sonnet-juiz', 'ANALYSIS_UPSERT', {
        camada: payload.camada, severidade: payload.severidade
      });
    }
  } else {
    // Novo — upsert cria a linha já em TRIADO, e a transição é "vazio → TRIADO"
    var criada = _trgRepoUpsertByFbId(fb_id, rec);
    _trgLogAppend(criada.id, fb_id, 'sonnet-juiz', 'ANALYSIS_UPSERT', {
      camada: payload.camada, severidade: payload.severidade, novo: true
    });
  }

  appendAuditLog('TRIAGEM_ANALYSIS', TRIAGEM_SHEET, fb_id,
    payload.camada + ' · ' + payload.severidade + ' · ' + payload.esforco);

  var final = _trgRepoGetByFbId(fb_id);
  return sanitizeForClient(final);
}

/** Helper: lê uma linha do FEEDBACKS por id. Lê via sheetToObjects (read-only). */
function _triagemSvcGetFeedback(fb_id) {
  var rows = sheetToObjects(FEEDBACK_SHEET);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].id) === String(fb_id)) return rows[i];
  }
  return null;
}

/* ───────────────────────── João (decisões via SGA) ───────────────────────── */

/**
 * João recusa a triagem com nota explicativa. Estado → RECUSADO.
 * Sincroniza com FEEDBACKS (status → RECUSADO) para fechar o ciclo do usuário.
 */
function triagemSvcRecusar(fb_id, nota) {
  if (!fb_id) throw new Error('fb_id é obrigatório.');
  if (!nota || !String(nota).trim()) {
    throw new Error('Nota é obrigatória ao recusar (explica para o usuário).');
  }
  var trg = _trgRepoGetByFbId(fb_id);
  if (!trg) throw new Error('Triagem não encontrada para fb_id=' + fb_id);

  // Acumula nota_joao
  var notaAcumulada = _triagemSvcAppendNota(trg.nota_joao, nota, 'recusa');
  _trgRepoUpsertByFbId(fb_id, { nota_joao: notaAcumulada });
  _trgRepoTransitionState(fb_id, TRIAGEM_ESTADOS.RECUSADO, 'joao', nota);

  // Sincroniza FEEDBACKS — fecha o ciclo na "Meus reportes" do usuário.
  // best-effort: se Api_fbMarcarStatus falhar, a recusa na triagem permanece.
  try {
    if (typeof Api_fbMarcarStatus === 'function') {
      Api_fbMarcarStatus(fb_id, 'RECUSADO', nota);
    }
  } catch (eSync) {
    Logger.log('[Triagem] sync FEEDBACKS na recusa falhou: ' + eSync.message);
  }

  appendAuditLog('TRIAGEM_RECUSAR', TRIAGEM_SHEET, fb_id, String(nota).slice(0, 200));
  return sanitizeForClient(_trgRepoGetByFbId(fb_id));
}

/**
 * João comenta sem mudar estado. Acumula nota_joao.
 * Útil quando ele quer registrar contexto/observação no card sem decidir ainda.
 */
function triagemSvcComentar(fb_id, nota) {
  if (!fb_id) throw new Error('fb_id é obrigatório.');
  if (!nota || !String(nota).trim()) throw new Error('Nota é obrigatória.');
  var trg = _trgRepoGetByFbId(fb_id);
  if (!trg) throw new Error('Triagem não encontrada para fb_id=' + fb_id);

  var notaAcumulada = _triagemSvcAppendNota(trg.nota_joao, nota, 'comentario');
  _trgRepoUpsertByFbId(fb_id, { nota_joao: notaAcumulada });
  _trgLogAppend(trg.id, fb_id, 'joao', 'COMMENT', { nota: String(nota).slice(0, 500) });

  appendAuditLog('TRIAGEM_COMENTAR', TRIAGEM_SHEET, fb_id, String(nota).slice(0, 200));
  return sanitizeForClient(_trgRepoGetByFbId(fb_id));
}

/**
 * João pede reanálise — estado volta para EM_TRIAGEM. Sonnet vai pegar
 * de novo no próximo watcher e re-rodar com a nota como contexto adicional.
 */
function triagemSvcPedirReanalise(fb_id, nota) {
  if (!fb_id) throw new Error('fb_id é obrigatório.');
  if (!nota || !String(nota).trim()) {
    throw new Error('Nota é obrigatória ao pedir reanálise (instrução para o Sonnet).');
  }
  var trg = _trgRepoGetByFbId(fb_id);
  if (!trg) throw new Error('Triagem não encontrada para fb_id=' + fb_id);

  var notaAcumulada = _triagemSvcAppendNota(trg.nota_joao, nota, 'reanalise');
  _trgRepoUpsertByFbId(fb_id, { nota_joao: notaAcumulada });
  _trgRepoTransitionState(fb_id, TRIAGEM_ESTADOS.EM_TRIAGEM, 'joao', nota);

  appendAuditLog('TRIAGEM_REANALISE', TRIAGEM_SHEET, fb_id, String(nota).slice(0, 200));
  return sanitizeForClient(_trgRepoGetByFbId(fb_id));
}

/**
 * João aprova a triagem pelo SGA. Gera a TAREFA-FB-*.md no Drive (via
 * Api_fbMarcarStatus → _fbGerarTarefaAgente, que agora usa a camada da TRIAGENS)
 * e move o estado:
 *   VERDE/AMARELO → APROVADO (aguarda implementação — Opus na Fase 2, ou manual)
 *   VERMELHO      → FECHADO_SEM_CODIGO (proposta documentada, sem auto-código)
 *
 * @param {string} fb_id
 * @param {string} [nota]  instrução extra do João — vira parte da TAREFA + histórico
 */
function triagemSvcAprovar(fb_id, nota) {
  if (!fb_id) throw new Error('fb_id é obrigatório.');
  var trg = _trgRepoGetByFbId(fb_id);
  if (!trg) throw new Error('Triagem não encontrada para fb_id=' + fb_id);

  var camada = String(trg.camada || '').toUpperCase();
  if (!camada) {
    throw new Error('Triagem sem camada definida — peça reanálise ao Sonnet antes de aprovar.');
  }

  // Nota opcional do João — acumula no histórico antes de gerar a TAREFA.
  if (nota && String(nota).trim()) {
    var notaAcum = _triagemSvcAppendNota(trg.nota_joao, nota, 'aprovacao');
    _trgRepoUpsertByFbId(fb_id, { nota_joao: notaAcum });
  }

  // Sincroniza FEEDBACKS (status APROVADO) — isso JÁ gera a TAREFA no Drive.
  var tarefaInfo = '';
  try {
    if (typeof Api_fbMarcarStatus === 'function') {
      var r = Api_fbMarcarStatus(fb_id, 'APROVADO', nota || '');
      if (r && r.tarefa && r.tarefa.arquivo) tarefaInfo = r.tarefa.arquivo;
    }
  } catch (eSync) {
    Logger.log('[Triagem] geração de TAREFA na aprovação falhou: ' + eSync.message);
  }

  var destino = (camada === TRIAGEM_CAMADAS.VERMELHO)
    ? TRIAGEM_ESTADOS.FECHADO_SEM_CODIGO
    : TRIAGEM_ESTADOS.APROVADO;
  _trgRepoTransitionState(fb_id, destino, 'joao',
    'Aprovado (' + camada + ')' + (tarefaInfo ? ' · TAREFA: ' + tarefaInfo : ''));

  appendAuditLog('TRIAGEM_APROVAR', TRIAGEM_SHEET, fb_id, camada + (tarefaInfo ? ' · ' + tarefaInfo : ''));
  return sanitizeForClient(_trgRepoGetByFbId(fb_id));
}

/**
 * João marca a triagem como publicada em produção (/exec).
 * Transição IMPLEMENTADO → PUBLICADO (a máquina de estados valida o pré-requisito).
 */
function triagemSvcMarcarPublicado(fb_id) {
  if (!fb_id) throw new Error('fb_id é obrigatório.');
  var trg = _trgRepoGetByFbId(fb_id);
  if (!trg) throw new Error('Triagem não encontrada para fb_id=' + fb_id);

  _trgRepoTransitionState(fb_id, TRIAGEM_ESTADOS.PUBLICADO, 'joao', 'Publicado em /exec pelo João.');
  try {
    if (typeof Api_fbMarcarStatus === 'function') {
      Api_fbMarcarStatus(fb_id, 'IMPLEMENTADO', 'Publicado em produção.');
    }
  } catch (eSync) { Logger.log('[Triagem] sync FEEDBACKS publicado: ' + eSync.message); }

  appendAuditLog('TRIAGEM_PUBLICADO', TRIAGEM_SHEET, fb_id, '');
  return sanitizeForClient(_trgRepoGetByFbId(fb_id));
}

/* ───────────────────────── Opus (executor) — Fase 2 prep ───────────────────────── */

/**
 * Opus marca implementação concluída. TODO: ativado na Fase 2.
 * Nesta fase 1 a função existe para o agente Opus já ter o ponto de entrada,
 * mas as transições oficiais (EM_IMPLEMENTACAO → IMPLEMENTADO) só são exercitadas
 * quando o watcher de Opus estiver ligado.
 *
 * @param {string} fb_id
 * @param {Object} payload  {arquivos_tocados, diff_resumo, snapshot_path, versao_apps_script}
 */
function triagemSvcMarcarImplementado(fb_id, payload) {
  if (!fb_id) throw new Error('fb_id é obrigatório.');
  payload = payload || {};
  var trg = _trgRepoGetByFbId(fb_id);
  if (!trg) throw new Error('Triagem não encontrada para fb_id=' + fb_id);

  // TODO Fase 2: validar que estado atual permite IMPLEMENTADO.
  // Para a Fase 1 aceita marcar mesmo sem passar por EM_IMPLEMENTACAO
  // (Opus pode estar testando a integração antes do watcher entrar).
  _trgRepoUpsertByFbId(fb_id, {
    arquivos_tocados: payload.arquivos_tocados || '',
    diff_resumo: payload.diff_resumo || '',
    snapshot_path: payload.snapshot_path || '',
    versao_apps_script: payload.versao_apps_script || ''
  });
  _trgRepoTransitionState(fb_id, TRIAGEM_ESTADOS.IMPLEMENTADO, 'opus-executor',
    'Implementado em /dev.');

  appendAuditLog('TRIAGEM_IMPLEMENTADO', TRIAGEM_SHEET, fb_id,
    (payload.arquivos_tocados || '') + ' · ' + (payload.versao_apps_script || ''));
  return sanitizeForClient(_trgRepoGetByFbId(fb_id));
}

/**
 * Opus marca falha. TODO: ativado na Fase 2 (integração completa com email).
 */
function triagemSvcMarcarFalha(fb_id, erro_msg) {
  if (!fb_id) throw new Error('fb_id é obrigatório.');
  var trg = _trgRepoGetByFbId(fb_id);
  if (!trg) throw new Error('Triagem não encontrada para fb_id=' + fb_id);

  _trgRepoUpsertByFbId(fb_id, { erro_msg: String(erro_msg || 'Erro não especificado.') });
  _trgRepoTransitionState(fb_id, TRIAGEM_ESTADOS.FALHOU, 'opus-executor', erro_msg);

  appendAuditLog('TRIAGEM_FALHOU', TRIAGEM_SHEET, fb_id, String(erro_msg || '').slice(0, 200));
  // TODO Fase 2: disparar email de FALHA para engenharia@allegro.eng.br
  return sanitizeForClient(_trgRepoGetByFbId(fb_id));
}

/* ───────────────────────── KPIs (badge / dashboard) ───────────────────────── */

/**
 * Conta triagens por estado — usado pelos badges da guia Triagens no SGA.
 * @return {Object} { TRIADO: n, APROVADO: n, ... } para todos os estados.
 */
function triagemSvcKpis() {
  var rows = sheetToObjects(TRIAGEM_SHEET);
  var out = {};
  // Inicia todos os estados em 0 (UI sabe que cards existem mesmo se 0)
  var k;
  for (k in TRIAGEM_ESTADOS) out[TRIAGEM_ESTADOS[k]] = 0;
  for (var i = 0; i < rows.length; i++) {
    var e = String(rows[i].estado || '');
    if (out[e] !== undefined) out[e]++;
  }
  return out;
}

/* ───────────────────────── Notificador periódico ───────────────────────── */

/**
 * Roda via trigger (a cada 30 min). Lista TRIADOs de camada AMARELO
 * sem nota_joao há > 4h e envia 1 email-resumo para engenharia@allegro.eng.br.
 *
 * Idempotente / anti-spam: o conjunto de IDs já notificado é guardado em
 * CONFIG (TRIAGEM_NOTIFICADOS_JSON). Só envia se houver IDs novos desde o
 * último envio.
 */
function triagemNotificadorPeriodico() {
  try {
    var rows = sheetToObjects(TRIAGEM_SHEET);
    var agora = new Date().getTime();
    var corteMs = 4 * 60 * 60 * 1000; // 4h
    var pendentes = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (String(r.estado) !== TRIAGEM_ESTADOS.TRIADO) continue;
      if (String(r.camada) !== TRIAGEM_CAMADAS.AMARELO) continue;
      if (r.nota_joao && String(r.nota_joao).trim()) continue;

      var t = new Date(r.atualizado_em || r.criado_em).getTime();
      if (isNaN(t)) continue;
      if (agora - t < corteMs) continue;
      pendentes.push(r);
    }

    if (!pendentes.length) {
      Logger.log('[Triagem] notificador: nada pendente.');
      return { ok: true, total: 0 };
    }

    // Anti-spam: compara com último set notificado
    var ultimosIds = [];
    try {
      var raw = getConfigValue('TRIAGEM_NOTIFICADOS_JSON');
      if (raw) ultimosIds = JSON.parse(raw) || [];
    } catch (e) { ultimosIds = []; }
    var ultimosSet = {};
    for (var u = 0; u < ultimosIds.length; u++) ultimosSet[ultimosIds[u]] = true;

    var novos = pendentes.filter(function (r) { return !ultimosSet[r.fb_id]; });
    if (!novos.length) {
      Logger.log('[Triagem] notificador: ' + pendentes.length + ' pendentes, todos já notificados.');
      return { ok: true, total: pendentes.length, novos: 0 };
    }

    // Monta email
    var to = 'engenharia@allegro.eng.br';
    var assunto = '[SGA] ' + pendentes.length + ' triagem(ns) 🟡 aguardando decisão';
    var corpo = 'Triagens da camada AMARELO em estado TRIADO há mais de 4h sem nota:\n\n';
    for (var p = 0; p < pendentes.length; p++) {
      var r2 = pendentes[p];
      corpo += '• ' + r2.fb_id + ' — ' + (r2.titulo || '(sem título)') + '\n';
      corpo += '  ' + (r2.tipo_confirmado || '?') + ' · severidade ' + (r2.severidade || '?') +
               ' · esforço ' + (r2.esforco || '?') + '\n';
      corpo += '  Tela: ' + (r2.tela || '?') + ' · Por: ' + (r2.autor_fb || '?') + '\n';
      corpo += '  Atualizada: ' + r2.atualizado_em + '\n\n';
    }
    corpo += '\nAbra a guia Triagens no SGA para decidir.\n';

    try {
      MailApp.sendEmail(to, assunto, corpo);
    } catch (eMail) {
      Logger.log('[Triagem] notificador email falhou: ' + eMail.message);
      return { ok: false, error: eMail.message };
    }

    // Atualiza set notificado (todos os pendentes desta rodada)
    var novosIds = pendentes.map(function (r) { return r.fb_id; });
    try {
      setConfigValue('TRIAGEM_NOTIFICADOS_JSON', JSON.stringify(novosIds));
    } catch (eSet) {
      Logger.log('[Triagem] notificador setConfig falhou: ' + eSet.message);
    }

    Logger.log('[Triagem] notificador: ' + novos.length + ' novos notificados (total pendentes ' + pendentes.length + ').');
    return { ok: true, total: pendentes.length, novos: novos.length };
  } catch (e) {
    Logger.log('[Triagem] notificador erro: ' + e.message);
    return { ok: false, error: e.message };
  }
}

/**
 * Instala o trigger periódico de notificação (a cada 30 min).
 * Idempotente: remove triggers anteriores do mesmo handler antes de criar.
 * Padrão equivalente ao instalarTriggerFeedback (Domain.Feedback.js).
 */
function instalarTriggerTriagem() {
  var existentes = ScriptApp.getProjectTriggers();
  for (var i = 0; i < existentes.length; i++) {
    if (existentes[i].getHandlerFunction() === 'triagemNotificadorPeriodico') {
      ScriptApp.deleteTrigger(existentes[i]);
    }
  }
  ScriptApp.newTrigger('triagemNotificadorPeriodico')
    .timeBased()
    .everyMinutes(30)
    .create();
  Logger.log('[Triagem] Trigger periódico (30 min) instalado.');
  return { ok: true };
}

/* ───────────────────────── Helpers privados ───────────────────────── */

/**
 * Acumula nota nova ao nota_joao existente, prefixando com timestamp + tag.
 * Mantém formato legível e auditável (sem perder histórico).
 */
function _triagemSvcAppendNota(notaExistente, notaNova, tag) {
  var prefixo = '[' + nowISO() + '] (' + (tag || 'nota') + ') ';
  var nova = prefixo + String(notaNova).trim();
  if (notaExistente && String(notaExistente).trim()) {
    return String(notaExistente).trim() + '\n\n' + nova;
  }
  return nova;
}

/* ═══════════════════════ Classificação automática (Sonnet server-side) ═══════════════════════
   Substitui o watcher local frágil: o SGA chama a Claude na nuvem para classificar
   cada triagem NOVO → TRIADO. Decisão João 2026-06-18: modelo Sonnet, camada VERDE
   classificada mas implementada sob demanda (não auto-corrige). */

var TRIAGEM_MODELO = 'claude-sonnet-4-6'; // Sonnet (decisão João)

/** Chama a Anthropic com um prompt e devolve {text, tokens}. Mesma infra do enriquecimento. */
function _triagemCallSonnet(prompt, maxTokens) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY não configurado em Script Properties.');
  var requestBody = {
    model: TRIAGEM_MODELO,
    max_tokens: maxTokens || 1500,
    messages: [{ role: 'user', content: prompt }]
  };
  var response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify(requestBody),
    muteHttpExceptions: true
  });
  var code = response.getResponseCode();
  var body = response.getContentText();
  if (code < 200 || code >= 300) throw new Error('Anthropic erro ' + code + ': ' + body.substring(0, 300));
  var parsed = JSON.parse(body);
  var txt = '';
  if (parsed.content) {
    for (var i = 0; i < parsed.content.length; i++) {
      if (parsed.content[i].type === 'text' && parsed.content[i].text) txt += parsed.content[i].text; // concatena (não sobrescreve) blocos múltiplos
    }
  }
  if (!txt) throw new Error('Anthropic sem bloco de texto.');
  return { text: txt, tokens: (parsed.usage ? ((parsed.usage.input_tokens || 0) + (parsed.usage.output_tokens || 0)) : 0) };
}

/** Extrai JSON tolerante (remove cercas markdown; pega do 1º { ao último }). */
function _triagemExtrairJson(raw) {
  var s = String(raw || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(s); } catch (e) {}
  var a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(s.substring(a, b + 1).replace(/```/g, '')); } catch (e2) {} }
  return null;
}

/**
 * Classifica UMA triagem chamando o Sonnet. Lê o FB original, classifica em
 * camada/tipo/severidade/esforço + análise, e grava (NOVO → TRIADO).
 * @param {string} fb_id
 * @return {Object} triagem classificada (sanitizada)
 */
function triagemSvcClassificar(fb_id) {
  if (!fb_id) throw new Error('fb_id é obrigatório.');
  var fb = _triagemSvcGetFeedback(fb_id);
  if (!fb) throw new Error('FB não encontrado: ' + fb_id);

  var prompt =
    'Você é o JUIZ da triagem de feedback do SGA (Sistema de Gestão Allegro), um CRM em Google Apps Script + Sheets.\n' +
    'Classifique o relato abaixo. NÃO implemente nada — só classifique e analise.\n\n' +
    'RELATO DO USUÁRIO:\n' +
    '- Tipo sugerido: ' + (fb.tipo || '?') + '\n' +
    '- Tela: ' + (fb.tela || '?') + '\n' +
    '- Título: ' + (fb.titulo || '') + '\n' +
    '- Descrição (verbatim): """' + String(fb.descricao || '').slice(0, 2000) + '"""\n\n' +
    'CAMADAS DE RISCO (política de autonomia):\n' +
    '- VERDE: cosmético/seguro (CSS, texto, cor, layout, ordenação) — zero risco a dados/lógica/permissão.\n' +
    '- AMARELO: lógica/comportamento revisável, SEM mexer em schema de planilha nem em permissão/alçada.\n' +
    '- VERMELHO: mexe em schema (colunas/abas), RBAC/permissão, regra financeira/alçada, ou é feature grande/arriscada.\n' +
    'REGRA DE OURO: na dúvida, SOBE a camada (nunca desce).\n\n' +
    'Responda EXCLUSIVAMENTE com JSON válido (sem markdown, sem texto antes/depois):\n' +
    '{\n' +
    '  "camada": "VERDE|AMARELO|VERMELHO",\n' +
    '  "tipo_confirmado": "ERRO|SUGESTAO|MELHORIA",\n' +
    '  "severidade": "CRITICA|ALTA|MEDIA|BAIXA",\n' +
    '  "esforco": "P|M|G",\n' +
    '  "analise_md": "análise em markdown: provável causa, onde mexer (tela/módulo), impacto e recomendação (CORRIGIR JÁ / BACKLOG / RECUSAR). Cite a mensagem original se houver detalhe relevante."\n' +
    '}';

  var res = _triagemCallSonnet(prompt, 1500);
  var data = _triagemExtrairJson(res.text);
  if (!data || !data.camada) throw new Error('Sonnet não retornou JSON de classificação válido.');

  var camada = String(data.camada || '').toUpperCase();
  var tipo   = String(data.tipo_confirmado || fb.tipo || 'SUGESTAO').toUpperCase();
  var sev    = String(data.severidade || 'MEDIA').toUpperCase();
  var esf    = String(data.esforco || 'M').toUpperCase();
  if (!TRIAGEM_CAMADAS[camada]) camada = 'VERMELHO';   // dúvida = sobe
  if (!TRIAGEM_TIPOS[tipo]) tipo = 'SUGESTAO';
  if (!TRIAGEM_SEVERIDADES[sev]) sev = 'MEDIA';
  if (!TRIAGEM_ESFORCOS[esf]) esf = 'M';

  var analise = (String(data.analise_md || '').trim() ||
    ('Classificado automaticamente como ' + camada + '.')) +
    '\n\n_— Triagem automática (Sonnet · ' + nowISO() + ' · ~' + res.tokens + ' tokens)_';

  appendAuditLog('TRIAGEM_CLASSIFICAR_IA', TRIAGEM_SHEET, fb_id,
    camada + ' · ' + sev + ' · ' + esf + ' · tokens=' + res.tokens);

  return triagemSvcUpsertAnalysis(fb_id, {
    camada: camada, tipo_confirmado: tipo, severidade: sev, esforco: esf,
    titulo: fb.titulo, autor_fb: fb.criado_por_nome || fb.criado_por, tela: fb.tela,
    analise_md: analise
  });
}

/**
 * Classifica todas as triagens em estado NOVO (até `limite`). Roda via trigger
 * periódico e sob demanda. Idempotente: só pega NOVO.
 * @param {number} [limite=5]
 * @return {{classificados:number, falhas:number, restantes:number}}
 */
function triagemSvcClassificarPendentes(limite) {
  limite = limite || 5;
  var rows = sheetToObjects(TRIAGEM_SHEET);
  var novos = [];
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].estado) === TRIAGEM_ESTADOS.NOVO) novos.push(rows[i].fb_id);
  }
  var ok = 0, fail = 0;
  for (var j = 0; j < novos.length && ok < limite; j++) {
    try { triagemSvcClassificar(novos[j]); ok++; }
    catch (e) { fail++; Logger.log('[Triagem] classificar ' + novos[j] + ': ' + e.message); }
  }
  return { classificados: ok, falhas: fail, restantes: Math.max(0, novos.length - ok) };
}

/** Handler do trigger periódico (a cada 5 min). */
function triagemClassificadorPeriodico() {
  try { return triagemSvcClassificarPendentes(5); }
  catch (e) { Logger.log('[Triagem] classificador periódico: ' + e.message); return { ok: false, error: e.message }; }
}

/** Instala o trigger de classificação (5 min). Idempotente. */
function instalarTriggerTriagemClassificador() {
  var ex = ScriptApp.getProjectTriggers();
  for (var i = 0; i < ex.length; i++) {
    if (ex[i].getHandlerFunction() === 'triagemClassificadorPeriodico') ScriptApp.deleteTrigger(ex[i]);
  }
  ScriptApp.newTrigger('triagemClassificadorPeriodico').timeBased().everyMinutes(5).create();
  Logger.log('[Triagem] Trigger classificador (5 min) instalado.');
  return { ok: true };
}

/** Garante o trigger instalado uma única vez (chamado lazy pela guia). */
function _triagemGarantirTriggerClassificador() {
  var trs = ScriptApp.getProjectTriggers();
  for (var i = 0; i < trs.length; i++) {
    if (trs[i].getHandlerFunction() === 'triagemClassificadorPeriodico') return; // já existe
  }
  instalarTriggerTriagemClassificador();
}
