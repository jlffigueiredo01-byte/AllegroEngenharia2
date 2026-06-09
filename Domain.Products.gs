// =============================================================================
// ALLEGRO Business System — Products / Price List Module
// Domain.Products.gs
// =============================================================================

var PRODUCTS_SHEET = 'PRODUCTS';
var PRODUCTS_HEADERS = [
  'code', 'description', 'ncm', 'category',
  'table_price_usd', 'purchase_price_usd', 'purchase_price_brl',
  'selling_price_usd', 'selling_price_brl', 'active'
];

// ---------------------------------------------------------------------------
// Sheet initialisation + seed data
// ---------------------------------------------------------------------------

function initProductsSheet() {
  getOrCreateSheet(PRODUCTS_SHEET, PRODUCTS_HEADERS);
  var existing = sheetToObjects(PRODUCTS_SHEET);
  if (existing.length > 0) return; // already seeded

  // ── ORGANICO ──────────────────────────────────────────────────────────────
  appendRowToSheet(PRODUCTS_SHEET, {code:'HMXT01', description:'Hydro-Mix XT', ncm:'90278999', category:'ORGANICO', table_price_usd:5890, purchase_price_usd:3828.50, purchase_price_brl:19831.63, selling_price_usd:14816.41, selling_price_brl:76749, active:'TRUE'}, PRODUCTS_HEADERS);
  appendRowToSheet(PRODUCTS_SHEET, {code:'HMHT01', description:'Hydro-Mix HT', ncm:'90278999', category:'ORGANICO', table_price_usd:7250, purchase_price_usd:4712.50, purchase_price_brl:24410.75, selling_price_usd:18237.45, selling_price_brl:94470, active:'TRUE'}, PRODUCTS_HEADERS);
  appendRowToSheet(PRODUCTS_SHEET, {code:'HPXT02', description:'Hydro-Probe XT', ncm:'90278999', category:'ORGANICO', table_price_usd:5145, purchase_price_usd:3344.25, purchase_price_brl:17323.22, selling_price_usd:12942.28, selling_price_brl:67041, active:'TRUE'}, PRODUCTS_HEADERS);
  appendRowToSheet(PRODUCTS_SHEET, {code:'HPBX01', description:'Hydro-Probe BX', ncm:'90278999', category:'ORGANICO', table_price_usd:7860, purchase_price_usd:5109, purchase_price_brl:26464.62, selling_price_usd:19772.01, selling_price_brl:102419, active:'TRUE'}, PRODUCTS_HEADERS);
  appendRowToSheet(PRODUCTS_SHEET, {code:'HMXT-FS01', description:'Hydro-Mix XT Food Safe', ncm:'90278999', category:'ORGANICO', table_price_usd:7720, purchase_price_usd:5018, purchase_price_brl:25993.24, selling_price_usd:19419.69, selling_price_brl:100594, active:'TRUE'}, PRODUCTS_HEADERS);
  appendRowToSheet(PRODUCTS_SHEET, {code:'HMXT-EX01', description:'Hydro-Mix XT ATEX (Explosão)', ncm:'90278999', category:'ORGANICO', table_price_usd:12200, purchase_price_usd:7930, purchase_price_brl:41077.40, selling_price_usd:30689.19, selling_price_brl:158970, active:'TRUE'}, PRODUCTS_HEADERS);
  appendRowToSheet(PRODUCTS_SHEET, {code:'HMHT-EX01', description:'Hydro-Mix HT ATEX (Explosão)', ncm:'90278999', category:'ORGANICO', table_price_usd:14690, purchase_price_usd:9548.50, purchase_price_brl:49461.23, selling_price_usd:36952.70, selling_price_brl:191415, active:'TRUE'}, PRODUCTS_HEADERS);

  // ── DUCTING ───────────────────────────────────────────────────────────────
  appendRowToSheet(PRODUCTS_SHEET, {code:'DSVHT01', description:'Ducting System V (Hydro-Mix HT)', ncm:'73089010', category:'DUCTING', table_price_usd:2260, purchase_price_usd:1469, purchase_price_brl:7609.42, selling_price_usd:2842.57, selling_price_brl:14724.50, active:'TRUE'}, PRODUCTS_HEADERS);
  appendRowToSheet(PRODUCTS_SHEET, {code:'DSAHT01', description:'Ducting System A (Hydro-Mix HT)', ncm:'73089010', category:'DUCTING', table_price_usd:2105, purchase_price_usd:1368.25, purchase_price_brl:7087.54, selling_price_usd:2647.59, selling_price_brl:13714.50, active:'TRUE'}, PRODUCTS_HEADERS);
  appendRowToSheet(PRODUCTS_SHEET, {code:'DSV02', description:'Ducting System V (Hydro-Mix XT)', ncm:'73089010', category:'DUCTING', table_price_usd:2540, purchase_price_usd:1651, purchase_price_brl:8552.18, selling_price_usd:3194.69, selling_price_brl:16548.50, active:'TRUE'}, PRODUCTS_HEADERS);
  appendRowToSheet(PRODUCTS_SHEET, {code:'DSA02', description:'Ducting System A (Hydro-Mix XT)', ncm:'73089010', category:'DUCTING', table_price_usd:1815, purchase_price_usd:1179.75, purchase_price_brl:6111.11, selling_price_usd:2282.82, selling_price_brl:11825, active:'TRUE'}, PRODUCTS_HEADERS);
  appendRowToSheet(PRODUCTS_SHEET, {code:'HSXT01', description:'Hydro-Mix XT Skid', ncm:'73089010', category:'DUCTING', table_price_usd:1785, purchase_price_usd:1160.25, purchase_price_brl:6010.10, selling_price_usd:4490.35, selling_price_brl:23260, active:'TRUE'}, PRODUCTS_HEADERS);

  // ── CONCRETO ──────────────────────────────────────────────────────────────
  appendRowToSheet(PRODUCTS_SHEET, {code:'HP04', description:'Hydro-Probe', ncm:'90278999', category:'CONCRETO', table_price_usd:4600, purchase_price_usd:2990, purchase_price_brl:15488.20, selling_price_usd:11571.43, selling_price_brl:59940, active:'TRUE'}, PRODUCTS_HEADERS);
  appendRowToSheet(PRODUCTS_SHEET, {code:'HM08', description:'Hydro-Mix', ncm:'90278999', category:'CONCRETO', table_price_usd:5550, purchase_price_usd:3607.50, purchase_price_brl:18686.85, selling_price_usd:13961.20, selling_price_brl:72319, active:'TRUE'}, PRODUCTS_HEADERS);
  appendRowToSheet(PRODUCTS_SHEET, {code:'ORB3', description:'Hydro-Probe Orbiter', ncm:'90278999', category:'CONCRETO', table_price_usd:5590, purchase_price_usd:3633.50, purchase_price_brl:18821.53, selling_price_usd:14061.78, selling_price_brl:72840, active:'TRUE'}, PRODUCTS_HEADERS);
  appendRowToSheet(PRODUCTS_SHEET, {code:'ORBA2C-700', description:'Hydro-Probe Orbiter Sensing Arm 700mm', ncm:'73089010', category:'CONCRETO', table_price_usd:2820, purchase_price_usd:1974, purchase_price_brl:10225.32, selling_price_usd:7639.38, selling_price_brl:39572, active:'TRUE'}, PRODUCTS_HEADERS);
  appendRowToSheet(PRODUCTS_SHEET, {code:'ORBR3-A', description:'Hydro-Probe Orbiter Rotating Connectors', ncm:'73089010', category:'CONCRETO', table_price_usd:1815, purchase_price_usd:1179.75, purchase_price_brl:6111.11, selling_price_usd:4565.64, selling_price_brl:23650, active:'TRUE'}, PRODUCTS_HEADERS);
  appendRowToSheet(PRODUCTS_SHEET, {code:'0900', description:'Hydro-Mix Replacement Ceramic Disc and Protection Ring Kit', ncm:'73089010', category:'CONCRETO', table_price_usd:1365, purchase_price_usd:887.25, purchase_price_brl:4595.96, selling_price_usd:3433.78, selling_price_brl:17787, active:'TRUE'}, PRODUCTS_HEADERS);
  appendRowToSheet(PRODUCTS_SHEET, {code:'0930', description:'Hydro-Mix Replacement Protection Ring with fixings', ncm:'73089010', category:'CONCRETO', table_price_usd:400, purchase_price_usd:260, purchase_price_brl:1346.80, selling_price_usd:1006.37, selling_price_brl:5213, active:'TRUE'}, PRODUCTS_HEADERS);

  // ── INTERFACE ─────────────────────────────────────────────────────────────
  appendRowToSheet(PRODUCTS_SHEET, {code:'SIM-02A', description:'USB Interface Module', ncm:'85444200', category:'INTERFACE', table_price_usd:411, purchase_price_usd:267.15, purchase_price_brl:1383.84, selling_price_usd:1033.98, selling_price_brl:5356, active:'TRUE'}, PRODUCTS_HEADERS);
  appendRowToSheet(PRODUCTS_SHEET, {code:'0957A', description:'Cabo 4m para HM08 e HP04', ncm:'85444200', category:'INTERFACE', table_price_usd:210, purchase_price_usd:136.50, purchase_price_brl:707.07, selling_price_usd:528.38, selling_price_brl:2737, active:'TRUE'}, PRODUCTS_HEADERS);
  appendRowToSheet(PRODUCTS_SHEET, {code:'0975A-25M', description:'Cabo 25m para HM08 e HP04', ncm:'85444200', category:'INTERFACE', table_price_usd:450, purchase_price_usd:292.50, purchase_price_brl:1515.15, selling_price_usd:1132.05, selling_price_brl:5864, active:'TRUE'}, PRODUCTS_HEADERS);
  appendRowToSheet(PRODUCTS_SHEET, {code:'5015', description:'Fixing Plate para HMXT', ncm:'73089010', category:'INTERFACE', table_price_usd:190, purchase_price_usd:123.50, purchase_price_brl:639.73, selling_price_usd:477.99, selling_price_brl:2476, active:'TRUE'}, PRODUCTS_HEADERS);
  appendRowToSheet(PRODUCTS_SHEET, {code:'0025', description:'Suporte de Montagem para caixa - Hydro-Probe', ncm:'73089010', category:'INTERFACE', table_price_usd:143, purchase_price_usd:92.95, purchase_price_brl:481.48, selling_price_usd:359.85, selling_price_brl:1864, active:'TRUE'}, PRODUCTS_HEADERS);
  appendRowToSheet(PRODUCTS_SHEET, {code:'0026', description:'Extension Mounting Sleeve - Hydro-Probe', ncm:'73089010', category:'INTERFACE', table_price_usd:310, purchase_price_usd:201.50, purchase_price_brl:1043.77, selling_price_usd:779.92, selling_price_brl:4040, active:'TRUE'}, PRODUCTS_HEADERS);

  // ── DISPLAY_HUB ───────────────────────────────────────────────────────────
  appendRowToSheet(PRODUCTS_SHEET, {code:'HV05', description:'Hydro-View - Sem Profinet/Profibus/Ethernet', ncm:'85371020', category:'DISPLAY_HUB', table_price_usd:2153, purchase_price_usd:1507.10, purchase_price_brl:7806.78, selling_price_usd:5832.63, selling_price_brl:30213, active:'TRUE'}, PRODUCTS_HEADERS);
  appendRowToSheet(PRODUCTS_SHEET, {code:'HV05E-1187', description:'Hydro-View HV05E com PROFIBUS', ncm:'85371020', category:'DISPLAY_HUB', table_price_usd:3195, purchase_price_usd:2236.50, purchase_price_brl:11585.07, selling_price_usd:8655.41, selling_price_brl:44835, active:'TRUE'}, PRODUCTS_HEADERS);
  appendRowToSheet(PRODUCTS_SHEET, {code:'HV05-1188', description:'Hydro-View HV05 com EtherNet/IP', ncm:'85371020', category:'DISPLAY_HUB', table_price_usd:3055, purchase_price_usd:2138.50, purchase_price_brl:11077.43, selling_price_usd:8276.06, selling_price_brl:42870, active:'TRUE'}, PRODUCTS_HEADERS);
  appendRowToSheet(PRODUCTS_SHEET, {code:'HV05-1189', description:'Hydro-View HV05 com PROFINET', ncm:'85371020', category:'DISPLAY_HUB', table_price_usd:3055, purchase_price_usd:2138.50, purchase_price_brl:11077.43, selling_price_usd:8276.06, selling_price_brl:42870, active:'TRUE'}, PRODUCTS_HEADERS);
  appendRowToSheet(PRODUCTS_SHEET, {code:'PHV05', description:'Painel + Hydro-View - Profinet/Profibus/Ethernet', ncm:'85371020', category:'DISPLAY_HUB', table_price_usd:3850, purchase_price_usd:2695, purchase_price_brl:13960.10, selling_price_usd:10429.73, selling_price_brl:54026, active:'TRUE'}, PRODUCTS_HEADERS);
  appendRowToSheet(PRODUCTS_SHEET, {code:'HH01', description:'Hydro-Hub', ncm:'85371020', category:'DISPLAY_HUB', table_price_usd:1290, purchase_price_usd:903, purchase_price_brl:4677.54, selling_price_usd:3494.79, selling_price_brl:18103, active:'TRUE'}, PRODUCTS_HEADERS);
  appendRowToSheet(PRODUCTS_SHEET, {code:'HH01-1187', description:'Hydro-Hub com PROFIBUS', ncm:'85371020', category:'DISPLAY_HUB', table_price_usd:1965, purchase_price_usd:1375.50, purchase_price_brl:7125.09, selling_price_usd:5323.36, selling_price_brl:27575, active:'TRUE'}, PRODUCTS_HEADERS);
  appendRowToSheet(PRODUCTS_SHEET, {code:'HH01-1188', description:'Hydro-Hub com EtherNet/IP', ncm:'85371020', category:'DISPLAY_HUB', table_price_usd:2125, purchase_price_usd:1487.50, purchase_price_brl:7705.25, selling_price_usd:5756.76, selling_price_brl:29820, active:'TRUE'}, PRODUCTS_HEADERS);
  appendRowToSheet(PRODUCTS_SHEET, {code:'HH01-1189', description:'Hydro-Hub com PROFINET', ncm:'85371020', category:'DISPLAY_HUB', table_price_usd:1965, purchase_price_usd:1487.50, purchase_price_brl:7705.25, selling_price_usd:5756.76, selling_price_brl:29820, active:'TRUE'}, PRODUCTS_HEADERS);
  appendRowToSheet(PRODUCTS_SHEET, {code:'PHH01', description:'Painel + Hydro-Hub - Profinet/Profibus/Ethernet', ncm:'85371020', category:'DISPLAY_HUB', table_price_usd:3520, purchase_price_usd:2464, purchase_price_brl:12763.52, selling_price_usd:9535.71, selling_price_brl:49395, active:'TRUE'}, PRODUCTS_HEADERS);

  // ── SERVICO ───────────────────────────────────────────────────────────────
  appendRowToSheet(PRODUCTS_SHEET, {code:'MO-STARTUP', description:'Start-Up - Comissionamento e Treinamento (5 dias)', ncm:'', category:'SERVICO', table_price_usd:0, purchase_price_usd:0, purchase_price_brl:0, selling_price_usd:0, selling_price_brl:24650, active:'TRUE'}, PRODUCTS_HEADERS);
  appendRowToSheet(PRODUCTS_SHEET, {code:'MO-INFRA', description:'Infraestrutura', ncm:'', category:'SERVICO', table_price_usd:0, purchase_price_usd:0, purchase_price_brl:0, selling_price_usd:0, selling_price_brl:0, active:'TRUE'}, PRODUCTS_HEADERS);

  // ── CONFIG defaults ───────────────────────────────────────────────────────
  setConfigValue('DOLLAR_RATE', 5.18);
  setConfigValue('PROPOSAL_COUNTER', 0);
}

// ---------------------------------------------------------------------------
// CONFIG helpers (thin wrappers — assumes Domain.Config.gs exposes
// getConfigValue / setConfigValue backed by a CONFIG sheet)
// ---------------------------------------------------------------------------

function _getConfigValue(key) {
  var rows = sheetToObjects('CONFIG');
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].key === key) return rows[i].value;
  }
  return null;
}

// setConfigValue is defined in Core.Config.gs

// ---------------------------------------------------------------------------
// Api_getProducts — return all active products
// ---------------------------------------------------------------------------

function Api_getProducts() {
  try {
    requireAuth();
    var rows = sheetToObjects(PRODUCTS_SHEET);
    var data = rows.filter(function(r) { return String(r.active).toUpperCase() === 'TRUE'; });
    return {ok: true, data: data};
  } catch (e) {
    return {ok: false, error: e.message};
  }
}

// ---------------------------------------------------------------------------
// Api_getProductsByCategory
// ---------------------------------------------------------------------------

function Api_getProductsByCategory(cat) {
  try {
    requireAuth();
    if (!cat) return {ok: false, error: 'category is required'};
    var rows = sheetToObjects(PRODUCTS_SHEET);
    var data = rows.filter(function(r) {
      return String(r.active).toUpperCase() === 'TRUE' &&
             String(r.category).toUpperCase() === String(cat).toUpperCase();
    });
    return {ok: true, data: data};
  } catch (e) {
    return {ok: false, error: e.message};
  }
}

// ---------------------------------------------------------------------------
// Api_getProduct — fetch single product by code
// ---------------------------------------------------------------------------

function Api_getProduct(code) {
  try {
    requireAuth();
    if (!code) return {ok: false, error: 'code is required'};
    var rows = sheetToObjects(PRODUCTS_SHEET);
    var found = null;
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i].code).toUpperCase() === String(code).toUpperCase()) {
        found = rows[i];
        break;
      }
    }
    if (!found) return {ok: false, error: 'Product not found: ' + code};
    return {ok: true, data: found};
  } catch (e) {
    return {ok: false, error: e.message};
  }
}

// ---------------------------------------------------------------------------
// Api_searchProducts — search by code or description (case-insensitive)
// ---------------------------------------------------------------------------

function Api_searchProducts(q) {
  try {
    requireAuth();
    if (!q) return {ok: false, error: 'search query is required'};
    var needle = String(q).toUpperCase();
    var rows = sheetToObjects(PRODUCTS_SHEET);
    var data = rows.filter(function(r) {
      return String(r.active).toUpperCase() === 'TRUE' && (
        String(r.code).toUpperCase().indexOf(needle) !== -1 ||
        String(r.description).toUpperCase().indexOf(needle) !== -1
      );
    });
    return {ok: true, data: data};
  } catch (e) {
    return {ok: false, error: e.message};
  }
}

// ---------------------------------------------------------------------------
// Api_updateProductPrice — update price fields for a product
//
// Allowed fields: table_price_usd, purchase_price_usd, purchase_price_brl,
//                 selling_price_usd, selling_price_brl, dollar_rate
// ---------------------------------------------------------------------------

var PRICE_FIELDS = [
  'table_price_usd', 'purchase_price_usd', 'purchase_price_brl',
  'selling_price_usd', 'selling_price_brl', 'dollar_rate'
];

function Api_updateProductPrice(code, fields) {
  try {
    requireAuth();
    if (!code)   return {ok: false, error: 'code is required'};
    if (!fields) return {ok: false, error: 'fields are required'};

    var rows = sheetToObjects(PRODUCTS_SHEET);
    var target = null;
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i].code).toUpperCase() === String(code).toUpperCase()) {
        target = rows[i];
        break;
      }
    }
    if (!target) return {ok: false, error: 'Product not found: ' + code};

    var updates = {};
    PRICE_FIELDS.forEach(function(f) {
      if (fields[f] !== undefined) {
        updates[f] = safeNumber(fields[f]);
      }
    });

    if (Object.keys(updates).length === 0) {
      return {ok: false, error: 'No valid price fields provided'};
    }

    updateRowById(PRODUCTS_SHEET, target.id, updates);
    return {ok: true};
  } catch (e) {
    return {ok: false, error: e.message};
  }
}

// ---------------------------------------------------------------------------
// Api_getDollarRate — reads DOLLAR_RATE from CONFIG sheet
// ---------------------------------------------------------------------------

function Api_getDollarRate() {
  try {
    requireAuth();
    var raw = _getConfigValue('DOLLAR_RATE');
    var rate = safeNumber(raw);
    if (!rate) return {ok: false, error: 'DOLLAR_RATE not configured'};
    return {ok: true, rate: rate};
  } catch (e) {
    return {ok: false, error: e.message};
  }
}

// ---------------------------------------------------------------------------
// Api_setDollarRate — persists DOLLAR_RATE to CONFIG sheet
// ---------------------------------------------------------------------------

function Api_setDollarRate(rate) {
  try {
    requireAuth();
    var n = safeNumber(rate);
    if (!n || n <= 0) return {ok: false, error: 'rate must be a positive number'};
    setConfigValue('DOLLAR_RATE', n);
    return {ok: true};
  } catch (e) {
    return {ok: false, error: e.message};
  }
}
