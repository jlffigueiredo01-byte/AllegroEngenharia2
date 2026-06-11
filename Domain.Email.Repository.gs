// ============================================================
// Domain.Email.Repository.gs — ALLEGRO Business System
// Acesso à aba EMAIL_TEMPLATES.
// ECOSSISTEMA_V2 §6.3 + ADENDO_V2_1 §G
// ============================================================

/**
 * Busca um template ativo pelo código.
 * @param {string} code - Código do template (ex: 'PROPOSTA_ENVIADA').
 * @returns {Object|null} Objeto do template ou null se não encontrado.
 */
function emailRepoGetTemplate(code) {
  var rows = sheetToObjects(EMAIL_TEMPLATES_SHEET);
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].code === code && rows[i].active === 'TRUE') return rows[i];
  }
  return null;
}

/**
 * Retorna todos os templates cadastrados (ativos e inativos).
 * @returns {Object[]} Array de objetos com todos os templates.
 */
function emailRepoGetAllTemplates() {
  return sheetToObjects(EMAIL_TEMPLATES_SHEET);
}

/**
 * Atualiza campos de um template pelo ID.
 * Aplica LockService para evitar escrita concorrente.
 * @param {string} id - ID do template (ex: 'TMPL-001').
 * @param {Object} updates - Campos a atualizar (exceto 'code').
 * @returns {boolean} true se a linha foi encontrada e atualizada.
 */
function emailRepoUpdateTemplate(id, updates) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    updates.updated_at = nowISO();
    return updateRowById(EMAIL_TEMPLATES_SHEET, id, updates);
  } finally {
    lock.releaseLock();
  }
}
