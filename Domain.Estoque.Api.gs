// =============================================================================
// Domain.Estoque.Api.gs
// Allegro Business System — Fase F15
// Ponto de entrada do cliente (google.script.run) para Estoque.
// Todas as funções retornam { ok: true, data } ou { ok: false, error }.
// =============================================================================

/**
 * Registra a entrada de um material no estoque.
 * Papéis permitidos: DIRETOR_TECNICO, FINANCEIRO_ADMIN.
 *
 * @param {string} materialId - ID do material.
 * @param {number} qty        - Quantidade a entrar.
 * @param {string} poId       - ID da PO vinculada.
 * @param {number} custo      - Custo unitário da entrada.
 * @returns {{ok:boolean, data:Object}|{ok:boolean, error:string}}
 */
function Api_estoqueEntrada(materialId, qty, poId, custo) {
  try {
    var user = requireRole(['DIRETOR_TECNICO', 'FINANCEIRO_ADMIN']);
    if (!materialId) throw new Error('ID do material é obrigatório.');
    if (!qty)        throw new Error('Quantidade é obrigatória.');
    var result = estoqueSvcEntrada(materialId, qty, poId, custo, user.id);
    return { ok: true, data: result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Registra a saída de um material do estoque.
 * Papéis permitidos: DIRETOR_TECNICO, TECNICO.
 *
 * @param {string} materialId  - ID do material.
 * @param {number} qty         - Quantidade a baixar.
 * @param {string} [projectId] - ID do projeto que consumiu o material.
 * @returns {{ok:boolean, data:Object}|{ok:boolean, error:string}}
 */
function Api_estoqueSaida(materialId, qty, projectId) {
  try {
    var user = requireRole(['DIRETOR_TECNICO', 'TECNICO']);
    if (!materialId) throw new Error('ID do material é obrigatório.');
    if (!qty)        throw new Error('Quantidade é obrigatória.');
    var result = estoqueSvcSaida(materialId, qty, projectId, user.id);
    return { ok: true, data: result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Reserva quantidade de um material no estoque.
 * Papéis permitidos: DIRETOR_TECNICO, FINANCEIRO_ADMIN.
 *
 * @param {string} materialId  - ID do material.
 * @param {number} qty         - Quantidade a reservar.
 * @param {string} [projectId] - ID do projeto que requisitou a reserva.
 * @returns {{ok:boolean, data:Object}|{ok:boolean, error:string}}
 */
function Api_estoqueReservar(materialId, qty, projectId) {
  try {
    var user = requireRole(['DIRETOR_TECNICO', 'FINANCEIRO_ADMIN']);
    if (!materialId) throw new Error('ID do material é obrigatório.');
    if (!qty)        throw new Error('Quantidade é obrigatória.');
    var result = estoqueSvcReservar(materialId, qty, projectId, user.id);
    return { ok: true, data: result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Retorna todos os saldos de estoque.
 * Papéis permitidos: DIRETOR_TECNICO, FINANCEIRO_ADMIN.
 *
 * @returns {{ok:boolean, data:Object[]}|{ok:boolean, error:string}}
 */
function Api_estoqueGetAll() {
  try {
    requireRole(['DIRETOR_TECNICO', 'FINANCEIRO_ADMIN']);
    return { ok: true, data: stockRepoGetAll() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Retorna os materiais com estoque abaixo do mínimo configurado.
 * Papéis permitidos: DIRETOR_TECNICO, FINANCEIRO_ADMIN.
 *
 * @returns {{ok:boolean, data:Array}|{ok:boolean, error:string}}
 */
function Api_estoqueGetBaixo() {
  try {
    requireRole(['DIRETOR_TECNICO', 'FINANCEIRO_ADMIN']);
    return { ok: true, data: estoqueSvcGetBaixo() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Retorna o histórico de movimentações de um material.
 * Papéis permitidos: DIRETOR_TECNICO, FINANCEIRO_ADMIN.
 *
 * @param {string} materialId - ID do material.
 * @returns {{ok:boolean, data:Object[]}|{ok:boolean, error:string}}
 */
function Api_estoqueGetMovimentacoes(materialId) {
  try {
    requireRole(['DIRETOR_TECNICO', 'FINANCEIRO_ADMIN']);
    if (!materialId) throw new Error('ID do material é obrigatório.');
    return { ok: true, data: stockMovRepoGetByMaterial(materialId) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
