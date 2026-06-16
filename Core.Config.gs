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

/**
 * Gera um ID sequencial garantidamente único numa aba. O contador já tem lock,
 * mas o cache do CONFIG pode defasar; esta guarda confere se o ID já existe na
 * aba e avança o contador até achar um livre. (mesmo padrão dos tickets,
 * generalizado). Ex.: generateUniqueSequentialId('PROPOSALS','PROPOSAL_COUNTER',
 *   function(n){ return '2026' + String(n).padStart(4,'0'); }, 'number')
 *
 * @param {string} sheetName  aba onde o ID será gravado
 * @param {string} counterKey chave do contador no CONFIG
 * @param {function} fmt       recebe o número e devolve o ID formatado
 * @param {string} [idCol]     coluna que guarda o ID (padrão 'id')
 */
function generateUniqueSequentialId(sheetName, counterKey, fmt, idCol) {
  idCol = idCol || 'id';
  var existentes = {};
  try {
    var rows = sheetToObjects(sheetName);
    for (var i = 0; i < rows.length; i++) existentes[String(rows[i][idCol])] = true;
  } catch (e) { /* aba ainda não existe: nenhum ID em uso */ }
  var id = fmt(getAndIncrementCounter(counterKey));
  var guarda = 0;
  while (existentes[String(id)] && guarda < 1000) {
    id = fmt(getAndIncrementCounter(counterKey));
    guarda++;
  }
  return id;
}
