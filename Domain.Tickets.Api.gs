// =============================================================================
// Domain.Tickets.Api.gs
// Allegro Business System — Fase F6
// Ponto de entrada do cliente (google.script.run) para o domínio Tickets.
// Todas as funções retornam { ok: true, data } ou { ok: false, error }.
// =============================================================================

/**
 * Abre um novo ticket de atendimento.
 * Papéis permitidos: todos.
 *
 * @param {Object} data - Dados do ticket (ver tktSvcAbrir para campos aceitos).
 * @returns {{ok:boolean, data:Object}|{ok:boolean, error:string}}
 */
function Api_tktAbrir(data) {
  try {
    requireAuth();
    if (!data) throw new Error('Dados do ticket são obrigatórios.');
    var result = tktSvcAbrir(data);
    return { ok: true, data: result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Retorna todos os tickets do sistema.
 * TECNICO vê apenas os tickets atribuídos a ele.
 * Aceita filtros opcionais: { company_id, status, priority, serial_id }.
 * Papéis permitidos: todos.
 *
 * @param {Object} [filters] - Filtros opcionais.
 * @param {string} [filters.company_id] - Filtrar por empresa.
 * @param {string} [filters.status]     - Filtrar por status.
 * @param {string} [filters.priority]   - Filtrar por prioridade.
 * @param {string} [filters.serial_id]  - Filtrar por serial da base instalada.
 * @returns {{ok:boolean, data:Object[]}|{ok:boolean, error:string}}
 */
function Api_tktGetAll(filters) {
  try {
    var user = requireAuth();
    var todos = tktRepoGetAll();

    // TECNICO vê apenas os atribuídos a ele
    if (user.role === ROLES.TECNICO) {
      todos = todos.filter(function(t) { return t.assigned_to === user.id; });
    }

    if (filters) {
      if (filters.company_id) {
        todos = todos.filter(function(t) { return t.company_id === filters.company_id; });
      }
      if (filters.status) {
        todos = todos.filter(function(t) { return t.status === filters.status; });
      }
      if (filters.priority) {
        todos = todos.filter(function(t) { return t.priority === filters.priority; });
      }
      if (filters.serial_id) {
        todos = todos.filter(function(t) { return t.serial_id === filters.serial_id; });
      }
    }

    return { ok: true, data: sanitizeForClient(todos) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Retorna um ticket pelo ID.
 * Papéis permitidos: todos.
 *
 * @param {string} id - ID do ticket (ex: TKT-00001).
 * @returns {{ok:boolean, data:Object}|{ok:boolean, error:string}}
 */
function Api_tktGetById(id) {
  try {
    requireAuth();
    if (!id) throw new Error('ID do ticket é obrigatório.');
    var tkt = tktRepoGetById(id);
    if (!tkt) throw new Error('Ticket não encontrado: ' + id);
    return { ok: true, data: tkt };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Atualiza o status de um ticket com nota opcional.
 * Papéis permitidos: DIRETOR_TECNICO, TECNICO.
 *
 * @param {string} id        - ID do ticket.
 * @param {string} novoStatus - Novo status (ver TICKET_STATUS).
 * @param {string} [notes]   - Nota sobre a mudança.
 * @returns {{ok:boolean, data:Object}|{ok:boolean, error:string}}
 */
function Api_tktUpdateStatus(id, novoStatus, notes) {
  try {
    requireRole([ROLES.DIRETOR_TECNICO, ROLES.TECNICO]);
    if (!id)        throw new Error('ID do ticket é obrigatório.');
    if (!novoStatus) throw new Error('Novo status é obrigatório.');
    var result = tktSvcUpdateStatus(id, novoStatus, notes || '');
    return { ok: true, data: result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Fecha um ticket (confirmação do cliente ou diretoria técnica).
 * O ticket deve estar com status RESOLVIDO antes de ser fechado.
 * Papéis permitidos: DIRETOR_TECNICO, DIRETOR_COMERCIAL.
 *
 * @param {string} id - ID do ticket.
 * @returns {{ok:boolean, data:Object}|{ok:boolean, error:string}}
 */
function Api_tktFechar(id) {
  try {
    requireRole([ROLES.DIRETOR_TECNICO, ROLES.DIRETOR_COMERCIAL]);
    if (!id) throw new Error('ID do ticket é obrigatório.');
    var result = tktSvcFechar(id);
    return { ok: true, data: result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Retorna tickets com SLA em risco (≥ 80% do tempo de resolução decorrido ou já estourado).
 * Papéis permitidos: DIRETOR_TECNICO.
 *
 * @returns {{ok:boolean, data:Object[]}|{ok:boolean, error:string}}
 */
function Api_tktGetBySla() {
  try {
    requireRole([ROLES.DIRETOR_TECNICO]);
    return { ok: true, data: tktSvcGetEmRiscoSla() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}


/** Comentário no chamado (alimentação do 8D). */
function Api_tktComentar(ticketId, texto) {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN', 'TECNICO']);
    return { ok: true, data: tktSvcComentar(ticketId, texto) };
  } catch (e) { return { ok: false, error: e.message }; }
}

/** Anexo (base64) na pasta do chamado no Drive. */
function Api_tktAnexar(ticketId, payload) {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN', 'TECNICO']);
    if (!payload) throw new Error('payload é obrigatório.');
    return { ok: true, data: tktSvcAnexar(ticketId, payload.base64, payload.mime, payload.name) };
  } catch (e) { return { ok: false, error: e.message }; }
}

/** Detalhe completo (ticket + interações + empresa). */
function Api_tktGetDetail(ticketId) {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN', 'TECNICO']);
    return { ok: true, data: sanitizeForClient(tktSvcGetDetail(ticketId)) };
  } catch (e) { return { ok: false, error: e.message }; }
}

/** Resolver com solução + causa raiz (4D/5D do 8D-lite). */
function Api_tktResolver(ticketId, resolutionNotes, rootCause) {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'TECNICO']);
    var r = tktSvcResolver(ticketId, resolutionNotes, rootCause);
    _tktAddUpdate(ticketId, 'STATUS', '✅ RESOLVIDO — Solução: ' + (resolutionNotes || '—') +
      (rootCause ? ' | Causa raiz: ' + rootCause : ''));
    return { ok: true, data: r };
  } catch (e) { return { ok: false, error: e.message }; }
}


/** Lança um custo de resolução no chamado. */
function Api_tktLancarCusto(ticketId, descricao, valor) {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN', 'TECNICO']);
    return { ok: true, data: tktSvcLancarCusto(ticketId, descricao, valor) };
  } catch (e) { return { ok: false, error: e.message }; }
}

/** Endgate: classifica origem do erro + quem paga e fecha o chamado. */
function Api_tktClassificarEFechar(ticketId, origemErro, cobrancaDe, licao) {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'TECNICO']);
    return { ok: true, data: tktSvcClassificarEFechar(ticketId, origemErro, cobrancaDe, licao) };
  } catch (e) { return { ok: false, error: e.message }; }
}

/** Financeiro: marca a cobrança pendente como realizada. */
function Api_tktMarcarCobrado(ticketId) {
  try {
    requireRole(['DIRETOR_TECNICO', 'FINANCEIRO_ADMIN']);
    return { ok: true, data: tktSvcMarcarCobrado(ticketId) };
  } catch (e) { return { ok: false, error: e.message }; }
}
