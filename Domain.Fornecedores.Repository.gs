// =============================================================================
// Domain.Fornecedores.Repository.gs
// Allegro Business System — Fase F15
// Acesso a dados das abas SUPPLIERS e MATERIALS. LockService em todas as escritas.
// =============================================================================

// ---------------------------------------------------------------------------
// SUPPLIERS
// ---------------------------------------------------------------------------

/**
 * Retorna todos os fornecedores cadastrados.
 * @returns {Object[]} Array de objetos com os campos de SUPPLIERS_HEADERS.
 */
function supplierRepoGetAll() {
  return sheetToObjects(SUPPLIERS_SHEET);
}

/**
 * Busca um fornecedor pelo ID.
 * @param {string} id - ID do fornecedor (ex: SUP-1).
 * @returns {Object|null} Objeto do fornecedor ou null se não encontrado.
 */
function supplierRepoGetById(id) {
  return supplierRepoGetAll().find(function(r) { return r.id === id; }) || null;
}

/**
 * Cria um novo registro de fornecedor na aba SUPPLIERS.
 * Utiliza LockService para evitar condições de corrida.
 * @param {Object} supplier - Objeto com todos os campos de SUPPLIERS_HEADERS.
 */
function supplierRepoCreate(supplier) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    appendRowToSheet(SUPPLIERS_SHEET, supplier, SUPPLIERS_HEADERS);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Atualiza campos de um fornecedor pelo ID.
 * Utiliza LockService para evitar condições de corrida.
 * @param {string} id      - ID do fornecedor a atualizar.
 * @param {Object} updates - Campos a atualizar (chave: nome da coluna).
 * @returns {boolean} true se a linha foi encontrada e atualizada.
 */
function supplierRepoUpdate(id, updates) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return updateRowById(SUPPLIERS_SHEET, id, updates);
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// MATERIALS
// ---------------------------------------------------------------------------

/**
 * Retorna todos os materiais cadastrados.
 * @returns {Object[]} Array de objetos com os campos de MATERIALS_HEADERS.
 */
function materialRepoGetAll() {
  return sheetToObjects(MATERIALS_SHEET);
}

/**
 * Busca um material pelo ID.
 * @param {string} id - ID do material (ex: MAT-1).
 * @returns {Object|null} Objeto do material ou null se não encontrado.
 */
function materialRepoGetById(id) {
  return materialRepoGetAll().find(function(r) { return r.id === id; }) || null;
}

/**
 * Busca um material pelo código (code). Utilizado no recebimento de NF.
 * @param {string} code - Código do material (ex: ACO-10MM).
 * @returns {Object|null} Objeto do material ou null se não encontrado.
 */
function materialRepoGetByCode(code) {
  return materialRepoGetAll().find(function(r) {
    return String(r.code).trim().toUpperCase() === String(code).trim().toUpperCase();
  }) || null;
}

/**
 * Cria um novo registro de material na aba MATERIALS.
 * Utiliza LockService para evitar condições de corrida.
 * @param {Object} material - Objeto com todos os campos de MATERIALS_HEADERS.
 */
function materialRepoCreate(material) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    appendRowToSheet(MATERIALS_SHEET, material, MATERIALS_HEADERS);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Atualiza campos de um material pelo ID.
 * Utiliza LockService para evitar condições de corrida.
 * @param {string} id      - ID do material a atualizar.
 * @param {Object} updates - Campos a atualizar (chave: nome da coluna).
 * @returns {boolean} true se a linha foi encontrada e atualizada.
 */
function materialRepoUpdate(id, updates) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return updateRowById(MATERIALS_SHEET, id, updates);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Persiste um registro de histórico de preço na aba MATERIAL_PRICES.
 * Usa LockService para evitar condições de corrida.
 *
 * @param {Object} priceRecord - Objeto com os campos de MATERIAL_PRICES_HEADERS.
 * @returns {void}
 */
function materialPriceRepoCreate(priceRecord) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    appendRowToSheet(MATERIAL_PRICES_SHEET, priceRecord, MATERIAL_PRICES_HEADERS);
  } finally {
    lock.releaseLock();
  }
}
