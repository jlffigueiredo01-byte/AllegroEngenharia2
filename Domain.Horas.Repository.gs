// =============================================================================
// Domain.Horas.Repository.gs
// Allegro Business System — Fase F8 (Timesheet)
// Acesso a dados da aba TIME_ENTRIES. LockService em todas as escritas.
// =============================================================================

/**
 * Retorna todos os lançamentos de horas de um usuário em uma semana.
 * @param {string} userId    - ID do usuário.
 * @param {string} weekStart - Data ISO (AAAA-MM-DD) da segunda-feira da semana.
 * @returns {Object[]} Array de entradas da semana.
 */
function horasRepoGetByUserWeek(userId, weekStart) {
  return sheetToObjects(TIME_ENTRIES_SHEET).filter(function(r) {
    return String(r.user_id).trim() === String(userId).trim() &&
           String(r.week_start).trim() === String(weekStart).trim();
  });
}

/**
 * Retorna todos os lançamentos de horas vinculados a um projeto.
 * Usado pelo relatório de obra (F19).
 * @param {string} projectId - ID do projeto.
 * @returns {Object[]} Array de entradas do projeto.
 */
function horasRepoGetByProject(projectId) {
  return sheetToObjects(TIME_ENTRIES_SHEET).filter(function(r) {
    return String(r.project_id).trim() === String(projectId).trim() &&
           r.project_id !== '';
  });
}

/**
 * Retorna todos os lançamentos de horas de um usuário em um período.
 * @param {string} userId    - ID do usuário.
 * @param {string} startDate - Data ISO inicial (AAAA-MM-DD), inclusive.
 * @param {string} endDate   - Data ISO final (AAAA-MM-DD), inclusive.
 * @returns {Object[]} Array de entradas no período.
 */
function horasRepoGetByUser(userId, startDate, endDate) {
  return sheetToObjects(TIME_ENTRIES_SHEET).filter(function(r) {
    if (String(r.user_id).trim() !== String(userId).trim()) return false;
    var d = String(r.date).trim();
    return d >= String(startDate).trim() && d <= String(endDate).trim();
  });
}

/**
 * Persiste um novo lançamento de horas na aba TIME_ENTRIES.
 * Utiliza LockService para evitar condições de corrida.
 * @param {Object} entry - Objeto com todos os campos de TIME_ENTRIES_HEADERS.
 */
function horasRepoCreate(entry) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    appendRowToSheet(TIME_ENTRIES_SHEET, entry, TIME_ENTRIES_HEADERS);
  } finally {
    lock.releaseLock();
  }
}
