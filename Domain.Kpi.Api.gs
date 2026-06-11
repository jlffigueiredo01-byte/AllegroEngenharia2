// ============================================================
// Domain.Kpi.Api.gs — ALLEGRO Business System
// Endpoints da API para o Painel de KPIs de Direção (F9).
// ============================================================

/**
 * Retorna os KPIs mais recentes do Painel de 8.
 * Se ainda não existir snapshot, calcula na hora (primeira vez).
 * Requer papel: DIRETOR_TECNICO, DIRETOR_COMERCIAL ou FINANCEIRO_ADMIN.
 *
 * @returns {{ ok: boolean, data: { kpis: Object, calculado_agora: boolean } }}
 */
function Api_kpiGetPainel() {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN']);
    var latest = kpiRepoGetLatest();
    if (!Object.keys(latest).length) {
      // Nenhum snapshot ainda — calcula agora e retorna ao vivo
      return {
        ok:   true,
        data: { kpis: kpiSvcCalcularPainel(), calculado_agora: true }
      };
    }
    return {
      ok:   true,
      data: { kpis: latest, calculado_agora: false }
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Força o recálculo imediato dos 8 KPIs e persiste novo snapshot.
 * Requer papel: DIRETOR_TECNICO.
 *
 * @returns {{ ok: boolean, data: Object }}
 */
function Api_kpiRecalcular() {
  try {
    requireRole(['DIRETOR_TECNICO']);
    var result = kpiSvcCalcularPainel();
    return { ok: true, data: result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Retorna o histórico de snapshots de um KPI específico.
 * Requer papel: DIRETOR_TECNICO, DIRETOR_COMERCIAL ou FINANCEIRO_ADMIN.
 *
 * @param {string} kpiCode  Código do KPI (ver KPI_CODES em Domain.Kpi.Model.gs).
 * @param {number} [limit]  Número de registros a retornar (default 12).
 * @returns {{ ok: boolean, data: Array }}
 */
function Api_kpiGetHistory(kpiCode, limit) {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN']);
    if (!kpiCode) throw new Error('kpiCode é obrigatório.');
    return { ok: true, data: kpiRepoGetHistory(kpiCode, limit || 12) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
