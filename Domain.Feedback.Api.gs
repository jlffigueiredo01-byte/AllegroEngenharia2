// =============================================================================
// Domain.Feedback.Api.gs — SGA
// Camada de API do ciclo de feedback. Envelope {ok,data}/{ok,error}.
// =============================================================================

/** Registra um relato (qualquer usuário autenticado). */
function Api_fbCriar(data) {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN', 'TECNICO']);
    return { ok: true, data: fbSvcCriar(data) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/** Relatos do próprio usuário, com status (fechamento do ciclo). */
function Api_fbMeus() {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN', 'TECNICO']);
    return { ok: true, data: sanitizeForClient(fbSvcMeus()) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/** Regrava TODOS os relatos NOVO como arquivos FB-xxxxx.md (teste/recuperação).
 *  Cada relato já gera seu .md na criação; isto força a regravação de todos os
 *  pendentes de uma vez. Só diretor técnico. */
function Api_fbCompilarAgora() {
  try {
    requireRole(['DIRETOR_TECNICO']);
    return { ok: true, data: _fbRegravarTodosNovos() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
