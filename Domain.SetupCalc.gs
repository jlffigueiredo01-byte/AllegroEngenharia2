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
    requireAuth();
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
    requireAuth();
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

function Api_getDollarRate() {
  try {
    requireAuth();
    var rate = getSetupCalcValue('DOLAR_VENDA');
    return { ok: true, rate: rate };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
