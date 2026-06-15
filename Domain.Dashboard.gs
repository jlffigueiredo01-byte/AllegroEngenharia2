/**
 * ALLEGRO Business System — Domain.Dashboard.gs
 * Provides aggregated dashboard statistics across all CRM entities.
 */

/**
 * Returns aggregated dashboard statistics for the Allegro CRM.
 *
 * @returns {{ok: boolean, data?: Object, error?: string}}
 */
function Api_getDashboardStats() {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN', 'TECNICO']);

    // Load all sheets
    var companies     = sheetToObjects('COMPANIES');
    var contacts      = sheetToObjects('CONTACTS');
    var opportunities = sheetToObjects('OPPORTUNITIES');
    var actionCards   = sheetToObjects('ACTION_CARDS');
    var timeline      = sheetToObjects('TIMELINE');
    var expenses      = sheetToObjects('EXPENSES');

    // --- Companies ---
    var companiesActive = companies.filter(function(r) {
      return r.active === 'TRUE';
    });

    // --- Contacts ---
    var contactsActive = contacts.filter(function(r) {
      return r.active === 'TRUE';
    });

    // --- Opportunities ---
    var activeStatuses = ['Lead', 'Elaborando proposta', 'Proposta enviada'];
    var oppByStatus = {};
    var oppTotalActive = 0;

    opportunities.forEach(function(r) {
      var s = r.status || '';
      oppByStatus[s] = (oppByStatus[s] || 0) + 1;
      if (activeStatuses.indexOf(s) !== -1) {
        oppTotalActive++;
      }
    });

    // --- Quotes ---
    // QUOTE_HEADERS foi descontinuada (desenho legado substituído por PROPOSALS).
    // KPIs de proposta vêm de PROPOSALS via Api_dashV2.
    var quotesTotalValue  = 0;
    var quotesClosedValue = 0;
    var quotesTotal       = 0;
    [].forEach(function(r) {
      var val = safeNumber(r.total_value_brl);
      quotesTotalValue += val;
      if (r.status === 'Proposta fechada') {
        quotesClosedValue += val;
      }
    });

    // --- Action Cards ---
    var openStatuses       = ['ABERTO', 'EM_ANDAMENTO'];
    var actionOpen         = 0;
    var actionInProgress   = 0;
    var actionUrgent       = 0;

    actionCards.forEach(function(r) {
      var s = r.status || '';
      if (s === 'ABERTO')       actionOpen++;
      if (s === 'EM_ANDAMENTO') actionInProgress++;

      var isUrgent = r.urgent === 'TRUE' || r.urgent === true;
      if (isUrgent && openStatuses.indexOf(s) !== -1) {
        actionUrgent++;
      }
    });

    // --- Expenses ---
    var expensesTotalValue = 0;
    var expensesAtivo = expenses.filter(function(r) {
      return (r.status || '').toUpperCase() === 'ATIVO';
    });

    expensesAtivo.forEach(function(r) {
      expensesTotalValue += safeNumber(r.total);
    });

    // --- Recent Activity (last 10 from TIMELINE, sorted desc) ---
    var sorted = timeline.slice().sort(function(a, b) {
      var ta = new Date(a.timestamp).getTime() || 0;
      var tb = new Date(b.timestamp).getTime() || 0;
      return tb - ta;
    });

    var recentActivity = sorted.slice(0, 10).map(function(r) {
      return {
        timestamp:   r.timestamp,
        description: r.description,
        user_name:   r.user_name,
        event_type:  r.event_type
      };
    });

    return {
      ok: true,
      data: {
        companies: {
          total:  companies.length,
          active: companiesActive.length
        },
        contacts: {
          total:  contacts.length,
          active: contactsActive.length
        },
        opportunities: {
          total:       opportunities.length,
          byStatus:    oppByStatus,
          totalActive: oppTotalActive
        },
        quotes: {
          total:          quotesTotal,
          totalValueBRL:  quotesTotalValue,
          closedValueBRL: quotesClosedValue
        },
        actionCards: {
          open:       actionOpen,
          inProgress: actionInProgress,
          urgent:     actionUrgent
        },
        expenses: {
          total:         expenses.length,
          totalValueBRL: expensesTotalValue
        },
        recentActivity: recentActivity
      }
    };

  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}


/**
 * Dashboard v2 — read-model agregado (uma chamada, Doherty <400ms).
 * KPIs do Painel de 8 (com os dados já disponíveis), funil canônico,
 * série de 6 meses, fila "precisa de você", atividade e garantias.
 */
function Api_dashV2() {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN', 'TECNICO']);

    var props    = sheetToObjects(PROPOSALS_SHEET);
    var projects = sheetToObjects(PROJECTS_SHEET);
    var cards    = sheetToObjects('ACTION_CARDS');
    var timeline = sheetToObjects('TIMELINE');

    var hoje = new Date();
    var mesAtual = hoje.getFullYear() + '-' + ('0' + (hoje.getMonth() + 1)).slice(-2);
    var anoAtual = String(hoje.getFullYear());

    // ── KPIs comerciais
    var ABERTAS = { PROPOSTA_GERADA: 1, EM_REVISAO: 1, APROVADA_ENVIO: 1, ENVIADA: 1 };
    var pipelineQtd = 0, pipelineVal = 0;
    var fechMesVal = 0, fechMesQtd = 0, fechYtdVal = 0;
    var nFech = 0, nRec = 0, somaFech = 0, somaMargem = 0, nMargem = 0;
    var funil = {};
    var ESTAGIOS = ['PROPOSTA_GERADA', 'EM_REVISAO', 'APROVADA_ENVIO', 'ENVIADA', 'FECHADA', 'RECUSADA'];
    for (var e = 0; e < ESTAGIOS.length; e++) funil[ESTAGIOS[e]] = { qtd: 0, valor: 0 };

    var paradas = []; // ENVIADA sem movimento > 7 dias
    var seis = {};    // série 6 meses
    for (var m6 = 5; m6 >= 0; m6--) {
      var dt = new Date(hoje.getFullYear(), hoje.getMonth() - m6, 1);
      var key = dt.getFullYear() + '-' + ('0' + (dt.getMonth() + 1)).slice(-2);
      seis[key] = { mes: key, criadas: 0, fechado_valor: 0 };
    }

    for (var i = 0; i < props.length; i++) {
      var p = props[i];
      var val = Number(p.total_value || 0);
      var st  = p.status || '';
      if (funil[st]) { funil[st].qtd++; funil[st].valor += val; }
      if (ABERTAS[st]) { pipelineQtd++; pipelineVal += val; }
      if (st === 'FECHADA') {
        nFech++; somaFech += val;
        var closed = String(p.closed_at || p.updated_at || '');
        if (closed.indexOf(mesAtual) === 0) { fechMesVal += val; fechMesQtd++; }
        if (closed.indexOf(anoAtual) === 0) { fechYtdVal += val; }
        if (seis[closed.slice(0, 7)]) seis[closed.slice(0, 7)].fechado_valor += val;
        try {
          var pj = JSON.parse(p.pricing_json || '{}');
          if (pj && typeof pj.margem_global === 'number') { somaMargem += pj.margem_global; nMargem++; }
        } catch (eM) {}
      }
      if (st === 'RECUSADA') nRec++;
      var created = String(p.created_at || '').slice(0, 7);
      if (seis[created]) seis[created].criadas++;
      if (st === 'ENVIADA' && !p.import_origem) {
        var upd = new Date(p.updated_at || p.sent_at || p.created_at);
        var dias = Math.floor((hoje - upd) / 86400000);
        if (!isNaN(dias) && dias >= 7) {
          paradas.push({ id: p.id, number: p.number, client: p.client_name, dias: dias });
        }
      }
    }

    // ── Backlog: projetos não entregues, valorados pela proposta de origem
    var propById = {};
    for (var pb = 0; pb < props.length; pb++) propById[String(props[pb].id)] = props[pb];
    var backlogVal = 0, backlogQtd = 0;
    for (var j = 0; j < projects.length; j++) {
      var stP = projects[j].status || '';
      if (stP !== 'ENTREGUE' && stP !== 'ENCERRADO') {
        backlogQtd++;
        var orig = propById[String(projects[j].proposal_id)];
        if (orig) backlogVal += Number(orig.total_value || 0);
      }
    }

    // ── Cards: abertos / urgentes / SLA
    var cardsAbertos = 0, cardsUrgentes = [];
    for (var c = 0; c < cards.length; c++) {
      var cs = cards[c].status || '';
      if (cs === 'ABERTO' || cs === 'EM_ANDAMENTO' || cs === 'SLA_ESTOURADO') {
        cardsAbertos++;
        var urgente = cs === 'SLA_ESTOURADO' ||
          String(cards[c].urgent).toUpperCase() === 'TRUE' ||
          (cards[c].due_at && new Date(cards[c].due_at) < hoje);
        if (urgente) cardsUrgentes.push({ id: cards[c].id, title: cards[c].title, assigned: cards[c].assigned_to_name || cards[c].assigned_to || '' });
      }
    }

    // ── Garantias vencendo (reuso do domínio Base Instalada)
    var garantias = [];
    try {
      var gRes = biSvcGetVencimentosGarantia ? biSvcGetVencimentosGarantia(90) : null;
      if (gRes && gRes.length) garantias = gRes.slice(0, 5);
    } catch (eG) { /* domínio indisponível */ }

    // ── Atividade recente
    timeline.sort(function (a, b) { return String(b.timestamp).localeCompare(String(a.timestamp)); });
    var atividade = [];
    for (var t = 0; t < timeline.length && t < 8; t++) {
      atividade.push({
        desc: timeline[t].description || timeline[t].event_type || '',
        ts: timeline[t].timestamp, user: timeline[t].user_name || ''
      });
    }

    // ── Atuação por estado (mapa do Brasil)
    var companies = sheetToObjects(COMPANIES_SHEET);
    var ufByCompany = {};
    var porEstado = {};
    for (var ce = 0; ce < companies.length; ce++) {
      var ufC = String(companies[ce].state || '').trim().toUpperCase();
      ufByCompany[String(companies[ce].id)] = ufC;
      if (!ufC || ufC === 'PY') continue; // PY fica fora do mapa BR
      if (!porEstado[ufC]) porEstado[ufC] = { empresas: 0, propostas: 0, valor_fechado: 0 };
      porEstado[ufC].empresas++;
    }
    for (var pe = 0; pe < props.length; pe++) {
      var ufP = ufByCompany[String(props[pe].client_id)] || '';
      if (!ufP || ufP === 'PY' || !porEstado[ufP]) continue;
      porEstado[ufP].propostas++;
      if (props[pe].status === 'FECHADA') porEstado[ufP].valor_fechado += Number(props[pe].total_value || 0);
    }

    var serie = [];
    for (var sk in seis) serie.push(seis[sk]);

    return { ok: true, data: sanitizeForClient({
      kpis: {
        pipeline:     { qtd: pipelineQtd, valor: Math.round(pipelineVal * 100) / 100 },
        fechado_mes:  { qtd: fechMesQtd, valor: Math.round(fechMesVal * 100) / 100 },
        fechado_ytd:  Math.round(fechYtdVal * 100) / 100,
        win_rate:     (nFech + nRec) ? Math.round(100 * nFech / (nFech + nRec)) : null,
        ticket_medio: nFech ? Math.round(somaFech / nFech) : null,
        margem_media: nMargem ? Math.round(1000 * somaMargem / nMargem) / 10 : null,
        backlog:      { qtd: backlogQtd, valor: Math.round(backlogVal * 100) / 100 },
        cards:        { abertos: cardsAbertos, urgentes: cardsUrgentes.length }
      },
      funil: funil,
      serie_6m: serie,
      urgentes: cardsUrgentes.slice(0, 6),
      paradas: paradas.slice(0, 6),
      garantias: garantias,
      atividade: atividade,
      por_estado: porEstado
    })};
  } catch (e2) {
    return { ok: false, error: e2.message };
  }
}


/**
 * Cascata de manutenção do sistema (botão ATUALIZAR TUDO do dashboard).
 * Roda cada etapa isoladamente — uma falha não derruba as demais — e
 * devolve o relatório passo a passo. Restrito ao DIRETOR_TECNICO.
 */
function Api_sysAtualizarTudo() {
  try {
    requireRole(['DIRETOR_TECNICO']);
    var passos = [];
    var rodar = function (nome, fn) {
      try {
        var r = fn();
        passos.push({ etapa: nome, ok: true, detalhe: typeof r === 'object' ? JSON.stringify(r).slice(0, 120) : '' });
      } catch (e) {
        passos.push({ etapa: nome, ok: false, detalhe: e.message });
      }
    };

    rodar('setupAll (abas, colunas, seeds, triggers)', function () { return setupAll(); });
    rodar('Reparo da importação (valores + marcação)', function () {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      if (!ss.getSheetByName(IMP_SHEET_ORG)) return 'aba de importação ausente — pulado';
      return corrigirImportacao();
    });
    rodar('Descritivos e mídia dos produtos', function () {
      seedProductDescriptions(); seedProductMedia(); return 'ok';
    });
    rodar('Colunas de tickets/updates', function () { _tktEnsureColumns(); return 'ok'; });
    rodar('Aba de feedback', function () { initFeedbackSheet(); return 'ok'; });
    rodar('Colunas de geolocalização (COMPANIES)', function () { _companiesEnsureColumns(); return 'ok'; });

    return { ok: true, data: { passos: passos } };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
