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
  'notes', 'form_date', 'legacy_quote_number', 'import_source', 'created_at'
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
    requireAuth();
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
    requireAuth();
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
    requireAuth();
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
    requireAuth();
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
    requireAuth();
    if (!id) throw new Error('id is required');
    if (!status) throw new Error('status is required');

    // Fetch current status for timeline
    var result = Api_getOpportunity(id);
    if (!result.ok) throw new Error(result.error);
    var prevStatus = result.data.status || '';

    updateRowById(OPPORTUNITIES_SHEET, id, { status: status });

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
    requireAuth();
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

    updateRowById(OPPORTUNITIES_SHEET, id, updates);

    appendAuditLog('UPDATE', 'OPPORTUNITY', id, 'Fields updated: ' + Object.keys(updates).join(', '));

    return { ok: true };
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
    requireAuth();
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
