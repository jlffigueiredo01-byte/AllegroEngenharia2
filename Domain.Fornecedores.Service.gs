// =============================================================================
// Domain.Fornecedores.Service.gs
// Allegro Business System — Fase F15
// Regras de negócio de Fornecedores e Materiais. Sem acesso direto à planilha.
// =============================================================================

/**
 * Cria um novo fornecedor.
 * Valida unicidade de CNPJ ativo (VALIDACAO_V3 §4.6) antes de persistir.
 *
 * @param {Object} data              - Dados do fornecedor.
 * @param {string} data.name         - Razão social (obrigatório).
 * @param {string} [data.cnpj]       - CNPJ (validado se informado).
 * @param {string} [data.country]    - País.
 * @param {string} [data.contact_name]  - Nome do contato.
 * @param {string} [data.contact_email] - E-mail do contato.
 * @param {string} [data.contact_phone] - Telefone do contato.
 * @param {string} [data.lead_time_days] - Prazo de entrega em dias.
 * @param {string} [data.payment_terms]  - Condições de pagamento.
 * @param {string} [data.currency]   - Moeda padrão (ex: BRL, USD).
 * @param {string} [data.notes]      - Observações.
 * @returns {Object} Registro completo do fornecedor criado.
 * @throws {Error} Se o CNPJ já estiver cadastrado para fornecedor ativo.
 */
function supplierSvcCreate(data) {
  if (!data.name) throw new Error('Nome do fornecedor é obrigatório.');

  // Validação de CNPJ único (VALIDACAO_V3 §4.6)
  if (data.cnpj) {
    var cnpjNorm = String(data.cnpj).replace(/\D/g, '');
    var existing = supplierRepoGetAll().filter(function(s) {
      return String(s.cnpj).replace(/\D/g, '') === cnpjNorm &&
             String(s.active).toUpperCase() !== 'FALSE';
    });
    if (existing.length) {
      throw new Error('CNPJ já cadastrado para o fornecedor: ' + existing[0].name);
    }
  }

  var id  = 'SUP-' + getAndIncrementCounter('SUPPLIER_COUNTER');
  var now = nowISO();
  var record = {
    id:             id,
    name:           data.name            || '',
    cnpj:           data.cnpj            || '',
    country:        data.country         || 'Brasil',
    contact_name:   data.contact_name    || '',
    contact_email:  data.contact_email   || '',
    contact_phone:  data.contact_phone   || '',
    lead_time_days: data.lead_time_days  || '',
    payment_terms:  data.payment_terms   || '',
    currency:       data.currency        || 'BRL',
    active:         'TRUE',
    notes:          data.notes           || '',
    created_at:     now,
    updated_at:     now
  };

  supplierRepoCreate(record);
  appendAuditLog('SUPPLIER_CREATE', 'SUPPLIERS', id, data.name);
  return record;
}

/**
 * Atualiza dados de um fornecedor existente.
 *
 * @param {string} id      - ID do fornecedor.
 * @param {Object} updates - Campos a atualizar.
 * @returns {Object} Registro atualizado.
 * @throws {Error} Se o fornecedor não for encontrado.
 */
function supplierSvcUpdate(id, updates) {
  var supplier = supplierRepoGetById(id);
  if (!supplier) throw new Error('Fornecedor não encontrado: ' + id);

  // Revalida CNPJ único se estiver sendo alterado
  if (updates.cnpj && updates.cnpj !== supplier.cnpj) {
    var cnpjNorm = String(updates.cnpj).replace(/\D/g, '');
    var conflict = supplierRepoGetAll().filter(function(s) {
      return s.id !== id &&
             String(s.cnpj).replace(/\D/g, '') === cnpjNorm &&
             String(s.active).toUpperCase() !== 'FALSE';
    });
    if (conflict.length) {
      throw new Error('CNPJ já cadastrado para o fornecedor: ' + conflict[0].name);
    }
  }

  updates.updated_at = nowISO();
  supplierRepoUpdate(id, updates);
  appendAuditLog('SUPPLIER_UPDATE', 'SUPPLIERS', id, JSON.stringify(updates));
  return supplierRepoGetById(id);
}

/**
 * Cria um novo material.
 *
 * @param {Object} data               - Dados do material.
 * @param {string} data.code          - Código único do material (obrigatório).
 * @param {string} data.description   - Descrição (obrigatório).
 * @param {string} data.unit          - Unidade de medida (ex: UN, KG, M).
 * @param {string} [data.category]    - Categoria.
 * @param {string} [data.supplier_id] - ID do fornecedor padrão.
 * @param {number} [data.stock_min]   - Estoque mínimo de alerta.
 * @returns {Object} Registro completo do material criado.
 * @throws {Error} Se code ou description estiverem ausentes.
 */
function materialSvcCreate(data) {
  if (!data.code)        throw new Error('Código do material é obrigatório.');
  if (!data.description) throw new Error('Descrição do material é obrigatória.');

  var id  = 'MAT-' + getAndIncrementCounter('MATERIAL_COUNTER');
  var now = nowISO();
  var record = {
    id:                   id,
    code:                 data.code              || '',
    description:          data.description       || '',
    unit:                 data.unit              || 'UN',
    category:             data.category          || '',
    supplier_id:          data.supplier_id       || '',
    last_price:           '',
    last_price_currency:  '',
    last_price_date:      '',
    stock_qty:            0,
    stock_min:            safeNumber(data.stock_min, 0),
    created_at:           now,
    updated_at:           now
  };

  materialRepoCreate(record);
  appendAuditLog('MATERIAL_CREATE', 'MATERIALS', id, data.code + ' — ' + data.description);
  return record;
}

/**
 * Atualiza dados de um material existente.
 *
 * @param {string} id      - ID do material.
 * @param {Object} updates - Campos a atualizar.
 * @returns {Object} Registro atualizado.
 * @throws {Error} Se o material não for encontrado.
 */
function materialSvcUpdate(id, updates) {
  var material = materialRepoGetById(id);
  if (!material) throw new Error('Material não encontrado: ' + id);

  updates.updated_at = nowISO();
  materialRepoUpdate(id, updates);
  appendAuditLog('MATERIAL_UPDATE', 'MATERIALS', id, JSON.stringify(updates));
  return materialRepoGetById(id);
}

/**
 * Registra o preço mais recente de um material, atualiza os campos last_price* no
 * registro do material e persiste no histórico MATERIAL_PRICES (ADENDO_V2_1 §B.3).
 *
 * @param {string} materialId - ID do material.
 * @param {number} price      - Preço unitário.
 * @param {string} currency   - Moeda (ex: BRL, USD).
 * @param {string} supplierId - ID do fornecedor que ofertou o preço.
 * @returns {Object} Registro de histórico criado.
 * @throws {Error} Se o material não for encontrado.
 */
function materialSvcRegistrarPreco(materialId, price, currency, supplierId) {
  var material = materialRepoGetById(materialId);
  if (!material) throw new Error('Material não encontrado: ' + materialId);

  var now = nowISO();
  materialRepoUpdate(materialId, {
    last_price:          price,
    last_price_currency: currency || 'BRL',
    last_price_date:     now,
    updated_at:          now
  });

  var priceRecord = {
    id:          'MP-' + getAndIncrementCounter('MATERIAL_PRICE_COUNTER'),
    material_id: materialId,
    supplier_id: supplierId || '',
    price:       safeNumber(price),
    currency:    currency   || 'BRL',
    recorded_at: now
  };
  // Usa materialPriceRepoCreate() do Fornecedores Repository — sem acesso direto à sheet
  materialPriceRepoCreate(priceRecord);

  appendAuditLog(
    'MATERIAL_PRICE',
    'MATERIALS',
    materialId,
    'Preço: ' + price + ' ' + (currency || 'BRL') + ' por ' + (supplierId || 'N/A')
  );

  return priceRecord;
}
