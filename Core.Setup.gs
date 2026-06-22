const USERS_HEADERS         = ['id', 'name', 'email', 'role', 'active', 'created_at'];
const TIMELINE_HEADERS      = ['id', 'timestamp', 'entity', 'entity_id', 'event_type', 'description', 'user_id', 'user_name'];
const CONFIG_HEADERS        = ['key', 'value', 'description'];

const CONFIG_DEFAULTS = [
  ['APP_NAME',              'Allegro Business System',          'Nome do sistema (legado)'],
  ['SYSTEM_NAME',           'SGA',                              'Sigla do sistema'],
  ['SYSTEM_FULL_NAME',      'Sistema de Gestão Allegro',        'Nome completo do sistema'],
  ['APP_VERSION',           '1.0.0',                            'Versão'],
  ['QUOTE_COUNTER',         '0',                      'Sequencial de propostas'],
  ['COMPANY_COUNTER',       '0',                      'Sequencial de empresas'],
  ['CONTACT_COUNTER',       '0',                      'Sequencial de contatos'],
  ['OPPORTUNITY_COUNTER',   '0',                      'Sequencial de oportunidades'],
  ['EXPENSE_COUNTER',             '0', 'Sequencial de despesas'],
  ['ACTION_CARD_COUNTER',         '0', 'Sequencial de action cards'],
  ['ACTION_CARD_HISTORY_COUNTER', '0', 'Sequencial de histórico de cards'],
  ['DOLLAR_RATE',      '5.18', 'Cotação do dólar americano'],
  ['PROPOSAL_COUNTER', '0',    'Sequencial de propostas'],
  // F7 — Financeiro: NF + Veículo
  ['NF_COUNTER',           '0', 'Sequencial de notas fiscais'],
  ['VEHICLE_LOG_COUNTER',  '0', 'Sequencial de registros de frota'],
  // F8 — Timesheet
  ['HORAS_COUNTER',        '0', 'Sequencial de lançamentos de horas'],
  // F18 — Compliance/HSE
  ['HSE_COUNTER',          '0', 'Sequencial de documentos HSE'],
  ['INSTRUMENT_COUNTER',   '0', 'Sequencial de instrumentos de medição'],
  // F15 — Compras e Estoque
  ['SUPPLIER_COUNTER',         '0',    'Sequencial de fornecedores'],
  ['MATERIAL_COUNTER',         '0',    'Sequencial de materiais'],
  ['MATERIAL_PRICE_COUNTER',   '0',    'Sequencial de histórico de preços de material'],
  ['PO_COUNTER',               '0',    'Sequencial legível de ordens de compra (PO-YYYY-NNN)'],
  ['PO_ID_COUNTER',            '0',    'Sequencial de IDs internos de ordens de compra'],
  ['STOCK_COUNTER',            '0',    'Sequencial de registros de estoque'],
  ['STOCK_MOV_COUNTER',        '0',    'Sequencial de movimentações de estoque'],
  ['TOLERANCIA_THREE_WAY_PCT', '0.05', 'Tolerância (fração) para three-way match (padrão 5%)'],
  // F6 — Pós-Venda: Base Instalada + Tickets
  ['BI_COUNTER',  '0', 'Sequencial de registros da base instalada'],
  ['TKT_COUNTER', '0', 'Sequencial de tickets'],
  // F16 — Caixa
  ['CASH_COUNTER', '0', 'Sequencial de movimentos de caixa'],
  // F19 — Projetos + RDO
  ['PROJECT_COUNTER',   '0', 'Sequencial de projetos'],
  ['RDO_COUNTER',       '0', 'Sequencial de RDOs'],
  ['MILESTONE_COUNTER', '0', 'Sequencial de marcos de projeto'],
  // F3 — Workflow: SLAs dos cards de proposta (em horas)
  ['SLA_LEVANTAMENTO_H',        '48',  'SLA para card de levantamento técnico (horas)'],
  ['SLA_REVISAO_PROPOSTA_H',    '24',  'SLA para card de revisão de proposta (horas)'],
  ['SLA_REVISAO_FINANCEIRO_H',  '24',  'SLA para card de revisão financeira (horas)'],
  ['SLA_ENVIO_PROPOSTA_H',       '8',  'SLA para card de envio de proposta aprovada (horas)'],
  ['SLA_RETORNO_CLIENTE_H',     '72',  'SLA para card de retorno do cliente (horas)'],
  ['SLA_KICKOFF_H',             '48',  'SLA para card de kickoff de projeto (horas)'],
  ['SLA_EMISSAO_NF_H',          '24',  'SLA para card de emissão de NF (horas)'],
  ['SLA_FOLLOWUP_H',            '48',  'SLA para card de follow-up pós-recusa (horas)'],
  // F6 — SLAs de tickets por prioridade (em horas)
  ['SLA_RESPONSE_CRITICA_H',    '1',   'SLA de resposta para tickets CRITICOS (horas)'],
  ['SLA_RESPONSE_ALTA_H',       '4',   'SLA de resposta para tickets ALTA (horas)'],
  ['SLA_RESPONSE_NORMAL_H',     '8',   'SLA de resposta para tickets NORMAL (horas)'],
  ['SLA_RESPONSE_BAIXA_H',      '24',  'SLA de resposta para tickets BAIXA (horas)'],
  ['SLA_RESOLUTION_CRITICA_H',  '4',   'SLA de resolução para tickets CRITICOS (horas)'],
  ['SLA_RESOLUTION_ALTA_H',     '24',  'SLA de resolução para tickets ALTA (horas)'],
  ['SLA_RESOLUTION_NORMAL_H',   '72',  'SLA de resolução para tickets NORMAL (horas)'],
  ['SLA_RESOLUTION_BAIXA_H',    '168', 'SLA de resolução para tickets BAIXA (horas)'],
  // F5 — Agenda/Calendário
  ['CALENDAR_ID',            '', 'ID do calendário Google (vazio = usa calendário padrão da conta)'],
  ['CALENDAR_EVENT_COUNTER', '0', 'Sequencial de eventos de agenda'],
  // Ciclo de feedback colaborativo — Triagens
  ['TRIAGEM_COUNTER',        '0', 'Sequencial de triagens (TRG-xxxxx)'],
  ['TRIAGEM_LOG_COUNTER',    '0', 'Sequencial de logs de triagem (TRL-xxxxxx)'],
  // FB-23 — Comentarios colaborativos na Visao Proposta
  ['PROPOSAL_COMMENT_COUNTER', '0', 'Sequencial de comentarios de proposta (PC-xxxxx)'],
];


/**
 * SETUP COMPLETO DO SGA — execute ESTA função (uma vez por ambiente).
 * Orquestra todos os inits e migrações na ordem correta. Idempotente:
 * pode rodar quantas vezes quiser sem duplicar nada.
 * @return {{ok:boolean, steps:string[], error?:string}}
 */
function setupAll() {
  var steps = [];
  try {
    initCoreSheets();              steps.push('initCoreSheets');
    initProposalsAddColumns();     steps.push('initProposalsAddColumns');
    _companiesEnsureColumns();     steps.push('_companiesEnsureColumns');
    initOpportunitiesAddColumns(); steps.push('initOpportunitiesAddColumns');
    initResiliencia();             steps.push('initResiliencia');
    initKpiSnapshotSheet();        steps.push('initKpiSnapshotSheet');
    initCalendarEventsSheet();     steps.push('initCalendarEventsSheet');
    migrateAcStatusPtBr();         steps.push('migrateAcStatusPtBr');
    // Drive: só roda se ROOT_FOLDER_ID estiver configurado; senão, pula sem erro
    if (drvGetRootId()) {
      setupDriveStructure();       steps.push('setupDriveStructure');
    } else {
      steps.push('setupDriveStructure PULADO (configure ROOT_FOLDER_ID e rode de novo)');
    }
    appendAuditLog('SETUP_ALL', 'SYSTEM', 'ALL', steps.join(' | '));
    Logger.log('setupAll concluído: ' + steps.join(' -> '));
    return { ok: true, steps: steps };
  } catch (e) {
    Logger.log('setupAll FALHOU em: ' + steps.join(' -> ') + ' | erro: ' + e.message);
    return { ok: false, steps: steps, error: e.message };
  }
}

function initCoreSheets() {
  initDriveRegistrySheet();   // Core.Drive.gs — registro de pastas do Drive
  getOrCreateSheet('CONFIG',   CONFIG_HEADERS);
  getOrCreateSheet('USERS',    USERS_HEADERS);
  getOrCreateSheet('AUDIT_LOG', AUDIT_HEADERS);
  getOrCreateSheet('TIMELINE', TIMELINE_HEADERS);
  initImportSheets();
  initExpensesSheet();
  initActionCardSheets();
  initWorkflowColumns();   // F3 — adiciona colunas de workflow à aba ACTION_CARDS
  initProductsSheet();
  initProposalsSheet();
  initProposalsAddColumns();
  initSetupCalcSheet();
  try { setupCalcBackfillInfraParams(); } catch (eBk) { Logger.log('[Setup] backfill CALC_INFRA falhou: ' + eBk.message); }
  initLaborRatesSheet();
  // F5 — Agenda/Calendário
  initCalendarEventsSheet();
  // F7 — Financeiro: NF + Veículo
  initInvoicesSheet();
  initVehicleLogSheet();
  // F8 — Timesheet
  initTimeEntriesSheet();
  // F9 — KPIs: Painel de Direção
  initKpiSnapshotSheet();
  // F14 — Email: Templates gerenciados
  initEmailTemplatesSheet();
  // F20 — EDM: Cofre de Documentos de Engenharia
  initEngDocsSheet();
  // F6 — Pós-Venda: Base Instalada + Tickets
  initBaseInstaladaSheet();
  initTicketsSheet();
  initTicketUpdatesSheet();
  initFeedbackSheet();
  // Ciclo de feedback colaborativo — Triagens (docs/ARQUITETURA-CICLO-FEEDBACK.md)
  initTriagemSheets();
  // FB-23: Comentarios colaborativos na Visao Proposta
  try { initProposalCommentsSheet(); } catch (eC) { Logger.log('[Setup] init PROPOSAL_COMMENTS falhou: ' + eC.message); }
  // F15 — Compras e Estoque
  initSuppliersSheet();
  initPurchaseOrdersSheet();
  initStockSheet();
  // F16 — Caixa: Livro Caixa + Reconciliações
  initCashLedgerSheet();
  // F19 — Projetos + RDO
  initProjectsSheet();
  // F18 — Compliance/HSE
  initComplianceSheets();

  initOpportunitiesAddColumns();

  CONFIG_DEFAULTS.forEach(([key, value, desc]) => {
    if (getConfigValue(key) === null) {
      const sheet = ss().getSheetByName('CONFIG');
      sheet.appendRow([key, value, desc]);
    }
  });
}

/**
 * Adiciona as colunas F2 à aba PROPOSALS caso ainda não existam.
 * Seguro para rodar em sistemas já em produção — não apaga dados existentes.
 * Colunas adicionadas: revision_num, parent_id, pricing_json, pdf_file_id,
 *   sent_at, closed_at, motivo_perda, alcada_nivel.
 */
function initProposalsAddColumns() {
  var sheet = ss().getSheetByName('PROPOSALS');
  if (!sheet) return; // aba ainda não existe; initProposalsSheet cuida disso
  var lastCol   = sheet.getLastColumn();
  var headerRow = lastCol > 0
    ? sheet.getRange(1, 1, 1, lastCol).getValues()[0]
    : [];
  // FONTE ÚNICA: PROPOSALS_NEW_COLS (Domain.Proposals.Model.gs).
  // A lista hardcoded antiga ficou para trás do modelo e fez flow_json,
  // opportunity_id e import_origem nunca serem criados pelo setupAll —
  // valores eram descartados em silêncio na gravação.
  var newCols = (typeof PROPOSALS_NEW_COLS !== 'undefined') ? PROPOSALS_NEW_COLS : [];
  for (var i = 0; i < newCols.length; i++) {
    if (headerRow.indexOf(newCols[i]) === -1) {
      lastCol += 1;
      sheet.getRange(1, lastCol).setValue(newCols[i]);
    }
  }
}

/**
 * Retorna metadados do sistema para o frontend (título, sigla, ambiente).
 * Lido em tempo de carregamento pelas UIs — nunca hardcoded nos HTMLs.
 */
function Api_getSystemMeta() {
  try {
    return {
      ok:              true,
      system_name:     getConfigValue('SYSTEM_NAME')      || 'SGA',
      system_full_name:getConfigValue('SYSTEM_FULL_NAME') || 'Sistema de Gestão Allegro',
      env:             getConfigValue('ENV')              || 'PROD'
    };
  } catch (e) {
    return { ok: true, system_name: 'SGA', system_full_name: 'Sistema de Gestão Allegro', env: 'PROD' };
  }
}

/**
 * Migra os valores de status da aba ACTION_CARDS de inglês para PT-BR.
 * Idempotente: uma segunda execução não altera nenhum registro.
 * Deve ser executada UMA vez por ambiente junto do setupAll().
 * Mapa: OPEN→ABERTO, IN_PROGRESS→EM_ANDAMENTO, FINISHED→CONCLUIDO, CANCELLED→CANCELADO.
 */
function migrateAcStatusPtBr() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sheet = ss().getSheetByName('ACTION_CARDS');
    if (!sheet || sheet.getLastRow() < 2) {
      appendAuditLog('MIGRATE_AC_STATUS', 'ACTION_CARDS', 'SYSTEM',
        'migrateAcStatusPtBr: aba vazia ou inexistente — 0 registros convertidos');
      return;
    }

    var lastCol    = sheet.getLastColumn();
    var headerRow  = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    var statusCol  = headerRow.indexOf('status');
    if (statusCol === -1) {
      Logger.log('[migrateAcStatusPtBr] Coluna "status" não encontrada.');
      return;
    }

    var MAP = { 'OPEN': 'ABERTO', 'IN_PROGRESS': 'EM_ANDAMENTO', 'FINISHED': 'CONCLUIDO', 'CANCELLED': 'CANCELADO' };
    var dataRange  = sheet.getRange(2, statusCol + 1, sheet.getLastRow() - 1, 1);
    var values     = dataRange.getValues();
    var converted  = 0;

    for (var i = 0; i < values.length; i++) {
      var old = String(values[i][0] || '');
      if (MAP[old]) {
        values[i][0] = MAP[old];
        converted++;
      }
    }

    if (converted > 0) dataRange.setValues(values);

    appendAuditLog('MIGRATE_AC_STATUS', 'ACTION_CARDS', 'SYSTEM',
      converted + ' registros convertidos para PT-BR');
    Logger.log('[migrateAcStatusPtBr] ' + converted + ' registros convertidos.');
  } finally {
    lock.releaseLock();
  }
}

/**
 * Adiciona as colunas extras de F4 (points_json, pricing_summary, updated_at)
 * à aba OPPORTUNITIES caso ainda não existam.
 * Seguro para rodar em sistemas já em produção — não apaga dados existentes.
 */
function initOpportunitiesAddColumns() {
  var sheet = ss().getSheetByName('OPPORTUNITIES');
  if (!sheet) return; // aba ainda não existe; initImportSheets cria depois
  var extraCols = ['points_json', 'pricing_summary', 'updated_at'];
  var headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var lastCol = sheet.getLastColumn();
  for (var i = 0; i < extraCols.length; i++) {
    if (headerRow.indexOf(extraCols[i]) === -1) {
      lastCol += 1;
      sheet.getRange(1, lastCol).setValue(extraCols[i]);
    }
  }
}

/**
 * Configura os componentes de resiliência (F12):
 *  - Scheduler central (trigger horário único)
 *  - Trigger de backup diário (fallback direto, caso o scheduler falhe)
 * Chamado ao final de initSetup().
 */
function initResiliencia() {
  try {
    setupScheduler();
    Logger.log('[Setup] Scheduler central configurado.');
  } catch (e) {
    Logger.log('[Setup] Erro ao configurar scheduler: ' + e.message);
  }

  try {
    setupBackupTrigger();
    Logger.log('[Setup] Trigger de backup configurado.');
  } catch (e) {
    Logger.log('[Setup] Erro ao configurar trigger de backup: ' + e.message);
  }

  // Trigger periódico do notificador de triagens (30 min — ciclo de feedback)
  try {
    instalarTriggerTriagem();
    Logger.log('[Setup] Trigger periódico de triagens configurado.');
  } catch (e) {
    Logger.log('[Setup] Erro ao configurar trigger de triagens: ' + e.message);
  }

  // Trigger do bridge agentes -> Apps Script via JSON no Drive (1 min)
  try {
    instalarTriggerAgentBridge();
    Logger.log('[Setup] Trigger do AgentBridge configurado.');
  } catch (e) {
    Logger.log('[Setup] Erro ao configurar trigger do AgentBridge: ' + e.message);
  }
}

/**
 * Inicializa a aba KPI_SNAPSHOT com cabeçalhos (F9 — KPIs).
 * Idempotente: usa getOrCreateSheet() — não recria se já existir.
 * Chamado por initCoreSheets().
 */
function initKpiSnapshotSheet() {
  getOrCreateSheet(KPI_SNAPSHOT_SHEET, KPI_SNAPSHOT_HEADERS);
}

/**
 * Inicializa a aba CALENDAR_EVENTS com cabeçalhos.
 * Idempotente: usa getOrCreateSheet() que não recria se já existir.
 * Chamado por initCoreSheets() (F5 — Agenda/Calendário).
 */
function initCalendarEventsSheet() {
  getOrCreateSheet(CALENDAR_EVENTS_SHEET, CALENDAR_EVENTS_HEADERS);
}

function appendTimelineEvent(entity, entityId, eventType, description) {
  const user = getCurrentUser();
  appendRowToSheet('TIMELINE', {
    id: generateId('TML'),
    timestamp: nowISO(),
    entity: entity,
    entity_id: String(entityId),
    event_type: eventType,
    description: description,
    user_id: user ? user.id : 'SYSTEM',
    user_name: user ? user.name : 'Sistema'
  }, TIMELINE_HEADERS);
}

/**
 * FB-23: lê a timeline de uma entidade (Proposta, Oportunidade, Ticket, etc).
 * Usado pela Visão Proposta pra montar o histórico.
 * @param {string} entity     (ex: 'Proposta')
 * @param {string} entityId   (ex: 'P-00012')
 * @return {{ok:true,data:Array}|{ok:false,error:string}}
 */
function Api_timelineByEntity(entity, entityId) {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN', 'TECNICO']);
    if (!entity || !entityId) throw new Error('entity e entityId sao obrigatorios.');
    var rows = sheetToObjects('TIMELINE');
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i].entity || '') === String(entity) &&
          String(rows[i].entity_id || '') === String(entityId)) {
        out.push(rows[i]);
      }
    }
    out.sort(function (a, b) {
      return String(b.timestamp || '').localeCompare(String(a.timestamp || ''));
    });
    return { ok: true, data: sanitizeForClient(out) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
