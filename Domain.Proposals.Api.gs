// ============================================================
// Domain.Proposals.Api.gs — ALLEGRO Business System
// Camada de API (ponto de entrada do frontend).
// Toda função pública retorna { ok: true, data: … }
// ou { ok: false, error: '…' }.
// Retrocompatibilidade com Domain.ProposalEngine.gs garantida
// pelos aliases na seção final deste arquivo.
// ============================================================

// -------------------------------------------------------
// API F2 — Funções canônicas
// -------------------------------------------------------

/**
 * Cria uma nova proposta.
 * @param {Object} data
 * @return {{ok:boolean, data?:Object, error?:string}}
 */
function Api_propCreate(data) {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'TECNICO']);
    return { ok: true, data: propSvcCreate(data) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Avança o status de uma proposta.
 * @param {string} id
 * @param {string} novoStatus
 * @param {Object} [opcoes]  — { motivo_perda, force_revisao_bloqueante }
 * @return {{ok:boolean, data?:Object, error?:string}}
 */
function Api_propUpdateStatus(id, novoStatus, opcoes) {
  try {
    // CANCELADA requer DIRETOR_TECNICO exclusivamente (ECOSSISTEMA_V2 §2)
    if (novoStatus === 'CANCELADA') {
      var user = requireRole(['DIRETOR_TECNICO']);
    } else {
      var user = requireRole([
        'DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN', 'TECNICO'
      ]);
    }
    var result = propSvcUpdateStatus(id, novoStatus, user.id, user.role, opcoes || {});

    // Se aprovando uma revisão (→ APROVADA_ENVIO), marca anteriores como SUBSTITUIDA
    if (novoStatus === 'APROVADA_ENVIO') {
      propSvcSubstituirAnterior(id);
    }
    return { ok: true, data: result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Lista todas as propostas, com filtros opcionais por status e company_id.
 * @param {Object} [filters]  — { status?, company_id? }
 * @return {{ok:boolean, data?:Object[], error?:string}}
 */
function Api_propGetAll(filters) {
  try {
    requireRole([
      'DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN', 'TECNICO'
    ]);
    var proposals = propRepoGetAll();
    if (filters && filters.status) {
      proposals = proposals.filter(function(p) { return p.status === filters.status; });
    }
    if (filters && filters.company_id) {
      proposals = proposals.filter(function(p) { return p.client_id === filters.company_id; });
    }
    // Ordena decrescente por created_at (compatível com comportamento antigo)
    proposals.sort(function(a, b) {
      return (b.created_at || '').localeCompare(a.created_at || '');
    });
    return { ok: true, data: proposals };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Retorna uma proposta pelo ID.
 * @param {string} id
 * @return {{ok:boolean, data?:Object, error?:string}}
 */
function Api_propGetById(id) {
  try {
    requireRole([
      'DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN', 'TECNICO'
    ]);
    var p = propRepoGetById(id);
    if (!p) return { ok: false, error: 'Proposta não encontrada: ' + id };
    return { ok: true, data: p };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Cria revisão de uma proposta ENVIADA.
 * @param {string} proposalId
 * @return {{ok:boolean, data?:Object, error?:string}}
 */
function Api_propCriarRevisao(proposalId) {
  try {
    var user = requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL']);
    return { ok: true, data: propSvcCriarRevisao(proposalId, user.id) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Vincula o JSON de precificação (prcCalcProposta) a uma proposta.
 * @param {string}        proposalId
 * @param {Object|string} pricingJson
 * @return {{ok:boolean, error?:string}}
 */
function Api_propAttachPricing(proposalId, pricingJson) {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'TECNICO']);
    if (!pricingJson) throw new Error('pricingJson é obrigatório.');
    var jsonStr = (typeof pricingJson === 'string')
      ? pricingJson
      : JSON.stringify(pricingJson);
    propRepoUpdate(proposalId, { pricing_json: jsonStr, updated_at: nowISO() });
    appendAuditLog('PROPOSAL_PRICING_ATTACH', 'PROPOSALS', proposalId,
      'pricing_json vinculado');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Retorna estatísticas agregadas para o dashboard.
 * Inclui contagens por todos os status F2 além dos legados.
 * @return {{ok:boolean, data?:Object, error?:string}}
 */
function Api_propGetStats() {
  try {
    requireRole([
      'DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN', 'TECNICO'
    ]);
    var rows = propRepoGetAll();
    var total = rows.length;
    var totalValue = 0;
    var byStatus = {};

    // Inicializa com todos os status F2
    var allStatuses = Object.keys(PROPOSAL_STATUS);
    for (var s = 0; s < allStatuses.length; s++) {
      byStatus[PROPOSAL_STATUS[allStatuses[s]]] = 0;
    }

    for (var i = 0; i < rows.length; i++) {
      totalValue += safeNumber(rows[i].total_value);
      var st = rows[i].status || '';
      byStatus[st] = (byStatus[st] || 0) + 1;
    }
    return {
      ok: true,
      data: {
        total:      total,
        totalValue: totalValue,
        byStatus:   byStatus,
        // Atalhos semânticos para o dashboard
        emAberto:   (byStatus['DEMANDA'] || 0) +
                    (byStatus['LEVANTAMENTO'] || 0) +
                    (byStatus['PROPOSTA_GERADA'] || 0) +
                    (byStatus['EM_REVISAO'] || 0) +
                    (byStatus['APROVADA_ENVIO'] || 0),
        enviadas:   byStatus['ENVIADA']  || 0,
        fechadas:   byStatus['FECHADA']  || 0,
        recusadas:  byStatus['RECUSADA'] || 0
      }
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// -------------------------------------------------------
// Aliases de retrocompatibilidade com Domain.ProposalEngine.gs
// Nomes das funções Api_* que existiam no arquivo antigo e
// podem ser chamados pelo frontend ou por outros módulos.
// -------------------------------------------------------

/**
 * Retrocompat: Api_getProposals → Api_propGetAll
 * O ProposalEngine original não aceitava filtros, mantemos assinatura
 * compatível (filtros opcionais).
 */
function Api_getProposals(filters) {
  return Api_propGetAll(filters);
}

/**
 * Retrocompat: Api_getProposal(id) → Api_propGetById(id)
 */
function Api_getProposal(id) {
  return Api_propGetById(id);
}

/**
 * Retrocompat: Api_createProposal(data) → Api_propCreate(data)
 * O ProposalEngine original usava client_id/client_name; propSvcCreate
 * aceita ambos (company_id ou client_id).
 */
function Api_createProposal(data) {
  return Api_propCreate(data);
}

/**
 * Retrocompat: Api_updateProposal(id, updates)
 * Se updates.status estiver presente, rota para Api_propUpdateStatus.
 * Caso contrário, aplica atualização de campos simples via Repository
 * (e.g. scope_text, observations, etc.).
 */
function Api_updateProposal(id, updates) {
  if (updates && updates.status) {
    return Api_propUpdateStatus(id, updates.status, updates);
  }
  try {
    requireRole([
      'DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN', 'TECNICO'
    ]);
    if (!id)      throw new Error('id é obrigatório.');
    if (!updates) throw new Error('updates é obrigatório.');

    var ALLOWED = [
      'scope_text', 'items_json', 'startup_value',
      'payment_terms', 'delivery_days', 'validity_days',
      'observations', 'location', 'responsible', 'type'
    ];
    var sanitized = {};
    ALLOWED.forEach(function(field) {
      if (updates[field] !== undefined) sanitized[field] = updates[field];
    });
    if (updates.startup_value !== undefined) {
      sanitized.startup_value = safeNumber(updates.startup_value);
    }
    sanitized.updated_at = nowISO();
    propRepoUpdate(id, sanitized);
    appendAuditLog('PROPOSAL_UPDATE', 'PROPOSALS', id, sanitized);
    return { ok: true, data: propRepoGetById(id) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Retrocompat: Api_getProposalStats → Api_propGetStats
 */
function Api_getProposalStats() {
  return Api_propGetStats();
}

/**
 * Retrocompat: Api_reviewProposalScope → propSvcRevisarEscopoPorIA
 */
function Api_reviewProposalScope(proposalId, scopeText) {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN', 'TECNICO']);
    return propSvcRevisarEscopoPorIA(proposalId, scopeText);
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Retrocompat: Api_generateProposalHTML → propSvcGerarHTML
 */
function Api_generateProposalHTML(proposalId) {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN', 'TECNICO']);
    return propSvcGerarHTML(proposalId);
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
