/* ═══════════════════════════════════════════════════════════════
   ACTION CARDS — API pública (chamada via google.script.run)
═══════════════════════════════════════════════════════════════ */

function Api_acGetAll() {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN']);
    return { ok: true, data: acGetAll() };
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
    return { ok: true, data: result };
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
    return { ok: true, data: acGetHistory(cardId) };
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
    return { ok: true, data: acSvcGetDashboardCards() };
  } catch (e) { return { ok: false, error: e.message }; }
}
