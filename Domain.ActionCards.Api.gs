/* ═══════════════════════════════════════════════════════════════
   ACTION CARDS — API pública (chamada via google.script.run)
═══════════════════════════════════════════════════════════════ */

function Api_acGetAll() {
  try {
    requireAuth();
    return { ok: true, data: acGetAll() };
  } catch (e) { return { ok: false, error: e.message }; }
}

function Api_acCreate(data) {
  try {
    var user = requireAuth();
    var id = svcCreateCard(data, user);
    return { ok: true, id: id };
  } catch (e) { return { ok: false, error: e.message }; }
}

function Api_acUpdateStatus(cardId, newStatus, member, note) {
  try {
    requireAuth();
    var result = svcUpdateStatus(cardId, newStatus, member, note);
    return { ok: true, data: result };
  } catch (e) { return { ok: false, error: e.message }; }
}

function Api_acEdit(cardId, updates, member, note) {
  try {
    requireAuth();
    svcEditCard(cardId, updates, member, note);
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}

function Api_acGetHistory(cardId) {
  try {
    requireAuth();
    return { ok: true, data: acGetHistory(cardId) };
  } catch (e) { return { ok: false, error: e.message }; }
}

/* Retorna usuários ativos da aba USERS — usado pelos selects do Kanban */
function Api_acGetActiveUsers() {
  try {
    requireAuth();
    var users = sheetToObjects('USERS')
      .filter(function(u) { return String(u.active).toUpperCase() === 'TRUE'; })
      .map(function(u) { return { id: u.id, name: u.name }; });
    return { ok: true, data: users };
  } catch (e) { return { ok: false, error: e.message }; }
}

function Api_acGetDashboardCards() {
  try {
    requireAuth();
    return { ok: true, data: svcGetDashboardCards() };
  } catch (e) { return { ok: false, error: e.message }; }
}
