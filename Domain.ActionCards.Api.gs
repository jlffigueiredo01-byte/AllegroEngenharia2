/* ═══════════════════════════════════════════════════════════════
   ACTION CARDS — API pública (chamada via google.script.run)
═══════════════════════════════════════════════════════════════ */

function Api_acGetAll() {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN']);
    // FB-00036: auto-limpeza de cards-lixo de SISTEMA na 1ª abertura após deploy.
    _acAutoCleanupSystemCards();
    return { ok: true, data: sanitizeForClient(acGetAll()) };
  } catch (e) { return { ok: false, error: e.message }; }
}

function Api_acCreate(data) {
  try {
    var user = requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN', 'TECNICO']);
    var id = acSvcCreateCard(data, user);
    return { ok: true, id: id };
  } catch (e) { return { ok: false, error: e.message }; }
}

function Api_acUpdateStatus(cardId, newStatus, member, note) {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN', 'TECNICO']);
    var result = acSvcUpdateStatus(cardId, newStatus, member, note);
    return { ok: true, data: sanitizeForClient(result) };
  } catch (e) { return { ok: false, error: e.message }; }
}

function Api_acEdit(cardId, updates, member, note) {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN', 'TECNICO']);
    acSvcEditCard(cardId, updates, member, note);
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}

function Api_acGetHistory(cardId) {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN', 'TECNICO']);
    return { ok: true, data: sanitizeForClient(acGetHistory(cardId)) };
  } catch (e) { return { ok: false, error: e.message }; }
}

/* Retorna usuários ativos da aba USERS — usado pelos selects do Kanban.
   Usa Api_getUsers() de Domain.Users ou getUsersByRole() de Core.Auth via wrapper. */
function Api_acGetActiveUsers() {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN', 'TECNICO']);
    // Usa getAuthorizedUser internamente — para listar todos os ativos,
    // delega para Core.Auth.getUsersByRole com todos os papéis
    var roles = ['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN', 'TECNICO'];
    var seen = {};
    var users = [];
    for (var r = 0; r < roles.length; r++) {
      var byRole = getUsersByRole(roles[r]);
      for (var u = 0; u < byRole.length; u++) {
        if (!seen[byRole[u].id]) {
          seen[byRole[u].id] = true;
          users.push({ id: byRole[u].id, name: byRole[u].name });
        }
      }
    }
    return { ok: true, data: users };
  } catch (e) { return { ok: false, error: e.message }; }
}

function Api_acGetDashboardCards() {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN']);
    return { ok: true, data: sanitizeForClient(acSvcGetDashboardCards()) };
  } catch (e) { return { ok: false, error: e.message }; }
}

/* ───────────────────────── FB-00036 cleanup ─────────────────────────
   Limpa cards automáticos de SISTEMA (SLA Estourado, [SISTEMA] Integridade)
   que poluíam o board. Chamável também manualmente pelo DIRETOR_TECNICO
   ou pelo chatbot ("limpar cards do sistema").
   Idempotente: marca o flag SYSTEM_CARDS_CLEANED_FB00036 em ScriptProperties
   para evitar reexecução automática. Reset manual: limpar a propriedade.
   ─────────────────────────────────────────────────────────────────── */

function Api_acCleanupSystemCards() {
  try {
    requireRole(['DIRETOR_TECNICO']);
    var n = _acCleanupSystemCardsImpl(/*force*/ true);
    return { ok: true, data: { cleaned: n } };
  } catch (e) { return { ok: false, error: e.message }; }
}

function _acAutoCleanupSystemCards() {
  try {
    var props = PropertiesService.getScriptProperties();
    if (props.getProperty('SYSTEM_CARDS_CLEANED_FB00036') === '1') return;
    var n = _acCleanupSystemCardsImpl(/*force*/ false);
    props.setProperty('SYSTEM_CARDS_CLEANED_FB00036', '1');
    Logger.log('[FB-00036] Auto-cleanup: ' + n + ' card(s) cancelado(s).');
  } catch (e) {
    Logger.log('[FB-00036] _acAutoCleanupSystemCards falhou: ' + e.message);
  }
}

function _acCleanupSystemCardsImpl(force) {
  var all = acGetAll();
  var alvos = all.filter(function(c) {
    var byUser   = String(c.created_by || '').toUpperCase() === 'SYSTEM';
    var titulo   = String(c.title || '');
    var isLixo   = titulo.indexOf('[SISTEMA]') === 0 ||
                   titulo.indexOf('SLA Estourado') === 0;
    var aberto   = c.status === 'ABERTO' || c.status === 'EM_ANDAMENTO' || c.status === 'SLA_ESTOURADO';
    return (byUser || isLixo) && aberto;
  });
  if (!alvos.length) return 0;

  var member = 'SYSTEM';
  var note   = 'Limpeza automática FB-00036 — cards de sistema removidos do board.';
  var ok = 0;
  alvos.forEach(function(c) {
    try {
      acCloseCard(c.id, 'SYSTEM', 'limpeza-fb00036', member, note);
      ok++;
    } catch (e) {
      Logger.log('[FB-00036] Falha ao cancelar ' + c.id + ': ' + e.message);
    }
  });
  return ok;
}
