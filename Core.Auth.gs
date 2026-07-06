// =============================================================================
// Core.Auth.gs — autenticação por PIN (4 dígitos)
//
// FLUXO:
//   - Admin (João) define um PIN único por usuário direto na coluna `pin` da
//     aba USERS. Email permanece para audit/notificações, NÃO autentica.
//   - Usuário abre o SGA → tela de PIN → digita 4 dígitos.
//   - Servidor valida (Api_loginByPin), cria sessão em UserProperties (12h
//     padrão, configurável via SETUP_CALC.SESSION_TTL_HORAS), retorna user.
//   - Cliente persiste flag no localStorage (sempre logado até expiração).
//   - Lockout: 5 tentativas erradas no mesmo PIN → bloqueio de 5 minutos
//     (cached em ScriptProperties por hash do PIN errado).
//
// MULTI-DISPOSITIVO:
//   Sessão fica em UserProperties (escopada por conta Google + script).
//   4 dispositivos com contas Google distintas (laptop pessoal, celular,
//   etc.) = 4 sessões independentes. Mesma conta Google em duas máquinas
//   compartilharia a sessão UserProperties (último login ganha) — não é o
//   caso aqui (cada um tem sua máquina, requisito de João 2026-06-30).
// =============================================================================

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

/**
 * Migração idempotente: garante que a aba USERS tem coluna 'pin'.
 * Chamada por initCoreSheets e pelo loginByPin (caso planilha esteja antiga).
 */
function _authEnsurePinColumn() {
  try {
    var sheet = ss().getSheetByName(USERS_SHEET);
    if (!sheet) return;
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    if (headers.indexOf('pin') !== -1) return; // já existe
    // Insere coluna 'pin' antes de 'role' (ou no fim, se 'role' não estiver presente)
    var roleIdx = headers.indexOf('role');
    var insertAt = roleIdx >= 0 ? roleIdx + 1 : headers.length + 1; // 1-based
    sheet.insertColumnBefore(insertAt);
    sheet.getRange(1, insertAt).setValue('pin');
    Logger.log('[Auth] Coluna "pin" adicionada à aba USERS em ' + insertAt);
  } catch (e) {
    Logger.log('[Auth] _authEnsurePinColumn falhou: ' + e.message);
  }
}

/** Normaliza PIN: extrai só dígitos, pad com zeros à esquerda até 4. */
function _authNormalizePin(raw) {
  var digits = String(raw == null ? '' : raw).replace(/\D/g, '');
  if (digits.length === 0) return '';
  if (digits.length > 4) digits = digits.slice(-4);
  while (digits.length < 4) digits = '0' + digits;
  return digits;
}

/** Verifica se está em lockout (5 tentativas erradas em 5min). */
function _authCheckLockout() {
  var props = PropertiesService.getUserProperties();
  var raw = props.getProperty('pin_lockout');
  if (!raw) return null;
  try {
    var lock = JSON.parse(raw);
    if (lock.until && Date.now() < lock.until) {
      var rest = Math.ceil((lock.until - Date.now()) / 1000);
      return rest;
    }
    props.deleteProperty('pin_lockout');
  } catch (e) { props.deleteProperty('pin_lockout'); }
  return null;
}

function _authRegisterFailedAttempt() {
  var props = PropertiesService.getUserProperties();
  var raw = props.getProperty('pin_attempts');
  var state = { count: 0, first: Date.now() };
  if (raw) { try { state = JSON.parse(raw); } catch (e) {} }
  // Reset se passou mais de 5min desde a primeira tentativa
  if (Date.now() - state.first > 5 * 60 * 1000) {
    state = { count: 0, first: Date.now() };
  }
  state.count++;
  props.setProperty('pin_attempts', JSON.stringify(state));
  if (state.count >= 5) {
    var until = Date.now() + 5 * 60 * 1000;
    props.setProperty('pin_lockout', JSON.stringify({ until: until }));
    props.deleteProperty('pin_attempts');
  }
}

function _authClearAttempts() {
  var props = PropertiesService.getUserProperties();
  props.deleteProperty('pin_attempts');
  props.deleteProperty('pin_lockout');
}

// ---------------------------------------------------------------------------
// Login por PIN
// ---------------------------------------------------------------------------

/**
 * Tenta login com o PIN informado.
 * @param {string|number} pinRaw - PIN de 4 dígitos (string ou número).
 * @returns {{ok:true, data:object}|{ok:false, error:string, lockoutSeconds?:number}}
 */
function Api_loginByPin(pinRaw) {
  try {
    // Lockout em curso?
    var lockSec = _authCheckLockout();
    if (lockSec) {
      return {
        ok: false,
        error: 'Muitas tentativas erradas. Tente de novo em ' + Math.ceil(lockSec / 60) + ' min.',
        lockoutSeconds: lockSec
      };
    }

    var pin = _authNormalizePin(pinRaw);
    if (!pin || pin.length !== 4) {
      return { ok: false, error: 'PIN inválido. Digite 4 dígitos.' };
    }

    // Garante a coluna 'pin' (migração silenciosa caso planilha esteja antiga)
    _authEnsurePinColumn();

    var rows = sheetToObjects(USERS_SHEET);
    var user = null;
    for (var i = 0; i < rows.length; i++) {
      var rowPin = _authNormalizePin(rows[i].pin);
      if (rowPin && rowPin === pin) {
        user = rows[i];
        break;
      }
    }

    if (!user) {
      _authRegisterFailedAttempt();
      return { ok: false, error: 'PIN não encontrado. Verifique com o administrador.' };
    }

    var isActive = user.active === true || String(user.active).toUpperCase() === 'TRUE';
    if (!isActive) {
      return { ok: false, error: 'Usuário inativo. Contate o administrador.' };
    }

    // Cria sessão em UserProperties (escopada por conta Google do dispositivo).
    // 'via:pin' marca a sessão como legítima — sessões legadas (criadas pelo
    // auto-login por email antes desta versão) NÃO têm essa flag e são rejeitadas
    // por Api_getCurrentUserInfo, forçando re-login por PIN.
    var session = {
      id:      user.id,
      name:    user.name,
      email:   user.email,
      role:    user.role,
      via:     'pin',
      loginAt: nowISO()
    };
    PropertiesService.getUserProperties().setProperty(SESSION_KEY, JSON.stringify(session));
    _authClearAttempts();
    appendAuditLog('LOGIN', 'USERS', user.id, 'PIN OK: ' + user.name);

    return { ok: true, data: { id: user.id, name: user.name, email: user.email, role: user.role } };

  } catch (e) {
    return { ok: false, error: e.message || 'Erro ao validar PIN.' };
  }
}

/**
 * Retorna informações da sessão ativa (se houver) — chamada no boot do app.
 * @returns {{ok:true, data:object}|{ok:false, error:'PIN_REQUIRED'|string}}
 */
function Api_getCurrentUserInfo() {
  try {
    var session = getCurrentUser();
    if (!session) return { ok: false, error: 'PIN_REQUIRED' };

    // Rejeita sessões legadas (criadas pelo auto-login por email antes desta versão).
    // Só aceita sessões marcadas com via:'pin'.
    if (session.via !== 'pin') {
      logoutUser();
      return { ok: false, error: 'PIN_REQUIRED' };
    }

    // Re-valida que o usuário ainda existe e está ativo
    var rows = sheetToObjects(USERS_SHEET);
    var u = null;
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i].id) === String(session.id)) { u = rows[i]; break; }
    }
    if (!u) {
      logoutUser();
      return { ok: false, error: 'PIN_REQUIRED' };
    }
    var isActive = u.active === true || String(u.active).toUpperCase() === 'TRUE';
    if (!isActive) {
      logoutUser();
      return { ok: false, error: 'Usuário foi desativado. Contate o administrador.' };
    }

    return { ok: true, data: { id: u.id, name: u.name, email: u.email, role: u.role } };

  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ---------------------------------------------------------------------------
// getAuthorizedUser — compat: agora retorna o usuário logado por PIN
// (mantém assinatura por causa de chamadas antigas, mas NÃO autentica por email)
// ---------------------------------------------------------------------------

function getAuthorizedUser() {
  var session = getCurrentUser();
  if (!session) throw new Error('PIN_REQUIRED');
  return session;
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
// requireAuth — exige sessão válida (sem auto-login por email)
// ---------------------------------------------------------------------------

function requireAuth() {
  let session = getCurrentUser();
  if (session && session.via === 'pin') return session;
  // Sessão legada (sem via:'pin') ou inexistente: força re-login por PIN
  if (session) logoutUser();
  throw new Error('PIN_REQUIRED');
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

// API pública compatível com chamada do cliente
function Api_logout() {
  try {
    logoutUser();
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}

// ---------------------------------------------------------------------------
// getUsersByRole — retorna todos os usuários ativos com o papel informado
// ---------------------------------------------------------------------------

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
// loginUser — @deprecated. Mantido apenas para retrocompatibilidade.
// ---------------------------------------------------------------------------

function loginUser(userId) {
  // @deprecated — use Api_loginByPin pelo cliente. Aqui apenas retorna a sessão atual.
  return requireAuth();
}

// ---------------------------------------------------------------------------
// HELPER DE EMERGÊNCIA — rode no editor do Apps Script se ninguém conseguir
// logar (PINs não foram cadastrados na planilha). Ex.:
//   setUserPin('jlffigueiredo01@gmail.com', '1234')
//   setUserPin('USR-00001', '0427')
// ---------------------------------------------------------------------------
function setUserPin(emailOrId, pin) {
  var normPin = _authNormalizePin(pin);
  if (!normPin || normPin.length !== 4) throw new Error('PIN inválido — use 4 dígitos.');

  _authEnsurePinColumn();
  var rows = sheetToObjects(USERS_SHEET);
  var target = null;
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (String(r.id) === String(emailOrId)) { target = r; break; }
    if (String(r.email).trim().toLowerCase() === String(emailOrId).trim().toLowerCase()) { target = r; break; }
  }
  if (!target) throw new Error('Usuário não encontrado: ' + emailOrId);

  // Conflito: PIN já em uso por outro
  for (var j = 0; j < rows.length; j++) {
    if (String(rows[j].id) === String(target.id)) continue;
    if (_authNormalizePin(rows[j].pin) === normPin) {
      throw new Error('PIN ' + normPin + ' já está em uso por ' + rows[j].name + '. Escolha outro.');
    }
  }

  updateRowByIdSafe(USERS_SHEET, target.id, { pin: normPin });
  appendAuditLog('SET_PIN', 'USERS', target.id, 'PIN definido para ' + target.name);
  Logger.log('PIN ' + normPin + ' atribuído a ' + target.name + ' (' + target.id + ')');
  return { id: target.id, name: target.name, pin: normPin };
}
