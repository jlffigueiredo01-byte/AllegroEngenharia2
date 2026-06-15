// ============================================================
// Domain.Quotes.gs — ALLEGRO Business System
// CRM Quote management (legacy-imported data + new entries)
// ============================================================

var QUOTES_SHEET = 'QUOTE_HEADERS';

var QUOTE_HEADERS = [
  'id', 'legacy_quote_number', 'legacy_quote_number_final',
  'year', 'company_id', 'company_name', 'opportunity_id',
  'representative', 'client_type', 'total_value_brl',
  'status', 'closing_date', 'state', 'notes',
  'import_source', 'created_at'
];

var QUOTE_STATUSES = [
  'Elaborando proposta',
  'Proposta enviada',
  'Proposta fechada',
  'Proposta recusada',
  'Cancelada',
  'Não elaborada'
];

// ------------------------------------------------------------
// Api_getQuotes — returns all quotes, newest first
// ------------------------------------------------------------
function Api_getQuotes() {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN', 'TECNICO']);
    var rows = sheetToObjects(QUOTES_SHEET);
    rows.sort(function(a, b) {
      return (b.created_at || '').localeCompare(a.created_at || '');
    });
    return { ok: true, data: rows };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ------------------------------------------------------------
// Api_getQuotesByCompany — filter by company_id
// ------------------------------------------------------------
function Api_getQuotesByCompany(compId) {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN', 'TECNICO']);
    if (!compId) throw new Error('company_id is required');
    var rows = sheetToObjects(QUOTES_SHEET);
    var filtered = rows.filter(function(r) {
      return r.company_id === compId;
    });
    filtered.sort(function(a, b) {
      return (b.created_at || '').localeCompare(a.created_at || '');
    });
    return { ok: true, data: filtered };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ------------------------------------------------------------
// Api_getQuote — single quote by id
// ------------------------------------------------------------
function Api_getQuote(id) {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN', 'TECNICO']);
    if (!id) throw new Error('id is required');
    var rows = sheetToObjects(QUOTES_SHEET);
    var quote = null;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].id === id) { quote = rows[i]; break; }
    }
    if (!quote) throw new Error('Quote not found: ' + id);
    return { ok: true, data: quote };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ------------------------------------------------------------
// Api_createQuote — create a new quote
// Expected data fields:
//   company_id, company_name, opportunity_id, representative,
//   total_value_brl, status, notes, closing_date, state
// ------------------------------------------------------------
function Api_createQuote(data) {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN']);
    if (!data) throw new Error('data is required');
    if (!data.company_id) throw new Error('company_id is required');
    if (!data.company_name) throw new Error('company_name is required');

    var status = data.status || 'Elaborando proposta';
    if (QUOTE_STATUSES.indexOf(status) === -1) {
      throw new Error('Invalid status: ' + status);
    }

    var id = 'QUO-' + getAndIncrementCounter('QUOTE_COUNTER');
    var now = nowISO();

    var quote = {
      id: id,
      legacy_quote_number: '',
      legacy_quote_number_final: '',
      year: new Date().getFullYear().toString(),
      company_id: data.company_id,
      company_name: data.company_name,
      opportunity_id: data.opportunity_id || '',
      representative: data.representative || '',
      client_type: data.client_type || '',
      total_value_brl: safeNumber(data.total_value_brl),
      status: status,
      closing_date: data.closing_date || '',
      state: data.state || '',
      notes: data.notes || '',
      import_source: 'manual',
      created_at: now
    };

    appendRowToSheet(QUOTES_SHEET, quote, QUOTE_HEADERS);
    appendAuditLog('CREATE', 'Quote', id, { company_id: quote.company_id, status: quote.status });

    return { ok: true, id: id };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ------------------------------------------------------------
// Api_updateQuoteStatus — update status field of a quote
// ------------------------------------------------------------
function Api_updateQuoteStatus(id, status) {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN']);
    if (!id) throw new Error('id is required');
    if (!status) throw new Error('status is required');
    if (QUOTE_STATUSES.indexOf(status) === -1) {
      throw new Error('Invalid status: ' + status);
    }

    updateRowById(QUOTES_SHEET, id, { status: status });
    appendAuditLog('UPDATE_STATUS', 'Quote', id, { status: status });

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ------------------------------------------------------------
// Api_getQuoteStats — aggregate statistics
// Returns: { total, byStatus:{}, totalValueBRL, closedValueBRL }
// ------------------------------------------------------------
function Api_getQuoteStats() {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN']);
    var rows = sheetToObjects(QUOTES_SHEET);

    var byStatus = {};
    var totalValueBRL = 0;
    var closedValueBRL = 0;

    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var s = r.status || '';
      byStatus[s] = (byStatus[s] || 0) + 1;

      var val = safeNumber(r.total_value_brl);
      totalValueBRL += val;
      if (s === 'Proposta fechada') {
        closedValueBRL += val;
      }
    }

    return {
      ok: true,
      data: {
        total: rows.length,
        byStatus: byStatus,
        totalValueBRL: totalValueBRL,
        closedValueBRL: closedValueBRL
      }
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
