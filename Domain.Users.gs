// Domain.Users — Api + Service

function Api_getUsers() {
  const rows = sheetToObjects(USERS_SHEET);
  return rows
    .filter(u => u.active === true || String(u.active).toUpperCase() === 'TRUE')
    .map(u => ({ id: u.id, name: u.name, role: u.role }));
}

function Api_loginUser(userId) {
  return loginUser(userId);
}

function Api_logoutUser() {
  logoutUser();
  return true;
}

function Api_getCurrentUser() {
  return getCurrentUser();
}

function Api_createUser(name, email, role) {
  requireRole(['GERAL']);
  if (!name || !email || !role) throw new Error('Nome, e-mail e perfil são obrigatórios.');
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
