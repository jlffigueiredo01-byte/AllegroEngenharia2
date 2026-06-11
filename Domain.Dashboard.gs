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
    var quoteHeaders  = sheetToObjects('QUOTE_HEADERS');
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
    var quotesTotalValue  = 0;
    var quotesClosedValue = 0;

    quoteHeaders.forEach(function(r) {
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
          total:          quoteHeaders.length,
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
