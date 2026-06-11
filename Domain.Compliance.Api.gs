// ============================================================
// Domain.Compliance.Api.gs — ALLEGRO Business System
// F18 — Compliance / HSE
// Camada de API: autenticação, autorização e delegação
// para a camada de serviço.
// ============================================================

// ------------------------------------------------------------
// HSE_DOCS — API pública
// ------------------------------------------------------------

/**
 * Registra um novo documento HSE para um técnico.
 * Restrito a DIRETOR_TECNICO.
 *
 * @param {Object} data Campos do documento (user_id, doc_type, expiry_date, …).
 * @returns {{ ok: boolean, data?: Object, error?: string }}
 */
function Api_hseCreate(data) {
  try {
    requireRole(['DIRETOR_TECNICO']);
    return { ok: true, data: hseSvcCreate(data) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Retorna os documentos HSE de um técnico.
 *
 * Regra de visibilidade:
 *  - TECNICO só pode consultar seus próprios documentos.
 *  - DIRETOR_TECNICO e FINANCEIRO_ADMIN podem consultar qualquer técnico.
 *
 * @param {string} [userId] ID do técnico. Ignorado se o solicitante for TECNICO.
 * @returns {{ ok: boolean, data?: Object[], error?: string }}
 */
function Api_hseGetByUser(userId) {
  try {
    var user = requireRole(['DIRETOR_TECNICO', 'FINANCEIRO_ADMIN', 'TECNICO']);
    var targetId = (user.role === 'TECNICO') ? user.id : (userId || user.id);
    return { ok: true, data: hseRepoGetByUser(targetId) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Verifica a habilitação HSE de um técnico para mobilização em campo.
 * Restrito a DIRETOR_TECNICO.
 *
 * @param {string} userId ID do técnico.
 * @returns {{ ok: boolean, data?: { habilitado: boolean, pendencias: string[] }, error?: string }}
 */
function Api_hseVerificarHabilitacao(userId) {
  try {
    requireRole(['DIRETOR_TECNICO']);
    return { ok: true, data: hseSvcVerificarHabilitacao(userId) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Verifica a habilitação HSE de uma equipe inteira.
 * Restrito a DIRETOR_TECNICO.
 *
 * @param {string[]} tecnicoIds Lista de IDs dos técnicos.
 * @returns {{ ok: boolean, data?: { todos_habilitados: boolean, por_tecnico: Object }, error?: string }}
 */
function Api_hseVerificarEquipe(tecnicoIds) {
  try {
    requireRole(['DIRETOR_TECNICO']);
    return { ok: true, data: hseSvcVerificarEquipe(tecnicoIds) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ------------------------------------------------------------
// REFERENCE_INSTRUMENTS — API pública
// ------------------------------------------------------------

/**
 * Registra um novo instrumento de medição com certificado de calibração.
 * Restrito a DIRETOR_TECNICO.
 *
 * @param {Object} data Campos do instrumento (code, calibration_expiry, …).
 * @returns {{ ok: boolean, data?: Object, error?: string }}
 */
function Api_instrCreate(data) {
  try {
    requireRole(['DIRETOR_TECNICO']);
    return { ok: true, data: instrSvcCreate(data) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Retorna todos os instrumentos de medição cadastrados.
 * Disponível para DIRETOR_TECNICO e TECNICO.
 *
 * @returns {{ ok: boolean, data?: Object[], error?: string }}
 */
function Api_instrGetAll() {
  try {
    requireRole(['DIRETOR_TECNICO', 'TECNICO']);
    return { ok: true, data: instrRepoGetAll() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Verifica se um instrumento está com calibração válida.
 * Deve ser chamado ao referenciar um instrumento em laudo técnico.
 * Disponível para DIRETOR_TECNICO e TECNICO.
 *
 * @param {string} instrumentId ID do instrumento.
 * @returns {{ ok: boolean, data?: { valid: boolean }, error?: string }}
 */
function Api_instrVerificarCalibracao(instrumentId) {
  try {
    requireRole(['DIRETOR_TECNICO', 'TECNICO']);
    var ok = instrSvcVerificarCalibracaoValida(instrumentId);
    return { ok: true, data: { valid: ok } };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ------------------------------------------------------------
// Dashboard de Compliance — API pública
// ------------------------------------------------------------

/**
 * Retorna resumo de situação HSE e instrumentos para o painel de controle.
 * Restrito a DIRETOR_TECNICO.
 *
 * @returns {{ ok: boolean, data?: Object, error?: string }}
 */
function Api_complianceGetDashboard() {
  try {
    requireRole(['DIRETOR_TECNICO']);
    var hseDocs = hseRepoGetAll();
    var instrs  = instrRepoGetAll();
    return {
      ok: true,
      data: {
        hse_vencidos:    hseDocs.filter(function(d) { return String(d.valid) === 'FALSE'; }).length,
        hse_validos:     hseDocs.filter(function(d) { return String(d.valid) === 'TRUE';  }).length,
        instrs_vencidos: instrs.filter(function(i) { return String(i.valid) === 'FALSE'; }).length,
        instrs_validos:  instrs.filter(function(i) { return String(i.valid) === 'TRUE';  }).length
      }
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
