var SETUP_CALC_SHEET = 'SETUP_CALC';
var SETUP_CALC_HEADERS = ['key', 'description', 'value', 'unit', 'category'];

function initSetupCalcSheet() {
  var spreadsheet = ss();
  var sheet = spreadsheet.getSheetByName(SETUP_CALC_SHEET);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(SETUP_CALC_SHEET);
  }

  // Only seed if sheet is empty (just header or completely empty)
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) return;

  // Write header row
  if (lastRow === 0) {
    sheet.appendRow(SETUP_CALC_HEADERS);
  }

  // CAMBIO
  sheet.appendRow(['DOLAR_COMPRA', 'Cotação dólar compra (BRL/USD)', 3.87, 'R$/USD', 'CAMBIO']);
  // DOLAR_VENDA: append row with null value, then set GOOGLEFINANCE formula
  sheet.appendRow(['DOLAR_VENDA', 'Cotação dólar venda (BRL/USD)', null, 'R$/USD', 'CAMBIO']);
  var dolarVendaRow = sheet.getLastRow();
  sheet.getRange(dolarVendaRow, 3).setFormula('=GOOGLEFINANCE("CURRENCY:USDBRL")');

  // MARKUP
  sheet.appendRow(['DESCONTO_COMPRA_PCT',  'Desconto de compra Hydronix (35%)',  0.35,  '%',      'MARKUP']);
  sheet.appendRow(['MULTIPLICADOR_VENDA',  'Multiplicador sobre preço de compra', 3.87, 'x',      'MARKUP']);

  // MAO_DE_OBRA
  sheet.appendRow(['HH_ENGENHARIA',        'Hora homem - Engenharia',            180,   'R$/h',   'MAO_DE_OBRA']);
  sheet.appendRow(['HH_TECNICO',           'Hora homem - Técnico',               120,   'R$/h',   'MAO_DE_OBRA']);
  sheet.appendRow(['HH_SUPORTE_REMOTO',    'Hora homem - Suporte Remoto',         80,   'R$/h',   'MAO_DE_OBRA']);

  // STARTUP
  sheet.appendRow(['STARTUP_DIARIAS',      'Nº de dias padrão para Start-Up',      5,   'dias',   'STARTUP']);
  sheet.appendRow(['STARTUP_DIARIA_VALOR', 'Valor da diária de Start-Up',        4930,  'R$/dia', 'STARTUP']);

  // VIAGENS
  sheet.appendRow(['DIARIA_ALIMENTACAO',   'Diária de alimentação',              100,   'R$/dia', 'VIAGENS']);
  sheet.appendRow(['DIARIA_HOSPEDAGEM',    'Diária de hospedagem',               200,   'R$/dia', 'VIAGENS']);
  sheet.appendRow(['KM_REEMBOLSO',         'Reembolso de quilometragem',         1.20,  'R$/km',  'VIAGENS']);
  sheet.appendRow(['PASSAGEM_AEREA_MEDIA', 'Passagem aérea média (ida e volta)', 800,   'R$',     'VIAGENS']);

  // IMPOSTOS
  sheet.appendRow(['ALIQUOTA_ISS',         'ISS sobre serviços',                0.050,  '%',      'IMPOSTOS']);
  sheet.appendRow(['ALIQUOTA_PIS_COFINS',  'PIS/COFINS sobre serviços',         0.0365, '%',      'IMPOSTOS']);
  sheet.appendRow(['ALIQUOTA_ICMS',        'ICMS padrão (equipamentos)',         0.120,  '%',      'IMPOSTOS']);

  // FB-20 — CALCULADORA DE INFRA (linear 1ª grau, 2 variáveis: tamanho_infra em metros e dist_curitiba em km)
  sheet.appendRow(['KIT_INFRA_COEF_M',     'Kit Infra: R$ por metro de infra',     120,    'R$/m',  'CALC_INFRA']);
  sheet.appendRow(['KIT_INFRA_COEF_KM',    'Kit Infra: R$ por km de Curitiba',      12,    'R$/km', 'CALC_INFRA']);
  sheet.appendRow(['KIT_INFRA_CONST',      'Kit Infra: valor fixo base',         11000,    'R$',    'CALC_INFRA']);
  sheet.appendRow(['MO_INFRA_COEF_M',      'MO Infra: R$ por metro de infra',      400,    'R$/m',  'CALC_INFRA']);
  sheet.appendRow(['MO_INFRA_COEF_KM',     'MO Infra: R$ por km de Curitiba',       15,    'R$/km', 'CALC_INFRA']);
  sheet.appendRow(['MO_INFRA_CONST',       'MO Infra: valor fixo base',          17000,    'R$',    'CALC_INFRA']);
  sheet.appendRow(['MO_STARTUP_COEF_M',    'MO Startup: R$ por metro de infra',     90,    'R$/m',  'CALC_INFRA']);
  sheet.appendRow(['MO_STARTUP_COEF_KM',   'MO Startup: R$ por km de Curitiba',     14,    'R$/km', 'CALC_INFRA']);
  sheet.appendRow(['MO_STARTUP_CONST',     'MO Startup: valor fixo base',         3000,    'R$',    'CALC_INFRA']);

  // Format header row
  var headerRange = sheet.getRange(1, 1, 1, SETUP_CALC_HEADERS.length);
  headerRange.setBackground('#1a56db');
  headerRange.setFontColor('#ffffff');
  headerRange.setFontWeight('bold');

  // Freeze header row
  sheet.setFrozenRows(1);

  // Set column widths: A=180, B=320, C=120, D=80, E=120
  sheet.setColumnWidth(1, 180);
  sheet.setColumnWidth(2, 320);
  sheet.setColumnWidth(3, 120);
  sheet.setColumnWidth(4, 80);
  sheet.setColumnWidth(5, 120);
}

function getSetupCalcValue(key) {
  var rows = sheetToObjects(SETUP_CALC_SHEET);
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].key === key) {
      var v = rows[i].value;
      return (v !== '' && v !== null && v !== undefined) ? Number(v) : 0;
    }
  }
  return 0;
}

function Api_getSetupCalc() {
  try {
    requireRole(['DIRETOR_TECNICO', 'FINANCEIRO_ADMIN']);
    var rows = sheetToObjects(SETUP_CALC_SHEET);
    var data = {};
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].key) {
        data[rows[i].key] = {
          value: rows[i].value,
          description: rows[i].description,
          unit: rows[i].unit,
          category: rows[i].category
        };
      }
    }
    return { ok: true, data: data };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function Api_setSetupCalcValue(key, value) {
  try {
    requireRole(['DIRETOR_TECNICO', 'FINANCEIRO_ADMIN']);
    if (!key) throw new Error('key is required');
    // Protect DOLAR_VENDA formula
    if (key === 'DOLAR_VENDA') throw new Error('DOLAR_VENDA usa fórmula automática. Edite diretamente na planilha.');
    var sheet = ss().getSheetByName(SETUP_CALC_SHEET);
    if (!sheet) throw new Error('Aba SETUP_CALC não encontrada.');
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (data[i][0] === key) {
        sheet.getRange(i + 1, 3).setValue(value);
        appendAuditLog('UPDATE', 'SETUP_CALC', key, { value: value });
        return { ok: true };
      }
    }
    throw new Error('Chave não encontrada: ' + key);
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function setupSvcGetDollarRate() {
  return safeNumber(getSetupCalcValue('DOLAR_VENDA'));
}

function Api_getDollarRate() {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN', 'TECNICO']);
    var rate = setupSvcGetDollarRate();
    return { ok: true, rate: rate };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// FB-20 — Calculadora de Custos de Infraestrutura
// Modelo linear 1º grau, 2 variáveis (tamanho_infra em metros e dist_curitiba em km).
// Computa 3 custos a partir de 9 coeficientes editáveis na aba SETUP_CALC (categoria CALC_INFRA).
function calcSvcInfra(input) {
  input = input || {};
  var m  = Number(input.tamanho_infra || 0);
  var km = Number(input.dist_curitiba || 0);
  var k = function(key) { return Number(getSetupCalcValue(key)) || 0; };
  var kit       = k('KIT_INFRA_COEF_M')    * m + k('KIT_INFRA_COEF_KM')    * km + k('KIT_INFRA_CONST');
  var moInfra   = k('MO_INFRA_COEF_M')     * m + k('MO_INFRA_COEF_KM')     * km + k('MO_INFRA_CONST');
  var moStartup = k('MO_STARTUP_COEF_M')   * m + k('MO_STARTUP_COEF_KM')   * km + k('MO_STARTUP_CONST');
  return {
    kit_infra:  Math.max(0, Math.round(kit       * 100) / 100),
    mo_infra:   Math.max(0, Math.round(moInfra   * 100) / 100),
    mo_startup: Math.max(0, Math.round(moStartup * 100) / 100),
    input: { tamanho_infra: m, dist_curitiba: km }
  };
}

function Api_calcInfra(input) {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN', 'TECNICO']);
    return { ok: true, data: calcSvcInfra(input) };
  } catch (e) { return { ok: false, error: e.message }; }
}

/**
 * Backfill idempotente das 9 chaves CALC_INFRA. Como initSetupCalcSheet() so roda
 * quando a aba esta vazia (early return em lastRow > 1) e a planilha do Joao JA
 * tem dados, sem este backfill as 9 chaves novas nunca seriam inseridas. Chamado
 * por Core.Setup.initCoreSheets. Idempotente — so insere o que falta.
 */
function setupCalcBackfillInfraParams() {
  var sheet = ss().getSheetByName(SETUP_CALC_SHEET);
  if (!sheet) return { ok: false, error: 'SETUP_CALC nao existe' };
  var rows = sheetToObjects(SETUP_CALC_SHEET);
  var existentes = {};
  for (var i = 0; i < rows.length; i++) existentes[rows[i].key] = true;
  var faltantes = [
    ['KIT_INFRA_COEF_M',    'Kit Infra: R$ por metro de infra',     120,   'R$/m',  'CALC_INFRA'],
    ['KIT_INFRA_COEF_KM',   'Kit Infra: R$ por km de Curitiba',      12,   'R$/km', 'CALC_INFRA'],
    ['KIT_INFRA_CONST',     'Kit Infra: valor fixo base',         11000,   'R$',    'CALC_INFRA'],
    ['MO_INFRA_COEF_M',     'MO Infra: R$ por metro de infra',      400,   'R$/m',  'CALC_INFRA'],
    ['MO_INFRA_COEF_KM',    'MO Infra: R$ por km de Curitiba',       15,   'R$/km', 'CALC_INFRA'],
    ['MO_INFRA_CONST',      'MO Infra: valor fixo base',          17000,   'R$',    'CALC_INFRA'],
    ['MO_STARTUP_COEF_M',   'MO Startup: R$ por metro de infra',     90,   'R$/m',  'CALC_INFRA'],
    ['MO_STARTUP_COEF_KM',  'MO Startup: R$ por km de Curitiba',     14,   'R$/km', 'CALC_INFRA'],
    ['MO_STARTUP_CONST',    'MO Startup: valor fixo base',         3000,   'R$',    'CALC_INFRA']
  ];
  var inseridos = 0;
  for (var j = 0; j < faltantes.length; j++) {
    if (!existentes[faltantes[j][0]]) { sheet.appendRow(faltantes[j]); inseridos++; }
  }
  Logger.log('[SetupCalc] backfill CALC_INFRA: ' + inseridos + ' linhas inseridas.');
  return { ok: true, data: { inseridos: inseridos } };
}
