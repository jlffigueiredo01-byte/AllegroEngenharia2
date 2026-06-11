// =============================================================================
// Domain.Compras.Service.gs
// Allegro Business System — Fase F15
// Regras de negócio de Ordens de Compra. Sem acesso direto à planilha.
// =============================================================================

/**
 * Cria uma nova Ordem de Compra no status RASCUNHO.
 *
 * @param {Object} data                  - Dados da PO.
 * @param {string} data.supplier_id      - ID do fornecedor (obrigatório).
 * @param {string} [data.proposal_id]    - ID da proposta vinculada.
 * @param {string} [data.project_id]     - ID do projeto vinculado.
 * @param {string} [data.currency]       - Moeda (padrão: BRL).
 * @param {number} [data.total_amount]   - Valor total da PO.
 * @param {Array}  [data.items_json]     - Array de itens [{material_id, qty, unit_price}].
 * @param {string} [data.expected_delivery] - Data prevista de entrega (ISO).
 * @param {string} [data.drive_folder_id]   - ID da pasta no Drive.
 * @returns {Object} Registro completo da PO criado.
 * @throws {Error} Se supplier_id não for informado.
 */
function poSvcCreate(data) {
  if (!data.supplier_id) throw new Error('ID do fornecedor é obrigatório.');

  var user = getCurrentUser();
  var ano  = new Date().getFullYear();

  // Dois contadores: número legível e ID interno (separados para thread-safety)
  var poSeq    = getAndIncrementCounter('PO_COUNTER');
  var poIdSeq  = getAndIncrementCounter('PO_ID_COUNTER');
  var poNumber = 'PO-' + ano + '-' + String(poSeq).padStart(3, '0');
  var id       = 'PO-' + poIdSeq;
  var now      = nowISO();

  var itemsJson = data.items_json;
  if (typeof itemsJson !== 'string') {
    itemsJson = JSON.stringify(itemsJson || []);
  }

  var record = {
    id:                id,
    po_number:         poNumber,
    supplier_id:       data.supplier_id        || '',
    proposal_id:       data.proposal_id        || '',
    project_id:        data.project_id         || '',
    status:            PO_STATUS.RASCUNHO,
    currency:          data.currency           || 'BRL',
    total_amount:      safeNumber(data.total_amount, 0),
    items_json:        itemsJson,
    issued_at:         '',
    expected_delivery: data.expected_delivery  || '',
    received_at:       '',
    nf_recebida_id:    '',
    three_way_ok:      'PENDENTE',
    drive_folder_id:   data.drive_folder_id    || '',
    created_by:        user ? user.id : 'SYSTEM',
    created_at:        now,
    updated_at:        now
  };

  poRepoCreate(record);
  appendAuditLog('PO_CREATE', 'PURCHASE_ORDERS', id,
    'PO ' + poNumber + ' para fornecedor ' + data.supplier_id);
  return record;
}

/**
 * Emite uma Ordem de Compra, alterando o status de RASCUNHO para EMITIDA.
 *
 * @param {string} poId - ID da PO a emitir.
 * @returns {Object} Registro atualizado da PO.
 * @throws {Error} Se a PO não for encontrada ou não estiver no status RASCUNHO.
 */
function poSvcEmitir(poId) {
  var po = poRepoGetById(poId);
  if (!po) throw new Error('PO não encontrada: ' + poId);
  if (po.status !== PO_STATUS.RASCUNHO) {
    throw new Error('PO só pode ser emitida no status RASCUNHO. Status atual: ' + po.status);
  }

  poRepoUpdate(poId, {
    status:     PO_STATUS.EMITIDA,
    issued_at:  nowISO(),
    updated_at: nowISO()
  });
  appendAuditLog('PO_EMITIR', 'PURCHASE_ORDERS', poId, 'PO emitida');
  return poRepoGetById(poId);
}

/**
 * Cancela uma Ordem de Compra.
 * Somente POs nos status RASCUNHO ou EMITIDA podem ser canceladas.
 *
 * @param {string} poId   - ID da PO a cancelar.
 * @param {string} motivo - Motivo do cancelamento.
 * @returns {Object} Registro atualizado da PO.
 * @throws {Error} Se a PO não for encontrada ou não puder ser cancelada.
 */
function poSvcCancelar(poId, motivo) {
  var po = poRepoGetById(poId);
  if (!po) throw new Error('PO não encontrada: ' + poId);
  if (po.status !== PO_STATUS.RASCUNHO && po.status !== PO_STATUS.EMITIDA) {
    throw new Error('Apenas POs no status RASCUNHO ou EMITIDA podem ser canceladas. Status atual: ' + po.status);
  }

  poRepoUpdate(poId, {
    status:     PO_STATUS.CANCELADA,
    updated_at: nowISO()
  });
  appendAuditLog('PO_CANCELAR', 'PURCHASE_ORDERS', poId,
    'PO cancelada. Motivo: ' + (motivo || 'Não informado'));
  return poRepoGetById(poId);
}

/**
 * Realiza o three-way match (VALIDACAO_V3 §4.2):
 * Vincula a NF recebida à PO e compara valores.
 * Divergência > TOLERANCIA_THREE_WAY_PCT (CONFIG) → cria Action Card para FINANCEIRO_ADMIN.
 *
 * @param {string} poId - ID da Ordem de Compra.
 * @param {string} nfId - ID da Nota Fiscal recebida (INVOICES_DB).
 * @returns {{po:Object, three_way_ok:boolean, divergencia_pct:number}}
 * @throws {Error} Se a PO ou a NF não forem encontradas, ou se a PO não estiver EMITIDA.
 */
function poSvcThreeWayMatch(poId, nfId) {
  var po = poRepoGetById(poId);
  if (!po) throw new Error('PO não encontrada: ' + poId);
  if (po.status !== PO_STATUS.EMITIDA && po.status !== PO_STATUS.RECEBIDA_PARCIAL) {
    throw new Error(
      'Three-way match só pode ser realizado em POs com status EMITIDA ou RECEBIDA_PARCIAL. Status atual: ' + po.status
    );
  }

  // Usa nfRepoGetById() do NotasFiscais Repository — sem acesso direto à sheet
  var nf = nfRepoGetById(nfId);
  if (!nf) throw new Error('NF não encontrada: ' + nfId);

  // Lê tolerância do CONFIG (padrão: 5%)
  var tolerancia  = safeNumber(getConfigValue('TOLERANCIA_THREE_WAY_PCT'), 0.05);
  var valorPO     = safeNumber(po.total_amount, 0);
  var valorNF     = safeNumber(nf.total, 0);
  var divergencia = valorPO > 0 ? Math.abs(valorNF - valorPO) / valorPO : 0;
  var threeWayOk  = divergencia <= tolerancia;

  poRepoUpdate(poId, {
    nf_recebida_id: nfId,
    three_way_ok:   threeWayOk ? 'TRUE' : 'FALSE',
    status:         PO_STATUS.RECEBIDA,
    received_at:    nowISO(),
    updated_at:     nowISO()
  });

  // Se divergência exceder tolerância → cria Action Card bloqueante para FINANCEIRO_ADMIN
  // Usa acCreate() do ActionCards Repository — sem acesso direto à sheet
  if (!threeWayOk) {
    acCreate({
      title:       'Three-way match: divergência em ' + po.po_number,
      message:     'Divergência: ' + (divergencia * 100).toFixed(1) + '% — PO ' + poId + ' / NF ' + nfId,
      quote_id:    po.proposal_id || '',
      pos_venda_id: '',
      urgent:      true,
      assigned_to: '',
      created_by:  'SISTEMA',
      tipo:        'THREE_WAY_DIVERGENCIA',
      source:      'SISTEMA'
    });
  }

  appendAuditLog(
    'PO_THREE_WAY',
    'PURCHASE_ORDERS',
    poId,
    'NF: ' + nfId +
    ' | OK: '          + threeWayOk +
    ' | Divergência: ' + (divergencia * 100).toFixed(1) + '%'
  );

  return {
    po:             poRepoGetById(poId),
    three_way_ok:   threeWayOk,
    divergencia_pct: divergencia * 100
  };
}


/**
 * Cria uma PO em RASCUNHO a partir dos itens Hydronix de uma proposta FECHADA.
 * Preço unitário = table_price_usd x (1 - DESCONTO_COMPRA_PCT) — preço de COMPRA.
 * Itens sem correspondência na PRODUCTS são ignorados (linhas de serviço etc).
 * @param {string} proposalId
 * @param {string} supplierId
 * @return {Object} a PO criada
 */
function poSvcCreateFromProposal(proposalId, supplierId) {
  if (!proposalId) throw new Error('proposalId é obrigatório.');
  if (!supplierId) throw new Error('supplierId é obrigatório.');

  var prop = propRepoGetById(proposalId);
  if (!prop) throw new Error('Proposta não encontrada: ' + proposalId);
  if (prop.status !== 'FECHADA') {
    throw new Error('PO só pode ser gerada de proposta FECHADA. Status atual: ' + prop.status);
  }

  var propItems = [];
  try { propItems = JSON.parse(prop.items_json || '[]') || []; } catch (e) {}
  if (!propItems.length) throw new Error('Proposta sem itens.');

  var products = sheetToObjects(PRODUCTS_SHEET);
  var byCode = {};
  for (var i = 0; i < products.length; i++) byCode[products[i].code] = products[i];

  var params = prcRepoGetSetupCalcParams();
  var desconto = params.DESCONTO_COMPRA_PCT || 0;

  var poItems = [];
  var total = 0;
  var ignorados = [];
  for (var j = 0; j < propItems.length; j++) {
    var it = propItems[j];
    var prod = byCode[it.code];
    if (!prod) { ignorados.push(it.code || it.description || '?'); continue; }
    var unit = Number(prod.table_price_usd || 0) * (1 - desconto);
    var qty  = Number(it.qty || 1);
    var line = { code: it.code, description: prod.description || it.description || '',
                 qty: qty, unit_price: Math.round(unit * 100) / 100,
                 total: Math.round(unit * qty * 100) / 100 };
    total += line.total;
    poItems.push(line);
  }
  if (!poItems.length) {
    throw new Error('Nenhum item da proposta corresponde a produtos do catálogo (só serviços?).');
  }

  var po = poSvcCreate({
    supplier_id:  supplierId,
    proposal_id:  proposalId,
    currency:     'USD',
    items_json:   poItems,
    total_amount: Math.round(total * 100) / 100
  });

  appendTimelineEvent('PROPOSAL', proposalId, 'PO_GERADA',
    'PO ' + (po.po_number || po.id) + ' gerada da proposta (' + poItems.length + ' itens' +
    (ignorados.length ? '; ignorados: ' + ignorados.join(', ') : '') + ')');
  return po;
}
