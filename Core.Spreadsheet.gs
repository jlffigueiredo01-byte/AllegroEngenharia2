let _ss = null;

function ss() {
  if (!_ss) {
    _ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!_ss) {
      const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
      if (!id) throw new Error('SPREADSHEET_ID não configurado nas Script Properties.');
      _ss = SpreadsheetApp.openById(id);
    }
  }
  return _ss;
}

function sheetToObjects(sheetName) {
  const sheet = ss().getSheetByName(sheetName);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0];
  return data.slice(1)
    .filter(row => row.some(cell => cell !== ''))
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = row[i] ?? ''; });
      return obj;
    });
}

function ensureColumns(sheet, cols) {
  const lastCol = sheet.getLastColumn();
  const existing = lastCol > 0
    ? sheet.getRange(1, 1, 1, lastCol).getValues()[0]
    : [];
  const missing = cols.filter(c => !existing.includes(c));
  if (!missing.length) return;
  // T15 (revisão geral): usar getLastColumn()+1 — contar só headers não
  // vazios sobrescrevia colunas quando havia célula vazia no cabeçalho.
  const startCol = sheet.getLastColumn() + 1;
  missing.forEach((col, i) => sheet.getRange(1, startCol + i).setValue(col));
}

function getOrCreateSheet(name, headers) {
  let sheet = ss().getSheetByName(name);
  if (!sheet) {
    sheet = ss().insertSheet(name);
    if (headers && headers.length) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length)
        .setFontWeight('bold')
        .setBackground('#E8F0FE');
      sheet.setFrozenRows(1);
    }
  }
  return sheet;
}

function findRowByValue(sheetName, colName, value) {
  const rows = sheetToObjects(sheetName);
  return rows.find(r => String(r[colName]).trim() === String(value).trim()) ?? null;
}

function findRowsByValue(sheetName, colName, value) {
  const rows = sheetToObjects(sheetName);
  return rows.filter(r => String(r[colName]).trim() === String(value).trim());
}

function appendRowToSheet(sheetName, rowObj, headers) {
  const sheet = getOrCreateSheet(sheetName, headers);
  const colHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const row = colHeaders.map(h => rowObj[h] ?? '');
  sheet.appendRow(row);
}

function updateRowById(sheetName, id, updates) {
  const sheet = ss().getSheetByName(sheetName);
  if (!sheet) return false;
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const idCol = headers.indexOf('id');
  if (idCol === -1) return false;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) === String(id)) {
      Object.entries(updates).forEach(([key, val]) => {
        const col = headers.indexOf(key);
        if (col !== -1) sheet.getRange(i + 1, col + 1).setValue(val);
      });
      return true;
    }
  }
  return false;
}

/**
 * Versão protegida por lock de updateRowById. Use SOMENTE em escritas que NÃO
 * estão dentro de um bloco que já segurou LockService.getScriptLock() — senão
 * dá deadlock (o LockService do GAS não é reentrante). As funções nos
 * Repository.gs que já pegam lock devem continuar chamando updateRowById cru.
 * Serializa edições concorrentes (evita "lost update" com vários usuários).
 */
function updateRowByIdSafe(sheetName, id, updates) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    return updateRowById(sheetName, id, updates);
  } finally {
    lock.releaseLock();
  }
}
