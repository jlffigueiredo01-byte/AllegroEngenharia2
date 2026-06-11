// =============================================================================
// Domain.Engenharia.Repository.gs
// Allegro Business System — Fase F20 (EDM)
// Acesso a dados das abas ENG_DOCS e ENG_DOC_REVISIONS.
// LockService em todas as operações de escrita.
// =============================================================================

// ---------------------------------------------------------------------------
// Documentos
// ---------------------------------------------------------------------------

/**
 * Retorna todos os documentos de engenharia cadastrados.
 * @returns {Object[]} Array de objetos com os campos de ENG_DOCS_HEADERS.
 */
function engRepoGetAllDocs() {
  return sheetToObjects(ENG_DOCS_SHEET);
}

/**
 * Busca um documento pelo número de documento.
 * @param {string} docNumber - Número do documento (ex: ALG-DE-ELE-0001).
 * @returns {Object|null} Objeto do documento ou null se não encontrado.
 */
function engRepoGetDoc(docNumber) {
  return engRepoGetAllDocs().find(function(r) {
    return String(r.doc_number).trim() === String(docNumber).trim();
  }) || null;
}

/**
 * Cria um novo documento no cofre de engenharia.
 * Utiliza LockService para evitar condições de corrida em escritas simultâneas.
 * @param {Object} doc - Objeto com todos os campos de ENG_DOCS_HEADERS.
 */
function engRepoCreateDoc(doc) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    appendRowToSheet(ENG_DOCS_SHEET, doc, ENG_DOCS_HEADERS);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Atualiza campos de um documento pelo número de documento.
 * Utiliza LockService para evitar condições de corrida em escritas simultâneas.
 * @param {string} docNumber - Número do documento a atualizar.
 * @param {Object} updates   - Campos a atualizar (chave: nome da coluna).
 * @returns {boolean} true se a linha foi encontrada e atualizada.
 */
function engRepoUpdateDoc(docNumber, updates) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sheet = ss().getSheetByName(ENG_DOCS_SHEET);
    if (!sheet) return false;
    var data = sheet.getDataRange().getValues();
    var headers = data[0];
    var docNumCol = headers.indexOf('doc_number');
    if (docNumCol === -1) return false;
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][docNumCol]).trim() === String(docNumber).trim()) {
        var keys = Object.keys(updates);
        for (var k = 0; k < keys.length; k++) {
          var col = headers.indexOf(keys[k]);
          if (col !== -1) sheet.getRange(i + 1, col + 1).setValue(updates[keys[k]]);
        }
        return true;
      }
    }
    return false;
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// Revisões
// ---------------------------------------------------------------------------

/**
 * Retorna todas as revisões de um documento, ordenadas por número de revisão.
 * @param {string} docNumber - Número do documento.
 * @returns {Object[]} Array de objetos de revisão (pode ser vazio).
 */
function engRepoGetRevisions(docNumber) {
  return sheetToObjects(ENG_DOC_REVISIONS_SHEET).filter(function(r) {
    return String(r.doc_number).trim() === String(docNumber).trim();
  });
}

/**
 * Busca uma revisão específica de um documento.
 * @param {string} docNumber - Número do documento (ex: ALG-DE-ELE-0001).
 * @param {string} revision  - Código da revisão (ex: R00, R01).
 * @returns {Object|null} Objeto da revisão ou null se não encontrado.
 */
function engRepoGetRevision(docNumber, revision) {
  return engRepoGetRevisions(docNumber).find(function(r) {
    return String(r.revision).trim() === String(revision).trim();
  }) || null;
}

/**
 * Cria uma nova revisão de documento no cofre.
 * Utiliza LockService para evitar condições de corrida em escritas simultâneas.
 * @param {Object} rev - Objeto com todos os campos de ENG_DOC_REVISIONS_HEADERS.
 */
function engRepoCreateRevision(rev) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    appendRowToSheet(ENG_DOC_REVISIONS_SHEET, rev, ENG_DOC_REVISIONS_HEADERS);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Atualiza campos de uma revisão pelo ID da revisão.
 * Utiliza LockService para evitar condições de corrida em escritas simultâneas.
 * @param {string} id      - ID da revisão (campo 'id').
 * @param {Object} updates - Campos a atualizar (chave: nome da coluna).
 * @returns {boolean} true se a linha foi encontrada e atualizada.
 */
function engRepoUpdateRevision(id, updates) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return updateRowById(ENG_DOC_REVISIONS_SHEET, id, updates);
  } finally {
    lock.releaseLock();
  }
}
