// =============================================================================
// Domain.Opportunities.gs — ALLEGRO Business System
// CRM Opportunities domain API
// =============================================================================

// OPPORTUNITIES_SHEET already defined as const in Domain.Import.gs
var OPPORTUNITIES_HEADERS = [
  'id', 'company_id', 'company_name', 'contact_id', 'representative',
  'client_type', 'status', 'product', 'max_temp', 'qty_sensors_xt',
  'qty_sensors_ht', 'qty_sensors_probe', 'installation_point',
  'automation_detail', 'hydro_view', 'infra_distance', 'tech_notes',
  'notes', 'form_date', 'legacy_quote_number', 'import_source', 'created_at',
  'points_json', 'pricing_summary', 'updated_at'
];

var OPPORTUNITY_STATUSES = [
  'Lead',
  'Elaborando proposta',
  'Proposta enviada',
  'Proposta fechada',
  'Proposta recusada',
  'Cancelada',
  'Não elaborada'
];

// ---------------------------------------------------------------------------
// Api_getOpportunities
// Returns all opportunities, newest first.
// ---------------------------------------------------------------------------
function Api_getOpportunities() {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN', 'TECNICO']);
    var rows = sheetToObjects(OPPORTUNITIES_SHEET);
    rows.sort(function (a, b) {
      var da = a.created_at || '';
      var db = b.created_at || '';
      return db < da ? -1 : db > da ? 1 : 0;
    });
    return { ok: true, data: rows };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ---------------------------------------------------------------------------
// Api_getOpportunitiesByCompany
// Returns all opportunities for a given company_id, newest first.
// ---------------------------------------------------------------------------
function Api_getOpportunitiesByCompany(companyId) {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN', 'TECNICO']);
    if (!companyId) throw new Error('companyId is required');
    var rows = sheetToObjects(OPPORTUNITIES_SHEET);
    var filtered = rows.filter(function (r) {
      return r.company_id === companyId;
    });
    filtered.sort(function (a, b) {
      var da = a.created_at || '';
      var db = b.created_at || '';
      return db < da ? -1 : db > da ? 1 : 0;
    });
    return { ok: true, data: filtered };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ---------------------------------------------------------------------------
// Api_getOpportunity
// Returns a single opportunity by id.
// ---------------------------------------------------------------------------
function Api_getOpportunity(id) {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN', 'TECNICO']);
    if (!id) throw new Error('id is required');
    var rows = sheetToObjects(OPPORTUNITIES_SHEET);
    var opp = null;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].id === id) { opp = rows[i]; break; }
    }
    if (!opp) throw new Error('Opportunity not found: ' + id);
    return { ok: true, data: opp };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ---------------------------------------------------------------------------
// Api_createOpportunity
// Creates a new opportunity row.
// ---------------------------------------------------------------------------
function Api_createOpportunity(data) {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'TECNICO']);
    if (!data) throw new Error('data is required');

    var id = 'OPP-' + getAndIncrementCounter('OPPORTUNITY_COUNTER');
    var now = nowISO();

    var obj = {
      id: id,
      company_id: data.company_id || '',
      company_name: data.company_name || '',
      contact_id: data.contact_id || '',
      representative: data.representative || '',
      client_type: data.client_type || '',
      status: data.status || 'Lead',
      product: data.product || '',
      max_temp: data.max_temp || '',
      qty_sensors_xt: data.qty_sensors_xt || '',
      qty_sensors_ht: data.qty_sensors_ht || '',
      qty_sensors_probe: data.qty_sensors_probe || '',
      installation_point: data.installation_point || '',
      automation_detail: data.automation_detail || '',
      hydro_view: data.hydro_view || '',
      infra_distance: data.infra_distance || '',
      tech_notes: data.tech_notes || '',
      notes: data.notes || '',
      form_date: data.form_date || '',
      legacy_quote_number: data.legacy_quote_number || '',
      import_source: data.import_source || '',
      created_at: now
    };

    appendRowToSheet(OPPORTUNITIES_SHEET, obj, OPPORTUNITIES_HEADERS);

    appendAuditLog('CREATE', 'OPPORTUNITY', id, 'Opportunity created for company: ' + obj.company_name);
    appendTimelineEvent('OPPORTUNITY', id, 'CREATED', 'Oportunidade criada com status: ' + obj.status);

    return { ok: true, id: id };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ---------------------------------------------------------------------------
// Api_updateOpportunityStatus
// Updates status and appends a timeline event.
// ---------------------------------------------------------------------------
function Api_updateOpportunityStatus(id, status, note) {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL']);
    if (!id) throw new Error('id is required');
    if (!status) throw new Error('status is required');

    // Fetch current status for timeline
    var result = Api_getOpportunity(id);
    if (!result.ok) throw new Error(result.error);
    var prevStatus = result.data.status || '';

    updateRowByIdSafe(OPPORTUNITIES_SHEET, id, { status: status });

    var description = 'Status: ' + prevStatus + ' → ' + status;
    if (note) description += '. Note: ' + note;
    appendTimelineEvent('OPPORTUNITY', id, 'STATUS_CHANGE', description);

    appendAuditLog('UPDATE_STATUS', 'OPPORTUNITY', id, description);

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ---------------------------------------------------------------------------
// Api_updateOpportunity
// Updates arbitrary fields on an existing opportunity.
// ---------------------------------------------------------------------------
function Api_updateOpportunity(id, data) {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'TECNICO']);
    if (!id) throw new Error('id is required');
    if (!data) throw new Error('data is required');

    // Strip protected fields
    var updates = {};
    var prohibited = ['id', 'created_at'];
    for (var key in data) {
      if (data.hasOwnProperty(key) && prohibited.indexOf(key) === -1) {
        updates[key] = data[key];
      }
    }

    updateRowByIdSafe(OPPORTUNITIES_SHEET, id, updates);

    appendAuditLog('UPDATE', 'OPPORTUNITY', id, 'Fields updated: ' + Object.keys(updates).join(', '));

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ---------------------------------------------------------------------------
// Api_oppSavePoints
// Salva o levantamento técnico de pontos na oportunidade.
// ---------------------------------------------------------------------------
/**
 * Salva o levantamento técnico de pontos na oportunidade.
 * @param {string} oppId - ID da oportunidade.
 * @param {Array}  points - Array de { descricao, produto_code, comprimento_m, fd }.
 * @returns {{ ok: boolean, error?: string }}
 */
function Api_oppSavePoints(oppId, points) {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'TECNICO']);
    if (!oppId) throw new Error('oppId é obrigatório.');
    if (!Array.isArray(points)) throw new Error('points deve ser um array.');
    for (var i = 0; i < points.length; i++) {
      if (!points[i].comprimento_m && points[i].comprimento_m !== 0) {
        throw new Error('Ponto ' + (i + 1) + ': comprimento_m é obrigatório.');
      }
    }
    updateRowByIdSafe(OPPORTUNITIES_SHEET, oppId, {
      points_json: JSON.stringify(points),
      updated_at: nowISO()
    });
    appendAuditLog('OPP_POINTS_SAVE', 'OPPORTUNITIES', oppId, points.length + ' pontos salvos');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ---------------------------------------------------------------------------
// Api_oppGetPoints
// Retorna os pontos de levantamento da oportunidade.
// ---------------------------------------------------------------------------
/**
 * Retorna os pontos de levantamento técnico da oportunidade.
 * @param {string} oppId - ID da oportunidade.
 * @returns {{ ok: boolean, data?: Array, error?: string }}
 */
function Api_oppGetPoints(oppId) {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN', 'TECNICO']);
    if (!oppId) throw new Error('oppId é obrigatório.');
    var rows = sheetToObjects(OPPORTUNITIES_SHEET);
    var opp = null;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].id === oppId) { opp = rows[i]; break; }
    }
    if (!opp) return { ok: false, error: 'Oportunidade não encontrada.' };
    var points = [];
    try { points = JSON.parse(opp.points_json || '[]'); } catch (e) {}
    return { ok: true, data: points };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ---------------------------------------------------------------------------
// Api_oppGerarProposta
// Gera proposta a partir de uma oportunidade via motor de precificação.
// ---------------------------------------------------------------------------
/**
 * Gera uma proposta a partir de uma oportunidade.
 * Chama prcCalcProposta (motor de precificação, F1) e cria a proposta via
 * propSvcCreate (Domain.Proposals.Service.gs, F2).
 * @param {string} oppId  - ID da oportunidade.
 * @param {Object} extras - Parâmetros logísticos: { distancia_km, dias_campo, n_pessoas, n_viagens }.
 * @returns {{ ok: boolean, data?: { proposal: Object, pricing: Object }, error?: string }}
 */
function Api_oppGerarProposta(oppId, extras) {
  try {
    var user = requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'TECNICO']);
    extras = extras || {};

    // --- Carrega a oportunidade ---
    var rows = sheetToObjects(OPPORTUNITIES_SHEET);
    var opp = null;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].id === oppId) { opp = rows[i]; break; }
    }
    if (!opp) throw new Error('Oportunidade não encontrada: ' + oppId);

    // --- Carrega os pontos ---
    var points = [];
    try { points = JSON.parse(opp.points_json || '[]'); } catch (e) {}
    if (!points.length) {
      throw new Error('Oportunidade sem levantamento de pontos. Use Api_oppSavePoints primeiro.');
    }

    // --- Agrupa produtos para a lista de materiais ---
    var productGroups = {};
    for (var j = 0; j < points.length; j++) {
      var code = points[j].produto_code;
      if (!productGroups[code]) {
        productGroups[code] = { code: code, qty: 0 };
      }
      productGroups[code].qty += 1;
    }
    var items = [];
    for (var k in productGroups) {
      if (Object.prototype.hasOwnProperty.call(productGroups, k)) {
        items.push(productGroups[k]);
      }
    }

    // --- Monta input para o motor de precificação ---
    var pricingInput = {
      items: items,
      points: points.map(function (p) {
        return { descricao: p.descricao, comprimento_m: p.comprimento_m, fd: p.fd || 1.0 };
      }),
      n_sensores: points.length,
      distancia_km: extras.distancia_km || 0,
      dias_campo: extras.dias_campo || null,
      n_pessoas: extras.n_pessoas || 2,
      n_viagens: extras.n_viagens || 1
    };

    // --- Chama o motor de precificação (F1) ---
    var pricingResult = prcCalcProposta(pricingInput);

    // --- Cria a proposta (F2) ---
    var proposalData = {
      title: (opp.name || opp.title || 'Proposta') + ' — ' + (opp.company_name || ''),
      company_id: opp.company_id,
      opportunity_id: oppId,
      pricing_json: JSON.stringify(pricingResult),
      total_estimado: pricingResult.total_proposta_brl,
      status: 'PROPOSTA_GERADA',
      created_by: user.id
    };
    var proposal = propSvcCreate(proposalData);

    // --- Atualiza oportunidade com resumo de precificação ---
    var summary = 'R$' + pricingResult.total_proposta_brl.toFixed(2) +
      ' (margem: ' + (pricingResult.margem_global * 100).toFixed(1) + '%)';
    updateRowByIdSafe(OPPORTUNITIES_SHEET, oppId, {
      pricing_summary: summary,
      updated_at: nowISO()
    });
    appendAuditLog('OPP_GERAR_PROPOSTA', 'OPPORTUNITIES', oppId,
      'Proposta ' + proposal.id + ' gerada. ' + summary);

    return { ok: true, data: { proposal: proposal, pricing: pricingResult } };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ---------------------------------------------------------------------------
// Api_getOpportunityStats
// Returns total count, count by status, and total active (non-closed/cancelled).
// ---------------------------------------------------------------------------
function Api_getOpportunityStats() {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN', 'TECNICO']);
    var rows = sheetToObjects(OPPORTUNITIES_SHEET);

    var byStatus = {};
    for (var s = 0; s < OPPORTUNITY_STATUSES.length; s++) {
      byStatus[OPPORTUNITY_STATUSES[s]] = 0;
    }

    for (var i = 0; i < rows.length; i++) {
      var st = rows[i].status || '';
      if (byStatus.hasOwnProperty(st)) {
        byStatus[st]++;
      } else {
        byStatus[st] = (byStatus[st] || 0) + 1;
      }
    }

    var inactiveStatuses = ['Proposta fechada', 'Proposta recusada', 'Cancelada', 'Não elaborada'];
    var totalActive = 0;
    for (var j = 0; j < rows.length; j++) {
      if (inactiveStatuses.indexOf(rows[j].status) === -1) {
        totalActive++;
      }
    }

    return {
      ok: true,
      data: {
        total: rows.length,
        byStatus: byStatus,
        totalActive: totalActive
      }
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
