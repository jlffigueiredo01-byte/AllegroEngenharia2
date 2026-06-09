/* ═══════════════════════════════════════════════════════════════
   ACTION CARDS — Service (regras de negócio)
═══════════════════════════════════════════════════════════════ */

function _acSendUrgentEmail(card) {
  try {
    var recipient = PropertiesService.getScriptProperties().getProperty('ALERT_EMAIL') ||
                    getConfigValue('ALERT_EMAIL');
    if (!recipient) return;
    var subject = '[URGENTE] ' + card.id + ' — ' + card.title;
    var body =
      'Card urgente criado no Allegro Business System.\n\n' +
      'ID: '       + card.id         + '\n' +
      'Título: '   + card.title      + '\n' +
      (card.quote_id ? 'Proposta: ' + card.quote_id + '\n' : '') +
      'Criado por: ' + card.created_by + '\n\n' +
      'Mensagem:\n' + (card.message || '(sem mensagem)');
    GmailApp.sendEmail(recipient, subject, body);
  } catch (e) {
    Logger.log('_acSendUrgentEmail: ' + e.message);
  }
}

function svcCreateCard(data, user) {
  if (!data || !data.title || !data.title.trim()) throw new Error('Título é obrigatório.');
  var id = acCreate({
    title:        data.title.trim(),
    message:      data.message      || '',
    quote_id:     data.quote_id     || '',
    pos_venda_id: data.pos_venda_id || '',
    urgent:       !!data.urgent,
    assigned_to:  data.assigned_to  || '',
    created_by:   user.id
  });
  var card = acGetById(id);
  if (data.urgent && card) _acSendUrgentEmail(card);
  if (data.quote_id && card) {
    appendTimelineEvent('OPPORTUNITY', data.quote_id, 'ACTION_CARD',
      'Card criado: "' + data.title + '" [' + id + ']');
  }
  appendAuditLog('CREATE', 'ACTION_CARD', id, data.title);
  return id;
}

function svcUpdateStatus(cardId, newStatus, member, note) {
  if (!note || !note.trim()) throw new Error('Nota obrigatória ao mudar status.');
  if (!member)               throw new Error('Responsável obrigatório ao mudar status.');
  var card = acGetById(cardId);
  if (!card) throw new Error('Card não encontrado: ' + cardId);
  var allowed = AC_TRANSITIONS[card.status] || [];
  if (allowed.indexOf(newStatus) === -1) {
    throw new Error('Transição inválida: ' + card.status + ' → ' + newStatus);
  }
  var result = acUpdateStatus(cardId, newStatus, member, note.trim());
  if (card.quote_id) {
    appendTimelineEvent('OPPORTUNITY', card.quote_id, 'ACTION_CARD',
      'Card ' + cardId + ' → ' + newStatus + ' (' + member + '): ' + note);
  }
  appendAuditLog('UPDATE', 'ACTION_CARD', cardId, 'Status: ' + result.fromStatus + ' → ' + newStatus);
  return result;
}

function svcEditCard(cardId, updates, member, note) {
  if (!member) throw new Error('Responsável obrigatório.');
  var allowed = ['title', 'message', 'quote_id', 'pos_venda_id', 'urgent', 'assigned_to'];
  var clean = {};
  allowed.forEach(function(k) { if (k in updates) clean[k] = updates[k]; });
  acUpdateCard(cardId, clean, member, note);
  appendAuditLog('UPDATE', 'ACTION_CARD', cardId, 'Edição por ' + member);
}

function svcGetDashboardCards() {
  return acGetAll()
    .filter(function(c) { return c.status === 'OPEN' || c.status === 'IN_PROGRESS'; })
    .sort(function(a, b) { return String(b.updated_at).localeCompare(String(a.updated_at)); })
    .slice(0, 6);
}
