const USERS_SHEET = 'USERS';
const SESSION_KEY = 'allegro_session';

function getCurrentUser() {
  const props = PropertiesService.getUserProperties();
  const stored = props.getProperty(SESSION_KEY);
  if (!stored) return null;
  try { return JSON.parse(stored); } catch (e) { return null; }
}

function loginUser(userId) {
  const user = findRowByValue(USERS_SHEET, 'id', userId);
  if (!user) return null;
  const isActive = user.active === true || String(user.active).toUpperCase() === 'TRUE';
  if (!isActive) return null;
  const session = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    loginAt: nowISO()
  };
  PropertiesService.getUserProperties().setProperty(SESSION_KEY, JSON.stringify(session));
  appendAuditLog('LOGIN', 'USERS', userId, 'Login: ' + user.name);
  return session;
}

function logoutUser() {
  const user = getCurrentUser();
  if (user) appendAuditLog('LOGOUT', 'USERS', user.id, 'Logout: ' + user.name);
  PropertiesService.getUserProperties().deleteProperty(SESSION_KEY);
}

function requireAuth() {
  const user = getCurrentUser();
  if (!user) throw new Error('Usuário não autenticado.');
  return user;
}

function requireRole(allowedRoles) {
  const user = requireAuth();
  if (!allowedRoles.includes(user.role)) throw new Error('Acesso negado para o perfil ' + user.role + '.');
  return user;
}

function canAccessFinancial() {
  const user = getCurrentUser();
  return user && user.role === 'GERAL';
}
