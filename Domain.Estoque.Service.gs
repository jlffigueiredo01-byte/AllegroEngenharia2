// =============================================================================
// Domain.Estoque.Service.gs
// Allegro Business System — Fase F15
// Regras de negócio de Estoque. Sem acesso direto à planilha.
// =============================================================================

/**
 * Registra a entrada de quantidade de um material no estoque.
 * Recalcula o custo médio ponderado móvel após a entrada.
 *
 * @param {string} materialId - ID do material.
 * @param {number} qty        - Quantidade a entrar (positivo).
 * @param {string} poId       - ID da PO vinculada ao recebimento.
 * @param {number} custo      - Custo unitário da entrada.
 * @param {string} [userId]   - ID do usuário responsável (opcional; usa sessão atual).
 * @returns {Object} Saldo atualizado do estoque.
 * @throws {Error} Se qty ou custo não forem positivos.
 */
function estoqueSvcEntrada(materialId, qty, poId, custo, userId) {
  if (!materialId)           throw new Error('ID do material é obrigatório.');
  if (safeNumber(qty) <= 0)  throw new Error('Quantidade de entrada deve ser positiva.');
  if (safeNumber(custo) < 0) throw new Error('Custo unitário não pode ser negativo.');

  var user = userId || (getCurrentUser() ? getCurrentUser().id : 'SYSTEM');
  var atual = stockRepoGetByMaterial(materialId);
  var qtdAtual       = atual ? safeNumber(atual.qty_atual, 0)    : 0;
  var custoMedioAtual = atual ? safeNumber(atual.custo_medio, 0) : 0;
  var novaQtd        = qtdAtual + safeNumber(qty);
  var novoCustoMedio = novaQtd > 0
    ? ((qtdAtual * custoMedioAtual) + (safeNumber(qty) * safeNumber(custo))) / novaQtd
    : safeNumber(custo);
  var qtdReservada   = atual ? safeNumber(atual.qty_reservada, 0) : 0;

  stockRepoUpsert(materialId, {
    qty_atual:            novaQtd,
    qty_disponivel:       novaQtd - qtdReservada,
    custo_medio:          parseFloat(novoCustoMedio.toFixed(4)),
    ultima_movimentacao:  nowISO()
  });

  stockMovRepoCreate({
    id:         'SM-' + getAndIncrementCounter('STOCK_MOV_COUNTER'),
    material_id: materialId,
    tipo:        STOCK_TIPO.ENTRADA,
    qty:         safeNumber(qty),
    po_id:       poId       || '',
    project_id:  '',
    user_id:     user,
    notes:       'Entrada via PO ' + (poId || 'N/A'),
    moved_at:    nowISO()
  });

  appendAuditLog(
    'ESTOQUE_ENTRADA',
    'STOCK',
    materialId,
    'Entrada: ' + qty + ' un | Custo médio: ' + novoCustoMedio.toFixed(2)
  );

  return stockRepoGetByMaterial(materialId);
}

/**
 * Registra a saída de quantidade de um material do estoque.
 *
 * @param {string} materialId  - ID do material.
 * @param {number} qty         - Quantidade a baixar (positivo).
 * @param {string} [projectId] - ID do projeto que consumiu o material.
 * @param {string} [userId]    - ID do usuário responsável (opcional; usa sessão atual).
 * @returns {Object} Saldo atualizado do estoque.
 * @throws {Error} Se estoque insuficiente ou qty inválida.
 */
function estoqueSvcSaida(materialId, qty, projectId, userId) {
  if (!materialId)          throw new Error('ID do material é obrigatório.');
  if (safeNumber(qty) <= 0) throw new Error('Quantidade de saída deve ser positiva.');

  var user = userId || (getCurrentUser() ? getCurrentUser().id : 'SYSTEM');
  var atual = stockRepoGetByMaterial(materialId);
  if (!atual) throw new Error('Material não encontrado no estoque: ' + materialId);

  var qtdDisp = safeNumber(atual.qty_disponivel, 0);
  if (qtdDisp < safeNumber(qty)) {
    throw new Error(
      'Estoque insuficiente. Disponível: ' + qtdDisp + ', solicitado: ' + qty
    );
  }

  var novaQtd      = safeNumber(atual.qty_atual, 0) - safeNumber(qty);
  var qtdReservada = safeNumber(atual.qty_reservada, 0);

  stockRepoUpsert(materialId, {
    qty_atual:           novaQtd,
    qty_disponivel:      novaQtd - qtdReservada,
    ultima_movimentacao: nowISO()
  });

  stockMovRepoCreate({
    id:          'SM-' + getAndIncrementCounter('STOCK_MOV_COUNTER'),
    material_id:  materialId,
    tipo:         STOCK_TIPO.SAIDA,
    qty:          safeNumber(qty),
    po_id:        '',
    project_id:   projectId || '',
    user_id:      user,
    notes:        'Saída para projeto ' + (projectId || 'N/A'),
    moved_at:     nowISO()
  });

  appendAuditLog(
    'ESTOQUE_SAIDA',
    'STOCK',
    materialId,
    'Saída: ' + qty + ' un para projeto ' + (projectId || 'N/A')
  );

  return stockRepoGetByMaterial(materialId);
}

/**
 * Reserva quantidade de um material no estoque (não reduz qty_atual,
 * apenas reduz qty_disponivel). Útil para separação de pedidos.
 *
 * @param {string} materialId  - ID do material.
 * @param {number} qty         - Quantidade a reservar (positivo).
 * @param {string} [projectId] - ID do projeto que requisitou a reserva.
 * @param {string} [userId]    - ID do usuário responsável.
 * @returns {Object} Saldo atualizado do estoque.
 * @throws {Error} Se estoque disponível for insuficiente.
 */
function estoqueSvcReservar(materialId, qty, projectId, userId) {
  if (!materialId)          throw new Error('ID do material é obrigatório.');
  if (safeNumber(qty) <= 0) throw new Error('Quantidade de reserva deve ser positiva.');

  var user = userId || (getCurrentUser() ? getCurrentUser().id : 'SYSTEM');
  var atual = stockRepoGetByMaterial(materialId);
  if (!atual) throw new Error('Material não encontrado no estoque: ' + materialId);

  var qtdDisp = safeNumber(atual.qty_disponivel, 0);
  if (qtdDisp < safeNumber(qty)) {
    throw new Error(
      'Estoque insuficiente para reserva. Disponível: ' + qtdDisp + ', solicitado: ' + qty
    );
  }

  var novaReservada  = safeNumber(atual.qty_reservada, 0) + safeNumber(qty);
  var novaDisponivel = safeNumber(atual.qty_atual, 0) - novaReservada;

  stockRepoUpsert(materialId, {
    qty_reservada:       novaReservada,
    qty_disponivel:      novaDisponivel,
    ultima_movimentacao: nowISO()
  });

  stockMovRepoCreate({
    id:          'SM-' + getAndIncrementCounter('STOCK_MOV_COUNTER'),
    material_id:  materialId,
    tipo:         STOCK_TIPO.RESERVA,
    qty:          safeNumber(qty),
    po_id:        '',
    project_id:   projectId || '',
    user_id:      user,
    notes:        'Reserva para projeto ' + (projectId || 'N/A'),
    moved_at:     nowISO()
  });

  appendAuditLog(
    'ESTOQUE_RESERVA',
    'STOCK',
    materialId,
    'Reserva: ' + qty + ' un para projeto ' + (projectId || 'N/A')
  );

  return stockRepoGetByMaterial(materialId);
}

/**
 * Retorna os materiais com saldo atual abaixo do estoque mínimo configurado.
 *
 * @returns {Array} Lista de objetos { material, saldo } com material abaixo do mínimo.
 */
function estoqueSvcGetBaixo() {
  var saldos    = stockRepoGetAll();
  var materiais = materialRepoGetAll();
  var resultado = [];

  saldos.forEach(function(saldo) {
    var material = materiais.find(function(m) { return m.id === saldo.material_id; });
    if (!material) return;
    var stockMin = safeNumber(material.stock_min, 0);
    if (stockMin > 0 && safeNumber(saldo.qty_atual, 0) < stockMin) {
      resultado.push({
        material: material,
        saldo:    saldo,
        deficit:  stockMin - safeNumber(saldo.qty_atual, 0)
      });
    }
  });

  return resultado;
}
