/* ═══════════════════════════════════════════════════════════════
   ACTION CARDS — Model (constantes e schema)
═══════════════════════════════════════════════════════════════ */

var AC_SHEET  = 'ACTION_CARDS';
var ACH_SHEET = 'ACTION_CARD_HISTORY';

var AC_HEADERS = [
  'id', 'title', 'message', 'quote_id', 'pos_venda_id',
  'urgent', 'status', 'assigned_to',
  'created_by', 'created_at', 'updated_at', 'last_member', 'last_note',
  // FB-00038: acompanhamento de atividade no card
  'anexos_json',        // [{url, name, por, em}]
  'participants_json',  // [userId, ...]
  'drive_folder_id'     // pasta do card no Drive (criação preguiçosa)
];

var ACH_HEADERS = [
  'id', 'card_id', 'timestamp', 'from_status', 'to_status', 'member', 'note'
];

var AC_STATUS = {
  ABERTO:       'ABERTO',
  EM_ANDAMENTO: 'EM_ANDAMENTO',
  CONCLUIDO:    'CONCLUIDO',
  CANCELADO:    'CANCELADO',
  SLA_ESTOURADO:'SLA_ESTOURADO'
};

var AC_TRANSITIONS = {
  'ABERTO':        ['EM_ANDAMENTO', 'CANCELADO'],
  'EM_ANDAMENTO':  ['ABERTO', 'CONCLUIDO', 'CANCELADO'],
  'CONCLUIDO':     [],
  'CANCELADO':     [],
  'SLA_ESTOURADO': ['EM_ANDAMENTO', 'CANCELADO']
};

function initActionCardSheets() {
  var sh = getOrCreateSheet(AC_SHEET,  AC_HEADERS);
  getOrCreateSheet(ACH_SHEET, ACH_HEADERS);
  // FB-00038: migração idempotente para abas criadas antes das colunas novas
  try { ensureColumns(sh, ['anexos_json', 'participants_json', 'drive_folder_id']); } catch (e) {}
}
