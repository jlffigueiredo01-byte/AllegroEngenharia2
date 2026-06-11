// Domain.Companies.gs
// ALLEGRO Business System — Companies domain
// Sheet: COMPANIES (id, name, state, city, client_type, active, normalized_name, legacy_name, import_source, created_at,
//                   address, lat, lng, distancia_base_km, tempo_viagem_min)
// Sheet is managed by Domain.Import.gs — do NOT call initCompaniesSheet here.
// NOTE: colunas lat, lng, distancia_base_km, tempo_viagem_min devem ser adicionadas
//       manualmente à aba COMPANIES se ainda não existirem.

'use strict';

// COMPANIES_SHEET already defined as const in Domain.Import.gs
var COMPANIES_HEADERS = [
  'id', 'name', 'state', 'city', 'client_type',
  'active', 'normalized_name', 'legacy_name', 'import_source', 'created_at',
  'address', 'lat', 'lng', 'distancia_base_km', 'tempo_viagem_min'
];

// ---------------------------------------------------------------------------
// Internal helpers — Geocoding (NUNCA chamar em render)
// ---------------------------------------------------------------------------

/**
 * Geocodifica um endereço e retorna lat/lng.
 * NUNCA chamar em render — apenas quando endereço muda.
 * @param {string} endereco
 * @returns {{lat: number, lng: number}|null}
 */
function _companiesGeocode(endereco) {
  if (!endereco || endereco.trim() === '') return null;
  try {
    var geocoder = Maps.newGeocoder().geocode(endereco);
    if (geocoder.status === 'OK' && geocoder.results && geocoder.results.length > 0) {
      var loc = geocoder.results[0].geometry.location;
      return { lat: loc.lat, lng: loc.lng };
    }
  } catch (e) {
    Logger.log('Geocode error: ' + e.message);
  }
  return null;
}

/**
 * Lê BASE_OPERACAO da aba CONFIG.
 * @returns {string}
 */
function _getBaseOperacao() {
  try {
    var rows = sheetToObjects('CONFIG');
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].key === 'BASE_OPERACAO') return rows[i].value || '';
    }
  } catch (e) {
    Logger.log('getBaseOperacao error: ' + e.message);
  }
  return '';
}

/**
 * Calcula distância rodoviária da BASE_OPERACAO até o cliente.
 * Persiste distancia_base_km e tempo_viagem_min no registro da empresa.
 * NUNCA chamar em render.
 * @param {string} companyId
 * @param {string} endereco
 */
function _companiesCalcDistancia(companyId, endereco) {
  var baseOp = _getBaseOperacao();
  if (!baseOp || !endereco) return;
  try {
    var directions = Maps.newDirectionFinder()
      .setOrigin(baseOp)
      .setDestination(endereco)
      .getDirections();
    if (directions.status === 'OK' && directions.routes && directions.routes.length > 0) {
      var leg = directions.routes[0].legs[0];
      var distKm  = leg.distance.value / 1000;
      var tempoMin = Math.round(leg.duration.value / 60);
      updateRowById(COMPANIES_SHEET, companyId, {
        distancia_base_km: distKm,
        tempo_viagem_min:  tempoMin
      });
    }
  } catch (e) {
    Logger.log('Distance error: ' + e.message);
  }
}

// ---------------------------------------------------------------------------
// Internal helpers — Name normalization
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
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN', 'TECNICO']);
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
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN', 'TECNICO']);
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
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN', 'TECNICO']);
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
 * @param {{name: string, state: string, city: string, client_type: string, address?: string}} data
 * @returns {{ok: boolean, id: string}}
 */
function Api_createCompany(data) {
  try {
    var user = requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'TECNICO']);
    if (!data || !data.name) throw new Error('name é obrigatório');

    var id = 'EMP-' + getAndIncrementCounter('COMPANY_COUNTER');
    var now = nowISO();
    var address = String(data.address || '').trim();

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
      created_at:      now,
      address:         address,
      lat:             '',
      lng:             '',
      distancia_base_km: '',
      tempo_viagem_min:  ''
    };

    appendRowToSheet(COMPANIES_SHEET, row, COMPANIES_HEADERS);
    appendAuditLog('CREATE', 'COMPANY', id, JSON.stringify({ name: row.name, city: row.city, state: row.state }));

    // Geocodificar se endereço fornecido
    if (address) {
      var geo = _companiesGeocode(address);
      if (geo) {
        updateRowById(COMPANIES_SHEET, id, { lat: geo.lat, lng: geo.lng });
      }
      _companiesCalcDistancia(id, address);
    }

    return { ok: true, id: id };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Updates editable fields of an existing company.
 * @param {string} id
 * @param {{name?: string, state?: string, city?: string, client_type?: string, address?: string}} data
 * @returns {{ok: boolean}}
 */
function Api_updateCompany(id, data) {
  try {
    var user = requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'TECNICO']);
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
    if (data.address     !== undefined) updates.address     = String(data.address).trim();

    if (Object.keys(updates).length === 0) throw new Error('Nenhum campo para atualizar');

    updateRowById(COMPANIES_SHEET, id, updates);
    appendAuditLog('UPDATE', 'COMPANY', id, JSON.stringify(updates));

    // Re-geocodificar se endereço foi alterado
    if (updates.address) {
      var geo = _companiesGeocode(updates.address);
      if (geo) {
        updateRowById(COMPANIES_SHEET, id, { lat: geo.lat, lng: geo.lng });
      }
      _companiesCalcDistancia(id, updates.address);
    }

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
    var user = requireRole(['DIRETOR_TECNICO']);
    if (!id) throw new Error('id obrigatório');

    updateRowById(COMPANIES_SHEET, id, { active: 'FALSE' });
    appendAuditLog('DEACTIVATE', 'COMPANY', id, '');

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Geocodifica em lote todas as empresas que têm endereço mas não têm lat/lng.
 * Throttle: 1 por vez com sleep de 200ms (respeita cota diária da Maps API).
 * Só pode ser chamada por DIRETOR_TECNICO.
 * @returns {{ok: boolean, data: {geocodificadas: number}}}
 */
function Api_companiesGeocodeBatch() {
  try {
    requireRole(['DIRETOR_TECNICO']);
    var rows = sheetToObjects(COMPANIES_SHEET);
    var count = 0;
    for (var i = 0; i < rows.length; i++) {
      var c = rows[i];
      if (!c.lat && c.address) {
        var geo = _companiesGeocode(c.address);
        if (geo) {
          updateRowById(COMPANIES_SHEET, c.id, { lat: geo.lat, lng: geo.lng });
          count++;
        }
        Utilities.sleep(200);
      }
    }
    return { ok: true, data: { geocodificadas: count } };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
