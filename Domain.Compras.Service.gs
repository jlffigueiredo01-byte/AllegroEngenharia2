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
  if (po.status !== PO_STATUS.RASCUNHO && po.status !== PO_STATUS.APROVADA) {
    throw new Error('PO só pode ser emitida em RASCUNHO ou APROVADA. Status atual: ' + po.status);
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

/* ═══════════════════════ FB-029: aprovar · documento SC · email ═══════════════════════ */

/** Aprova uma PO (RASCUNHO → APROVADA). Maria + diretores (RBAC na Api). */
function poSvcAprovar(poId) {
  var po = poRepoGetById(poId);
  if (!po) throw new Error('PO não encontrada: ' + poId);
  if (po.status !== PO_STATUS.RASCUNHO) {
    throw new Error('PO só pode ser aprovada no status RASCUNHO. Status atual: ' + po.status);
  }
  var user = getCurrentUser();
  poRepoUpdate(poId, { status: PO_STATUS.APROVADA, updated_at: nowISO() });
  appendAuditLog('PO_APROVAR', 'PURCHASE_ORDERS', poId, 'PO aprovada por ' + (user ? user.id : '?'));
  return poRepoGetById(poId);
}

/** Formata valor monetário simples (sem depender de Intl no servidor). */
function _poFmtMoney(n, cur) {
  var v = Number(n || 0).toFixed(2).split('.');
  v[0] = v[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  var sym = cur === 'USD' ? 'US$ ' : (cur === 'BRL' ? 'R$ ' : ((cur || '') + ' '));
  return sym + v.join(',');
}

/**
 * Gera o HTML do documento "Solicitação de Compra — SC" de uma PO.
 * Usado pela visualização na UI e como corpo do e-mail ao fornecedor.
 * @param {string} poId
 * @return {string} HTML standalone (inline styles)
 */
function poSvcGerarHTML(poId) {
  var po = poRepoGetById(poId);
  if (!po) throw new Error('PO não encontrada: ' + poId);
  var sup = po.supplier_id ? supplierRepoGetById(po.supplier_id) : null;
  var items = [];
  try { items = JSON.parse(po.items_json || '[]') || []; } catch (e) {}
  var cur = po.currency || 'USD';

  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  };
  var cfg = function (k, def) { try { return getConfigValue(k) || def; } catch (e) { return def; } };
  var emp = {
    razao:    cfg('EMPRESA_RAZAO', 'ALLEGRO DESENVOLVIMENTO E AUTOMACAO INDUSTRIAL LTDA'),
    cnpj:     cfg('EMPRESA_CNPJ', '07.979.808/0001-01'),
    endereco: cfg('EMPRESA_ENDERECO', 'Rua Marechal Cândido Rondon, 3171 — Cascavel, Paraná — CEP 85.811-080'),
    tel:      cfg('EMPRESA_TELEFONE', '+55 45 99946-0898'),
    email:    cfg('EMPRESA_EMAIL', 'contato@allegro.eng.br'),
    depto:    'ENGENHARIA'
  };

  var respNome = po.created_by || '';
  try {
    var us = sheetToObjects(USERS_SHEET);
    for (var u = 0; u < us.length; u++) { if (us[u].id === po.created_by) { respNome = us[u].name || po.created_by; break; } }
  } catch (e) {}

  var rows = '';
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    var qty = Number(it.qty || 0);
    var unit = Number(it.unit_price || 0);
    var tot = (it.total != null) ? Number(it.total) : (qty * unit);
    rows +=
      '<tr>' +
        '<td style="border:1px solid #cbd5e1;padding:6px 8px;text-align:center">' + (i + 1) + '</td>' +
        '<td style="border:1px solid #cbd5e1;padding:6px 8px">' + esc(it.code || '') + '</td>' +
        '<td style="border:1px solid #cbd5e1;padding:6px 8px;text-align:center">' + qty + '</td>' +
        '<td style="border:1px solid #cbd5e1;padding:6px 8px">' + esc(it.description || '') + '</td>' +
        '<td style="border:1px solid #cbd5e1;padding:6px 8px;text-align:right">' + _poFmtMoney(unit, cur) + '</td>' +
        '<td style="border:1px solid #cbd5e1;padding:6px 8px;text-align:right">' + _poFmtMoney(tot, cur) + '</td>' +
      '</tr>';
  }

  return '' +
    '<div style="font-family:Arial,Helvetica,sans-serif;color:#1e293b;max-width:760px;margin:0 auto;padding:24px;font-size:13px;line-height:1.5">' +
      '<div style="border-bottom:3px solid #1a56db;padding-bottom:10px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:flex-end">' +
        '<div><div style="font-size:20px;font-weight:800;color:#1a56db">SOLICITAÇÃO DE COMPRA — SC</div>' +
          '<div style="color:#64748b;font-size:12px">Allegro Engenharia · Hydronix</div></div>' +
        '<div style="text-align:right;font-size:12px"><div><b>SC nº:</b> ' + esc(po.po_number || po.id) + '</div>' +
          '<div><b>Data:</b> ' + esc(formatDate(po.created_at || nowISO())) + '</div>' +
          '<div><b>Status:</b> ' + esc(po.status || '') + '</div></div>' +
      '</div>' +
      '<table style="width:100%;border-collapse:collapse;margin-bottom:14px"><tr>' +
        '<td style="vertical-align:top;width:50%;padding-right:10px">' +
          '<div style="font-weight:700;color:#1a56db;font-size:11px;text-transform:uppercase;margin-bottom:4px">Responsável pela solicitação</div>' +
          '<div><b>' + esc(respNome) + '</b></div><div>' + esc(emp.razao) + '</div>' +
          '<div>Depto: ' + esc(emp.depto) + ' · CNPJ: ' + esc(emp.cnpj) + '</div>' +
          '<div>' + esc(emp.tel) + ' · ' + esc(emp.email) + '</div>' +
          (po.proposal_id ? '<div style="margin-top:4px"><b>Projeto/Proposta:</b> ' + esc(po.proposal_id) + '</div>' : '') +
        '</td>' +
        '<td style="vertical-align:top;width:50%;padding-left:10px;border-left:1px solid #e2e8f0">' +
          '<div style="font-weight:700;color:#1a56db;font-size:11px;text-transform:uppercase;margin-bottom:4px">Fornecedor</div>' +
          (sup ?
            ('<div><b>' + esc(sup.name || '') + '</b></div>' +
             (sup.cnpj ? '<div>CNPJ: ' + esc(sup.cnpj) + '</div>' : '') +
             (sup.contact_name ? '<div>' + esc(sup.contact_name) + '</div>' : '') +
             '<div>' + esc(sup.po_email || sup.contact_email || '(sem e-mail cadastrado)') +
               (sup.contact_phone ? ' · ' + esc(sup.contact_phone) : '') + '</div>')
            : '<div style="color:#b45309">Fornecedor não vinculado</div>') +
        '</td>' +
      '</tr></table>' +
      '<table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:6px">' +
        '<thead><tr style="background:#1a56db;color:#fff">' +
          '<th style="border:1px solid #1a56db;padding:6px 8px">ITEM</th>' +
          '<th style="border:1px solid #1a56db;padding:6px 8px">COD</th>' +
          '<th style="border:1px solid #1a56db;padding:6px 8px">QTD</th>' +
          '<th style="border:1px solid #1a56db;padding:6px 8px;text-align:left">Descrição</th>' +
          '<th style="border:1px solid #1a56db;padding:6px 8px">Valor unit.</th>' +
          '<th style="border:1px solid #1a56db;padding:6px 8px">Valor total</th>' +
        '</tr></thead><tbody>' +
          (rows || '<tr><td colspan="6" style="border:1px solid #cbd5e1;padding:10px;text-align:center;color:#94a3b8">Sem itens</td></tr>') +
        '</tbody><tfoot><tr>' +
          '<td colspan="5" style="border:1px solid #cbd5e1;padding:6px 8px;text-align:right;font-weight:700">TOTAL</td>' +
          '<td style="border:1px solid #cbd5e1;padding:6px 8px;text-align:right;font-weight:800;color:#16a34a">' + _poFmtMoney(po.total_amount, cur) + '</td>' +
        '</tr></tfoot></table>' +
      '<div style="font-size:11px;color:#64748b;margin-bottom:14px">Moeda: ' + esc(cur) + '</div>' +
      '<div style="margin-bottom:12px"><div style="font-weight:700;color:#1a56db;font-size:11px;text-transform:uppercase;margin-bottom:4px">Informações para entrega</div>' +
        '<div>' + esc(emp.razao) + '</div><div>' + esc(emp.endereco) + '</div>' +
        (po.expected_delivery ? '<div><b>Entrega prevista:</b> ' + esc(formatDate(po.expected_delivery)) + '</div>' : '') +
      '</div>' +
      '<div style="margin-top:28px;display:flex;justify-content:space-between;font-size:12px;color:#475569">' +
        '<div style="text-align:center">_____________________________<br>Responsável Allegro</div>' +
        '<div style="text-align:center">_____________________________<br>Fornecedor (ciência)</div>' +
      '</div>' +
    '</div>';
}

/**
 * Envia o documento SC por e-mail ao fornecedor (po_email/contact_email).
 * @param {string} poId
 * @return {{to:string}}
 */
function poSvcEnviarEmail(poId) {
  var po = poRepoGetById(poId);
  if (!po) throw new Error('PO não encontrada: ' + poId);
  var sup = po.supplier_id ? supplierRepoGetById(po.supplier_id) : null;
  var to = sup ? (sup.po_email || sup.contact_email || '') : '';
  if (!to) throw new Error('Fornecedor sem e-mail cadastrado (po_email/contact_email). Cadastre o e-mail do fornecedor antes de emitir.');
  var html = poSvcGerarHTML(poId);
  MailApp.sendEmail({
    to: to,
    subject: 'Ordem de Compra ' + (po.po_number || po.id) + ' — Allegro Engenharia',
    htmlBody: html,
    name: 'Allegro Engenharia'
  });
  appendAuditLog('PO_EMAIL', 'PURCHASE_ORDERS', poId, 'Documento SC enviado para ' + to);
  return { to: to };
}
