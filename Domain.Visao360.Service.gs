// Helper global: o google.script.run NÃO serializa objetos Date — a resposta
// vira null no cliente ("sem resposta"). O Sheets converte células de data
// automaticamente, então TODO endpoint que devolve linhas cruas precisa
// passar por aqui. JSON.stringify converte Date em ISO string.
function sanitizeForClient(o) {
  return JSON.parse(JSON.stringify(o));
}

// =============================================================================
// Domain.Visao360.Service.gs — SGA
// Read-model agregador da Visão 360: entrega o workspace completo de um
// cliente em UMA chamada.
//
// NOTA DE ARQUITETURA: este service lê as abas de outros domínios diretamente
// (sheetToObjects). É uma exceção deliberada à regra "Repository é o único
// ponto de acesso do domínio": trata-se de uma PROJEÇÃO SOMENTE-LEITURA
// (padrão CQRS read-model). Nenhuma escrita acontece aqui — toda ação de
// criação continua passando pelas Apis dos domínios donos.
// =============================================================================

/**
 * Monta o workspace 360 de uma empresa.
 * @param {string} companyId
 * @return {Object} company, contacts, opportunities, proposals, projects,
 *                  milestones_by_project, pos, base, tickets, expenses,
 *                  timeline (desc, cap 50), kpis
 */
function c360SvcGet(companyId) {
  if (!companyId) throw new Error('companyId é obrigatório.');

  var cid = String(companyId);

  // --- Empresa
  var company = null;
  var companies = sheetToObjects(COMPANIES_SHEET);
  for (var i = 0; i < companies.length; i++) {
    if (String(companies[i].id) === cid) { company = companies[i]; break; }
  }
  if (!company) throw new Error('Empresa não encontrada: ' + companyId);

  // --- Coleções por vínculo direto
  var contacts = sheetToObjects(CONTACTS_SHEET).filter(function (r) {
    return String(r.company_id) === cid;
  });
  var opportunities = sheetToObjects(OPPORTUNITIES_SHEET).filter(function (r) {
    return String(r.company_id) === cid;
  });
  var proposals = sheetToObjects(PROPOSALS_SHEET).filter(function (r) {
    return String(r.client_id) === cid;
  });
  var projects = sheetToObjects(PROJECTS_SHEET).filter(function (r) {
    return String(r.company_id) === cid;
  });
  var base = sheetToObjects(BASE_INSTALADA_SHEET).filter(function (r) {
    return String(r.company_id) === cid;
  });
  var tickets = sheetToObjects(TICKETS_SHEET).filter(function (r) {
    return String(r.company_id) === cid;
  });

  // --- Índices de ids para vínculos indiretos
  var propIds = {}, projIds = {};
  for (var p = 0; p < proposals.length; p++) propIds[String(proposals[p].id)] = true;
  for (var j = 0; j < projects.length; j++) projIds[String(projects[j].id)] = true;

  var pos = sheetToObjects(PURCHASE_ORDERS_SHEET).filter(function (r) {
    return propIds[String(r.proposal_id)] || projIds[String(r.project_id)];
  });
  var tktIds = {};
  for (var tk2 = 0; tk2 < tickets.length; tk2++) tktIds[String(tickets[tk2].id)] = true;
  var expenses = sheetToObjects(EXPENSES_SHEET).filter(function (r) {
    if (r.status === 'DELETED') return false;
    if (r.ref_type === 'PROPOSAL') return propIds[String(r.ref_id)];
    if (r.ref_type === 'PROJECT')  return projIds[String(r.ref_id)];
    if (r.ref_type === 'TICKET')   return tktIds[String(r.ref_id)];
    return false;
  });

  // --- Marcos agregados por projeto (x concluídos / y total)
  var milestonesByProject = {};
  if (projects.length) {
    var allMs = sheetToObjects(PROJECT_MILESTONES_SHEET);
    for (var m = 0; m < allMs.length; m++) {
      var pid = String(allMs[m].project_id);
      if (!projIds[pid]) continue;
      if (!milestonesByProject[pid]) milestonesByProject[pid] = { done: 0, total: 0 };
      milestonesByProject[pid].total++;
      if (allMs[m].status === 'CONCLUIDO') milestonesByProject[pid].done++;
    }
  }

  // --- Timeline unificada: tudo que aconteceu com as entidades deste cliente
  var idSet = {};
  idSet[cid] = true;
  var collect = function (rows) {
    for (var k = 0; k < rows.length; k++) idSet[String(rows[k].id)] = true;
  };
  collect(opportunities); collect(proposals); collect(projects);
  collect(pos); collect(base); collect(tickets);

  var timeline = sheetToObjects('TIMELINE').filter(function (r) {
    return idSet[String(r.entity_id)];
  });
  timeline.sort(function (a, b) {
    return String(b.timestamp).localeCompare(String(a.timestamp));
  });
  if (timeline.length > 50) timeline = timeline.slice(0, 50);

  // --- Mini-KPIs do cliente
  var totalFechado = 0, abertas = 0;
  var ABERTOS = { PROPOSTA_GERADA: 1, EM_REVISAO: 1, APROVADA_ENVIO: 1, ENVIADA: 1 };
  for (var q = 0; q < proposals.length; q++) {
    if (proposals[q].status === 'FECHADA') totalFechado += Number(proposals[q].total_value || 0);
    if (ABERTOS[proposals[q].status]) abertas++;
  }
  var ticketsAbertos = 0;
  for (var t = 0; t < tickets.length; t++) {
    var st = String(tickets[t].status || '');
    if (st !== 'FECHADO' && st !== 'CANCELADO' && st !== 'RESOLVIDO') ticketsAbertos++;
  }
  var totalDespesas = 0;
  for (var e2 = 0; e2 < expenses.length; e2++) totalDespesas += Number(expenses[e2].total || 0);

  // Ordenação: mais recentes primeiro onde houver created_at
  var byCreatedDesc = function (a, b) {
    return String(b.created_at || '').localeCompare(String(a.created_at || ''));
  };
  opportunities.sort(byCreatedDesc);
  proposals.sort(byCreatedDesc);
  projects.sort(byCreatedDesc);
  pos.sort(byCreatedDesc);

  return {
    company:               company,
    contacts:              contacts,
    opportunities:         opportunities,
    proposals:             proposals,
    projects:              projects,
    milestones_by_project: milestonesByProject,
    pos:                   pos,
    base:                  base,
    tickets:               tickets,
    expenses:              expenses,
    timeline:              timeline,
    kpis: {
      total_fechado:    Math.round(totalFechado * 100) / 100,
      propostas_abertas: abertas,
      equipamentos:     base.length,
      tickets_abertos:  ticketsAbertos,
      total_despesas:   Math.round(totalDespesas * 100) / 100,
      ultima_interacao: timeline.length ? timeline[0].timestamp : ''
    }
  };
}
