// =============================================================================
// Domain.BaseInstalada.Api.gs
// Allegro Business System — Fase F6
// Ponto de entrada do cliente (google.script.run) para o domínio Base Instalada.
// Todas as funções retornam { ok: true, data } ou { ok: false, error }.
// =============================================================================

/**
 * Registra um equipamento na base instalada.
 * Papéis permitidos: DIRETOR_TECNICO, TECNICO.
 *
 * @param {Object} data - Dados do equipamento (ver biSvcCreate para campos aceitos).
 * @returns {{ok:boolean, data:Object}|{ok:boolean, error:string}}
 */
function Api_biCreate(data) {
  try {
    requireRole([ROLES.DIRETOR_TECNICO, ROLES.TECNICO]);
    if (!data) throw new Error('Dados do equipamento são obrigatórios.');
    var result = biSvcCreate(data);
    return { ok: true, data: result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Retorna todos os equipamentos da base instalada.
 * Aceita filtros opcionais: { company_id, project_id, status }.
 * Papéis permitidos: todos.
 *
 * @param {Object} [filters] - Filtros opcionais.
 * @param {string} [filters.company_id] - Filtrar por empresa.
 * @param {string} [filters.project_id] - Filtrar por projeto.
 * @param {string} [filters.status]     - Filtrar por status (ATIVO, GARANTIA, etc.).
 * @returns {{ok:boolean, data:Object[]}|{ok:boolean, error:string}}
 */
function Api_biGetAll(filters) {
  try {
    requireAuth();
    var todos = biRepoGetAll();
    if (filters) {
      if (filters.company_id) {
        todos = todos.filter(function(r) { return r.company_id === filters.company_id; });
      }
      if (filters.project_id) {
        todos = todos.filter(function(r) { return r.project_id === filters.project_id; });
      }
      if (filters.status) {
        todos = todos.filter(function(r) { return r.status === filters.status; });
      }
    }
    return { ok: true, data: todos };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Retorna todos os equipamentos de uma empresa.
 * Papéis permitidos: todos.
 *
 * @param {string} companyId - ID da empresa.
 * @returns {{ok:boolean, data:Object[]}|{ok:boolean, error:string}}
 */
function Api_biGetByCompany(companyId) {
  try {
    requireAuth();
    if (!companyId) throw new Error('companyId é obrigatório.');
    return { ok: true, data: biRepoGetByCompany(companyId) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Atualiza a data de startup de um equipamento e recalcula as garantias.
 * Papéis permitidos: DIRETOR_TECNICO, TECNICO.
 *
 * @param {string}      id                  - ID do registro na base instalada.
 * @param {string}      startupDate         - Data de startup (ISO 'YYYY-MM-DD').
 * @param {string|null} [aceiteTecnicoDate] - Data do aceite técnico (opcional).
 * @returns {{ok:boolean, data:Object}|{ok:boolean, error:string}}
 */
function Api_biUpdateStartup(id, startupDate, aceiteTecnicoDate) {
  try {
    requireRole([ROLES.DIRETOR_TECNICO, ROLES.TECNICO]);
    if (!id)          throw new Error('ID do registro é obrigatório.');
    if (!startupDate) throw new Error('startup_date é obrigatório.');
    var result = biSvcUpdateStartup(id, startupDate, aceiteTecnicoDate || null);
    return { ok: true, data: result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Lista seriais com garantia (HW ou serviço) expirando nos próximos N dias.
 * Papéis permitidos: DIRETOR_TECNICO, DIRETOR_COMERCIAL.
 *
 * @param {number} [dias=30] - Janela de dias para verificação (default: 30).
 * @returns {{ok:boolean, data:Object[]}|{ok:boolean, error:string}}
 */
function Api_biGetVencimentosGarantia(dias) {
  try {
    requireRole([ROLES.DIRETOR_TECNICO, ROLES.DIRETOR_COMERCIAL]);
    var janela = dias ? parseInt(dias, 10) : 30;
    return { ok: true, data: biSvcGetVencimentos(janela) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
