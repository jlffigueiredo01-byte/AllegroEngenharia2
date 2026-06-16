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

/**
 * GUIA DE MELHORIAS (admin): todos os feedbacks de todos os usuários.
 * Restrito a DIRETOR_TECNICO — quebra deliberada do isolamento do "Meus
 * reportes", por isso o RBAC estrito. (FB-00004/FB-00012)
 */
function Api_fbGetAll() {
  try {
    requireRole(['DIRETOR_TECNICO']);
    var rows = sheetToObjects(FEEDBACK_SHEET);
    rows.sort(function (a, b) { return String(b.criado_em).localeCompare(String(a.criado_em)); });
    return { ok: true, data: sanitizeForClient(rows) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Marca o status de um relato (admin). Escreve na aba FEEDBACKS + auditoria.
 * O usuário que criou o relato vê o novo status em "Meus reportes" (ciclo
 * fechado). Só DIRETOR_TECNICO.
 */
function Api_fbMarcarStatus(id, novoStatus, nota) {
  try {
    requireRole(['DIRETOR_TECNICO']);
    if (!id) throw new Error('id é obrigatório.');
    var validos = ['NOVO', 'COMPILADO', 'EM_ANALISE', 'APROVADO', 'IMPLEMENTADO', 'RECUSADO'];
    if (validos.indexOf(novoStatus) === -1) throw new Error('Status inválido: ' + novoStatus);
    var patch = { status: novoStatus, atualizado_em: nowISO() };
    if (nota !== undefined && nota !== null) patch.resolucao_nota = String(nota);
    updateRowByIdSafe(FEEDBACK_SHEET, id, patch);
    appendAuditLog('FEEDBACK_STATUS', 'FEEDBACKS', id, novoStatus + (nota ? ' · ' + nota : ''));

    // MESA DE COMANDO: ao APROVAR, gera uma tarefa para os agentes na pasta
    // SISTEMA_TAREFAS do Drive (caixa de entrada deles). Verde/amarelo viram
    // tarefa de IMPLEMENTAR; vermelho vira tarefa de PROPOR (salvaguarda — não
    // vira código no impulso). best-effort: não derruba a marcação de status.
    var tarefa = null;
    if (novoStatus === 'APROVADO') {
      try { tarefa = _fbGerarTarefaAgente(id, nota); } catch (eT) { Logger.log('tarefa: ' + eT.message); }
    }
    return { ok: true, data: { id: id, status: novoStatus, tarefa: tarefa } };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
