// =============================================================================
// Domain.Tickets.Repository.gs
// Allegro Business System — Fase F6
// Acesso a dados da aba TICKETS. LockService em todas as escritas.
// =============================================================================

/**
 * Retorna todos os tickets cadastrados.
 * @returns {Object[]} Array de objetos com os campos de TICKETS_HEADERS.
 */
function tktRepoGetAll() {
  return sheetToObjects(TICKETS_SHEET);
}

/**
 * Busca um ticket pelo ID.
 * @param {string} id - ID do ticket (ex: TKT-00001).
 * @returns {Object|null} Objeto do ticket ou null se não encontrado.
 */
function tktRepoGetById(id) {
  return tktRepoGetAll().find(function(r) { return r.id === id; }) || null;
}

/**
 * Cria um novo ticket na aba.
 * Utiliza LockService para evitar condições de corrida.
 * @param {Object} ticket - Objeto com todos os campos de TICKETS_HEADERS.
 */
function tktRepoCreate(ticket) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    appendRowToSheet(TICKETS_SHEET, ticket, TICKETS_HEADERS);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Atualiza campos de um ticket pelo ID.
 * Utiliza LockService para evitar condições de corrida.
 * @param {string} id      - ID do ticket a atualizar.
 * @param {Object} updates - Campos a atualizar (chave: nome da coluna).
 * @returns {boolean} true se a linha foi encontrada e atualizada.
 */
function tktRepoUpdate(id, updates) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return updateRowById(TICKETS_SHEET, id, updates);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Retorna todos os tickets em aberto (não fechados e não resolvidos).
 * @returns {Object[]} Array de tickets com status ABERTO ou EM_ATENDIMENTO ou AGUARDANDO_CLIENTE.
 */
function tktRepoGetOpen() {
  var statusAbertos = [
    TICKET_STATUS.ABERTO,
    TICKET_STATUS.EM_ATENDIMENTO,
    TICKET_STATUS.AGUARDANDO_CLIENTE
  ];
  return tktRepoGetAll().filter(function(r) {
    return statusAbertos.indexOf(r.status) !== -1;
  });
}

/**
 * Retorna todos os tickets de uma empresa.
 * @param {string} companyId - ID da empresa.
 * @returns {Object[]} Array de tickets da empresa.
 */
function tktRepoGetByCompany(companyId) {
  return tktRepoGetAll().filter(function(r) { return r.company_id === companyId; });
}

/**
 * Retorna todos os tickets vinculados a um serial da base instalada.
 * @param {string} serialId - ID do registro em INSTALLED_BASE.
 * @returns {Object[]} Array de tickets do serial.
 */
function tktRepoGetBySerial(serialId) {
  return tktRepoGetAll().filter(function(r) { return r.serial_id === serialId; });
}
