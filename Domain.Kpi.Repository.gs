// ============================================================
// Domain.Kpi.Repository.gs — ALLEGRO Business System
// Persistência de snapshots KPI na aba KPI_SNAPSHOT (F9).
// ============================================================

/**
 * Persiste um snapshot de KPI na aba KPI_SNAPSHOT.
 * Usa LockService para evitar escritas concorrentes em execuções paralelas.
 *
 * @param {Object} snapshotData Objeto com os campos de KPI_SNAPSHOT_HEADERS.
 */
function kpiRepoSaveSnapshot(snapshotData) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    appendRowToSheet(KPI_SNAPSHOT_SHEET, snapshotData, KPI_SNAPSHOT_HEADERS);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Retorna o snapshot mais recente de cada KPI.
 * O resultado é um objeto indexado por kpi_code:
 *   { PIPELINE_PONDERADO: { kpi_code, value, unit, snapshot_at, ... }, ... }
 *
 * @returns {Object} Mapa de kpi_code → snapshot mais recente.
 */
function kpiRepoGetLatest() {
  var rows = sheetToObjects(KPI_SNAPSHOT_SHEET);
  if (!rows.length) return {};
  var latest = {};
  rows.forEach(function(r) {
    if (!latest[r.kpi_code] || r.snapshot_at > latest[r.kpi_code].snapshot_at) {
      latest[r.kpi_code] = r;
    }
  });
  return latest;
}

/**
 * Retorna o histórico de snapshots de um KPI específico, do mais recente ao mais antigo.
 *
 * @param {string} kpiCode  Código do KPI (use KPI_CODES).
 * @param {number} [limit]  Quantidade máxima de registros a retornar (default 12).
 * @returns {Array} Lista de snapshots ordenada decrescente.
 */
function kpiRepoGetHistory(kpiCode, limit) {
  var rows = sheetToObjects(KPI_SNAPSHOT_SHEET).filter(function(r) {
    return r.kpi_code === kpiCode;
  });
  rows.sort(function(a, b) {
    return b.snapshot_at.localeCompare(a.snapshot_at);
  });
  return rows.slice(0, limit || 12);
}
