const AUDIT_SHEET = 'AUDIT_LOG';
const AUDIT_HEADERS = ['id', 'timestamp', 'user_id', 'user_name', 'action', 'entity', 'entity_id', 'details'];

function appendAuditLog(action, entity, entityId, details) {
  const user = getCurrentUser();
  const sheet = getOrCreateSheet(AUDIT_SHEET, AUDIT_HEADERS);
  sheet.appendRow([
    generateId('AUD'),
    nowISO(),
    user ? user.id : 'SYSTEM',
    user ? user.name : 'Sistema',
    action,
    entity,
    String(entityId ?? ''),
    String(details ?? '')
  ]);
}
