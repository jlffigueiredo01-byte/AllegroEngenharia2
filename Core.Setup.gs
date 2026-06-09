const USERS_HEADERS         = ['id', 'name', 'email', 'role', 'active', 'created_at'];
const TIMELINE_HEADERS      = ['id', 'timestamp', 'entity', 'entity_id', 'event_type', 'description', 'user_id', 'user_name'];
const CONFIG_HEADERS        = ['key', 'value', 'description'];

const CONFIG_DEFAULTS = [
  ['APP_NAME',              'Allegro Business System', 'Nome do sistema'],
  ['APP_VERSION',           '1.0.0',                  'Versão'],
  ['QUOTE_COUNTER',         '0',                      'Sequencial de propostas'],
  ['COMPANY_COUNTER',       '0',                      'Sequencial de empresas'],
  ['CONTACT_COUNTER',       '0',                      'Sequencial de contatos'],
  ['OPPORTUNITY_COUNTER',   '0',                      'Sequencial de oportunidades'],
  ['EXPENSE_COUNTER',             '0', 'Sequencial de despesas'],
  ['ACTION_CARD_COUNTER',         '0', 'Sequencial de action cards'],
  ['ACTION_CARD_HISTORY_COUNTER', '0', 'Sequencial de histórico de cards'],
  ['DOLLAR_RATE',      '5.18', 'Cotação do dólar americano'],
  ['PROPOSAL_COUNTER', '0',    'Sequencial de propostas'],
];

function initCoreSheets() {
  getOrCreateSheet('CONFIG',   CONFIG_HEADERS);
  getOrCreateSheet('USERS',    USERS_HEADERS);
  getOrCreateSheet('AUDIT_LOG', AUDIT_HEADERS);
  getOrCreateSheet('TIMELINE', TIMELINE_HEADERS);
  initImportSheets();
  initExpensesSheet();
  initActionCardSheets();
  initProductsSheet();
  initProposalsSheet();
  initSetupCalcSheet();

  CONFIG_DEFAULTS.forEach(([key, value, desc]) => {
    if (getConfigValue(key) === null) {
      const sheet = ss().getSheetByName('CONFIG');
      sheet.appendRow([key, value, desc]);
    }
  });
}

function appendTimelineEvent(entity, entityId, eventType, description) {
  const user = getCurrentUser();
  appendRowToSheet('TIMELINE', {
    id: generateId('TML'),
    timestamp: nowISO(),
    entity: entity,
    entity_id: String(entityId),
    event_type: eventType,
    description: description,
    user_id: user ? user.id : 'SYSTEM',
    user_name: user ? user.name : 'Sistema'
  }, TIMELINE_HEADERS);
}
