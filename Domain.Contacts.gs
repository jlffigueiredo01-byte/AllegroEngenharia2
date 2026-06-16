// ============================================================
// Domain.Contacts.gs — ALLEGRO Business System
// CRM Contacts domain — all CRUD operations via Api_ functions
// CONTACTS sheet is managed by Domain.Import.gs (no init here)
// ============================================================

// CONTACTS_SHEET and COMPANIES_SHEET already defined as const in Domain.Import.gs
var CONTACTS_HEADERS = ['id','company_id','name','phone','email','role','active','import_source','created_at'];

// ------------------------------------------------------------
// Internal helpers
// ------------------------------------------------------------

/**
 * Load a map of companyId → company_name from the COMPANIES sheet.
 * Returns a plain object so lookups are O(1).
 */
function _buildCompanyMap_() {
  var rows = sheetToObjects(COMPANIES_SHEET);
  var map = {};
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (r.id) {
      map[r.id] = r.name || '';
    }
  }
  return map;
}

/**
 * Enrich a single contact object with company_name.
 */
function _enrichContact_(contact, companyMap) {
  var c = {};
  for (var k in contact) {
    if (Object.prototype.hasOwnProperty.call(contact, k)) {
      c[k] = contact[k];
    }
  }
  c.company_name = (contact.company_id && companyMap[contact.company_id])
    ? companyMap[contact.company_id]
    : '';
  return c;
}

/**
 * Return all rows from CONTACTS sheet as objects.
 */
function _getAllContacts_() {
  return sheetToObjects(CONTACTS_SHEET);
}

// ------------------------------------------------------------
// Public API functions
// ------------------------------------------------------------

/**
 * Api_getContacts — returns all active contacts, enriched with company_name.
 * @returns {{ok: boolean, data: Array}}
 */
function Api_getContacts() {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN', 'TECNICO']);
    var rows = _getAllContacts_();
    var companyMap = _buildCompanyMap_();
    var active = [];
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].active === true || rows[i].active === 'TRUE' || rows[i].active === '1') {
        active.push(_enrichContact_(rows[i], companyMap));
      }
    }
    return { ok: true, data: sanitizeForClient(active) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Api_getContactsByCompany — returns active contacts for a given company.
 * @param {string} companyId
 * @returns {{ok: boolean, data: Array}}
 */
function Api_getContactsByCompany(companyId) {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN', 'TECNICO']);
    if (!companyId) throw new Error('companyId is required');
    var rows = _getAllContacts_();
    var companyMap = _buildCompanyMap_();
    var result = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (
        r.company_id === companyId &&
        (r.active === true || r.active === 'TRUE' || r.active === '1')
      ) {
        result.push(_enrichContact_(r, companyMap));
      }
    }
    return { ok: true, data: sanitizeForClient(result) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Api_getContact — returns a single contact by id.
 * @param {string} id
 * @returns {{ok: boolean, data: Object}}
 */
function Api_getContact(id) {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN', 'TECNICO']);
    if (!id) throw new Error('id is required');
    var rows = _getAllContacts_();
    var companyMap = _buildCompanyMap_();
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].id === id) {
        return { ok: true, data: _enrichContact_(rows[i], companyMap) };
      }
    }
    throw new Error('Contact not found: ' + id);
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Api_createContact — creates a new contact row.
 * @param {{company_id:string, name:string, phone:string, email:string, role:string}} data
 * @returns {{ok: boolean, id: string}}
 */
function Api_createContact(data) {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'TECNICO']);
    if (!data || !data.name) throw new Error('name is required');

    var id  = 'CNT-' + getAndIncrementCounter('CONTACT_COUNTER');
    var now = nowISO();

    var obj = {
      id:            id,
      company_id:    data.company_id    || '',
      name:          data.name,
      phone:         data.phone         || '',
      email:         data.email         || '',
      role:          data.role          || '',
      active:        'TRUE',
      import_source: 'manual',
      created_at:    now
    };

    appendRowToSheet(CONTACTS_SHEET, obj, CONTACTS_HEADERS);
    appendAuditLog('CREATE', 'CONTACT', id, { name: obj.name, company_id: obj.company_id });

    return { ok: true, id: id };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Api_updateContact — updates mutable fields of a contact.
 * @param {string} id
 * @param {{company_id:string, name:string, phone:string, email:string, role:string}} data
 * @returns {{ok: boolean}}
 */
function Api_updateContact(id, data) {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'TECNICO']);
    if (!id)   throw new Error('id is required');
    if (!data) throw new Error('data is required');

    var allowed = ['company_id', 'name', 'phone', 'email', 'role'];
    var updates = {};
    for (var i = 0; i < allowed.length; i++) {
      var key = allowed[i];
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        updates[key] = data[key];
      }
    }

    updateRowById(CONTACTS_SHEET, id, updates);
    appendAuditLog('UPDATE', 'CONTACT', id, updates);

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Api_deactivateContact — sets active = false for a contact.
 * @param {string} id
 * @returns {{ok: boolean}}
 */
function Api_deactivateContact(id) {
  try {
    requireRole(['DIRETOR_TECNICO']);
    if (!id) throw new Error('id is required');

    updateRowById(CONTACTS_SHEET, id, { active: 'FALSE' });
    appendAuditLog('DEACTIVATE', 'CONTACT', id, {});

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
