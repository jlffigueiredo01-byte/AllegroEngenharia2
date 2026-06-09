// Domain.Companies.gs
// ALLEGRO Business System — Companies domain
// Sheet: COMPANIES (id, name, state, city, client_type, active, normalized_name, legacy_name, import_source, created_at)
// Sheet is managed by Domain.Import.gs — do NOT call initCompaniesSheet here.

'use strict';

// COMPANIES_SHEET already defined as const in Domain.Import.gs
var COMPANIES_HEADERS = [
  'id', 'name', 'state', 'city', 'client_type',
  'active', 'normalized_name', 'legacy_name', 'import_source', 'created_at'
];

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Normalize a company name: uppercase, strip accents, collapse whitespace.
 * @param {string} name
 * @returns {string}
 */
function _normCompanyName(name) {
  if (!name) return '';
  var s = String(name).toUpperCase().trim();
  // Strip common Portuguese/Latin diacritics
  s = s
    .replace(/[ÁÀÂÃÄ]/g, 'A')
    .replace(/[ÉÈÊË]/g, 'E')
    .replace(/[ÍÌÎÏ]/g, 'I')
    .replace(/[ÓÒÔÕÖ]/g, 'O')
    .replace(/[ÚÙÛÜ]/g, 'U')
    .replace(/[Ç]/g, 'C')
    .replace(/[ÑÑ]/g, 'N');
  // Collapse multiple spaces
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

/**
 * Retrieve the COMPANIES sheet rows as objects.
 * @returns {Object[]}
 */
function _getCompaniesRows() {
  return sheetToObjects(COMPANIES_SHEET);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns all active companies.
 * @returns {{ok: boolean, data: Object[]}}
 */
function Api_getCompanies() {
  try {
    requireAuth();
    var rows = _getCompaniesRows();
    var active = rows.filter(function(r) {
      return String(r.active).toUpperCase() === 'TRUE' || r.active === true;
    });
    return { ok: true, data: active };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Searches companies by name, city or state (case-insensitive). Max 50 results.
 * @param {string} q
 * @returns {{ok: boolean, data: Object[]}}
 */
function Api_searchCompanies(q) {
  try {
    requireAuth();
    if (!q || String(q).trim() === '') {
      return Api_getCompanies();
    }
    var term = String(q).trim().toUpperCase();
    var rows = _getCompaniesRows();
    var results = rows.filter(function(r) {
      var name  = String(r.name  || '').toUpperCase();
      var city  = String(r.city  || '').toUpperCase();
      var state = String(r.state || '').toUpperCase();
      var norm  = String(r.normalized_name || '').toUpperCase();
      return (
        name.indexOf(term)  !== -1 ||
        norm.indexOf(term)  !== -1 ||
        city.indexOf(term)  !== -1 ||
        state.indexOf(term) !== -1
      );
    });
    // Limit to 50
    results = results.slice(0, 50);
    return { ok: true, data: results };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Returns a single company by id.
 * @param {string} id
 * @returns {{ok: boolean, data: Object}}
 */
function Api_getCompany(id) {
  try {
    requireAuth();
    if (!id) throw new Error('id obrigatório');
    var rows = _getCompaniesRows();
    var found = null;
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i].id) === String(id)) {
        found = rows[i];
        break;
      }
    }
    if (!found) throw new Error('Empresa não encontrada: ' + id);
    return { ok: true, data: found };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Creates a new company.
 * @param {{name: string, state: string, city: string, client_type: string}} data
 * @returns {{ok: boolean, id: string}}
 */
function Api_createCompany(data) {
  try {
    var user = requireAuth();
    if (!data || !data.name) throw new Error('name é obrigatório');

    var id = 'EMP-' + getAndIncrementCounter('COMPANY_COUNTER');
    var now = nowISO();

    var row = {
      id:              id,
      name:            String(data.name).trim(),
      state:           String(data.state   || '').trim(),
      city:            String(data.city    || '').trim(),
      client_type:     String(data.client_type || '').trim(),
      active:          'TRUE',
      normalized_name: _normCompanyName(data.name),
      legacy_name:     '',
      import_source:   'MANUAL',
      created_at:      now
    };

    appendRowToSheet(COMPANIES_SHEET, row, COMPANIES_HEADERS);
    appendAuditLog('CREATE', 'COMPANY', id, JSON.stringify({ name: row.name, city: row.city, state: row.state }));

    return { ok: true, id: id };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Updates editable fields of an existing company.
 * @param {string} id
 * @param {{name?: string, state?: string, city?: string, client_type?: string}} data
 * @returns {{ok: boolean}}
 */
function Api_updateCompany(id, data) {
  try {
    var user = requireAuth();
    if (!id)   throw new Error('id obrigatório');
    if (!data) throw new Error('data obrigatório');

    var updates = {};
    if (data.name        !== undefined) {
      updates.name            = String(data.name).trim();
      updates.normalized_name = _normCompanyName(data.name);
    }
    if (data.state       !== undefined) updates.state       = String(data.state).trim();
    if (data.city        !== undefined) updates.city        = String(data.city).trim();
    if (data.client_type !== undefined) updates.client_type = String(data.client_type).trim();

    if (Object.keys(updates).length === 0) throw new Error('Nenhum campo para atualizar');

    updateRowById(COMPANIES_SHEET, id, updates);
    appendAuditLog('UPDATE', 'COMPANY', id, JSON.stringify(updates));

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Deactivates a company (sets active = FALSE).
 * @param {string} id
 * @returns {{ok: boolean}}
 */
function Api_deactivateCompany(id) {
  try {
    var user = requireAuth();
    if (!id) throw new Error('id obrigatório');

    updateRowById(COMPANIES_SHEET, id, { active: 'FALSE' });
    appendAuditLog('DEACTIVATE', 'COMPANY', id, '');

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
