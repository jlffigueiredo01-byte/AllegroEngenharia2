// =============================================================================
// Domain.Estoque.Repository.gs
// Allegro Business System — Fase F15
// Acesso a dados das abas STOCK e STOCK_MOVEMENTS. LockService em todas as escritas.
// =============================================================================

// ---------------------------------------------------------------------------
// STOCK (saldos)
// ---------------------------------------------------------------------------

/**
 * Retorna todos os registros de saldo de estoque.
 * @returns {Object[]} Array de objetos com os campos de STOCK_HEADERS.
 */
function stockRepoGetAll() {
  return sheetToObjects(STOCK_SHEET);
}

/**
 * Busca o registro de saldo de estoque pelo ID de material.
 * @param {string} materialId - ID do material (ex: MAT-1).
 * @returns {Object|null} Objeto de saldo ou null se não encontrado.
 */
function stockRepoGetByMaterial(materialId) {
  return stockRepoGetAll().find(function(r) { return r.material_id === materialId; }) || null;
}

/**
 * Cria ou atualiza (upsert) o registro de saldo de estoque para um material.
 * Utiliza LockService para evitar condições de corrida.
 * Se não existir registro para o material, cria um novo com qty_reservada = 0.
 *
 * @param {string} materialId - ID do material.
 * @param {Object} updates    - Campos a definir/atualizar.
 */
function stockRepoUpsert(materialId, updates) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var existing = stockRepoGetByMaterial(materialId);
    if (existing) {
      updateRowById(STOCK_SHEET, existing.id, Object.assign({}, updates, { updated_at: nowISO() }));
    } else {
      // Busca código do material para facilitar leitura humana na aba
      var material = materialRepoGetById(materialId);
      var id = 'STK-' + getAndIncrementCounter('STOCK_COUNTER');
      appendRowToSheet(STOCK_SHEET, Object.assign(
        {
          id:               id,
          material_id:      materialId,
          material_code:    material ? material.code : '',
          qty_reservada:    0,
          qty_disponivel:   0,
          custo_medio:      0,
          ultima_movimentacao: '',
          updated_at:       nowISO()
        },
        updates
      ), STOCK_HEADERS);
    }
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// STOCK_MOVEMENTS (movimentações)
// ---------------------------------------------------------------------------

/**
 * Retorna todas as movimentações de estoque.
 * @returns {Object[]} Array de objetos com os campos de STOCK_MOVEMENTS_HEADERS.
 */
function stockMovRepoGetAll() {
  return sheetToObjects(STOCK_MOVEMENTS_SHEET);
}

/**
 * Retorna as movimentações de um material específico.
 * @param {string} materialId - ID do material.
 * @returns {Object[]} Array de movimentações do material.
 */
function stockMovRepoGetByMaterial(materialId) {
  return stockMovRepoGetAll().filter(function(r) { return r.material_id === materialId; });
}

/**
 * Registra uma movimentação de estoque.
 * Utiliza LockService para evitar condições de corrida.
 * @param {Object} mov - Objeto com todos os campos de STOCK_MOVEMENTS_HEADERS.
 */
function stockMovRepoCreate(mov) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    appendRowToSheet(STOCK_MOVEMENTS_SHEET, mov, STOCK_MOVEMENTS_HEADERS);
  } finally {
    lock.releaseLock();
  }
}
