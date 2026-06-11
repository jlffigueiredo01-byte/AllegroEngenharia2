// =============================================================================
// Domain.Compras.Repository.gs
// Allegro Business System — Fase F15
// Acesso a dados da aba PURCHASE_ORDERS. LockService em todas as escritas.
// =============================================================================

/**
 * Retorna todas as ordens de compra cadastradas.
 * @returns {Object[]} Array de objetos com os campos de PURCHASE_ORDERS_HEADERS.
 */
function poRepoGetAll() {
  return sheetToObjects(PURCHASE_ORDERS_SHEET);
}

/**
 * Busca uma ordem de compra pelo ID.
 * @param {string} id - ID da PO (ex: PO-1).
 * @returns {Object|null} Objeto da PO ou null se não encontrado.
 */
function poRepoGetById(id) {
  return poRepoGetAll().find(function(r) { return r.id === id; }) || null;
}

/**
 * Busca ordens de compra vinculadas a uma proposta.
 * @param {string} proposalId - ID da proposta.
 * @returns {Object[]} Array de POs da proposta.
 */
function poRepoGetByProposal(proposalId) {
  return poRepoGetAll().filter(function(r) { return r.proposal_id === proposalId; });
}

/**
 * Cria um novo registro de ordem de compra na aba PURCHASE_ORDERS.
 * Utiliza LockService para evitar condições de corrida.
 * @param {Object} po - Objeto com todos os campos de PURCHASE_ORDERS_HEADERS.
 */
function poRepoCreate(po) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    appendRowToSheet(PURCHASE_ORDERS_SHEET, po, PURCHASE_ORDERS_HEADERS);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Atualiza campos de uma ordem de compra pelo ID.
 * Utiliza LockService para evitar condições de corrida.
 * @param {string} id      - ID da PO a atualizar.
 * @param {Object} updates - Campos a atualizar (chave: nome da coluna).
 * @returns {boolean} true se a linha foi encontrada e atualizada.
 */
function poRepoUpdate(id, updates) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return updateRowById(PURCHASE_ORDERS_SHEET, id, updates);
  } finally {
    lock.releaseLock();
  }
}
