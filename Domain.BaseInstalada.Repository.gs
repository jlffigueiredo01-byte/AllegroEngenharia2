// =============================================================================
// Domain.BaseInstalada.Repository.gs
// Allegro Business System — Fase F6
// Acesso a dados da aba INSTALLED_BASE. LockService em todas as escritas.
// =============================================================================

/**
 * Retorna todos os equipamentos da base instalada.
 * @returns {Object[]} Array de objetos com os campos de BASE_INSTALADA_HEADERS.
 */
function biRepoGetAll() {
  return sheetToObjects(BASE_INSTALADA_SHEET);
}

/**
 * Busca um equipamento da base instalada pelo ID.
 * @param {string} id - ID do registro (ex: BI-00001).
 * @returns {Object|null} Objeto do registro ou null se não encontrado.
 */
function biRepoGetById(id) {
  return biRepoGetAll().find(function(r) { return r.id === id; }) || null;
}

/**
 * Busca um equipamento da base instalada pelo número de série.
 * @param {string} serial - Número de série do equipamento.
 * @returns {Object|null} Objeto do registro ou null se não encontrado.
 */
function biRepoGetBySerial(serial) {
  return biRepoGetAll().find(function(r) {
    return String(r.serial).trim().toUpperCase() === String(serial).trim().toUpperCase();
  }) || null;
}

/**
 * Cria um novo registro na base instalada.
 * Utiliza LockService para evitar condições de corrida.
 * @param {Object} entry - Objeto com todos os campos de BASE_INSTALADA_HEADERS.
 */
function biRepoCreate(entry) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    appendRowToSheet(BASE_INSTALADA_SHEET, entry, BASE_INSTALADA_HEADERS);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Atualiza campos de um registro da base instalada pelo ID.
 * Utiliza LockService para evitar condições de corrida.
 * @param {string} id      - ID do registro a atualizar.
 * @param {Object} updates - Campos a atualizar (chave: nome da coluna).
 * @returns {boolean} true se a linha foi encontrada e atualizada.
 */
function biRepoUpdate(id, updates) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return updateRowById(BASE_INSTALADA_SHEET, id, updates);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Retorna todos os equipamentos vinculados a uma empresa.
 * @param {string} companyId - ID da empresa.
 * @returns {Object[]} Array de registros da empresa.
 */
function biRepoGetByCompany(companyId) {
  return biRepoGetAll().filter(function(r) { return r.company_id === companyId; });
}

/**
 * Retorna todos os equipamentos vinculados a um projeto.
 * @param {string} projectId - ID do projeto.
 * @returns {Object[]} Array de registros do projeto.
 */
function biRepoGetByProject(projectId) {
  return biRepoGetAll().filter(function(r) { return r.project_id === projectId; });
}
