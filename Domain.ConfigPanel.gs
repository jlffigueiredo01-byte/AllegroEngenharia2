// Domain.ConfigPanel — Configuration Panel API
// Accessible only to DIRETOR_TECNICO

var ADMIN_ROLES = ['DIRETOR_TECNICO'];

// ---------------------------------------------------------------------------
// Users management (Config Panel variants — do NOT conflict with Domain.Users)
// ---------------------------------------------------------------------------

/**
 * Api_cfgGetUsers() → {ok, data: user[]}
 * Returns ALL users including inactive.
 */
function Api_cfgGetUsers() {
  requireAuth();
  requireRole(ADMIN_ROLES);
  try {
    var rows = sheetToObjects(USERS_SHEET);
    return { ok: true, data: rows };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Api_cfgCreateUser(data) → {ok, id}
 * data: {name, email, role}
 */
function Api_cfgCreateUser(data) {
  requireAuth();
  requireRole(ADMIN_ROLES);
  try {
    if (!data || !data.name || !data.email || !data.role) {
      return { ok: false, error: 'Nome, e-mail e perfil são obrigatórios.' };
    }
    var existing = findRowByValue(USERS_SHEET, 'email', data.email.trim().toLowerCase());
    if (existing) {
      return { ok: false, error: 'Já existe um usuário com este e-mail.' };
    }
    var id = generateId('USR');
    appendRowToSheet(
      USERS_SHEET,
      {
        id:         id,
        name:       data.name.trim(),
        email:      data.email.trim().toLowerCase(),
        role:       data.role,
        active:     'TRUE',
        created_at: nowISO()
      },
      USERS_HEADERS
    );
    appendAuditLog('CREATE', 'USERS', id, 'Usuário criado pelo painel de config: ' + data.name);
    return { ok: true, id: id };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Api_cfgToggleUser(id) → {ok, newActive}
 * Flips the active field between TRUE and FALSE.
 */
function Api_cfgToggleUser(id) {
  requireAuth();
  requireRole(ADMIN_ROLES);
  try {
    var row = findRowByValue(USERS_SHEET, 'id', id);
    if (!row) {
      return { ok: false, error: 'Usuário não encontrado: ' + id };
    }
    var currentActive = String(row.active).toUpperCase() === 'TRUE';
    var newActive = !currentActive;
    updateRowByIdSafe(USERS_SHEET, id, { active: newActive ? 'TRUE' : 'FALSE' });
    appendAuditLog(
      'UPDATE',
      'USERS',
      id,
      'Usuário ' + (newActive ? 'ativado' : 'desativado') + ' pelo painel de config.'
    );
    return { ok: true, newActive: newActive };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Api_cfgUpdateUser(id, data) → {ok}
 * data: {name, email, role}
 */
function Api_cfgUpdateUser(id, data) {
  requireAuth();
  requireRole(ADMIN_ROLES);
  try {
    var row = findRowByValue(USERS_SHEET, 'id', id);
    if (!row) {
      return { ok: false, error: 'Usuário não encontrado: ' + id };
    }
    var updates = {};
    if (data.name)  updates.name  = data.name.trim();
    if (data.email) updates.email = data.email.trim().toLowerCase();
    if (data.role)  updates.role  = data.role;
    updateRowByIdSafe(USERS_SHEET, id, updates);
    appendAuditLog('UPDATE', 'USERS', id, 'Dados do usuário atualizados pelo painel de config.');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ---------------------------------------------------------------------------
// System configuration
// ---------------------------------------------------------------------------

/**
 * Api_cfgGetConfigValues() → {ok, data: [{key, value, description}]}
 * Returns all CONFIG rows except sensitive keys (those containing 'COUNTER' or 'KEY').
 */
function Api_cfgGetConfigValues() {
  requireAuth();
  requireRole(ADMIN_ROLES);
  try {
    var rows = sheetToObjects(CONFIG_SHEET);
    var filtered = rows.filter(function(r) {
      var k = String(r.key).toUpperCase();
      return k.indexOf('COUNTER') === -1 && k.indexOf('KEY') === -1;
    });
    return { ok: true, data: filtered };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Api_cfgSetConfigValue(key, value) → {ok}
 */
function Api_cfgSetConfigValue(key, value) {
  requireAuth();
  requireRole(ADMIN_ROLES);
  try {
    setConfigValue(key, value);
    appendAuditLog('UPDATE', 'CONFIG', key, 'Valor alterado para: ' + value);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
