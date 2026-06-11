// =============================================================================
// Domain.Compras.Api.gs
// Allegro Business System — Fase F15
// Ponto de entrada do cliente (google.script.run) para Ordens de Compra.
// Todas as funções retornam { ok: true, data } ou { ok: false, error }.
// =============================================================================

/**
 * Cria uma nova Ordem de Compra no status RASCUNHO.
 * Papéis permitidos: DIRETOR_TECNICO, FINANCEIRO_ADMIN.
 *
 * @param {Object} data - Dados da PO (ver poSvcCreate).
 * @returns {{ok:boolean, data:Object}|{ok:boolean, error:string}}
 */
function Api_poCreate(data) {
  try {
    requireRole(['DIRETOR_TECNICO', 'FINANCEIRO_ADMIN']);
    var result = poSvcCreate(data);
    return { ok: true, data: result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Retorna todas as Ordens de Compra cadastradas.
 * Papéis permitidos: DIRETOR_TECNICO, FINANCEIRO_ADMIN.
 *
 * @returns {{ok:boolean, data:Object[]}|{ok:boolean, error:string}}
 */
function Api_poGetAll() {
  try {
    requireRole(['DIRETOR_TECNICO', 'FINANCEIRO_ADMIN']);
    return { ok: true, data: poRepoGetAll() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Emite uma Ordem de Compra (RASCUNHO → EMITIDA).
 * Papéis permitidos: DIRETOR_TECNICO.
 *
 * @param {string} poId - ID da PO.
 * @returns {{ok:boolean, data:Object}|{ok:boolean, error:string}}
 */
function Api_poEmitir(poId) {
  try {
    requireRole(['DIRETOR_TECNICO']);
    if (!poId) throw new Error('ID da PO é obrigatório.');
    var result = poSvcEmitir(poId);
    return { ok: true, data: result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Cancela uma Ordem de Compra.
 * Papéis permitidos: DIRETOR_TECNICO.
 *
 * @param {string} poId   - ID da PO.
 * @param {string} motivo - Motivo do cancelamento.
 * @returns {{ok:boolean, data:Object}|{ok:boolean, error:string}}
 */
function Api_poCancelar(poId, motivo) {
  try {
    requireRole(['DIRETOR_TECNICO']);
    if (!poId) throw new Error('ID da PO é obrigatório.');
    var result = poSvcCancelar(poId, motivo);
    return { ok: true, data: result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Realiza o three-way match entre uma PO e uma NF recebida.
 * Papéis permitidos: DIRETOR_TECNICO, FINANCEIRO_ADMIN.
 *
 * @param {string} poId - ID da PO.
 * @param {string} nfId - ID da NF recebida (INVOICES_DB).
 * @returns {{ok:boolean, data:{po:Object,three_way_ok:boolean,divergencia_pct:number}}|{ok:boolean, error:string}}
 */
function Api_poThreeWayMatch(poId, nfId) {
  try {
    requireRole(['DIRETOR_TECNICO', 'FINANCEIRO_ADMIN']);
    if (!poId) throw new Error('ID da PO é obrigatório.');
    if (!nfId) throw new Error('ID da NF é obrigatório.');
    var result = poSvcThreeWayMatch(poId, nfId);
    return { ok: true, data: result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Retorna as Ordens de Compra vinculadas a uma proposta.
 * Papéis permitidos: todos os perfis autenticados.
 *
 * @param {string} proposalId - ID da proposta.
 * @returns {{ok:boolean, data:Object[]}|{ok:boolean, error:string}}
 */
function Api_poGetByProposal(proposalId) {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN', 'TECNICO']);
    if (!proposalId) throw new Error('ID da proposta é obrigatório.');
    return { ok: true, data: poRepoGetByProposal(proposalId) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
