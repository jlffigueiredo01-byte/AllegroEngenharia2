// =============================================================================
// Domain.Estoque.Model.gs
// Allegro Business System — Fase F15
// Constantes e inicialização das abas STOCK e STOCK_MOVEMENTS
// =============================================================================

/** Nome da aba de saldos de estoque. */
var STOCK_SHEET = 'STOCK';

/** Cabeçalhos canônicos de STOCK. */
var STOCK_HEADERS = [
  'id', 'material_id', 'material_code', 'qty_atual', 'qty_reservada', 'qty_disponivel',
  'custo_medio', 'ultima_movimentacao', 'updated_at'
];

/** Nome da aba de movimentações de estoque. */
var STOCK_MOVEMENTS_SHEET = 'STOCK_MOVEMENTS';

/** Cabeçalhos canônicos de STOCK_MOVEMENTS. */
var STOCK_MOVEMENTS_HEADERS = [
  'id', 'material_id', 'tipo', 'qty', 'po_id', 'project_id', 'user_id', 'notes', 'moved_at'
];

/**
 * Tipos válidos de movimentação de estoque.
 * ENTRADA  — recebimento de mercadoria (via PO).
 * SAIDA    — consumo/baixa para projeto ou operação.
 * RESERVA  — reserva para futuro consumo (não reduz qty_atual, reduz qty_disponivel).
 * ESTORNO  — reversão de uma movimentação anterior.
 */
var STOCK_TIPO = {
  ENTRADA: 'ENTRADA',
  SAIDA:   'SAIDA',
  RESERVA: 'RESERVA',
  ESTORNO: 'ESTORNO'
};

/**
 * Inicializa as abas STOCK e STOCK_MOVEMENTS com cabeçalhos canônicos.
 * Chamado por initCoreSheets() em Core.Setup.gs.
 */
function initStockSheet() {
  getOrCreateSheet(STOCK_SHEET, STOCK_HEADERS);
  getOrCreateSheet(STOCK_MOVEMENTS_SHEET, STOCK_MOVEMENTS_HEADERS);
}
