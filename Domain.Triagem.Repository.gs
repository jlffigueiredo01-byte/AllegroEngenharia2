// =============================================================================
// Domain.Triagem.Repository.gs — SGA
// CRUD da aba TRIAGENS. Único ponto de leitura/escrita do estado vivo
// das triagens — qualquer outra camada deve passar por aqui (não por
// sheetToObjects direto).
//
// Convenção: funções prefixadas com "_trg" são internas do domínio.
// LockService.getScriptLock() em TODA escrita combinada (read+update).
//
// AVISO sobre lock (CLAUDE.md): updateRowByIdSafe pega seu próprio lock —
// NUNCA chamar updateRowByIdSafe dentro de bloco que já segurou o lock,
// senão dá deadlock (LockService do GAS não é reentrante).
// =============================================================================

/* ───────────────────────── ID generator ───────────────────────── */

function _nextTriagemId() {
  return generateUniqueSequentialId(TRIAGEM_SHEET, 'TRIAGEM_COUNTER',
    function (n) { return 'TRG-' + String(n).padStart(5, '0'); });
}

function _nextTriagemLogId() {
  return 'TRL-' + String(getAndIncrementCounter('TRIAGEM_LOG_COUNTER')).padStart(6, '0');
}

/* ───────────────────────── Leitura ───────────────────────── */

/**
 * Lista triagens com filtros opcionais.
 * @param {Object} [filtros] {estado, camada, tipo_confirmado, severidade}
 * @return {Array} linhas ordenadas por atualizado_em DESC
 */
function _trgRepoList(filtros) {
  filtros = filtros || {};
  var rows = sheetToObjects(TRIAGEM_SHEET);
  if (filtros.estado) {
    rows = rows.filter(function (r) { return String(r.estado) === String(filtros.estado); });
  }
  if (filtros.camada) {
    rows = rows.filter(function (r) { return String(r.camada) === String(filtros.camada); });
  }
  if (filtros.tipo_confirmado) {
    rows = rows.filter(function (r) { return String(r.tipo_confirmado) === String(filtros.tipo_confirmado); });
  }
  if (filtros.severidade) {
    rows = rows.filter(function (r) { return String(r.severidade) === String(filtros.severidade); });
  }
  rows.sort(function (a, b) { return String(b.atualizado_em).localeCompare(String(a.atualizado_em)); });
  return rows;
}

/** Busca a triagem por FB-id (chave de negócio). Retorna null se não existir. */
function _trgRepoGetByFbId(fb_id) {
  if (!fb_id) return null;
  return findRowByValue(TRIAGEM_SHEET, 'fb_id', fb_id);
}

/** Busca por triagem_id (TRG-xxxxx). Retorna null se não existir. */
function _trgRepoGetById(triagem_id) {
  if (!triagem_id) return null;
  return findRowByValue(TRIAGEM_SHEET, 'id', triagem_id);
}

/* ───────────────────────── Escrita ───────────────────────── */

/**
 * Upsert por fb_id: cria nova linha se não existir, atualiza a existente
 * se já houver. Idempotente. Usado pelo Sonnet para gravar análise e
 * pelos serviços para mudanças incrementais (nota, estado, etc).
 *
 * @param {string} fb_id     FB-xxxxx — chave de negócio
 * @param {Object} rec       campos a gravar (parcial — só os campos passados são tocados)
 * @return {Object}          a triagem após upsert (com id preenchido)
 */
function _trgRepoUpsertByFbId(fb_id, rec) {
  if (!fb_id) throw new Error('fb_id é obrigatório no upsert da triagem.');
  rec = rec || {};

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var existente = _trgRepoGetByFbId(fb_id);
    var now = nowISO();

    if (existente) {
      // Update — usa updateRowById (não Safe — já temos o lock)
      var patch = {};
      var keys = Object.keys(rec);
      for (var i = 0; i < keys.length; i++) {
        // não sobrescreve id/fb_id/criado_em em update
        if (keys[i] === 'id' || keys[i] === 'fb_id' || keys[i] === 'criado_em') continue;
        patch[keys[i]] = rec[keys[i]];
      }
      patch.atualizado_em = now;
      updateRowById(TRIAGEM_SHEET, existente.id, patch);
      // Retorna versão atualizada (merge in-memory pra não fazer outro read)
      var merged = {};
      var k;
      for (k in existente) merged[k] = existente[k];
      for (k in patch) merged[k] = patch[k];
      return merged;
    }

    // Insert — gera id próprio, preenche obrigatórios
    var id = _nextTriagemId();
    var row = {
      id: id,
      fb_id: fb_id,
      estado: rec.estado || TRIAGEM_ESTADOS.NOVO,
      camada: rec.camada || '',
      tipo_confirmado: rec.tipo_confirmado || '',
      severidade: rec.severidade || '',
      esforco: rec.esforco || '',
      titulo: rec.titulo || '',
      autor_fb: rec.autor_fb || '',
      tela: rec.tela || '',
      analise_md: rec.analise_md || '',
      arquivos_tocados: rec.arquivos_tocados || '',
      diff_resumo: rec.diff_resumo || '',
      snapshot_path: rec.snapshot_path || '',
      erro_msg: rec.erro_msg || '',
      nota_joao: rec.nota_joao || '',
      versao_apps_script: rec.versao_apps_script || '',
      hist_estados_json: rec.hist_estados_json || '[]',
      criado_em: now,
      atualizado_em: now
    };
    appendRowToSheet(TRIAGEM_SHEET, row, TRIAGEM_HEADERS);
    return row;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Transição de estado controlada — valida pela máquina de estados,
 * atualiza histórico e grava log de auditoria.
 *
 * @param {string} fb_id      chave do FB
 * @param {string} novoEstado estado destino (TRIAGEM_ESTADOS.*)
 * @param {string} ator       quem disparou ("joao", "sonnet-juiz", "opus-executor", etc)
 * @param {string} [nota]     observação opcional registrada no histórico
 * @return {Object}           a triagem após transição
 */
function _trgRepoTransitionState(fb_id, novoEstado, ator, nota) {
  if (!fb_id) throw new Error('fb_id é obrigatório.');
  if (!novoEstado) throw new Error('novoEstado é obrigatório.');
  ator = ator || 'sistema';

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var trg = _trgRepoGetByFbId(fb_id);
    if (!trg) throw new Error('Triagem não encontrada para fb_id=' + fb_id);

    var estadoAtual = String(trg.estado || '');
    // Valida transição
    _triagemValidarEstado(estadoAtual, novoEstado);

    // Atualiza histórico — append novo evento
    var hist = [];
    try { hist = JSON.parse(trg.hist_estados_json || '[]'); } catch (e) { hist = []; }
    if (!hist.length || hist[hist.length - 1].para !== novoEstado || hist[hist.length - 1].de !== estadoAtual) {
      hist.push({
        de: estadoAtual,
        para: novoEstado,
        ts: nowISO(),
        ator: ator,
        nota: nota || ''
      });
    }

    var now = nowISO();
    updateRowById(TRIAGEM_SHEET, trg.id, {
      estado: novoEstado,
      hist_estados_json: JSON.stringify(hist),
      atualizado_em: now
    });

    // Log de auditoria (mesma transação)
    _trgLogAppend(trg.id, fb_id, ator, 'TRANSITION', {
      de: estadoAtual,
      para: novoEstado,
      nota: nota || ''
    });

    // Retorna versão mesclada
    trg.estado = novoEstado;
    trg.hist_estados_json = JSON.stringify(hist);
    trg.atualizado_em = now;
    return trg;
  } finally {
    lock.releaseLock();
  }
}

/* ───────────────────────── Log de auditoria ───────────────────────── */

/**
 * Grava uma linha no TRIAGEM_LOG. Auditoria fina do ciclo.
 * Não pega lock — assume que o caller já está dentro de um (ou que é uma
 * gravação atômica simples — appendRow do Sheets é serializada pelo backend).
 *
 * @param {string} triagem_id  TRG-xxxxx
 * @param {string} fb_id       FB-xxxxx
 * @param {string} ator        ator que disparou
 * @param {string} evento      ANALYSIS_UPSERT | TRANSITION | COMMENT | RECUSE | etc
 * @param {Object} [payload]   detalhes (será JSON.stringify)
 */
function _trgLogAppend(triagem_id, fb_id, ator, evento, payload) {
  try {
    var row = {
      id: _nextTriagemLogId(),
      triagem_id: triagem_id || '',
      fb_id: fb_id || '',
      ts: nowISO(),
      ator: ator || 'sistema',
      evento: evento || 'UNKNOWN',
      payload_json: JSON.stringify(payload || {})
    };
    appendRowToSheet(TRIAGEM_LOG_SHEET, row, TRIAGEM_LOG_HEADERS);
  } catch (e) {
    Logger.log('[Triagem] _trgLogAppend falhou: ' + e.message);
  }
}
