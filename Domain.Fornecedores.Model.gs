// =============================================================================
// Domain.Fornecedores.Model.gs
// Allegro Business System — Fase F15
// Constantes e inicialização das abas SUPPLIERS, MATERIALS e MATERIAL_PRICES
// =============================================================================

/** Nome da aba de fornecedores. */
var SUPPLIERS_SHEET = 'SUPPLIERS';

/** Cabeçalhos canônicos de SUPPLIERS. */
var SUPPLIERS_HEADERS = [
  'id', 'name', 'cnpj', 'country', 'contact_name', 'contact_email', 'contact_phone',
  'lead_time_days', 'payment_terms', 'currency', 'active', 'notes', 'created_at', 'updated_at'
];

/** Nome da aba de materiais. */
var MATERIALS_SHEET = 'MATERIALS';

/** Cabeçalhos canônicos de MATERIALS. */
var MATERIALS_HEADERS = [
  'id', 'code', 'description', 'unit', 'category',
  'supplier_id', 'last_price', 'last_price_currency', 'last_price_date',
  'stock_qty', 'stock_min', 'created_at', 'updated_at'
];

/** Nome da aba de histórico de preços de materiais (em ALLEGRO_LOGS). */
var MATERIAL_PRICES_SHEET = 'MATERIAL_PRICES';

/** Cabeçalhos canônicos de MATERIAL_PRICES. */
var MATERIAL_PRICES_HEADERS = [
  'id', 'material_id', 'supplier_id', 'price', 'currency', 'recorded_at'
];

/**
 * Inicializa as abas SUPPLIERS, MATERIALS e MATERIAL_PRICES com cabeçalhos canônicos.
 * Chamado por initCoreSheets() em Core.Setup.gs.
 */
function initSuppliersSheet() {
  getOrCreateSheet(SUPPLIERS_SHEET, SUPPLIERS_HEADERS);
  getOrCreateSheet(MATERIALS_SHEET, MATERIALS_HEADERS);
  getOrCreateSheet(MATERIAL_PRICES_SHEET, MATERIAL_PRICES_HEADERS);
}
