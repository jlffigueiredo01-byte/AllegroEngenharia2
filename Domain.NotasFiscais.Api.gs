// =============================================================================
// Domain.NotasFiscais.Api.gs
// Allegro Business System — Fase F7
// Ponto de entrada do cliente (google.script.run) para o domínio NF.
// Todas as funções retornam { ok: true, data } ou { ok: false, error }.
// =============================================================================

/**
 * Registra uma nova nota fiscal no sistema.
 * Papéis permitidos: DIRETOR_TECNICO, FINANCEIRO_ADMIN.
 *
 * @param {Object} nfData - Dados da NF (ver nfSvcCreate para campos aceitos).
 * @returns {{ok:boolean, data:Object}|{ok:boolean, error:string}}
 */
function Api_nfCreate(nfData) {
  try {
    requireRole(['DIRETOR_TECNICO', 'FINANCEIRO_ADMIN']);
    var result = nfSvcCreate(nfData);
    return { ok: true, data: result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Retorna todas as notas fiscais cadastradas.
 * Papéis permitidos: DIRETOR_TECNICO, DIRETOR_COMERCIAL, FINANCEIRO_ADMIN.
 *
 * @returns {{ok:boolean, data:Object[]}|{ok:boolean, error:string}}
 */
function Api_nfGetAll() {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN']);
    return { ok: true, data: nfRepoGetAll() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Retorna as NFs vinculadas a uma proposta específica.
 * Papéis permitidos: DIRETOR_TECNICO, DIRETOR_COMERCIAL, FINANCEIRO_ADMIN.
 *
 * @param {string} proposalId - ID da proposta.
 * @returns {{ok:boolean, data:Object[]}|{ok:boolean, error:string}}
 */
function Api_nfGetByProposal(proposalId) {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN']);
    if (!proposalId) throw new Error('proposalId é obrigatório.');
    return { ok: true, data: nfRepoGetByProposal(proposalId) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Registra a baixa de pagamento de uma nota fiscal.
 * Papéis permitidos: DIRETOR_TECNICO, FINANCEIRO_ADMIN.
 *
 * @param {string} id            - ID da NF (ex: NF-000001).
 * @param {string} dataPagamento - Data do pagamento.
 * @param {number} valorPago     - Valor efetivamente pago.
 * @returns {{ok:boolean, data:Object}|{ok:boolean, error:string}}
 */
function Api_nfRegistrarBaixa(id, dataPagamento, valorPago) {
  try {
    requireRole(['DIRETOR_TECNICO', 'FINANCEIRO_ADMIN']);
    if (!id)            throw new Error('ID da NF é obrigatório.');
    if (!dataPagamento) throw new Error('Data de pagamento é obrigatória.');
    if (!valorPago)     throw new Error('Valor pago é obrigatório.');
    var result = nfSvcRegistrarBaixa(id, dataPagamento, valorPago);
    return { ok: true, data: result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Tenta extrair dados de um XML de NF-e para pré-preenchimento do formulário.
 * Papéis permitidos: DIRETOR_TECNICO, FINANCEIRO_ADMIN.
 *
 * @param {string} xmlContent - Conteúdo do arquivo XML como string.
 * @returns {{ok:boolean, data:Object|null}|{ok:boolean, error:string}}
 *          data será null se o XML não puder ser interpretado.
 */
function Api_nfParseXml(xmlContent) {
  try {
    requireRole(['DIRETOR_TECNICO', 'FINANCEIRO_ADMIN']);
    if (!xmlContent) throw new Error('Conteúdo XML não fornecido.');
    var result = nfSvcParseXml(xmlContent);
    return { ok: true, data: result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Retorna o resumo financeiro de NFs (totais por status de pagamento).
 * Papéis permitidos: DIRETOR_TECNICO, DIRETOR_COMERCIAL, FINANCEIRO_ADMIN.
 *
 * @returns {{ok:boolean, data:Object}|{ok:boolean, error:string}}
 */
function Api_nfGetResumo() {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN']);
    return { ok: true, data: nfSvcGetResumo() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
