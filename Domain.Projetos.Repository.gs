// ============================================================
// Domain.Projetos.Repository.gs — ALLEGRO Business System
// Acesso a dados para Projetos, Marcos e RDO (F19-lite).
// Toda escrita usa LockService para evitar colisões.
// ============================================================

// ------------------------------------------------------------
// Projetos
// ------------------------------------------------------------

/**
 * Cria um projeto na aba PROJECTS.
 * @param {Object} proj — objeto com campos definidos em PROJECTS_HEADERS
 * @return {void}
 */
function projRepoCreate(proj) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    appendRowToSheet(PROJECTS_SHEET, proj, PROJECTS_HEADERS);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Retorna um projeto pelo ID ou null se não encontrado.
 * @param {string} id
 * @return {Object|null}
 */
function projRepoGetById(id) {
  var rows = sheetToObjects(PROJECTS_SHEET);
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].id === id) return rows[i];
  }
  return null;
}

/**
 * Retorna todos os projetos.
 * @return {Object[]}
 */
function projRepoGetAll() {
  return sheetToObjects(PROJECTS_SHEET);
}

/**
 * Atualiza campos de um projeto existente.
 * @param {string} id
 * @param {Object} updates — campos a sobrescrever
 * @return {void}
 */
function projRepoUpdate(id, updates) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    updateRowById(PROJECTS_SHEET, id, updates);
  } finally {
    lock.releaseLock();
  }
}

// ------------------------------------------------------------
// Marcos (Milestones)
// ------------------------------------------------------------

/**
 * Cria um marco na aba PROJECT_MILESTONES.
 * @param {Object} ms
 * @return {void}
 */
function msRepoCreate(ms) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    appendRowToSheet(PROJECT_MILESTONES_SHEET, ms, PROJECT_MILESTONES_HEADERS);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Retorna todos os marcos de todos os projetos.
 * Usado por projSvcCheckMarcosAtrasados (job agendado).
 * @return {Object[]}
 */
function msRepoGetAll() {
  return sheetToObjects(PROJECT_MILESTONES_SHEET);
}

/**
 * Retorna todos os marcos de um projeto.
 * @param {string} projectId
 * @return {Object[]}
 */
function msRepoGetByProject(projectId) {
  return sheetToObjects(PROJECT_MILESTONES_SHEET).filter(function(m) {
    return m.project_id === projectId;
  });
}

/**
 * Atualiza campos de um marco existente.
 * @param {string} id
 * @param {Object} updates
 * @return {void}
 */
function msRepoUpdate(id, updates) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    updateRowById(PROJECT_MILESTONES_SHEET, id, updates);
  } finally {
    lock.releaseLock();
  }
}

// ------------------------------------------------------------
// RDO — imutável: apenas Create e Read
// ------------------------------------------------------------

/**
 * Cria um RDO na aba PROJECT_RDO.
 * RDO é imutável por design — não existe função de update.
 * @param {Object} rdo
 * @return {void}
 */
function rdoRepoCreate(rdo) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    appendRowToSheet(PROJECT_RDO_SHEET, rdo, PROJECT_RDO_HEADERS);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Retorna todos os RDOs de um projeto, ordenados por data.
 * @param {string} projectId
 * @return {Object[]}
 */
function rdoRepoGetByProject(projectId) {
  return sheetToObjects(PROJECT_RDO_SHEET).filter(function(r) {
    return r.project_id === projectId;
  });
}

/**
 * Retorna o RDO de um projeto em uma data específica (ou null).
 * Usado para garantir unicidade (imutabilidade).
 * @param {string} projectId
 * @param {string} date — formato YYYY-MM-DD
 * @return {Object|null}
 */
function rdoRepoGetByDate(projectId, date) {
  var rows = sheetToObjects(PROJECT_RDO_SHEET);
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].project_id === projectId && rows[i].date === date) {
      return rows[i];
    }
  }
  return null;
}
