/* ═══════════════════════════════════════════════════════════════
   ACTION CARDS — Repository
   Único ponto de leitura/escrita nas sheets.
   LockService obrigatório em TODA escrita (concorrência segura).
═══════════════════════════════════════════════════════════════ */

function _nextCardId() {
  return generateUniqueSequentialId(AC_SHEET, 'ACTION_CARD_COUNTER', function (n) { return 'ACT-' + String(n).padStart(5, '0'); });
}

function _nextHistoryId() {
  return 'ACH-' + String(getAndIncrementCounter('ACTION_CARD_HISTORY_COUNTER')).padStart(5, '0');
}

function acCreate(fields) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var id  = (fields.id && String(fields.id).trim()) ? String(fields.id).trim() : _nextCardId();
    var now = nowISO();

    // Defaults para campos base
    var row = {
      id:           id,
      title:        fields.title        || '',
      message:      fields.message      || '',
      quote_id:     fields.quote_id     || '',
      pos_venda_id: fields.pos_venda_id || '',
      urgent:       (fields.urgent === true || fields.urgent === 'TRUE') ? 'TRUE' : 'FALSE',
      status:       fields.status       || AC_STATUS.ABERTO,
      assigned_to:  fields.assigned_to  || '',
      created_by:   fields.created_by   || '',
      created_at:   now,
      updated_at:   now,
      last_member:  fields.created_by   || '',
      last_note:    'Card criado'
    };

    // Merge de campos extras cujos nomes existam no cabeçalho REAL da aba
    var sheet = ss().getSheetByName(AC_SHEET);
    var realHeaders = sheet && sheet.getLastColumn() > 0
      ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
      : AC_HEADERS;

    var fieldKeys = Object.keys(fields);
    for (var i = 0; i < fieldKeys.length; i++) {
      var k = fieldKeys[i];
      if (realHeaders.indexOf(k) !== -1 && !(k in row)) {
        row[k] = fields[k];
      } else if (realHeaders.indexOf(k) === -1 && !(k in row)) {
        Logger.log('[acCreate] Campo ignorado (não existe na sheet): ' + k);
      }
    }

    appendRowToSheet(AC_SHEET, row, realHeaders);
    return id;
  } finally {
    lock.releaseLock();
  }
}

function acUpdateStatus(cardId, newStatus, member, note) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var card = acGetById(cardId);
    if (!card) throw new Error('Card não encontrado: ' + cardId);
    var now        = nowISO();
    var fromStatus = card.status;
    updateRowById(AC_SHEET, cardId, {
      status:      newStatus,
      updated_at:  now,
      last_member: member,
      last_note:   note
    });
    appendRowToSheet(ACH_SHEET, {
      id:          _nextHistoryId(),
      card_id:     cardId,
      timestamp:   now,
      from_status: fromStatus,
      to_status:   newStatus,
      member:      member,
      note:        note
    }, ACH_HEADERS);
    return { cardId: cardId, fromStatus: fromStatus, toStatus: newStatus };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Fecha um card gravando closed_by, closed_at e close_reason além do status.
 * Usado pelo Workflow para autocomplete (§2.3 HOTFIX-01).
 */
function acCloseCard(cardId, closedBy, closeReason, member, note) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var card = acGetById(cardId);
    if (!card) throw new Error('Card não encontrado: ' + cardId);
    var now        = nowISO();
    var fromStatus = card.status;
    updateRowById(AC_SHEET, cardId, {
      status:       AC_STATUS.CONCLUIDO,
      updated_at:   now,
      last_member:  member,
      last_note:    note || 'Card fechado',
      closed_by:    closedBy,
      closed_at:    now,
      close_reason: closeReason || ''
    });
    appendRowToSheet(ACH_SHEET, {
      id:          _nextHistoryId(),
      card_id:     cardId,
      timestamp:   now,
      from_status: fromStatus,
      to_status:   AC_STATUS.CONCLUIDO,
      member:      member,
      note:        note || 'Card fechado'
    }, ACH_HEADERS);
    return { cardId: cardId, fromStatus: fromStatus, toStatus: AC_STATUS.CONCLUIDO };
  } finally {
    lock.releaseLock();
  }
}

function acUpdateCard(cardId, updates, member, note) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var now = nowISO();
    updates.updated_at  = now;
    updates.last_member = member;
    updates.last_note   = note || 'Campos editados';
    updateRowById(AC_SHEET, cardId, updates);
    appendRowToSheet(ACH_SHEET, {
      id:          _nextHistoryId(),
      card_id:     cardId,
      timestamp:   now,
      from_status: '',
      to_status:   '',
      member:      member,
      note:        'Edição: ' + (note || 'campos atualizados')
    }, ACH_HEADERS);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Update sem entrada no histórico (FB-00038: comentários/anexos já registram
 * a própria entrada; evita duplicar).
 */
function acUpdateCardSilent(cardId, updates) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    updateRowById(AC_SHEET, cardId, updates);
  } finally {
    lock.releaseLock();
  }
}

/** Entrada avulsa no histórico (comentário/anexo — FB-00038). */
function acAppendHistory(cardId, fromStatus, toStatus, member, note) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    appendRowToSheet(ACH_SHEET, {
      id:          _nextHistoryId(),
      card_id:     cardId,
      timestamp:   nowISO(),
      from_status: fromStatus || '',
      to_status:   toStatus || '',
      member:      member,
      note:        note
    }, ACH_HEADERS);
  } finally {
    lock.releaseLock();
  }
}

function acGetAll() {
  return sheetToObjects(AC_SHEET);
}

function acGetById(cardId) {
  return findRowByValue(AC_SHEET, 'id', cardId);
}

function acGetHistory(cardId) {
  var rows = findRowsByValue(ACH_SHEET, 'card_id', cardId);
  return rows.sort(function(a, b) {
    return String(b.timestamp).localeCompare(String(a.timestamp));
  });
}
