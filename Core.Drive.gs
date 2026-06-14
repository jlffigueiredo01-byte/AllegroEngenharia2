// ============================================================
// Core.Drive.gs — Estrutura oficial do Drive do SGA
// Regras (ALLEGRO_DRIVE_E_AMBIENTE.md):
//   - Toda pasta lógica é referenciada por CHAVE → id na aba DRIVE_REGISTRY
//   - Nunca buscar pasta por nome em runtime; criação preguiçosa por chave
//   - Raiz definida pela Script Property ROOT_FOLDER_ID
// ============================================================

var DRIVE_REGISTRY_SHEET = 'DRIVE_REGISTRY';
var DRIVE_REGISTRY_COLS  = ['key', 'folder_id', 'path', 'created_at'];

/**
 * Taxonomia oficial. parent '' = raiz (ROOT_FOLDER_ID).
 * Chaves estáveis: o nome pode mudar no Drive sem quebrar nada.
 */
var DRIVE_TAXONOMY = {
  SISTEMA:            { parent: '',           name: '00-Sistema' },
  SISTEMA_BACKUPS:    { parent: 'SISTEMA',    name: 'Backups' },
  SISTEMA_FEEDBACK:   { parent: 'SISTEMA',    name: 'Feedback' },
  ENGENHARIA:         { parent: '',           name: '01-Engenharia' },
  COMERCIAL:          { parent: '',           name: '02-Comercial' },
  PROPOSTAS:          { parent: 'COMERCIAL',  name: 'Propostas' },
  PROJETOS:           { parent: '',           name: '03-Projetos' },
  COMPRAS:            { parent: '',           name: '04-Compras' },
  FINANCEIRO:         { parent: '',           name: '05-Financeiro' },
  FIN_NOTAS:          { parent: 'FINANCEIRO', name: 'NotasFiscais' },
  FIN_COMPROVANTES:   { parent: 'FINANCEIRO', name: 'Comprovantes' },
  POSVENDA:           { parent: '',           name: '06-PosVenda' },
  POSVENDA_TICKETS:   { parent: 'POSVENDA',   name: 'Tickets' },
  EMPRESA:            { parent: '',           name: '07-Empresa' },
  EMPRESA_CONTRATOS:  { parent: 'EMPRESA',    name: 'Contratos' },
  EMPRESA_HSE:        { parent: 'EMPRESA',    name: 'HSE' }
};

function initDriveRegistrySheet() {
  getOrCreateSheet(DRIVE_REGISTRY_SHEET, DRIVE_REGISTRY_COLS);
}

/** @return {string} id da pasta raiz, ou '' se não configurada. */
function drvGetRootId() {
  return PropertiesService.getScriptProperties().getProperty('ROOT_FOLDER_ID') || '';
}

function _drvRegistryGet(key) {
  var rows = sheetToObjects(DRIVE_REGISTRY_SHEET);
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].key === key && rows[i].folder_id) return rows[i].folder_id;
  }
  return '';
}

function _drvRegistrySet(key, folderId, path) {
  appendRowToSheet(DRIVE_REGISTRY_SHEET, {
    key: key, folder_id: folderId, path: path || '', created_at: nowISO()
  }, DRIVE_REGISTRY_COLS);
}

/**
 * Resolve (e cria se necessário) a pasta de uma chave da taxonomia.
 * Sem ROOT_FOLDER_ID configurado, retorna null (chamador decide fallback).
 * @param {string} key
 * @return {Folder|null}
 */
function drvGetFolder(key) {
  initDriveRegistrySheet();
  var rootId = drvGetRootId();
  if (!rootId) return null;

  var cached = _drvRegistryGet(key);
  if (cached) {
    try { return DriveApp.getFolderById(cached); } catch (e) { /* recria abaixo */ }
  }

  var def = DRIVE_TAXONOMY[key];
  if (!def) throw new Error('Chave de pasta desconhecida: ' + key);

  var parentFolder = def.parent ? drvGetFolder(def.parent) : DriveApp.getFolderById(rootId);
  if (!parentFolder) return null;

  // Reaproveita se a pasta já existir com esse nome dentro do pai (idempotência)
  var it = parentFolder.getFoldersByName(def.name);
  var folder = it.hasNext() ? it.next() : parentFolder.createFolder(def.name);

  var parentPath = def.parent && DRIVE_TAXONOMY[def.parent] ? DRIVE_TAXONOMY[def.parent].name + '/' : '';
  _drvRegistrySet(key, folder.getId(), parentPath + def.name);
  return folder;
}

/**
 * Subpasta de ano dentro de uma chave (ex.: PROPOSTAS/2026). Criação preguiçosa.
 * @param {string} key  chave da taxonomia
 * @param {number|string} [year]
 * @return {Folder|null}
 */
function drvGetYearFolder(key, year) {
  var base = drvGetFolder(key);
  if (!base) return null;
  var y = String(year || new Date().getFullYear());
  var regKey = key + '_' + y;
  var cached = _drvRegistryGet(regKey);
  if (cached) {
    try { return DriveApp.getFolderById(cached); } catch (e) { /* recria */ }
  }
  var it = base.getFoldersByName(y);
  var folder = it.hasNext() ? it.next() : base.createFolder(y);
  _drvRegistrySet(regKey, folder.getId(), DRIVE_TAXONOMY[key].name + '/' + y);
  return folder;
}

/**
 * Bootstrap: cria toda a taxonomia fixa a partir do ROOT_FOLDER_ID.
 * Idempotente — pode rodar quantas vezes quiser.
 * Executar no editor GAS após configurar a Script Property ROOT_FOLDER_ID.
 * @return {{ok:boolean, created:string[], error?:string}}
 */
function setupDriveStructure() {
  try {
    if (!drvGetRootId()) {
      throw new Error('Configure a Script Property ROOT_FOLDER_ID com o id da pasta raiz do SGA.');
    }
    var created = [];
    for (var key in DRIVE_TAXONOMY) {
      var f = drvGetFolder(key);
      if (f) created.push(key + ' → ' + f.getId());
    }
    appendAuditLog('DRIVE_SETUP', 'DRIVE_REGISTRY', 'ROOT', created.length + ' pastas garantidas');
    return { ok: true, created: created };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
