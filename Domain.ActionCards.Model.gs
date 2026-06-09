/* ═══════════════════════════════════════════════════════════════
   ACTION CARDS — Model (constantes e schema)
═══════════════════════════════════════════════════════════════ */

var AC_SHEET  = 'ACTION_CARDS';
var ACH_SHEET = 'ACTION_CARD_HISTORY';

var AC_HEADERS = [
  'id', 'title', 'message', 'quote_id', 'pos_venda_id',
  'urgent', 'status', 'assigned_to',
  'created_by', 'created_at', 'updated_at', 'last_member', 'last_note'
];

var ACH_HEADERS = [
  'id', 'card_id', 'timestamp', 'from_status', 'to_status', 'member', 'note'
];

var AC_STATUS = {
  OPEN:        'OPEN',
  IN_PROGRESS: 'IN_PROGRESS',
  FINISHED:    'FINISHED',
  CANCELLED:   'CANCELLED'
};

var AC_TRANSITIONS = {
  'OPEN':        ['IN_PROGRESS', 'CANCELLED'],
  'IN_PROGRESS': ['OPEN', 'FINISHED', 'CANCELLED'],
  'FINISHED':    [],
  'CANCELLED':   []
};

function initActionCardSheets() {
  getOrCreateSheet(AC_SHEET,  AC_HEADERS);
  getOrCreateSheet(ACH_SHEET, ACH_HEADERS);
}
