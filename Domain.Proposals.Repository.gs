// ============================================================
// Domain.Proposals.Repository.gs — ALLEGRO Business System
// Acesso a dados da aba PROPOSALS via Core.Spreadsheet.gs.
// Toda escrita usa LockService para evitar condições de corrida.
// ============================================================

/**
 * Retorna todos os registros da aba PROPOSALS como array de objetos.
 * Cada registro com pricing_json e items_json permanecem como string;
 * parsear é responsabilidade do chamador (Service ou frontend).
 * @return {Object[]}
 */
function propRepoGetAll() {
  return sheetToObjects(PROPOSALS_SHEET);
}

/**
 * Retorna um único registro pelo ID, ou null se não encontrado.
 * @param {string} id
 * @return {Object|null}
 */
function propRepoGetById(id) {
  var rows = sheetToObjects(PROPOSALS_SHEET);
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].id === id) return rows[i];
  }
  return null;
}

/**
 * Retorna todas as propostas com o status informado.
 * @param {string} status  — deve ser um dos valores de PROPOSAL_STATUS
 * @return {Object[]}
 */
function propRepoGetByStatus(status) {
  return sheetToObjects(PROPOSALS_SHEET).filter(function(r) {
    return r.status === status;
  });
}

/**
 * Retorna todas as propostas associadas a um cliente (company).
 * @param {string} companyId
 * @return {Object[]}
 */
function propRepoGetByCompany(companyId) {
  return sheetToObjects(PROPOSALS_SHEET).filter(function(r) {
    return r.client_id === companyId;
  });
}

/**
 * Retorna todas as revisões de uma proposta raiz (parent_id = rootId)
 * OU a própria proposta raiz (id = rootId), ordenadas por revision_num.
 * Útil para determinar o próximo número de revisão.
 * @param {string} rootId  — ID da proposta original (R0)
 * @return {Object[]}
 */
function propRepoGetRevisions(rootId) {
  return sheetToObjects(PROPOSALS_SHEET).filter(function(r) {
    return r.parent_id === rootId || r.id === rootId;
  }).sort(function(a, b) {
    return (a.revision_num || '').localeCompare(b.revision_num || '');
  });
}

/**
 * Persiste um novo registro na aba PROPOSALS.
 * Usa LockService para evitar race condition no appendRow.
 * @param {Object} proposal  — objeto com todos os campos necessários
 * @return {Object}  o mesmo objeto recebido
 */
function propRepoCreate(proposal) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    appendRowToSheet(PROPOSALS_SHEET, proposal, PROPOSALS_HEADERS_F2);
    return proposal;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Atualiza campos de um registro existente identificado por id.
 * Usa LockService para evitar escritas simultâneas.
 * @param {string} id
 * @param {Object} updates  — apenas os campos a alterar
 * @return {void}
 */
function propRepoUpdate(id, updates) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    updateRowById(PROPOSALS_SHEET, id, updates);
  } finally {
    lock.releaseLock();
  }
}
