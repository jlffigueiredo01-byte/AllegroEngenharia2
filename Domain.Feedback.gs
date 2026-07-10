// =============================================================================
// Domain.Feedback.gs — SGA
// Ciclo de construção colaborativa (fase 1): captura → UM arquivo FB-xxxxx.md
// por relato é gravado na hora na pasta do Drive (robusto, sem filtro de data)
// → no fim do dia, e-mail de resumo para o João. Os agentes do Claude Code
// leem os FB-*.md ainda não triados (sem PLANO correspondente).
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
  'anexo_url', 'anexo_name',  // primeiro anexo (retrocompat)
  'anexos_json',              // lista completa [{url,name}] (múltiplos anexos)
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
 *                        anexos:[{base64,mime,name}]}  (também aceita anexo único)
 */
function fbSvcCriar(data) {
  var user = requireAuth();
  if (!data || !data.descricao || !String(data.descricao).trim()) {
    throw new Error('Descreva o que aconteceu.');
  }
  var tipo = FEEDBACK_TIPOS[data.tipo] || 'SUGESTAO';

  // anexos (prints) → pasta de feedback no Drive. Aceita lista (data.anexos)
  // ou um único (data.anexo, retrocompat). Salva todos; o 1º também vai nas
  // colunas anexo_url/anexo_name para compatibilidade.
  var lista = [];
  if (data.anexos && data.anexos.length) lista = data.anexos;
  else if (data.anexo && data.anexo.base64) lista = [data.anexo];

  var anexos = [];
  if (lista.length) {
    try {
      var base = drvGetFolder('SISTEMA_FEEDBACK');
      if (base) {
        for (var ai = 0; ai < lista.length; ai++) {
          var a = lista[ai];
          if (!a || !a.base64) continue;
          var blob = Utilities.newBlob(
            Utilities.base64Decode(a.base64),
            a.mime || 'image/png',
            a.name || ('feedback-' + new Date().getTime() + '-' + ai + '.png'));
          var file = base.createFile(blob);
          // T6 (revisão geral): sem link público — o anexo herda a permissão
          // da pasta Feedback do Drive (quem tem acesso à pasta vê).
          anexos.push({ url: file.getUrl(), name: a.name || file.getName() });
        }
      }
    } catch (eDrive) {
      Logger.log('fbSvcCriar anexo: ' + eDrive.message);
    }
  }
  var anexoUrl = anexos.length ? anexos[0].url : '';
  var anexoName = anexos.length ? anexos[0].name : '';

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
    anexos_json: JSON.stringify(anexos),
    contexto_json: JSON.stringify(data.contexto || {}),
    criado_por: user.id, criado_por_nome: user.name || user.id, criado_em: now,
    compilado_em: '', camada: '', resolucao_nota: '', atualizado_em: now
  };
  var sh = getOrCreateSheet(FEEDBACK_SHEET, FEEDBACK_HEADERS);
  // Garante que toda coluna de FEEDBACK_HEADERS exista na aba (adiciona faltantes
  // no fim — ex.: `criado_por` que estava ausente e causava o desalinhamento).
  // Não reordena nem mexe nas colunas existentes. Combinado com a gravação
  // header-aware abaixo, resolve sem precisar editar a planilha à mão.
  try { ensureColumns(sh, FEEDBACK_HEADERS); } catch (eC) { Logger.log('fbSvcCriar ensureColumns: ' + eC.message); }
  // Gravação HEADER-AWARE: mapeia cada valor pela COLUNA REAL da planilha (pelo
  // nome do cabeçalho), NÃO posicionalmente. Corrige o desalinhamento (bug
  // "Quando: Joao" / criado_por e contexto_json deslocados) quando a ordem das
  // colunas da aba diverge de FEEDBACK_HEADERS.
  var _hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var row = [];
  for (var i = 0; i < _hdr.length; i++) {
    var _k = String(_hdr[i]).trim();
    row.push(rec.hasOwnProperty(_k) ? rec[_k] : '');
  }
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

  // GERAÇÃO IMEDIATA, UM ARQUIVO POR RELATO: grava FB-xxxxx.md na hora.
  // Mais robusto que reescrever um arquivo do dia (sem filtro de data/fuso),
  // e o trigger detecta cada novo arquivo facilmente. (best-effort)
  try { _fbGravarRelato(rec); } catch (eMd) { Logger.log('fbSvcCriar md: ' + eMd.message); }

  // Cria o card de triagem em NOVO NA HORA — aparece na guia Triagens
  // imediatamente, sem depender de watcher/Drive sync/PLANO. best-effort.
  try {
    if (typeof triagemSvcCriarNovo === 'function') {
      triagemSvcCriarNovo(id, {
        titulo: rec.titulo,
        autor_fb: rec.criado_por_nome || rec.criado_por,
        tela: rec.tela
      });
    }
  } catch (eTrg) { Logger.log('fbSvcCriar triagem NOVO: ' + eTrg.message); }

  return { id: id };
}

/** Os relatos do próprio usuário, com status (fecha o ciclo).
 *  Match ROBUSTO: o id do usuário em cache pode divergir do criado_por gravado
 *  (drift de id, email vs id, caixa/espaço). Casa por id OU email no campo
 *  criado_por, e por nome no campo criado_por_nome — normalizado. Evita o caso
 *  "aparece em Melhorias mas some em Meus reportes". */
function fbSvcMeus() {
  var user = requireAuth();
  var _norm = function (v) { return String(v == null ? '' : v).trim().toLowerCase(); };
  // Conjunto de chaves de identidade do usuário (id, email, nome) + o id derivado
  // do nome na convenção "USR-NOME" (ex.: "Joao" → "usr-joao"). Cobre o drift e a
  // convenção de geração de id usada nos relatos antigos.
  var keys = {};
  var cand = [user.id, user.email, user.name];
  for (var c = 0; c < cand.length; c++) { if (cand[c]) keys[_norm(cand[c])] = true; }
  if (user.name) {
    var _n = _norm(user.name);
    keys['usr-' + _n] = true;
    keys['usr-' + _n.split(' ')[0]] = true;
  }
  var rows = sheetToObjects(FEEDBACK_SHEET).filter(function (r) {
    // Dados antigos podem estar desalinhados — confere os 3 campos onde a
    // identidade do autor pode ter caído (criado_por, criado_por_nome, criado_em).
    return !!(keys[_norm(r.criado_por)] || keys[_norm(r.criado_por_nome)] || keys[_norm(r.criado_em)]);
  });
  // FB-032: ordena do mais recente p/ o mais antigo pelo NÚMERO do FB (robusto
  // mesmo se criado_em vier inconsistente/desalinhado na planilha).
  rows.sort(function (a, b) {
    var na = parseInt(String(a.id).replace(/\D/g, ''), 10) || 0;
    var nb = parseInt(String(b.id).replace(/\D/g, ''), 10) || 0;
    return nb - na;
  });
  return rows.slice(0, 50);
}

/* ──────────────── Mesa de comando: tarefa para os agentes ──────────────── */

/**
 * Gera TAREFA-FB-xxxxx.md na pasta SISTEMA_TAREFAS do Drive quando o João
 * aprova um relato na guia de Melhorias. A camada decide a instrução:
 *   VERDE/AMARELO → IMPLEMENTAR na /dev (João revisa e publica);
 *   VERMELHO      → PROPOR (escrever plano; NÃO implementar sem novo OK).
 * Camada vazia (ainda não triada) → tratada como VERMELHO por segurança.
 */
function _fbGerarTarefaAgente(id, nota) {
  var rec = null;
  var rows = sheetToObjects(FEEDBACK_SHEET);
  for (var i = 0; i < rows.length; i++) { if (rows[i].id === id) { rec = rows[i]; break; } }
  if (!rec) return null;

  // A camada confiável vive na aba TRIAGENS (gravada pelo Sonnet). Prefere ela;
  // cai para o FEEDBACKS só se não houver triagem. Também puxa a análise do Sonnet
  // para a TAREFA ficar auto-contida (classificação + mensagem original juntas).
  var camada = String(rec.camada || '').toUpperCase();
  var analiseSonnet = '';
  try {
    if (typeof _trgRepoGetByFbId === 'function') {
      var trg = _trgRepoGetByFbId(id);
      if (trg) {
        if (trg.camada) camada = String(trg.camada).toUpperCase();
        analiseSonnet = String(trg.analise_md || '');
      }
    }
  } catch (eTrg) { /* sem triagem — segue com camada do FEEDBACKS */ }
  // na dúvida, sobe de camada (regra de ouro da política de autonomia)
  var modo = (camada === 'VERDE' || camada === 'AMARELO') ? 'IMPLEMENTAR' : 'PROPOR';
  var emoji = { ERRO: '🐛', SUGESTAO: '💡', MELHORIA: '⬆️' };

  // T1 (revisão geral): '\n' de verdade — antes saía '\\n' literal e o
  // markdown da TAREFA virava uma linha só ilegível.
  var out = '# TAREFA — ' + rec.id + ' (' + (modo === 'IMPLEMENTAR' ? '🟢🟡 IMPLEMENTAR' : '🔴 PROPOR') + ')\n\n';
  out += '> Aprovada pelo João na guia de Melhorias em ' + nowISO() + '.\n';
  out += '> Leia `docs/POLITICA_AUTONOMIA_AGENTES.md` e `PROMPT_TRIAGEM.md` antes.\n\n';
  out += '## Decisão do João\n';
  out += '- **Camada:** ' + (camada || 'não classificada → tratar como VERMELHO') + '\n';
  out += '- **Modo:** ' + modo + '\n';
  if (nota) out += '- **Nota do João:** ' + nota + '\n';
  out += '\n## O que fazer\n';
  if (modo === 'IMPLEMENTAR') {
    out += '1. Implemente a correção/melhoria na `/dev`.\n';
    out += '2. Registre o estado anterior (reversível) e rode as validações.\n';
    out += '3. NÃO publique para `/exec` — o João revisa e publica.\n';
    out += '4. Atualize o status do ' + rec.id + ' na aba FEEDBACKS e cite o ' + rec.id + '.\n';
  } else {
    out += '1. NÃO implemente. Escreva a proposta (causa, impacto pela Interligação\n';
    out += '   Total, esforço, risco, esboço da solução) em `PLANO-' + rec.id + '.md`.\n';
    out += '2. Aguarde novo OK explícito do João antes de tocar em código.\n';
  }
  out += '\n## Relato original\n\n';
  out += '### ' + (emoji[rec.tipo] || '') + ' ' + (rec.titulo || '') + '\n\n';
  out += '- **Tipo:** ' + rec.tipo + ' · **Tela:** ' + (rec.tela || '?') + ' · **Por:** ' + (rec.criado_por_nome || rec.criado_por) + '\n\n';
  out += '> ' + String(rec.descricao || '').replace(/\n/g, '\n> ') + '\n';
  if (rec.anexo_url) out += '\n📎 [anexo](' + rec.anexo_url + ')\n';

  // Classificação do Sonnet vai JUNTO (TAREFA auto-contida: original + classificação).
  if (analiseSonnet && analiseSonnet.trim()) {
    out += '\n## 🧠 Classificação do Sonnet\n\n' + analiseSonnet.trim() + '\n';
  }
  out += '\n> ⚠️ Se a classificação acima divergir da MENSAGEM ORIGINAL do usuário\n';
  out += '> (seção "Relato original" acima), a mensagem original PREVALECE. Releia o\n';
  out += '> relato verbatim antes de codar — detalhes do usuário não devem se perder no resumo.\n';

  var pasta = drvGetFolder('SISTEMA_TAREFAS');
  if (!pasta) return null;
  var nomeArq = 'TAREFA-' + rec.id + '.md';
  var existentes = pasta.getFilesByName(nomeArq);
  while (existentes.hasNext()) existentes.next().setTrashed(true);
  var file = pasta.createFile(nomeArq, out, 'text/markdown');
  return { arquivo: nomeArq, modo: modo, url: file.getUrl() };
}

/* ──────────────── Geração imediata do .md (um por relato) ──────────────── */

/**
 * Grava UM arquivo por relato: FB-xxxxx.md na pasta de feedback do Drive.
 * Robusto: sem filtro de data (que sofria com fuso horário) e o trigger
 * detecta cada novo arquivo de forma simples. Idempotente (regrava se já existe).
 */
function _fbGravarRelato(rec) {
  var md = _fbMontarMarkdownRelato(rec);
  return _fbGravarNoDrive(rec.id + '.md', md);
}

/** Markdown de um único relato (formato amigável para o agente triar). */
function _fbMontarMarkdownRelato(r) {
  var emoji = { ERRO: '🐛', SUGESTAO: '💡', MELHORIA: '⬆️' };
  var out = '# ' + (emoji[r.tipo] || '') + ' ' + r.id + ' — ' + (r.titulo || '') + '\n\n';
  out += '> Relato de usuário do SGA. Triagem: ver `PROMPT_TRIAGEM.md`. Agente PROPÕE, decisão é do João.\n\n';
  out += '- **Tipo (sugerido pelo usuário):** ' + r.tipo + '\n';
  out += '- **Tela:** ' + (r.tela || 'não informada') + '\n';
  out += '- **Por:** ' + (r.criado_por_nome || r.criado_por) + '\n';
  out += '- **Quando:** ' + r.criado_em + '\n';
  if (r.urgente === 'TRUE') out += '- 🚨 **URGENTE — está impedindo o trabalho**\n';
  out += '- **Status:** ' + r.status + '\n';
  var ctx = {};
  try { ctx = JSON.parse(r.contexto_json || '{}'); } catch (e) {}
  if (ctx.build) out += '- **Versão do deploy:** ' + ctx.build + '\n';
  if (ctx.entity && ctx.entity.id) out += '- **Registro aberto:** ' + (ctx.entity.secao || '?') + ' / ' + ctx.entity.id + '\n';
  out += '\n## Descrição\n\n> ' + String(r.descricao || '').replace(/\n/g, '\n> ') + '\n';
  var _anexos = []; try { _anexos = JSON.parse(r.anexos_json || '[]'); } catch (e) {}
  if (!_anexos.length && r.anexo_url) _anexos = [{ url: r.anexo_url, name: r.anexo_name || 'anexo' }];
  for (var _ai = 0; _ai < _anexos.length; _ai++) out += '\n📎 [' + (_anexos[_ai].name || 'anexo') + '](' + _anexos[_ai].url + ')\n';
  // FB-033 — diagnóstico enriquecido. As chamadas ao servidor que falharam vêm
  // primeiro (maior valor pra entender de onde veio o erro).
  if (ctx.serverErrors && ctx.serverErrors.length) {
    out += '\n<details><summary>⚠️ chamadas ao servidor que FALHARAM (' + ctx.serverErrors.length + ')</summary>\n\n```\n';
    for (var _se = 0; _se < ctx.serverErrors.length; _se++) {
      var se = ctx.serverErrors[_se];
      out += '[' + (se.t || '') + '] ' + (se.fn || '?') + ' (' + (se.dur || '?') + 'ms)\n  args: ' + (se.args || '') + '\n  erro: ' + (se.err || '') + '\n';
    }
    out += '```\n</details>\n';
  }
  if (ctx.jsErrors && ctx.jsErrors.length) {
    out += '\n<details><summary>erros JS capturados na sessão</summary>\n\n```\n' +
      ctx.jsErrors.join('\n').slice(0, 1000) + '\n```\n</details>\n';
  }
  if (ctx.consoleErrors && ctx.consoleErrors.length) {
    out += '\n<details><summary>console.error / warn (' + ctx.consoleErrors.length + ')</summary>\n\n```\n';
    for (var _ce = 0; _ce < ctx.consoleErrors.length; _ce++) {
      var ce = ctx.consoleErrors[_ce];
      out += '[' + (ce.t || '') + '] ' + (ce.level || '') + ': ' + (ce.msg || '') + '\n';
    }
    out += '```\n</details>\n';
  }
  if (ctx.trail && ctx.trail.length) {
    out += '\n<details><summary>trilha de interações (' + ctx.trail.length + ' passos)</summary>\n\n```\n';
    for (var _tr = 0; _tr < ctx.trail.length; _tr++) {
      var tr = ctx.trail[_tr];
      out += '[' + (tr.t || '') + '] ' + (tr.k || '') + ': ' + (tr.d || '') + '\n';
    }
    out += '```\n</details>\n';
  }
  if (ctx.userAgent) out += '\n<sub>sessão: ' + (ctx.papel || '') + ' · ' + (ctx.viewport || '') + ' · ' + ctx.userAgent + '</sub>\n';
  return out;
}

/**
 * Regrava todos os relatos NOVO como arquivos individuais. Rede de segurança
 * e correção retroativa (ex.: relatos que ficaram sem .md por bug anterior).
 */
function _fbRegravarTodosNovos() {
  var novos = sheetToObjects(FEEDBACK_SHEET).filter(function (r) { return r.status === 'NOVO'; });
  var n = 0;
  for (var i = 0; i < novos.length; i++) {
    try { _fbGravarRelato(novos[i]); n++; } catch (e) { Logger.log('regravar ' + novos[i].id + ': ' + e.message); }
  }
  return { ok: true, gravados: n };
}

/* ──────────────── Resumo diário por e-mail (por tempo) ──────────────── */

/**
 * Resumo do dia por e-mail. NÃO gera mais o arquivo (isso agora é por ação,
 * em _fbGravarRelato). Conta os relatos NOVO por tipo e avisa o
 * João. Roda no trigger diário. Garante também que o .md do dia esteja gravado
 * (rede de segurança, caso alguma gravação por ação tenha falhado).
 */
function fbResumoDiario() {
  var hoje = new Date();
  var dataStr = hoje.getFullYear() + '-' + ('0' + (hoje.getMonth() + 1)).slice(-2) + '-' + ('0' + hoje.getDate()).slice(-2);
  var doDia = sheetToObjects(FEEDBACK_SHEET).filter(function (r) { return r.status === 'NOVO'; });

  // rede de segurança: garante que todo relato NOVO tem seu .md
  try { _fbRegravarTodosNovos(); } catch (e) { Logger.log('[Feedback] resumo md: ' + e.message); }

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

/** Compat: regrava todos os relatos NOVO como arquivos individuais. */
function fbCompilarECommitar() {
  return _fbRegravarTodosNovos();
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
    // remove versão anterior de mesmo nome (idempotente)
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
