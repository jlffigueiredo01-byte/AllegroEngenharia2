// Domain.Users — Api + Service

var VALID_ROLES = ['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN', 'TECNICO'];

function Api_getUsers() {
  requireRole(['DIRETOR_TECNICO']);
  const rows = sheetToObjects(USERS_SHEET);
  return rows
    .filter(u => u.active === true || String(u.active).toUpperCase() === 'TRUE')
    .map(u => ({ id: u.id, name: u.name, role: u.role }));
}

function Api_loginUser(userId) {
  // loginUser is deprecated — delegates to requireAuth which validates via Google session
  return loginUser(userId);
}

function Api_logoutUser() {
  // No auth guard needed — logout must be callable even with an expired session
  logoutUser();
  return true;
}

function Api_getCurrentUser() {
  // Delegates to Core.Auth.gs Api_getCurrentUserInfo which has auth guard
  return getCurrentUser();
}

function Api_createUser(name, email, role) {
  requireRole(['DIRETOR_TECNICO']);
  if (!name || !email || !role) throw new Error('Nome, e-mail e perfil são obrigatórios.');
  if (VALID_ROLES.indexOf(role) === -1) throw new Error('Papel inválido. Use: ' + VALID_ROLES.join(', '));
  const existing = findRowByValue(USERS_SHEET, 'email', email);
  if (existing) throw new Error('Já existe um usuário com este e-mail.');
  const id = generateId('USR');
  appendRowToSheet(USERS_SHEET, {
    id: id,
    name: name.trim(),
    email: email.trim().toLowerCase(),
    role: role,
    active: 'TRUE',
    created_at: nowISO()
  }, USERS_HEADERS);
  appendAuditLog('CREATE', 'USERS', id, 'Novo usuário: ' + name);
  return { id, name, email, role };
}

// ─────────────────────────────────────────────────────────────────────────
// Gestão de usuários (tela de Usuários) — tudo restrito a DIRETOR_TECNICO.
// ─────────────────────────────────────────────────────────────────────────

/** Lista TODOS os usuários (ativos e inativos), com todos os campos. */
function Api_usersGetAll() {
  try {
    requireRole(['DIRETOR_TECNICO']);
    var rows = sheetToObjects(USERS_SHEET).map(function (u) {
      return {
        id: u.id, name: u.name, email: u.email, role: u.role,
        active: (u.active === true || String(u.active).toUpperCase() === 'TRUE'),
        created_at: u.created_at
      };
    });
    rows.sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
    return { ok: true, data: sanitizeForClient(rows) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/** Cria usuário (envelope {ok}). Reaproveita as validações do Api_createUser. */
function Api_usersCreate(data) {
  try {
    requireRole(['DIRETOR_TECNICO']);
    var d = data || {};
    return { ok: true, data: Api_createUser(d.name, d.email, d.role) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/** Edita nome e/ou papel de um usuário. O e-mail (chave de login) não muda
 *  aqui de propósito — trocar e-mail é criar outro acesso. */
function Api_usersUpdate(id, updates) {
  try {
    requireRole(['DIRETOR_TECNICO']);
    if (!id) throw new Error('id é obrigatório.');
    var u = findRowByValue(USERS_SHEET, 'id', id);
    if (!u) throw new Error('Usuário não encontrado: ' + id);
    var patch = {};
    if (updates && updates.name && String(updates.name).trim()) patch.name = String(updates.name).trim();
    if (updates && updates.role) {
      if (VALID_ROLES.indexOf(updates.role) === -1) throw new Error('Papel inválido.');
      patch.role = updates.role;
    }
    // E-mail: só pode ser DEFINIDO quando ainda está vazio (corrige usuários
    // criados sem e-mail). Se já houver um e-mail, ele é imutável (é a chave
    // do login — trocar seria criar outro acesso).
    if (updates && updates.email && String(updates.email).trim()) {
      var emailAtual = String(u.email || '').trim();
      var emailNovo = String(updates.email).trim().toLowerCase();
      if (emailAtual && emailAtual.toLowerCase() !== emailNovo) {
        throw new Error('O e-mail não pode ser alterado depois de definido. Crie outro usuário se precisar de outro acesso.');
      }
      if (!emailAtual) {
        var jaUsado = findRowByValue(USERS_SHEET, 'email', emailNovo);
        if (jaUsado && jaUsado.id !== id) throw new Error('Já existe um usuário com este e-mail.');
        patch.email = emailNovo;
      }
    }
    if (!Object.keys(patch).length) throw new Error('Nada para atualizar.');
    updateRowByIdSafe(USERS_SHEET, id, patch);
    appendAuditLog('UPDATE', 'USERS', id, JSON.stringify(patch));
    return { ok: true, data: { id: id } };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/** Define/atualiza o PIN de 4 dígitos de um usuário (DIRETOR_TECNICO).
 *  Validações: PIN único, 4 dígitos, normalização (só dígitos, pad-zero). */
function Api_usersSetPin(id, pin) {
  try {
    requireRole(['DIRETOR_TECNICO']);
    if (!id) throw new Error('id é obrigatório.');
    var result = setUserPin(id, pin); // helper em Core.Auth.gs (já valida unicidade)
    return { ok: true, data: result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/** Ativa/desativa um usuário (desativar preserva o histórico — não exclui).
 *  Trava de segurança: não permite o admin desativar a si mesmo (evita
 *  o sistema ficar sem nenhum DIRETOR_TECNICO ativo). */
function Api_usersSetActive(id, active) {
  try {
    var me = requireRole(['DIRETOR_TECNICO']);
    if (!id) throw new Error('id é obrigatório.');
    if (id === me.id && !active) throw new Error('Você não pode desativar a si mesmo.');
    var u = findRowByValue(USERS_SHEET, 'id', id);
    if (!u) throw new Error('Usuário não encontrado: ' + id);
    updateRowByIdSafe(USERS_SHEET, id, { active: active ? 'TRUE' : 'FALSE' });
    appendAuditLog(active ? 'REACTIVATE' : 'DEACTIVATE', 'USERS', id, u.name);
    return { ok: true, data: { id: id, active: active } };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
