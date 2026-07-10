/* ═══════════════════════════════════════════════════════════════
   ACTION CARDS — Service (regras de negócio)
═══════════════════════════════════════════════════════════════ */

function _acSendUrgentEmail(card) {
  try {
    // ALERT_EMAIL: padrão SGA = aba CONFIG (dado não-sensível). Script
    // Properties fica só como fallback retrocompatível.
    var recipient = getConfigValue('ALERT_EMAIL') ||
                    PropertiesService.getScriptProperties().getProperty('ALERT_EMAIL');
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

function acSvcCreateCard(data, user) {
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

function acSvcUpdateStatus(cardId, newStatus, member, note) {
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

function acSvcEditCard(cardId, updates, member, note) {
  if (!member) throw new Error('Responsável obrigatório.');
  var allowed = ['title', 'message', 'quote_id', 'pos_venda_id', 'urgent', 'assigned_to'];
  var clean = {};
  allowed.forEach(function(k) { if (k in updates) clean[k] = updates[k]; });
  acUpdateCard(cardId, clean, member, note);
  appendAuditLog('UPDATE', 'ACTION_CARD', cardId, 'Edição por ' + member);
}

function acSvcGetDashboardCards() {
  return acGetAll()
    .filter(function(c) { return c.status === AC_STATUS.ABERTO || c.status === AC_STATUS.EM_ANDAMENTO; })
    .sort(function(a, b) { return String(b.updated_at).localeCompare(String(a.updated_at)); })
    .slice(0, 6);
}

/* ───────────────────────── FB-00038 — atividade no card ─────────────────────
   Comentários (viram entradas do histórico), anexos (Drive, subpasta por
   card) e participantes (lista de userIds no card). Quem comenta ou anexa
   entra automaticamente como participante. */

function _acParseJson(raw, fallback) {
  try { var v = JSON.parse(raw || ''); return v != null ? v : fallback; }
  catch (e) { return fallback; }
}

function _acEnsureParticipant(card, userId) {
  if (!userId) return null;
  var list = _acParseJson(card.participants_json, []);
  if (list.indexOf(userId) !== -1) return null;
  list.push(userId);
  acUpdateCardSilent(card.id, { participants_json: JSON.stringify(list) });
  return list;
}

/** Comentário livre no card — vira entrada do histórico (💬). */
function acSvcComment(cardId, texto, user) {
  if (!texto || !String(texto).trim()) throw new Error('Escreva o comentário.');
  var card = acGetById(cardId);
  if (!card) throw new Error('Card não encontrado: ' + cardId);
  acAppendHistory(cardId, '', '', user.name, '💬 ' + String(texto).trim());
  acUpdateCardSilent(cardId, { updated_at: nowISO(), last_member: user.name, last_note: '💬 comentário' });
  _acEnsureParticipant(card, user.id);
  appendAuditLog('AC_COMMENT', 'ACTION_CARD', cardId, user.name);
  return true;
}

/** Anexa arquivo ao card (Drive: 07-Empresa/ActionCards/<cardId>). */
function acSvcAttach(cardId, base64Data, mimeType, fileName, user) {
  if (!base64Data) throw new Error('Arquivo vazio.');
  var card = acGetById(cardId);
  if (!card) throw new Error('Card não encontrado: ' + cardId);

  var folderId = card.drive_folder_id;
  if (!folderId) {
    var base = drvGetFolder('EMPRESA_ACTIONCARDS');
    if (!base) throw new Error('Drive não configurado (ROOT_FOLDER_ID) — rode setupAll.');
    var it = base.getFoldersByName(cardId);
    var folder = it.hasNext() ? it.next() : base.createFolder(cardId);
    folderId = folder.getId();
  }
  var blob = Utilities.newBlob(
    Utilities.base64Decode(base64Data), mimeType || 'application/octet-stream',
    fileName || ('anexo-' + new Date().getTime()));
  var file = DriveApp.getFolderById(folderId).createFile(blob);
  // Sem link público (T6): o arquivo herda a permissão da pasta do SGA.

  var anexos = _acParseJson(card.anexos_json, []);
  anexos.push({ url: file.getUrl(), name: fileName || file.getName(), por: user.name, em: nowISO() });
  acUpdateCardSilent(cardId, {
    anexos_json: JSON.stringify(anexos),
    drive_folder_id: folderId,
    updated_at: nowISO(), last_member: user.name, last_note: '📎 anexo'
  });
  acAppendHistory(cardId, '', '', user.name, '📎 Anexo: ' + (fileName || file.getName()));
  _acEnsureParticipant(card, user.id);
  appendAuditLog('AC_ATTACH', 'ACTION_CARD', cardId, fileName || file.getName());
  return { url: file.getUrl(), name: fileName || file.getName(), anexos: anexos };
}

/** Define a lista de participantes do card. */
function acSvcSetParticipants(cardId, userIds, user) {
  var card = acGetById(cardId);
  if (!card) throw new Error('Card não encontrado: ' + cardId);
  var clean = (userIds || []).filter(function (id) { return id && String(id).trim(); });
  acUpdateCardSilent(cardId, {
    participants_json: JSON.stringify(clean),
    updated_at: nowISO(), last_member: user.name, last_note: '👥 participantes atualizados'
  });
  appendAuditLog('AC_PARTICIPANTS', 'ACTION_CARD', cardId, clean.join(','));
  return clean;
}
