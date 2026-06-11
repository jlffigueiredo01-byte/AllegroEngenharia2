// =============================================================================
// Domain.Fornecedores.Api.gs
// Allegro Business System — Fase F15
// Ponto de entrada do cliente (google.script.run) para Fornecedores e Materiais.
// Todas as funções retornam { ok: true, data } ou { ok: false, error }.
// =============================================================================

// ---------------------------------------------------------------------------
// SUPPLIERS
// ---------------------------------------------------------------------------

/**
 * Cria um novo fornecedor.
 * Papéis permitidos: DIRETOR_TECNICO, FINANCEIRO_ADMIN.
 *
 * @param {Object} data - Dados do fornecedor (ver supplierSvcCreate).
 * @returns {{ok:boolean, data:Object}|{ok:boolean, error:string}}
 */
function Api_supplierCreate(data) {
  try {
    requireRole(['DIRETOR_TECNICO', 'FINANCEIRO_ADMIN']);
    var result = supplierSvcCreate(data);
    return { ok: true, data: result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Retorna todos os fornecedores cadastrados.
 * Papéis permitidos: todos os perfis autenticados.
 *
 * @returns {{ok:boolean, data:Object[]}|{ok:boolean, error:string}}
 */
function Api_supplierGetAll() {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN', 'TECNICO']);
    return { ok: true, data: supplierRepoGetAll() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Atualiza dados de um fornecedor existente.
 * Papéis permitidos: DIRETOR_TECNICO, FINANCEIRO_ADMIN.
 *
 * @param {string} id      - ID do fornecedor.
 * @param {Object} updates - Campos a atualizar.
 * @returns {{ok:boolean, data:Object}|{ok:boolean, error:string}}
 */
function Api_supplierUpdate(id, updates) {
  try {
    requireRole(['DIRETOR_TECNICO', 'FINANCEIRO_ADMIN']);
    if (!id) throw new Error('ID do fornecedor é obrigatório.');
    var result = supplierSvcUpdate(id, updates);
    return { ok: true, data: result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ---------------------------------------------------------------------------
// MATERIALS
// ---------------------------------------------------------------------------

/**
 * Cria um novo material.
 * Papéis permitidos: DIRETOR_TECNICO, FINANCEIRO_ADMIN.
 *
 * @param {Object} data - Dados do material (ver materialSvcCreate).
 * @returns {{ok:boolean, data:Object}|{ok:boolean, error:string}}
 */
function Api_materialCreate(data) {
  try {
    requireRole(['DIRETOR_TECNICO', 'FINANCEIRO_ADMIN']);
    var result = materialSvcCreate(data);
    return { ok: true, data: result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Retorna todos os materiais cadastrados.
 * Papéis permitidos: todos os perfis autenticados.
 *
 * @returns {{ok:boolean, data:Object[]}|{ok:boolean, error:string}}
 */
function Api_materialGetAll() {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN', 'TECNICO']);
    return { ok: true, data: materialRepoGetAll() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Busca um material pelo código.
 * Papéis permitidos: todos os perfis autenticados.
 *
 * @param {string} code - Código do material.
 * @returns {{ok:boolean, data:Object|null}|{ok:boolean, error:string}}
 */
function Api_materialGetByCode(code) {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN', 'TECNICO']);
    if (!code) throw new Error('Código do material é obrigatório.');
    return { ok: true, data: materialRepoGetByCode(code) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Registra o preço mais recente de um material.
 * Papéis permitidos: DIRETOR_TECNICO, FINANCEIRO_ADMIN.
 *
 * @param {string} materialId - ID do material.
 * @param {number} price      - Preço unitário.
 * @param {string} currency   - Moeda (ex: BRL, USD).
 * @param {string} supplierId - ID do fornecedor.
 * @returns {{ok:boolean, data:Object}|{ok:boolean, error:string}}
 */
function Api_materialRegistrarPreco(materialId, price, currency, supplierId) {
  try {
    requireRole(['DIRETOR_TECNICO', 'FINANCEIRO_ADMIN']);
    if (!materialId) throw new Error('ID do material é obrigatório.');
    if (!price)      throw new Error('Preço é obrigatório.');
    var result = materialSvcRegistrarPreco(materialId, price, currency, supplierId);
    return { ok: true, data: result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
