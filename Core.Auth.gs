// =============================================================================
// Core.Auth.gs — autenticação por PIN (4 dígitos) com ACESSO ANÔNIMO
//
// DECISÃO (João, 2026-07-08): NÃO exigir conta Google. O Web App roda como o
// dono ("Executar como: Eu") com acesso "Qualquer pessoa" (anônimo). Sistema
// interno, link não divulgado. A única credencial é o PIN.
//
// POR QUE SESSÕES POR TOKEN (e não UserProperties):
//   Com acesso anônimo executando como o dono, TODO acesso compartilha o
//   mesmo UserProperties (o do dono) — sessões colidiriam entre usuários.
//   Solução: token aleatório por login, guardado no localStorage do
//   navegador de cada usuário e enviado em TODA chamada via Api_dispatch
//   (injeção automática no wrapper de google.script.run do FeedbackDiag).
//
// FLUXO:
//   login:   client → Api_loginByPin(pin) → valida → cria SESS_<token> em
//            ScriptProperties (TTL 12h) → devolve token → localStorage.
//   chamada: client → Api_dispatch(token, 'Api_xxx', [args]) → resolve a
//            sessão, seta __SGA_SESSION e invoca a Api real.
//   logout:  Api_logout apaga a sessão; client apaga o token.
//
// Lockout GLOBAL (janela de 5 min, 8 falhas) em ScriptProperties — sem
// identidade Google não há como fazer lockout por usuário.
// =============================================================================

const USERS_SHEET = 'USERS';

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

// Sessão da EXECUÇÃO corrente (setada pelo Api_dispatch a cada request).
var __SGA_SESSION = null;

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
 */
function _authEnsurePinColumn() {
  try {
    var sheet = ss().getSheetByName(USERS_SHEET);
    if (!sheet) return;
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    if (headers.indexOf('pin') !== -1) return;
    var roleIdx = headers.indexOf('role');
    var insertAt = roleIdx >= 0 ? roleIdx + 1 : headers.length + 1;
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

/**
 * T7b (revisão geral): hash SHA-256 do PIN com salt (Script Property
 * PIN_SALT, fallback fixo). Migração transparente: a célula pode ter o PIN
 * em claro (João digita 4 dígitos na planilha) — no 1º login o hash é
 * gravado por cima. _authPinMatches aceita os dois formatos.
 */
function _authHashPin(pin) {
  var salt = PropertiesService.getScriptProperties().getProperty('PIN_SALT') || 'allegro-sga';
  var dig = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + '|' + pin);
  return dig.map(function (b) { return ('0' + (b & 0xFF).toString(16)).slice(-2); }).join('');
}

/** Compara o valor armazenado (claro OU hash) com o PIN informado. */
function _authPinMatches(stored, pin) {
  var s = String(stored == null ? '' : stored).trim();
  if (!s || !pin) return false;
  if (/^[0-9a-f]{64}$/i.test(s)) return s.toLowerCase() === _authHashPin(pin);
  return _authNormalizePin(s) === pin;
}

// ── Lockout GLOBAL (ScriptProperties, janela de 5 min, 8 falhas) ──

function _authLockKey() { return 'PIN_FAIL_' + Math.floor(Date.now() / 300000); }

function _authCheckLockout() {
  try {
    var n = Number(PropertiesService.getScriptProperties().getProperty(_authLockKey()) || 0);
    if (n >= 8) return 300; // segundos aproximados até a janela virar
  } catch (e) {}
  return null;
}

function _authRegisterFailedAttempt() {
  try {
    var sp = PropertiesService.getScriptProperties();
    var k = _authLockKey();
    sp.setProperty(k, String(Number(sp.getProperty(k) || 0) + 1));
  } catch (e) {}
}

// ── Sessões por token (ScriptProperties) ──

function _authSessKey(token) { return 'SESS_' + token; }

function _authSessionCreate(user) {
  var token = Utilities.getUuid();
  var ttlH = _authGetSetupCalcTTL();
  var sess = {
    id:        user.id,
    name:      user.name,
    email:     user.email,
    role:      user.role,
    via:       'pin',
    loginAt:   nowISO(),
    expiresAt: Date.now() + ttlH * 60 * 60 * 1000
  };
  PropertiesService.getScriptProperties().setProperty(_authSessKey(token), JSON.stringify(sess));
  return token;
}

function _authSessionGet(token) {
  if (!token) return null;
  var sp = PropertiesService.getScriptProperties();
  var raw = sp.getProperty(_authSessKey(String(token)));
  if (!raw) return null;
  var sess = null;
  try { sess = JSON.parse(raw); } catch (e) { return null; }
  if (!sess || (sess.expiresAt && Date.now() > sess.expiresAt)) {
    try { sp.deleteProperty(_authSessKey(String(token))); } catch (e) {}
    return null;
  }
  sess._token = String(token);
  return sess;
}

/** Expurgo best-effort de sessões vencidas (roda a cada login). */
function _authSessionsCleanup() {
  try {
    var sp = PropertiesService.getScriptProperties();
    var all = sp.getProperties();
    Object.keys(all).forEach(function (k) {
      if (k.indexOf('SESS_') !== 0) return;
      try {
        var s = JSON.parse(all[k]);
        if (!s || (s.expiresAt && Date.now() > s.expiresAt)) sp.deleteProperty(k);
      } catch (e) { sp.deleteProperty(k); }
    });
  } catch (e) {}
}

// ---------------------------------------------------------------------------
// Login por PIN (PÚBLICA — única chamada sem token)
// ---------------------------------------------------------------------------

/**
 * @param {string|number} pinRaw - PIN de 4 dígitos.
 * @returns {{ok:true, data:{id,name,email,role,token}}|{ok:false, error:string}}
 */
function Api_loginByPin(pinRaw) {
  try {
    var lockSec = _authCheckLockout();
    if (lockSec) {
      return { ok: false, error: 'Muitas tentativas erradas. Tente de novo em alguns minutos.' };
    }

    var pin = _authNormalizePin(pinRaw);
    if (!pin || pin.length !== 4) {
      return { ok: false, error: 'PIN inválido. Digite 4 dígitos.' };
    }

    _authEnsurePinColumn();

    var rows = sheetToObjects(USERS_SHEET);
    var user = null;
    for (var i = 0; i < rows.length; i++) {
      if (_authPinMatches(rows[i].pin, pin)) { user = rows[i]; break; }
    }

    if (!user) {
      _authRegisterFailedAttempt();
      return { ok: false, error: 'PIN não encontrado. Verifique com o administrador.' };
    }

    var isActive = user.active === true || String(user.active).toUpperCase() === 'TRUE';
    if (!isActive) {
      return { ok: false, error: 'Usuário inativo. Contate o administrador.' };
    }

    // T7b: migração transparente — PIN em claro na planilha vira hash no 1º login
    if (!/^[0-9a-f]{64}$/i.test(String(user.pin || '').trim())) {
      try { updateRowByIdSafe(USERS_SHEET, user.id, { pin: _authHashPin(pin) }); } catch (eMig) {}
    }

    _authSessionsCleanup();
    var token = _authSessionCreate(user);
    appendAuditLog('LOGIN', 'USERS', user.id, 'PIN OK: ' + user.name);

    return { ok: true, data: { id: user.id, name: user.name, email: user.email, role: user.role, token: token } };

  } catch (e) {
    return { ok: false, error: e.message || 'Erro ao validar PIN.' };
  }
}

// ---------------------------------------------------------------------------
// Api_dispatch — ponto único de entrada autenticado
// Toda chamada Api_* do cliente passa por aqui (injeção no wrapper do
// FeedbackDiag). Resolve a sessão pelo token, seta __SGA_SESSION e invoca.
// ---------------------------------------------------------------------------

// Funções que podem rodar SEM sessão (nenhum dado sensível).
var _SGA_PUBLIC_FNS = { Api_getSystemMeta: 1 };

function Api_dispatch(token, fnName, args) {
  try {
    fnName = String(fnName || '');
    if (fnName.indexOf('Api_') !== 0 || fnName === 'Api_dispatch' || fnName === 'Api_loginByPin') {
      return { ok: false, error: 'Função não permitida: ' + fnName };
    }
    var g = (typeof globalThis !== 'undefined') ? globalThis : this;
    var fn = g[fnName];
    if (typeof fn !== 'function') {
      return { ok: false, error: 'Função inexistente: ' + fnName };
    }
    if (!_SGA_PUBLIC_FNS[fnName]) {
      var sess = _authSessionGet(token);
      if (!sess) return { ok: false, error: 'PIN_REQUIRED' };
      __SGA_SESSION = sess;
    }
    return fn.apply(null, args || []);
  } catch (e) {
    return { ok: false, error: e.message || 'Erro interno no dispatcher.' };
  } finally {
    __SGA_SESSION = null;
  }
}

// ---------------------------------------------------------------------------
// Sessão corrente — todos os Api_/Services usam estes helpers
// ---------------------------------------------------------------------------

function getCurrentUser() {
  return __SGA_SESSION || null;
}

function requireAuth() {
  if (__SGA_SESSION && __SGA_SESSION.via === 'pin') return __SGA_SESSION;
  throw new Error('PIN_REQUIRED');
}

function requireRole(allowedRoles) {
  const user = requireAuth();
  if (!allowedRoles.includes(user.role)) {
    throw new Error('Acesso negado para o perfil ' + user.role + '.');
  }
  return user;
}

// Compat: código antigo que chamava getAuthorizedUser (identidade Google).
function getAuthorizedUser() {
  return requireAuth();
}

/**
 * Info da sessão ativa — chamada no boot do app (via dispatcher).
 * Revalida que o usuário ainda existe e está ativo na aba USERS.
 */
function Api_getCurrentUserInfo() {
  try {
    var session = requireAuth();

    var rows = sheetToObjects(USERS_SHEET);
    var u = null;
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i].id) === String(session.id)) { u = rows[i]; break; }
    }
    if (!u) return { ok: false, error: 'PIN_REQUIRED' };
    var isActive = u.active === true || String(u.active).toUpperCase() === 'TRUE';
    if (!isActive) return { ok: false, error: 'Usuário foi desativado. Contate o administrador.' };

    return { ok: true, data: { id: u.id, name: u.name, email: u.email, role: u.role } };
  } catch (e) {
    return { ok: false, error: e.message === 'PIN_REQUIRED' ? 'PIN_REQUIRED' : e.message };
  }
}

// ---------------------------------------------------------------------------
// Logout
// ---------------------------------------------------------------------------

function logoutUser() {
  if (__SGA_SESSION) {
    try { appendAuditLog('LOGOUT', 'USERS', __SGA_SESSION.id, 'Logout: ' + __SGA_SESSION.name); } catch (e) {}
    if (__SGA_SESSION._token) {
      try { PropertiesService.getScriptProperties().deleteProperty(_authSessKey(__SGA_SESSION._token)); } catch (e) {}
    }
  }
}

function Api_logout() {
  try {
    logoutUser();
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}

// (Api_logoutUser vive em Domain.Users.gs e delega para logoutUser().)

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
// loginUser — @deprecated
// ---------------------------------------------------------------------------

function loginUser(userId) {
  return requireAuth();
}

// ---------------------------------------------------------------------------
// HELPER DE EMERGÊNCIA — rode no editor do Apps Script se ninguém conseguir
// logar. Ex.: setUserPin('jlffigueiredo01@gmail.com', '1234')
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

  for (var j = 0; j < rows.length; j++) {
    if (String(rows[j].id) === String(target.id)) continue;
    if (_authPinMatches(rows[j].pin, normPin)) {
      throw new Error('PIN ' + normPin + ' já está em uso por ' + rows[j].name + '. Escolha outro.');
    }
  }

  // T7b: grava já o hash (não o PIN em claro)
  updateRowByIdSafe(USERS_SHEET, target.id, { pin: _authHashPin(normPin) });
  appendAuditLog('SET_PIN', 'USERS', target.id, 'PIN definido para ' + target.name);
  Logger.log('PIN ' + normPin + ' atribuído a ' + target.name + ' (' + target.id + ')');
  return { id: target.id, name: target.name, pin: normPin };
}
