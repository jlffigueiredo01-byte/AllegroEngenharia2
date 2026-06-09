const CONFIG_SHEET = 'CONFIG';

function configMap() {
  const sheet = ss().getSheetByName(CONFIG_SHEET);
  if (!sheet) return {};
  const rows = sheet.getDataRange().getValues();
  const map = {};
  rows.slice(1).forEach(([key, value]) => {
    if (key) map[String(key).trim()] = value;
  });
  return map;
}

function getConfigValue(key) {
  return configMap()[key] ?? null;
}

function setConfigValue(key, value) {
  const sheet = ss().getSheetByName(CONFIG_SHEET);
  if (!sheet) throw new Error('Aba CONFIG não encontrada.');
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === key) {
      sheet.getRange(i + 1, 2).setValue(value);
      return;
    }
  }
  sheet.appendRow([key, value, '']);
}

function getAndIncrementCounter(key) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const current = Number(getConfigValue(key)) || 0;
    const next = current + 1;
    setConfigValue(key, next);
    return next;
  } finally {
    lock.releaseLock();
  }
}
