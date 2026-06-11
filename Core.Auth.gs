const USERS_SHEET = 'USERS';
const SESSION_KEY = 'allegro_session';

var ROLES = {
  DIRETOR_TECNICO:    'DIRETOR_TECNICO',
  DIRETOR_COMERCIAL:  'DIRETOR_COMERCIAL',
  FINANCEIRO_ADMIN:   'FINANCEIRO_ADMIN',
  TECNICO:            'TECNICO'
};

var RBAC_MATRIX = {
  'crm.read':           ['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN', 'TECNICO'],
  'crm.write':          ['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'TECNICO'],
  'crm.approve':        ['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL'],
  'propostas.read':     ['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN', 'TECNICO'],
  'propostas.write':    ['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN', 'TECNICO'],
  'propostas.send':     ['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL'],
  'margem.read':        ['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN'],
  'financeiro.read':    ['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN'],
  'financeiro.write':   ['DIRETOR_TECNICO', 'FINANCEIRO_ADMIN', 'TECNICO'],
  'financeiro.approve': ['DIRETOR_TECNICO', 'FINANCEIRO_ADMIN'],
  'config.read':        ['DIRETOR_TECNICO', 'FINANCEIRO_ADMIN'],
  'config.write':       ['DIRETOR_TECNICO', 'FINANCEIRO_ADMIN'],
  'usuarios.manage':    ['DIRETOR_TECNICO'],
  'tickets.read':       ['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN', 'TECNICO'],
  'tickets.write':      ['DIRETOR_TECNICO', 'TECNICO'],
  'all':                ['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN', 'TECNICO']
};

// ---------------------------------------------------------------------------
// Helpers privados
// ---------------------------------------------------------------------------

function _authGetSetupCalcTTL() {
  try {
    var rows = sheetToObjects('SETUP_CALC');
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].key === 'SESSION_TTL_HORAS') return Number(rows[i].value) || 12;
    }
  } catch (e) {}
  return 12;
}

// ---------------------------------------------------------------------------
// getAuthorizedUser — identifica o usuário pelo email do Google ativo
// ---------------------------------------------------------------------------

function getAuthorizedUser() {
  var email = Session.getActiveUser().getEmail();
  if (!email) {
    throw new Error('Não foi possível identificar o usuário. Faça login com sua conta Google.');
  }

  var rows = sheetToObjects('USERS');
  var user = null;
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].email).trim().toLowerCase() === email.trim().toLowerCase()) {
      user = rows[i];
      break;
    }
  }

  if (!user) {
    throw new Error('Acesso não autorizado. O e-mail ' + email + ' não está cadastrado no sistema.');
  }

  var isActive = user.active === true || String(user.active).toUpperCase() === 'TRUE';
  if (!isActive) {
    throw new Error('Usuário inativo. Contate o administrador do sistema.');
  }

  return user;
}

// ---------------------------------------------------------------------------
// getCurrentUser — lê sessão em cache com verificação de expiração
// ---------------------------------------------------------------------------

function getCurrentUser() {
  const props = PropertiesService.getUserProperties();
  const stored = props.getProperty(SESSION_KEY);
  if (!stored) return null;

  let session;
  try { session = JSON.parse(stored); } catch (e) { return null; }

  // Verificar expiração
  if (session && session.loginAt) {
    const ttlHoras = _authGetSetupCalcTTL();
    const loginTime = new Date(session.loginAt).getTime();
    const expiresAt = loginTime + ttlHoras * 60 * 60 * 1000;
    if (Date.now() > expiresAt) {
      props.deleteProperty(SESSION_KEY);
      return null;
    }
  }

  return session || null;
}

// ---------------------------------------------------------------------------
// requireAuth — garante sessão válida; auto-login via email se necessário
// ---------------------------------------------------------------------------

function requireAuth() {
  let session = getCurrentUser();
  if (session) return session;

  // Nenhuma sessão válida em cache — identificar pelo email do Google
  const user = getAuthorizedUser(); // lança erro se não autorizado

  session = {
    id:      user.id,
    name:    user.name,
    email:   user.email,
    role:    user.role,
    loginAt: nowISO()
  };

  PropertiesService.getUserProperties().setProperty(SESSION_KEY, JSON.stringify(session));
  appendAuditLog('LOGIN', 'USERS', user.id, 'Auto-login: ' + user.email);
  return session;
}

// ---------------------------------------------------------------------------
// requireRole — verifica se a sessão possui um dos papéis permitidos
// ---------------------------------------------------------------------------

function requireRole(allowedRoles) {
  const user = requireAuth();
  if (!allowedRoles.includes(user.role)) {
    throw new Error('Acesso negado para o perfil ' + user.role + '.');
  }
  return user;
}

// ---------------------------------------------------------------------------
// logoutUser — encerra a sessão e registra no audit log
// ---------------------------------------------------------------------------

function logoutUser() {
  const user = getCurrentUser();
  if (user) appendAuditLog('LOGOUT', 'USERS', user.id, 'Logout: ' + user.name);
  PropertiesService.getUserProperties().deleteProperty(SESSION_KEY);
}

// ---------------------------------------------------------------------------
// getUsersByRole — retorna todos os usuários ativos com o papel informado
// ---------------------------------------------------------------------------

/**
 * Retorna todos os usuários ativos cadastrados com o papel (role) informado.
 * Centralizado aqui para evitar que Services acessem USERS_SHEET diretamente.
 *
 * @param {string} role - Papel a filtrar (ex: 'TECNICO', 'DIRETOR_COMERCIAL').
 * @returns {Object[]} Array de objetos de usuário (id, name, email, role).
 */
function getUsersByRole(role) {
  var rows = sheetToObjects(USERS_SHEET);
  var result = [];
  for (var i = 0; i < rows.length; i++) {
    var u = rows[i];
    if (
      u.role === role &&
      (u.active === true || String(u.active).toUpperCase() !== 'FALSE')
    ) {
      result.push({ id: u.id, name: u.name, email: u.email, role: u.role });
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// canAccessFinancial — atalho para verificar acesso financeiro
// ---------------------------------------------------------------------------

function canAccessFinancial() {
  const user = getCurrentUser();
  return user && ['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN'].includes(user.role);
}

// ---------------------------------------------------------------------------
// loginUser — @deprecated. Login agora é automático via Session.getActiveUser().getEmail()
// ---------------------------------------------------------------------------

function loginUser(userId) {
  // @deprecated — login agora é automático via Session.getActiveUser().getEmail()
  return requireAuth();
}

/**
 * Retorna informações do usuário autenticado via email do Google.
 * Chamada pelo frontend no carregamento inicial do app.
 * @returns {{ok:boolean, data:object}|{ok:boolean, error:string, email:string}}
 */
function Api_getCurrentUserInfo() {
  var email = '';
  try {
    email = Session.getActiveUser().getEmail() || '';
  } catch(e) {}
  try {
    var user = requireAuth();
    return { ok: true, data: { id: user.id, name: user.name, email: user.email, role: user.role } };
  } catch(e) {
    if (e.message.indexOf('não autorizado') !== -1 ||
        e.message.indexOf('não está cadastrado') !== -1 ||
        e.message.indexOf('inativo') !== -1) {
      return { ok: false, error: 'NOT_AUTHORIZED', email: email };
    }
    return { ok: false, error: e.message, email: email };
  }
}
