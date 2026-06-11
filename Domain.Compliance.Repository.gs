// ============================================================
// Domain.Compliance.Repository.gs — ALLEGRO Business System
// F18 — Compliance / HSE
// Acesso a dados — HSE_DOCS e REFERENCE_INSTRUMENTS.
// Toda escrita usa LockService para evitar condição de corrida.
// ============================================================

// ------------------------------------------------------------
// HSE_DOCS — Repositório
// ------------------------------------------------------------

/**
 * Retorna todos os documentos HSE cadastrados.
 * @returns {Object[]}
 */
function hseRepoGetAll() {
  return sheetToObjects(HSE_DOCS_SHEET);
}

/**
 * Retorna os documentos HSE de um técnico específico.
 * @param {string} userId
 * @returns {Object[]}
 */
function hseRepoGetByUser(userId) {
  return hseRepoGetAll().filter(function(r) {
    return String(r.user_id).trim() === String(userId).trim();
  });
}

/**
 * Retorna um documento HSE pelo ID.
 * @param {string} id
 * @returns {Object|null}
 */
function hseRepoGetById(id) {
  var all = hseRepoGetAll();
  for (var i = 0; i < all.length; i++) {
    if (String(all[i].id).trim() === String(id).trim()) return all[i];
  }
  return null;
}

/**
 * Insere um novo documento HSE.
 * Usa LockService para evitar escrita concorrente.
 * @param {Object} doc Objeto com todos os campos de HSE_DOCS_HEADERS.
 */
function hseRepoCreate(doc) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    appendRowToSheet(HSE_DOCS_SHEET, doc, HSE_DOCS_HEADERS);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Atualiza campos de um documento HSE existente.
 * Usa LockService para evitar escrita concorrente.
 * @param {string} id    ID do documento HSE.
 * @param {Object} updates Mapa de campo → valor a atualizar.
 */
function hseRepoUpdate(id, updates) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    updateRowById(HSE_DOCS_SHEET, id, updates);
  } finally {
    lock.releaseLock();
  }
}

// ------------------------------------------------------------
// REFERENCE_INSTRUMENTS — Repositório
// ------------------------------------------------------------

/**
 * Retorna todos os instrumentos de medição cadastrados.
 * @returns {Object[]}
 */
function instrRepoGetAll() {
  return sheetToObjects(REFERENCE_INSTRUMENTS_SHEET);
}

/**
 * Retorna um instrumento pelo ID.
 * @param {string} id
 * @returns {Object|null}
 */
function instrRepoGetById(id) {
  var all = instrRepoGetAll();
  for (var i = 0; i < all.length; i++) {
    if (String(all[i].id).trim() === String(id).trim()) return all[i];
  }
  return null;
}

/**
 * Insere um novo instrumento de medição.
 * Usa LockService para evitar escrita concorrente.
 * @param {Object} instr Objeto com todos os campos de REFERENCE_INSTRUMENTS_HEADERS.
 */
function instrRepoCreate(instr) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    appendRowToSheet(REFERENCE_INSTRUMENTS_SHEET, instr, REFERENCE_INSTRUMENTS_HEADERS);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Atualiza campos de um instrumento existente.
 * Usa LockService para evitar escrita concorrente.
 * @param {string} id      ID do instrumento.
 * @param {Object} updates Mapa de campo → valor a atualizar.
 */
function instrRepoUpdate(id, updates) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    updateRowById(REFERENCE_INSTRUMENTS_SHEET, id, updates);
  } finally {
    lock.releaseLock();
  }
}
