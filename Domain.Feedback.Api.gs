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

/** Regrava o .md do dia agora (teste manual). O arquivo já é atualizado a
 *  cada relato; isto força a regravação sob demanda. Só diretor técnico. */
function Api_fbCompilarAgora() {
  try {
    requireRole(['DIRETOR_TECNICO']);
    return { ok: true, data: _fbRegravarArquivoDoDia() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
