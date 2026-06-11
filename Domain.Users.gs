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
