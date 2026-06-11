// =============================================================================
// Domain.NotasFiscais.Service.gs
// Allegro Business System — Fase F7
// Regras de negócio de Notas Fiscais. Sem acesso direto à planilha.
// =============================================================================

/**
 * Registra uma nota fiscal no sistema.
 * Valida a direção, gera ID sequencial, define status inicial de pagamento
 * e persiste via repository.
 *
 * @param {Object} nfData - Dados da NF.
 * @param {string} nfData.direction    - 'EMITIDA' ou 'RECEBIDA' (obrigatório).
 * @param {string} nfData.number       - Número da NF (obrigatório).
 * @param {string} nfData.cnpj         - CNPJ do parceiro.
 * @param {string} nfData.partner_name - Razão social do parceiro.
 * @param {string} nfData.issue_date   - Data de emissão (ISO ou dd/MM/yyyy).
 * @param {number} nfData.total        - Valor total da NF.
 * @param {string} [nfData.proposal_id]  - ID da proposta vinculada.
 * @param {string} [nfData.file_id]      - ID do arquivo no Drive.
 * @param {string} [nfData.due_date]     - Data de vencimento (ISO ou dd/MM/yyyy).
 * @param {string} [nfData.nf_key]       - Chave de acesso (44 dígitos) da NF-e.
 * @param {string} [nfData.parcelas_json] - JSON com array de parcelas.
 * @returns {Object} Registro completo da NF criado.
 * @throws {Error} Se direction for inválido ou number estiver ausente.
 */
function nfSvcCreate(nfData) {
  // Validações
  if (!nfData.direction || !NF_DIRECTION[nfData.direction]) {
    throw new Error('Direction inválido. Use EMITIDA ou RECEBIDA.');
  }
  if (!nfData.number) {
    throw new Error('Número da NF é obrigatório.');
  }
  if (!nfData.total || isNaN(nfData.total)) {
    throw new Error('Valor total da NF é obrigatório e deve ser numérico.');
  }

  var id  = 'NF-' + String(getAndIncrementCounter('NF_COUNTER')).padStart(6, '0');
  var now = nowISO();

  var statusPagamento = nfData.direction === NF_DIRECTION.EMITIDA
    ? NF_STATUS_PAG.A_RECEBER
    : NF_STATUS_PAG.A_PAGAR;

  var record = {
    id:               id,
    nf_key:           nfData.nf_key         || '',
    number:           nfData.number,
    direction:        nfData.direction,
    cnpj:             nfData.cnpj           || '',
    partner_name:     nfData.partner_name   || '',
    issue_date:       nfData.issue_date     || '',
    total:            safeNumber(nfData.total),
    proposal_id:      nfData.proposal_id    || '',
    file_id:          nfData.file_id        || '',
    status_pagamento: statusPagamento,
    due_date:         nfData.due_date       || '',
    parcelas_json:    nfData.parcelas_json  || JSON.stringify([]),
    created_at:       now,
    updated_at:       now
  };

  nfRepoCreate(record);

  appendAuditLog(
    'NF_CREATE',
    'INVOICES_DB',
    id,
    'NF ' + nfData.direction + ' nº ' + nfData.number + ' R$' + nfData.total
  );

  // Nota: action card de cobrança D-5 é criado pelo trigger noturno (Core.Scheduler)
  // quando a NF A_RECEBER se aproxima do vencimento.

  return record;
}

/**
 * Registra a baixa de pagamento de uma nota fiscal.
 * Altera status_pagamento para RECEBIDA (emitidas) ou PAGA (recebidas).
 *
 * @param {string} id            - ID da NF (ex: NF-000001).
 * @param {string} dataPagamento - Data em que o pagamento ocorreu.
 * @param {number} valorPago     - Valor efetivamente pago.
 * @returns {Object} Registro atualizado da NF.
 * @throws {Error} Se a NF não for encontrada.
 */
function nfSvcRegistrarBaixa(id, dataPagamento, valorPago) {
  var nf = nfRepoGetById(id);
  if (!nf) throw new Error('NF não encontrada: ' + id);

  var novoStatus = nf.direction === NF_DIRECTION.EMITIDA
    ? NF_STATUS_PAG.RECEBIDA
    : NF_STATUS_PAG.PAGA;

  nfRepoUpdate(id, { status_pagamento: novoStatus, updated_at: nowISO() });

  appendAuditLog(
    'NF_BAIXA',
    'INVOICES_DB',
    id,
    'Baixa: R$' + valorPago + ' em ' + dataPagamento
  );

  return nfRepoGetById(id);
}

/**
 * Tenta extrair dados básicos de um XML de NF-e (SEFAZ padrão 4.0).
 * Utilizado quando o usuário faz upload de XML para pré-preencher o formulário.
 * Em caso de falha ou XML inválido retorna null (fallback para preenchimento manual).
 *
 * @param {string} xmlContent - Conteúdo do XML da NF-e como string.
 * @returns {Object|null} Objeto com { nf_key, number, cnpj, partner_name, issue_date, total }
 *                        ou null se o parse falhar.
 */
function nfSvcParseXml(xmlContent) {
  try {
    var doc  = XmlService.parse(xmlContent);
    var root = doc.getRootElement();
    var ns   = XmlService.getNamespace('http://www.portalfiscal.inf.br/nfe');

    // Suporta raiz <nfeProc> (com envelope) ou <NFe> (arquivo avulso)
    var nfeEl = root.getChild('NFe', ns) || root;
    var infNFe = nfeEl.getChild('infNFe', ns);
    if (!infNFe) return null;

    var ide   = infNFe.getChild('ide',   ns);
    var emit  = infNFe.getChild('emit',  ns);
    var total = infNFe.getChild('total', ns);

    var chave = infNFe.getAttribute('Id')
      ? infNFe.getAttribute('Id').getValue().replace('NFe', '')
      : '';

    var icmsTot = total ? total.getChild('ICMSTot', ns) : null;
    var valorTotal = icmsTot ? parseFloat(icmsTot.getChildText('vNF', ns) || '0') : 0;

    // Data de emissão: dhEmi (com fuso) tem precedência sobre dEmi
    var dhEmi = ide ? (ide.getChildText('dhEmi', ns) || ide.getChildText('dEmi', ns) || '') : '';

    return {
      nf_key:       chave,
      number:       ide  ? ide.getChildText('nNF', ns)   || '' : '',
      cnpj:         emit ? emit.getChildText('CNPJ', ns)  || '' : '',
      partner_name: emit ? emit.getChildText('xNome', ns) || '' : '',
      issue_date:   dhEmi,
      total:        valorTotal
    };
  } catch (e) {
    // XML inválido ou namespace inesperado — retorna null para fallback manual
    return null;
  }
}

/**
 * Retorna o resumo financeiro de NFs por status.
 * Útil para o painel financeiro.
 *
 * @returns {Object} { a_receber, recebido, a_pagar, pago } em R$.
 */
function nfSvcGetResumo() {
  var todas = nfRepoGetAll();
  var resumo = { a_receber: 0, recebido: 0, a_pagar: 0, pago: 0 };

  todas.forEach(function(nf) {
    var valor = safeNumber(nf.total);
    switch (nf.status_pagamento) {
      case NF_STATUS_PAG.A_RECEBER: resumo.a_receber += valor; break;
      case NF_STATUS_PAG.RECEBIDA:  resumo.recebido  += valor; break;
      case NF_STATUS_PAG.A_PAGAR:   resumo.a_pagar   += valor; break;
      case NF_STATUS_PAG.PAGA:      resumo.pago       += valor; break;
    }
  });

  return resumo;
}
