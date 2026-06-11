// =============================================================================
// Domain.Caixa.Repository.gs
// Fase F16 — Acesso a dados do Livro Caixa e Reconciliações
// Todas as operações de escrita usam LockService para segurança em concorrência.
// =============================================================================

// ---------------------------------------------------------------------------
// CASH_LEDGER — movimentos de caixa
// ---------------------------------------------------------------------------

/**
 * Insere um novo movimento no livro caixa.
 * @param {Object} entry - Objeto com campos de CASH_LEDGER_HEADERS.
 */
function cashRepoCreate(entry) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    appendRowToSheet(CASH_LEDGER_SHEET, entry, CASH_LEDGER_HEADERS);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Retorna todos os movimentos do livro caixa.
 * @returns {Object[]}
 */
function cashRepoGetAll() {
  return sheetToObjects(CASH_LEDGER_SHEET);
}

/**
 * Retorna os movimentos de um período específico.
 * @param {string} period - Período no formato 'AAAA-MM'.
 * @returns {Object[]}
 */
function cashRepoGetByPeriod(period) {
  return cashRepoGetAll().filter(function(r) {
    return (String(r.date || '')).slice(0, 7) === period;
  });
}

/**
 * Atualiza campos de um movimento existente pelo id.
 * Acrescenta updated_at automaticamente.
 * @param {string} id - ID do movimento (ex.: 'CX-1').
 * @param {Object} updates - Campos a atualizar.
 * @returns {boolean} true se encontrado e atualizado.
 */
function cashRepoUpdate(id, updates) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return updateRowById(
      CASH_LEDGER_SHEET,
      id,
      Object.assign({}, updates, { updated_at: nowISO() })
    );
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// RECONCILIATIONS — reconciliações mensais
// ---------------------------------------------------------------------------

/**
 * Insere um novo registro de reconciliação.
 * @param {Object} rec - Objeto com campos de RECONCILIATIONS_HEADERS.
 */
function reconRepoCreate(rec) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    appendRowToSheet(RECONCILIATIONS_SHEET, rec, RECONCILIATIONS_HEADERS);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Retorna a reconciliação de um período, ou null se não existir.
 * @param {string} period - Período no formato 'AAAA-MM'.
 * @returns {Object|null}
 */
function reconRepoGetByPeriod(period) {
  var all = sheetToObjects(RECONCILIATIONS_SHEET);
  for (var i = 0; i < all.length; i++) {
    if (all[i].period === period) return all[i];
  }
  return null;
}

/**
 * Retorna todas as reconciliações.
 * @returns {Object[]}
 */
function reconRepoGetAll() {
  return sheetToObjects(RECONCILIATIONS_SHEET);
}

/**
 * Atualiza campos de uma reconciliação existente pelo id.
 * Acrescenta updated_at automaticamente.
 * @param {string} id - ID da reconciliação (ex.: 'REC-202506').
 * @param {Object} updates - Campos a atualizar.
 * @returns {boolean} true se encontrado e atualizado.
 */
function reconRepoUpdate(id, updates) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return updateRowById(
      RECONCILIATIONS_SHEET,
      id,
      Object.assign({}, updates, { updated_at: nowISO() })
    );
  } finally {
    lock.releaseLock();
  }
}
