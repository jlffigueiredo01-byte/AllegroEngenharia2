// =============================================================================
// Domain.Feedback.gs — SGA
// Ciclo de construção colaborativa (fase 1): captura → compilação diária →
// commit do .md no repositório (onde os agentes do Claude Code trabalham).
//
// Entidades:
//   FEEDBACKS         um relato por linha (erro/sugestão/melhoria)
// Status do relato:
//   NOVO → COMPILADO → EM_ANALISE → APROVADO → IMPLEMENTADO | RECUSADO
//
// Configuração necessária em Script Properties (Projeto → Configurações):
//   GITHUB_TOKEN   PAT fine-grained, escopo Contents:write SÓ neste repo
//   GITHUB_REPO    ex.: jlffigueiredo01-byte/AllegroEngenharia2
//   GITHUB_BRANCH  ex.: yrdyrsdfgRuflo  (default: main)
//   FEEDBACK_HORA  hora do lote diário 0-23 (default: 19)
// ALERT_EMAIL (já usado pelos Action Cards) recebe os relatos urgentes.
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
    compilado_em: '', resolucao_nota: '', atualizado_em: now
  };
  var sh = getOrCreateSheet(FEEDBACK_SHEET, FEEDBACK_HEADERS);
  var row = [];
  for (var i = 0; i < FEEDBACK_HEADERS.length; i++) row.push(rec[FEEDBACK_HEADERS[i]]);
  sh.appendRow(row);

  // urgente: e-mail imediato para o diretor técnico (não espera o lote)
  if (data.urgente) {
    try {
      var to = PropertiesService.getScriptProperties().getProperty('ALERT_EMAIL') || getConfigValue('ALERT_EMAIL');
      if (to) {
        MailApp.sendEmail(to, '🚨 SGA — feedback URGENTE de ' + rec.criado_por_nome,
          rec.titulo + '\n\n' + rec.descricao + '\n\nTela: ' + rec.tela + '\nRelato: ' + id +
          (anexoUrl ? '\nAnexo: ' + anexoUrl : ''));
      }
    } catch (eMail) { Logger.log('fbSvcCriar email: ' + eMail.message); }
  }
  return { id: id };
}

/** Os relatos do próprio usuário, com status (fecha o ciclo). */
function fbSvcMeus() {
  var user = requireAuth();
  var rows = sheetToObjects(FEEDBACK_SHEET).filter(function (r) { return r.criado_por === user.id; });
  rows.sort(function (a, b) { return String(b.criado_em).localeCompare(String(a.criado_em)); });
  return rows.slice(0, 50);
}

/* ──────────────── Compilação diária + commit no repo ──────────────── */

/**
 * Agrupa os relatos NOVOS, gera o .md do dia, commita no repositório via
 * GitHub API e marca os relatos como COMPILADO. Roda no trigger diário,
 * mas também pode ser chamada manualmente (botão no dashboard).
 */
function fbCompilarECommitar() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var novos = sheetToObjects(FEEDBACK_SHEET).filter(function (r) { return r.status === 'NOVO'; });
    if (!novos.length) { Logger.log('[Feedback] nenhum relato novo.'); return { ok: true, compilados: 0 }; }

    var hoje = new Date();
    var dataStr = hoje.getFullYear() + '-' + ('0' + (hoje.getMonth() + 1)).slice(-2) + '-' + ('0' + hoje.getDate()).slice(-2);
    var md = _fbMontarMarkdown(novos, dataStr);

    var path = 'feedback/' + dataStr + '.md';
    var commit = _fbCommitGitHub(path, md,
      'feedback: ' + novos.length + ' relato(s) de ' + dataStr + ' [skip ci]');

    // marca como COMPILADO só se o commit deu certo (senão tenta de novo amanhã)
    if (commit.ok) {
      var now = nowISO();
      for (var i = 0; i < novos.length; i++) {
        updateRowById(FEEDBACK_SHEET, novos[i].id, { status: 'COMPILADO', compilado_em: dataStr, atualizado_em: now });
      }
    }
    Logger.log('[Feedback] ' + (commit.ok ? 'commitado ' + path : 'FALHA no commit: ' + commit.error));
    return { ok: commit.ok, compilados: commit.ok ? novos.length : 0, path: path, erro: commit.error };
  } finally {
    lock.releaseLock();
  }
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

/** Cria/atualiza um arquivo no repositório via GitHub Contents API. */
function _fbCommitGitHub(path, content, message) {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('GITHUB_TOKEN');
  var repo  = props.getProperty('GITHUB_REPO');
  var branch = props.getProperty('GITHUB_BRANCH') || 'main';
  if (!token || !repo) return { ok: false, error: 'GITHUB_TOKEN/GITHUB_REPO não configurados em Script Properties.' };

  var apiBase = 'https://api.github.com/repos/' + repo + '/contents/' + path;
  var headers = { Authorization: 'token ' + token, Accept: 'application/vnd.github+json' };

  // se o arquivo do dia já existe, precisamos do sha para atualizar
  var sha = null;
  try {
    var get = UrlFetchApp.fetch(apiBase + '?ref=' + encodeURIComponent(branch),
      { headers: headers, muteHttpExceptions: true });
    if (get.getResponseCode() === 200) sha = JSON.parse(get.getContentText()).sha;
  } catch (e) { /* arquivo ainda não existe */ }

  var payload = {
    message: message,
    content: Utilities.base64Encode(Utilities.newBlob(content).getBytes()),
    branch: branch
  };
  if (sha) payload.sha = sha;

  try {
    var put = UrlFetchApp.fetch(apiBase, {
      method: 'put', headers: headers, contentType: 'application/json',
      payload: JSON.stringify(payload), muteHttpExceptions: true
    });
    var code = put.getResponseCode();
    if (code === 200 || code === 201) return { ok: true };
    return { ok: false, error: 'HTTP ' + code + ': ' + put.getContentText().slice(0, 200) };
  } catch (e2) {
    return { ok: false, error: e2.message };
  }
}

/** Cria o trigger diário do lote (idempotente). Hora via FEEDBACK_HORA. */
function instalarTriggerFeedback() {
  var hora = parseInt(PropertiesService.getScriptProperties().getProperty('FEEDBACK_HORA') || '19', 10);
  var existentes = ScriptApp.getProjectTriggers();
  for (var i = 0; i < existentes.length; i++) {
    if (existentes[i].getHandlerFunction() === 'fbCompilarECommitar') ScriptApp.deleteTrigger(existentes[i]);
  }
  ScriptApp.newTrigger('fbCompilarECommitar').timeBased().everyDays(1).atHour(hora).create();
  Logger.log('[Feedback] Trigger diário às ' + hora + 'h.');
  return { ok: true, hora: hora };
}
