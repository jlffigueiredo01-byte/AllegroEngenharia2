// ============================================================
// Domain.Email.Api.gs — ALLEGRO Business System
// Endpoints públicos do módulo de e-mail.
// Todas as funções retornam { ok, data } ou { ok, error }.
// ECOSSISTEMA_V2 §6.3 + ADENDO_V2_1 §G
// ============================================================

/**
 * Envia e-mail usando template cadastrado.
 * @param {string} templateCode - Código do template.
 * @param {string} toEmail - Destinatário.
 * @param {Object} vars - Variáveis de substituição.
 * @param {Object} [opts] - Opções extras: { cc, bcc, attachments }.
 * @returns {{ok: boolean, data?: Object, error?: string}}
 */
function Api_emailEnviar(templateCode, toEmail, vars, opts) {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL']);
    return { ok: true, data: emailSvcEnviar(templateCode, toEmail, vars, opts || {}) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Envia proposta por e-mail para o contato principal da empresa vinculada.
 * @param {string} proposalId - ID da proposta.
 * @param {string} [pdfFileId] - ID do PDF no Google Drive (opcional).
 * @returns {{ok: boolean, data?: Object, error?: string}}
 */
function Api_emailEnviarProposta(proposalId, pdfFileId) {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL']);
    return { ok: true, data: emailSvcEnviarProposta(proposalId, pdfFileId) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Retorna todos os templates de e-mail cadastrados.
 * @returns {{ok: boolean, data?: Object[], error?: string}}
 */
function Api_emailGetTemplates() {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL']);
    return { ok: true, data: emailRepoGetAllTemplates() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Atualiza campos de um template existente.
 * O campo 'code' não pode ser alterado (é a chave de lookup).
 * @param {string} id - ID do template (ex: 'TMPL-001').
 * @param {Object} updates - Campos a atualizar.
 * @returns {{ok: boolean, data?: boolean, error?: string}}
 */
function Api_emailUpdateTemplate(id, updates) {
  try {
    requireRole(['DIRETOR_TECNICO']);
    // 'code' é chave de lookup — não pode ser alterado via API
    delete updates.code;
    return { ok: true, data: emailRepoUpdateTemplate(id, updates) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Retorna a cota diária de e-mails restante para a conta atual.
 * Útil para verificar proximidade do limite de 100 e-mails/dia (consumer).
 * @returns {{ok: boolean, data?: {quota_remaining: number}, error?: string}}
 */
function Api_emailGetQuota() {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN']);
    return { ok: true, data: { quota_remaining: MailApp.getRemainingDailyQuota() } };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
