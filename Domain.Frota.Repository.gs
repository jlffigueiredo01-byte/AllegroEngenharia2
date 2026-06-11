// =============================================================================
// Domain.Frota.Repository.gs
// Allegro Business System — Fase F7
// Acesso a dados da aba VEHICLE_LOG. LockService em todas as escritas.
// =============================================================================

/**
 * Retorna todos os registros de abastecimento/log do veículo.
 * @returns {Object[]} Array de objetos com os campos de VEHICLE_LOG_HEADERS.
 */
function frotaRepoGetAll() {
  return sheetToObjects(VEHICLE_LOG_SHEET);
}

/**
 * Busca um registro de log pelo ID.
 * @param {string} id - ID do registro (ex: VL-000001).
 * @returns {Object|null} Objeto do log ou null se não encontrado.
 */
function frotaRepoGetById(id) {
  return frotaRepoGetAll().find(function(r) { return r.id === id; }) || null;
}

/**
 * Cria um novo registro de log de veículo.
 * Utiliza LockService para evitar condições de corrida.
 * @param {Object} entry - Objeto com todos os campos de VEHICLE_LOG_HEADERS.
 */
function frotaRepoCreate(entry) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    appendRowToSheet(VEHICLE_LOG_SHEET, entry, VEHICLE_LOG_HEADERS);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Retorna os N registros mais recentes, ordenados por data descendente.
 * Utilizado pelo service para calcular médias.
 * @param {number} n - Quantidade de registros a retornar.
 * @returns {Object[]} Últimos N registros.
 */
function frotaRepoGetRecent(n) {
  var all = frotaRepoGetAll();
  // Ordenar por date descrescente (ISO string ordena lexicograficamente)
  all.sort(function(a, b) {
    return String(b.date).localeCompare(String(a.date));
  });
  return all.slice(0, n);
}

/**
 * Retorna todos os registros de um período específico (por data).
 * @param {string} dateFrom - Data inicial ISO (YYYY-MM-DD).
 * @param {string} dateTo   - Data final ISO (YYYY-MM-DD).
 * @returns {Object[]} Registros no período.
 */
function frotaRepoGetByPeriod(dateFrom, dateTo) {
  return frotaRepoGetAll().filter(function(r) {
    return String(r.date) >= dateFrom && String(r.date) <= dateTo;
  });
}
