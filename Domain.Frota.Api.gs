// =============================================================================
// Domain.Frota.Api.gs
// Allegro Business System — Fase F7
// Ponto de entrada do cliente (google.script.run) para o domínio Frota.
// Todas as funções retornam { ok: true, data } ou { ok: false, error }.
// =============================================================================

/**
 * Registra um abastecimento de veículo no sistema.
 * Papéis permitidos: DIRETOR_TECNICO, FINANCEIRO_ADMIN, TECNICO.
 *
 * @param {Object} data - Dados do abastecimento (ver frotaSvcRegistrarAbastecimento).
 * @returns {{ok:boolean, data:Object}|{ok:boolean, error:string}}
 */
function Api_frotaRegistrarAbastecimento(data) {
  try {
    requireRole(['DIRETOR_TECNICO', 'FINANCEIRO_ADMIN', 'TECNICO']);
    if (!data) throw new Error('Dados do abastecimento não fornecidos.');
    var result = frotaSvcRegistrarAbastecimento(data);
    return { ok: true, data: result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Retorna o log completo de abastecimentos.
 * Papéis permitidos: DIRETOR_TECNICO, FINANCEIRO_ADMIN.
 *
 * @returns {{ok:boolean, data:Object[]}|{ok:boolean, error:string}}
 */
function Api_frotaGetLog() {
  try {
    requireRole(['DIRETOR_TECNICO', 'FINANCEIRO_ADMIN']);
    return { ok: true, data: frotaRepoGetAll() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Retorna o resumo de eficiência da frota nos últimos 3 meses.
 * Inclui médias de km/L, R$/km, totais de litros e gasto.
 * Papéis permitidos: DIRETOR_TECNICO, FINANCEIRO_ADMIN.
 *
 * @returns {{ok:boolean, data:Object}|{ok:boolean, error:string}}
 */
function Api_frotaGetResumo() {
  try {
    requireRole(['DIRETOR_TECNICO', 'FINANCEIRO_ADMIN']);
    return { ok: true, data: frotaSvcGetResumo() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
