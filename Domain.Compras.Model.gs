// =============================================================================
// Domain.Compras.Model.gs
// Allegro Business System — Fase F15
// Constantes e inicialização da aba PURCHASE_ORDERS
// =============================================================================

/** Nome da aba de ordens de compra. */
var PURCHASE_ORDERS_SHEET = 'PURCHASE_ORDERS';

/** Cabeçalhos canônicos de PURCHASE_ORDERS. */
var PURCHASE_ORDERS_HEADERS = [
  'id', 'po_number', 'supplier_id', 'proposal_id', 'project_id',
  'status', 'currency', 'total_amount', 'items_json',
  'issued_at', 'expected_delivery', 'received_at',
  'nf_recebida_id',   // vinculado após three-way match
  'three_way_ok',     // TRUE | FALSE | PENDENTE
  'drive_folder_id',
  'created_by', 'created_at', 'updated_at'
];

/**
 * Status válidos de uma Ordem de Compra.
 * RASCUNHO → APROVADA → EMITIDA → RECEBIDA_PARCIAL / RECEBIDA → (CANCELADA)
 * (FB-029: passo APROVADA entre rascunho e emissão — gera→aprova→emite.)
 */
var PO_STATUS = {
  RASCUNHO:          'RASCUNHO',
  APROVADA:          'APROVADA',
  EMITIDA:           'EMITIDA',
  RECEBIDA_PARCIAL:  'RECEBIDA_PARCIAL',
  RECEBIDA:          'RECEBIDA',
  CANCELADA:         'CANCELADA'
};

/**
 * Inicializa a aba PURCHASE_ORDERS com os cabeçalhos canônicos.
 * Chamado por initCoreSheets() em Core.Setup.gs.
 */
function initPurchaseOrdersSheet() {
  getOrCreateSheet(PURCHASE_ORDERS_SHEET, PURCHASE_ORDERS_HEADERS);
}
