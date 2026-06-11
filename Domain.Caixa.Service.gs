// =============================================================================
// Domain.Caixa.Service.gs
// Fase F16 — Regras de negócio do Livro Caixa
// Sem integração bancária — conciliação mensal é o controle (VALIDACAO_V3 §10.3)
// =============================================================================

/**
 * Lança um movimento (entrada ou saída) no livro caixa.
 *
 * @param {Object}  data
 * @param {string}  data.date           - Data do movimento (ISO ou dd/MM/yyyy).
 * @param {string}  data.description    - Descrição do movimento.
 * @param {number}  data.amount         - Valor positivo em reais.
 * @param {string}  data.direction      - 'ENTRADA' ou 'SAIDA'.
 * @param {string}  [data.category]     - Uma das categorias em CASH_CATEGORIES.
 * @param {string}  [data.reference_type] - 'NF' | 'PO' | 'MANUAL'.
 * @param {string}  [data.reference_id]   - ID do documento de origem.
 * @param {string}  [data.created_by]     - ID do usuário responsável.
 * @returns {Object} Movimento persistido.
 */
function caixaSvcLancar(data) {
  if (!data.date)        throw new Error('Campo obrigatório ausente: date.');
  if (!data.description) throw new Error('Campo obrigatório ausente: description.');
  if (!data.amount)      throw new Error('Campo obrigatório ausente: amount.');
  if (!data.direction)   throw new Error('Campo obrigatório ausente: direction (ENTRADA|SAIDA).');

  if (data.direction !== 'ENTRADA' && data.direction !== 'SAIDA') {
    throw new Error('direction deve ser ENTRADA ou SAIDA.');
  }
  if (parseFloat(data.amount) <= 0) {
    throw new Error('amount deve ser um valor positivo.');
  }

  // Valida categoria, se informada
  if (data.category) {
    var cats = CASH_CATEGORIES[data.direction] || [];
    if (cats.indexOf(data.category) === -1) {
      throw new Error(
        'Categoria inválida para ' + data.direction + ': ' + data.category +
        '. Válidas: ' + cats.join(', ')
      );
    }
  }

  // Valida reference_type, se informado
  if (data.reference_type && CASH_REFERENCE_TYPES.indexOf(data.reference_type) === -1) {
    throw new Error('reference_type inválido: ' + data.reference_type + '. Use NF, PO ou MANUAL.');
  }

  var id = 'CX-' + getAndIncrementCounter('CASH_COUNTER');
  var user = getCurrentUser();

  var record = {
    id:               id,
    date:             data.date,
    description:      data.description,
    amount:           parseFloat(data.amount),
    direction:        data.direction,
    category:         data.category         || '',
    reference_type:   data.reference_type   || 'MANUAL',
    reference_id:     data.reference_id     || '',
    reconciled:       'FALSE',
    reconciliation_id: '',
    created_by:       data.created_by || (user ? user.id : 'SYSTEM'),
    created_at:       nowISO(),
    updated_at:       nowISO()
  };

  cashRepoCreate(record);
  appendAuditLog(
    'CAIXA_LANCAR',
    'CASH_LEDGER',
    id,
    data.direction + ': R$' + parseFloat(data.amount).toFixed(2) + ' — ' + data.description
  );
  return record;
}

/**
 * Abre (ou retorna existente) a reconciliação de um período.
 * O saldo inicial é o saldo_final da última reconciliação fechada anterior.
 *
 * @param {string} period - Período no formato 'AAAA-MM'.
 * @returns {Object} Reconciliação aberta ou já existente.
 */
function caixaSvcAbrirReconciliacao(period) {
  if (!period || !/^\d{4}-\d{2}$/.test(period)) {
    throw new Error('period deve estar no formato AAAA-MM (ex.: 2026-06).');
  }

  var existing = reconRepoGetByPeriod(period);
  if (existing) return existing;

  // Calcula saldo inicial = saldo_final da reconciliação fechada mais recente anterior
  var todasFechadas = reconRepoGetAll().filter(function(r) {
    return r.status === 'FECHADA' && r.period < period;
  });
  todasFechadas.sort(function(a, b) { return b.period.localeCompare(a.period); });
  var saldoInicial = todasFechadas.length > 0
    ? parseFloat(todasFechadas[0].saldo_final || 0)
    : 0;

  // Calcula totais dos movimentos já lançados no período
  var movs = cashRepoGetByPeriod(period);
  var totalEntradas = 0;
  var totalSaidas   = 0;
  movs.forEach(function(m) {
    if (m.direction === 'ENTRADA') totalEntradas += parseFloat(m.amount || 0);
    if (m.direction === 'SAIDA')   totalSaidas   += parseFloat(m.amount || 0);
  });
  var saldoFinal = saldoInicial + totalEntradas - totalSaidas;

  var rec = {
    id:             'REC-' + period.replace('-', ''),
    period:         period,
    saldo_inicial:  saldoInicial,
    total_entradas: totalEntradas,
    total_saidas:   totalSaidas,
    saldo_final:    saldoFinal,
    saldo_extrato:  '',
    diferenca:      '',
    ajustes_json:   '[]',
    status:         'ABERTA',
    fechado_por:    '',
    fechado_at:     '',
    created_at:     nowISO(),
    updated_at:     nowISO()
  };

  reconRepoCreate(rec);
  appendAuditLog(
    'RECONCILIACAO_ABERTA',
    'RECONCILIATIONS',
    rec.id,
    'Período: ' + period + ' | Saldo inicial: R$' + saldoInicial.toFixed(2)
  );
  return rec;
}

/**
 * Fecha a reconciliação de um período.
 * Recalcula totais com os movimentos atuais, registra diferença em relação
 * ao saldo extrato informado e marca todos os movimentos do período como
 * reconciliados.
 *
 * @param {string}   period        - Período no formato 'AAAA-MM'.
 * @param {number}   saldoExtrato  - Saldo informado pelo banco (manual).
 * @param {Object[]} [ajustes]     - Array de ajustes justificados (opcional).
 * @param {string}   fechadoPor    - ID do usuário que está fechando.
 * @returns {Object} Reconciliação atualizada.
 */
function caixaSvcFecharReconciliacao(period, saldoExtrato, ajustes, fechadoPor) {
  if (!period || !/^\d{4}-\d{2}$/.test(period)) {
    throw new Error('period deve estar no formato AAAA-MM (ex.: 2026-06).');
  }
  if (saldoExtrato === undefined || saldoExtrato === null || saldoExtrato === '') {
    throw new Error('saldoExtrato é obrigatório para fechar a reconciliação.');
  }

  var rec = reconRepoGetByPeriod(period);
  if (!rec) {
    throw new Error(
      'Reconciliação do período ' + period + ' não encontrada. ' +
      'Crie primeiro com caixaSvcAbrirReconciliacao.'
    );
  }
  if (rec.status === 'FECHADA') {
    throw new Error('Reconciliação do período ' + period + ' já está fechada.');
  }

  // Recalcula com movimentos atuais (podem ter sido lançados após abertura)
  var movs = cashRepoGetByPeriod(period);
  var totalEntradas = 0;
  var totalSaidas   = 0;
  movs.forEach(function(m) {
    if (m.direction === 'ENTRADA') totalEntradas += parseFloat(m.amount || 0);
    if (m.direction === 'SAIDA')   totalSaidas   += parseFloat(m.amount || 0);
  });

  // Saldo inicial da reconciliação anterior fechada
  var todasFechadas = reconRepoGetAll().filter(function(r) {
    return r.status === 'FECHADA' && r.period < period;
  });
  todasFechadas.sort(function(a, b) { return b.period.localeCompare(a.period); });
  var saldoInicial = todasFechadas.length > 0
    ? parseFloat(todasFechadas[0].saldo_final || 0)
    : 0;

  var saldoFinal = saldoInicial + totalEntradas - totalSaidas;
  var diferenca  = parseFloat(saldoExtrato) - saldoFinal;

  reconRepoUpdate(rec.id, {
    saldo_inicial:  saldoInicial,
    total_entradas: totalEntradas,
    total_saidas:   totalSaidas,
    saldo_final:    saldoFinal,
    saldo_extrato:  parseFloat(saldoExtrato),
    diferenca:      diferenca,
    ajustes_json:   JSON.stringify(ajustes || []),
    status:         'FECHADA',
    fechado_por:    fechadoPor || '',
    fechado_at:     nowISO()
  });

  // Marca todos os movimentos do período como reconciliados
  movs.forEach(function(m) {
    cashRepoUpdate(m.id, {
      reconciled:       'TRUE',
      reconciliation_id: rec.id
    });
  });

  appendAuditLog(
    'RECONCILIACAO_FECHADA',
    'RECONCILIATIONS',
    rec.id,
    'Período: ' + period +
    ' | Saldo caixa: R$' + saldoFinal.toFixed(2) +
    ' | Saldo extrato: R$' + parseFloat(saldoExtrato).toFixed(2) +
    ' | Diferença: R$' + diferenca.toFixed(2)
  );

  return reconRepoGetByPeriod(period);
}

/**
 * Retorna uma projeção simplificada de caixa para os próximos N dias.
 * Entradas previstas: 50% do total de propostas ENVIADAS + 25% de FECHADAS.
 * Saídas previstas: POs com status EMITIDA e entrega dentro do prazo.
 *
 * NOTA: Aprimorar com parcelas reais das propostas (Domain.Caixa.Service §3).
 *
 * @param {number} [diasAfrente=90] - Horizonte de projeção em dias.
 * @returns {Object} Resumo da projeção.
 */
function caixaSvcProjecao(diasAfrente) {
  diasAfrente = diasAfrente || 90;
  var hoje   = new Date();
  var limite = new Date();
  limite.setDate(hoje.getDate() + diasAfrente);

  // Entradas previstas via propostas — usa propRepoGetAll() sem acesso direto à sheet
  var entradasPrevistas = 0;
  try {
    var proposals = propRepoGetAll();
    proposals.forEach(function(p) {
      if (['ENVIADA', 'FECHADA'].indexOf(p.status) === -1) return;
      var valor = parseFloat(p.total_estimado) || 0;
      entradasPrevistas += p.status === 'ENVIADA' ? valor * 0.5 : valor * 0.25;
    });
  } catch (e) {
    Logger.log('[caixaSvcProjecao] Erro ao ler propostas: ' + e.message);
  }

  // Saídas previstas via ordens de compra — usa poRepoGetAll() sem acesso direto à sheet
  var saidasPrevistas = 0;
  try {
    var pos = poRepoGetAll();
    pos.forEach(function(po) {
      if (po.status !== 'EMITIDA') return;
      var expectedDate = po.expected_delivery ? new Date(po.expected_delivery) : null;
      if (!expectedDate || expectedDate <= limite) {
        saidasPrevistas += parseFloat(po.total_amount || 0);
      }
    });
  } catch (e) {
    Logger.log('[caixaSvcProjecao] poRepoGetAll não disponível — saídas previstas = 0.');
  }

  return {
    dias:               diasAfrente,
    entradas_previstas: Math.round(entradasPrevistas),
    saidas_previstas:   Math.round(saidasPrevistas),
    saldo_projetado:    Math.round(entradasPrevistas - saidasPrevistas),
    nota:               'Estimativa simplificada. Aprimorar com parcelas reais das propostas (Domain.Caixa.Service §3).'
  };
}
