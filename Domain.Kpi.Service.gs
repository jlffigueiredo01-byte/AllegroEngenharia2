// ============================================================
// Domain.Kpi.Service.gs — ALLEGRO Business System
// Cálculo dos 8 KPIs do Painel de Direção (§3.4 — F9).
// CUSTO ZERO: execução via snapshot agendado (Scheduler 01h),
// não em tempo real — respeita o limite de 6 min do GAS.
// ============================================================

/**
 * Orquestrador principal do Painel de 8.
 * Calcula todos os KPIs e persiste um snapshot por código.
 * Chamado pelo Core.Scheduler às 01:00 ou manualmente via Api_kpiRecalcular.
 *
 * @returns {Object} Mapa de kpi_code → { value, unit, context }.
 */
function kpiSvcCalcularPainel() {
  var agora = new Date();
  var snapshotAt = agora.toISOString();
  var periodoYM = snapshotAt.slice(0, 7); // AAAA-MM
  var kpis = {};

  kpis[KPI_CODES.PIPELINE_PONDERADO]    = _kpiCalcPipelinePonderado();
  kpis[KPI_CODES.WIN_RATE_12M]          = _kpiCalcWinRate12m(agora);
  kpis[KPI_CODES.TICKET_MEDIO_12M]      = _kpiCalcTicketMedio12m(agora);
  kpis[KPI_CODES.MARGEM_REAL_MEDIA]     = _kpiCalcMargemRealMedia(agora);
  kpis[KPI_CODES.CAIXA_PROJETADO_90D]   = _kpiCalcCaixaProjetado90d(agora);
  kpis[KPI_CODES.BACKLOG_TOTAL]         = _kpiCalcBacklog();
  kpis[KPI_CODES.PROJETOS_NO_PRAZO_PCT] = _kpiCalcProjetosNoPrazo();
  kpis[KPI_CODES.SLAS_ESTOURADOS]       = _kpiCalcSlasEstourados();

  // Persiste um registro por KPI na aba KPI_SNAPSHOT
  for (var code in kpis) {
    if (!Object.prototype.hasOwnProperty.call(kpis, code)) continue;
    var kpi = kpis[code];
    kpiRepoSaveSnapshot({
      id:           'KPI-' + snapshotAt.replace(/[^0-9]/g, '').slice(0, 14) + '-' + code,
      snapshot_at:  snapshotAt,
      period:       periodoYM,
      kpi_code:     code,
      value:        kpi.value,
      unit:         kpi.unit,
      context_json: JSON.stringify(kpi.context || {})
    });
  }

  appendAuditLog('KPI_SNAPSHOT', 'KPI_SNAPSHOT', 'SYSTEM', 'Painel de 8 calculado — ' + snapshotAt);
  return kpis;
}

// ============================================================
// CÁLCULOS INDIVIDUAIS (privados)
// ============================================================

/**
 * KPI 1 — Pipeline ponderado (valor × probabilidade por estágio).
 * Probabilidades configuráveis via PROB_<STAGE> na aba CONFIG.
 */
function _kpiCalcPipelinePonderado() {
  // Usa propRepoGetAll() — sem acesso direto à sheet
  var proposals = propRepoGetAll();
  // Lê probabilidades via getConfigValue — sem acesso direto à sheet
  var probConfig = {};
  var ATIVOS_STAGES = ['DEMANDA', 'LEVANTAMENTO', 'PROPOSTA_GERADA', 'EM_REVISAO', 'APROVADA_ENVIO', 'ENVIADA'];
  for (var si = 0; si < ATIVOS_STAGES.length; si++) {
    var v = getConfigValue('PROB_' + ATIVOS_STAGES[si]);
    if (v !== null && v !== '') probConfig[ATIVOS_STAGES[si]] = parseFloat(v) || 0;
  }

  var total = 0;
  var count = 0;
  var ATIVOS = ['DEMANDA', 'LEVANTAMENTO', 'PROPOSTA_GERADA', 'EM_REVISAO', 'APROVADA_ENVIO', 'ENVIADA'];

  proposals.forEach(function(p) {
    if (ATIVOS.indexOf(p.status) === -1) return;
    var prob = probConfig.hasOwnProperty(p.status)
      ? probConfig[p.status]
      : (PIPELINE_PROB_DEFAULTS[p.status] || 0.10);
    var valor = parseFloat(p.total_estimado) || 0;
    total += valor * prob;
    count++;
  });

  return {
    value:   Math.round(total),
    unit:    'BRL',
    context: { proposals_count: count }
  };
}

/**
 * KPI 2 — Win rate 12 meses (% FECHADA / (FECHADA + RECUSADA)).
 */
function _kpiCalcWinRate12m(agora) {
  var dozeAnosAtras = new Date(agora);
  dozeAnosAtras.setMonth(dozeAnosAtras.getMonth() - 12);

  // Usa propRepoGetAll() — sem acesso direto à sheet
  var proposals = propRepoGetAll();
  var fechadas = 0;
  var recusadas = 0;

  proposals.forEach(function(p) {
    var closedAt = p.closed_at ? new Date(p.closed_at) : null;
    if (!closedAt || closedAt < dozeAnosAtras) return;
    if (p.status === 'FECHADA')   fechadas++;
    if (p.status === 'RECUSADA') recusadas++;
  });

  var total = fechadas + recusadas;
  var rate  = total > 0 ? Math.round((fechadas / total) * 100) : 0;

  return {
    value:   rate,
    unit:    'PCT',
    context: { fechadas: fechadas, recusadas: recusadas, total: total }
  };
}

/**
 * KPI 3 — Ticket médio das propostas FECHADAS nos últimos 12 meses.
 */
function _kpiCalcTicketMedio12m(agora) {
  var dozeAnosAtras = new Date(agora);
  dozeAnosAtras.setMonth(dozeAnosAtras.getMonth() - 12);

  // Usa propRepoGetAll() — sem acesso direto à sheet
  var proposals = propRepoGetAll();
  var soma  = 0;
  var count = 0;

  proposals.forEach(function(p) {
    if (p.status !== 'FECHADA') return;
    var closedAt = p.closed_at ? new Date(p.closed_at) : null;
    if (!closedAt || closedAt < dozeAnosAtras) return;
    soma += parseFloat(p.total_estimado) || 0;
    count++;
  });

  return {
    value:   count > 0 ? Math.round(soma / count) : 0,
    unit:    'BRL',
    context: { count: count }
  };
}

/**
 * KPI 4 — Margem real média (margem_global de pricing_json) das FECHADAS 12m.
 * Retorna percentual inteiro (0–100).
 */
function _kpiCalcMargemRealMedia(agora) {
  var dozeAnosAtras = new Date(agora);
  dozeAnosAtras.setMonth(dozeAnosAtras.getMonth() - 12);

  // Usa propRepoGetAll() — sem acesso direto à sheet
  var proposals = propRepoGetAll();
  var soma  = 0;
  var count = 0;

  proposals.forEach(function(p) {
    if (p.status !== 'FECHADA') return;
    var closedAt = p.closed_at ? new Date(p.closed_at) : null;
    if (!closedAt || closedAt < dozeAnosAtras) return;
    var pricing = {};
    try { pricing = JSON.parse(p.pricing_json || '{}'); } catch (e) {}
    if (pricing.margem_global !== undefined) {
      soma += pricing.margem_global;
      count++;
    }
  });

  return {
    value:   count > 0 ? Math.round((soma / count) * 100) : 0,
    unit:    'PCT',
    context: { count: count }
  };
}

/**
 * KPI 5 — Caixa projetado 90 dias.
 * Simplificado: soma 50 % do total_estimado das propostas ENVIADAS
 * (parcela prevista de assinatura/entrada) nos próximos 90 dias.
 * F16 (Domain.Caixa) aprimorará este cálculo com fluxo real.
 */
function _kpiCalcCaixaProjetado90d(agora) {
  // Usa propRepoGetAll() — sem acesso direto à sheet
  var proposals = propRepoGetAll();
  var entradas  = 0;

  proposals.forEach(function(p) {
    if (['ENVIADA', 'APROVADA_ENVIO'].indexOf(p.status) === -1) return;
    var valor = parseFloat(p.total_estimado) || 0;
    // Assume 50 % na assinatura/entrada como receita provável nos próximos 90d
    entradas += valor * 0.5;
  });

  return {
    value:   Math.round(entradas),
    unit:    'BRL',
    context: { nota: 'Simplificado — aprimorar com F16 Domain.Caixa' }
  };
}

/**
 * KPI 6 — Backlog total.
 * Por ora: propostas FECHADAS sem project_id associado.
 * F19 (Domain.Projetos) aprimorará com projetos em andamento reais.
 */
function _kpiCalcBacklog() {
  // Usa propRepoGetAll() — sem acesso direto à sheet
  var proposals = propRepoGetAll();
  var backlog = proposals.filter(function(p) {
    return p.status === 'FECHADA' && !p.project_id;
  });

  return {
    value:   backlog.length,
    unit:    'COUNT',
    context: { nota: 'Aprimorar com F19 Domain.Projetos' }
  };
}

/**
 * KPI 7 — % projetos no prazo.
 * Placeholder até F19: retorna 100 % enquanto não há dados de projetos reais.
 */
function _kpiCalcProjetosNoPrazo() {
  return {
    value:   100,
    unit:    'PCT',
    context: { nota: 'Aguardando F19 Domain.Projetos para cálculo real' }
  };
}

/**
 * KPI 8 — SLAs estourados.
 * Conta ACTION_CARDS abertos com due_at vencido +
 * TICKETS abertos sem resolução e sla_resolution_ok != TRUE.
 */
function _kpiCalcSlasEstourados() {
  var agora = new Date();

  // Cards de ação vencidos
  // Usa acGetAll() do ActionCards Repository — sem acesso direto à sheet
  var cards = acGetAll();
  var cardsEstourados = cards.filter(function(c) {
    return c.status === 'ABERTO' && c.due_at && new Date(c.due_at) < agora;
  });

  // Tickets SLA estourado
  var ticketsEstourados = [];
  try {
    // Usa tktRepoGetAll() do Tickets Repository — sem acesso direto à sheet
    var tks = tktRepoGetAll();
    ticketsEstourados = tks.filter(function(t) {
      return t.status === 'ABERTO' &&
             String(t.sla_resolution_ok).toUpperCase() !== 'TRUE' &&
             (!t.resolved_at || t.resolved_at === '');
    });
  } catch (e) {
    // Aba TICKETS ainda não existe — ignora silenciosamente
  }

  return {
    value:   cardsEstourados.length + ticketsEstourados.length,
    unit:    'COUNT',
    context: { cards: cardsEstourados.length, tickets: ticketsEstourados.length }
  };
}
