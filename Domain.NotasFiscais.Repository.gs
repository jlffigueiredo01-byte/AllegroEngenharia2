// =============================================================================
// Domain.NotasFiscais.Repository.gs
// Allegro Business System — Fase F7
// Acesso a dados da aba INVOICES_DB. LockService em todas as escritas.
// =============================================================================

/**
 * Retorna todas as notas fiscais cadastradas.
 * @returns {Object[]} Array de objetos com os campos de INVOICES_HEADERS.
 */
function nfRepoGetAll() {
  return sheetToObjects(INVOICES_SHEET);
}

/**
 * Busca uma nota fiscal pelo ID.
 * @param {string} id - ID da NF (ex: NF-000001).
 * @returns {Object|null} Objeto da NF ou null se não encontrado.
 */
function nfRepoGetById(id) {
  return nfRepoGetAll().find(function(r) { return r.id === id; }) || null;
}

/**
 * Cria um novo registro de nota fiscal na aba.
 * Utiliza LockService para evitar condições de corrida.
 * @param {Object} nf - Objeto com todos os campos de INVOICES_HEADERS.
 */
function nfRepoCreate(nf) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    appendRowToSheet(INVOICES_SHEET, nf, INVOICES_HEADERS);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Atualiza campos de uma nota fiscal pelo ID.
 * Utiliza LockService para evitar condições de corrida.
 * @param {string} id - ID da NF a atualizar.
 * @param {Object} updates - Campos a atualizar (chave: nome da coluna).
 * @returns {boolean} true se a linha foi encontrada e atualizada.
 */
function nfRepoUpdate(id, updates) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return updateRowById(INVOICES_SHEET, id, updates);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Retorna todas as notas fiscais vinculadas a uma proposta.
 * @param {string} proposalId - ID da proposta.
 * @returns {Object[]} Array de NFs da proposta.
 */
function nfRepoGetByProposal(proposalId) {
  return nfRepoGetAll().filter(function(r) { return r.proposal_id === proposalId; });
}
