/* ═══════════════════════════════════════════════════════════════
   ACTION CARDS — Repository
   Único ponto de leitura/escrita nas sheets.
   LockService obrigatório em TODA escrita (concorrência segura).
═══════════════════════════════════════════════════════════════ */

function _nextCardId() {
  return 'ACT-' + String(getAndIncrementCounter('ACTION_CARD_COUNTER')).padStart(5, '0');
}

function _nextHistoryId() {
  return 'ACH-' + String(getAndIncrementCounter('ACTION_CARD_HISTORY_COUNTER')).padStart(5, '0');
}

function acCreate(fields) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var id  = _nextCardId();
    var now = nowISO();
    appendRowToSheet(AC_SHEET, {
      id:           id,
      title:        fields.title,
      message:      fields.message      || '',
      quote_id:     fields.quote_id     || '',
      pos_venda_id: fields.pos_venda_id || '',
      urgent:       fields.urgent ? 'TRUE' : 'FALSE',
      status:       AC_STATUS.OPEN,
      assigned_to:  fields.assigned_to  || '',
      created_by:   fields.created_by,
      created_at:   now,
      updated_at:   now,
      last_member:  fields.created_by,
      last_note:    'Card criado'
    }, AC_HEADERS);
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
