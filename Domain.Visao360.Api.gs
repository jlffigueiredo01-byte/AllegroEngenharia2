// =============================================================================
// Domain.Visao360.Api.gs — SGA
// Endpoint único do workspace do cliente.
// =============================================================================

/**
 * Workspace 360 completo de uma empresa, em uma única chamada.
 * @param {string} companyId
 * @return {{ok:boolean, data?:Object, error?:string}}
 */
function Api_c360(companyId) {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN', 'TECNICO']);
    return { ok: true, data: c360SvcGet(companyId) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
