// =============================================================================
// Domain.Engenharia.Api.gs
// Allegro Business System — Fase F20 (EDM)
// Funções de API chamadas pelo frontend (HtmlService / google.script.run).
// Todas as funções validam autenticação e autorização por role antes de executar.
// =============================================================================

// ---------------------------------------------------------------------------
// Documentos
// ---------------------------------------------------------------------------

/**
 * Cria um novo documento no cofre de engenharia.
 * Papéis permitidos: DIRETOR_TECNICO, TECNICO.
 *
 * @param {{
 *   title: string,
 *   type: string,
 *   discipline: string,
 *   description?: string,
 *   tags?: string,
 *   owner?: string,
 *   proposal_id?: string,
 *   project_id?: string,
 *   company_id?: string,
 *   product_code?: string,
 *   serial?: string
 * }} data - Dados do documento a criar.
 * @returns {{ok: boolean, data: Object}|{ok: boolean, error: string}}
 */
function Api_engCreateDoc(data) {
  try {
    requireRole(['DIRETOR_TECNICO', 'TECNICO']);
    var result = engSvcCreateDoc(data);
    return { ok: true, data: result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Retorna a lista de documentos de engenharia com filtros opcionais.
 * Papéis permitidos: DIRETOR_TECNICO, DIRETOR_COMERCIAL, FINANCEIRO_ADMIN, TECNICO.
 *
 * @param {{
 *   type?: string,
 *   discipline?: string,
 *   status?: string,
 *   search?: string
 * }|null} filters - Filtros opcionais (null ou {} para listar todos).
 * @returns {{ok: boolean, data: Object[]}|{ok: boolean, error: string}}
 */
function Api_engGetDocs(filters) {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN', 'TECNICO']);
    var docs = engRepoGetAllDocs();

    if (filters) {
      if (filters.type) {
        docs = docs.filter(function(d) { return d.type === filters.type; });
      }
      if (filters.discipline) {
        docs = docs.filter(function(d) { return d.discipline === filters.discipline; });
      }
      if (filters.status) {
        docs = docs.filter(function(d) { return d.status === filters.status; });
      }
      if (filters.search) {
        var q = String(filters.search).toLowerCase();
        docs = docs.filter(function(d) {
          return (String(d.title || '').toLowerCase().indexOf(q) !== -1) ||
                 (String(d.tags  || '').toLowerCase().indexOf(q) !== -1) ||
                 (String(d.doc_number || '').toLowerCase().indexOf(q) !== -1);
        });
      }
    }

    return { ok: true, data: docs };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Retorna os dados completos de um único documento pelo número.
 * Papéis permitidos: DIRETOR_TECNICO, DIRETOR_COMERCIAL, FINANCEIRO_ADMIN, TECNICO.
 *
 * @param {string} docNumber - Número do documento (ex: ALG-DE-ELE-0001).
 * @returns {{ok: boolean, data: Object}|{ok: boolean, error: string}}
 */
function Api_engGetDoc(docNumber) {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN', 'TECNICO']);
    var doc = engRepoGetDoc(docNumber);
    if (!doc) return { ok: false, error: 'Documento não encontrado: ' + docNumber + '.' };
    return { ok: true, data: doc };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ---------------------------------------------------------------------------
// Revisões
// ---------------------------------------------------------------------------

/**
 * Cria uma nova revisão de um documento no cofre.
 * Papéis permitidos: DIRETOR_TECNICO, TECNICO.
 *
 * @param {string} docNumber - Número do documento (ex: ALG-DE-ELE-0001).
 * @param {{
 *   file_id_nativo?: string,
 *   file_id_pdf?: string,
 *   author?: string,
 *   change_description?: string
 * }} revData - Dados da nova revisão.
 * @returns {{ok: boolean, data: Object}|{ok: boolean, error: string}}
 */
function Api_engCreateRevision(docNumber, revData) {
  try {
    requireRole(['DIRETOR_TECNICO', 'TECNICO']);
    var result = engSvcCreateRevision(docNumber, revData);
    return { ok: true, data: result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Aprova uma revisão de documento.
 * Apenas DIRETOR_TECNICO pode executar esta ação.
 *
 * @param {string} docNumber - Número do documento (ex: ALG-DE-ELE-0001).
 * @param {string} revision  - Código da revisão a aprovar (ex: R01).
 * @returns {{ok: boolean, data: {doc: Object, revision: Object}}|{ok: boolean, error: string}}
 */
function Api_engAprovarRevision(docNumber, revision) {
  try {
    var user = requireRole(['DIRETOR_TECNICO']);
    var result = engSvcAprovarRevision(docNumber, revision, user.id);
    return { ok: true, data: result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Retorna todas as revisões de um documento.
 * Papéis permitidos: DIRETOR_TECNICO, DIRETOR_COMERCIAL, FINANCEIRO_ADMIN, TECNICO.
 *
 * @param {string} docNumber - Número do documento (ex: ALG-DE-ELE-0001).
 * @returns {{ok: boolean, data: Object[]}|{ok: boolean, error: string}}
 */
function Api_engGetRevisions(docNumber) {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN', 'TECNICO']);
    return { ok: true, data: engRepoGetRevisions(docNumber) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Verifica se uma revisão específica está APROVADA.
 * Útil para bloquear uso de revisões EM_ELABORACAO em propostas.
 * Papéis permitidos: todos os autenticados.
 *
 * @param {string} docNumber - Número do documento.
 * @param {string} revision  - Código da revisão (ex: R00).
 * @returns {{ok: boolean, data: {is_aprovado: boolean}}|{ok: boolean, error: string}}
 */
function Api_engIsAprovado(docNumber, revision) {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN', 'TECNICO']);
    var isAprovado = engSvcIsAprovado(docNumber, revision);
    return { ok: true, data: { is_aprovado: isAprovado } };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Retorna um resumo de documento (número, título, status, revisão corrente).
 * Papéis permitidos: todos os autenticados.
 *
 * @param {string} docNumber - Número do documento.
 * @returns {{ok: boolean, data: Object}|{ok: boolean, error: string}}
 */
function Api_engGetDocSummary(docNumber) {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN', 'TECNICO']);
    var summary = engSvcGetDocSummary(docNumber);
    if (!summary) return { ok: false, error: 'Documento não encontrado: ' + docNumber + '.' };
    return { ok: true, data: summary };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Retorna os metadados do EDM: tipos, disciplinas e status disponíveis.
 * Utilizado pelo frontend para popular selects/dropdowns sem hardcode.
 * Papéis permitidos: todos os autenticados.
 *
 * @returns {{ok: boolean, data: {types: string[], disciplines: string[], statuses: string[]}}}
 */
function Api_engGetMetadata() {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN', 'TECNICO']);
    return {
      ok: true,
      data: {
        types:       ENG_DOC_TYPES,
        disciplines: ENG_DISCIPLINES,
        statuses:    ENG_DOC_STATUS
      }
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
