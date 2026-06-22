// ============================================================
// Domain.Proposals.Model.gs — ALLEGRO Business System
// Modelo de dados: estados, transições e definição de colunas
// da aba PROPOSALS (Fase F2 — máquina de estados unificada).
// ============================================================

// Evita redeclaração se Domain.ProposalEngine.gs ainda estiver presente.
if (typeof PROPOSALS_SHEET === 'undefined') {
  var PROPOSALS_SHEET = 'PROPOSALS';
}

/**
 * Conjunto canônico de status da máquina de estados F2.
 * Os termos RASCUNHO / REVISADO / APROVADO / REPROVADO / ENVIADO / CANCELADO
 * do ProposalEngine original foram abolidos.
 */
var PROPOSAL_STATUS = {
  DEMANDA:         'DEMANDA',
  LEVANTAMENTO:    'LEVANTAMENTO',
  PROPOSTA_GERADA: 'PROPOSTA_GERADA',
  EM_REVISAO:      'EM_REVISAO',
  APROVADA_ENVIO:  'APROVADA_ENVIO',
  ENVIADA:         'ENVIADA',
  FECHADA:         'FECHADA',
  RECUSADA:        'RECUSADA',
  SUBSTITUIDA:     'SUBSTITUIDA',
  CANCELADA:       'CANCELADA'
};

/**
 * Grafo de transições permitidas.
 * Para cada estado atual: quais estados podem ser destino e quais
 * papéis de usuário têm permissão para acionar a transição.
 *
 * Regra de alçada (VALIDACAO_V3 §3.1):
 *   EM_REVISAO → APROVADA_ENVIO com alcada_nivel=COMPLETA exige
 *   card de revisão fechado por FINANCEIRO_ADMIN (verificado no Service).
 */
var PROPOSAL_TRANSITIONS = {
  DEMANDA: {
    next:  ['LEVANTAMENTO', 'CANCELADA'],
    roles: ['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'TECNICO']
  },
  LEVANTAMENTO: {
    next:  ['PROPOSTA_GERADA', 'CANCELADA'],
    roles: ['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'TECNICO']
  },
  PROPOSTA_GERADA: {
    next:  ['EM_REVISAO', 'CANCELADA'],
    roles: ['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'TECNICO']
  },
  EM_REVISAO: {
    next:  ['APROVADA_ENVIO', 'PROPOSTA_GERADA', 'CANCELADA'],
    roles: ['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN']
  },
  APROVADA_ENVIO: {
    next:  ['ENVIADA', 'CANCELADA'],
    roles: ['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN'] // FB-23: Maria (FINANCEIRO_ADMIN) pode aprovar envio
  },
  ENVIADA: {
    next:  ['FECHADA', 'RECUSADA', 'SUBSTITUIDA'],
    roles: ['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL']
  },
  FECHADA:    { next: [], roles: [] },
  RECUSADA:   { next: [], roles: [] },
  SUBSTITUIDA:{ next: [], roles: [] },
  CANCELADA:  { next: [], roles: [] }
};

/**
 * Colunas novas adicionadas na F2 à aba PROPOSALS.
 * Colunas pré-existentes herdadas do ProposalEngine não são listadas aqui;
 * initProposalsAddColumns() garante que só insere o que ainda não existe.
 */
var PROPOSALS_NEW_COLS = [
  'flow_json',      // fluxograma editável da solução [{title, sub}] — vazio = automático
  'opportunity_id', // FK — oportunidade de origem (CONCEITO_FLUXO.md)
  'revision_num',   // 'R0', 'R1', 'R2'…
  'parent_id',      // ID da proposta original (para revisões)
  'pricing_json',   // JSON completo do prcCalcProposta
  'pdf_file_id',    // ID do arquivo PDF no Drive
  'sent_at',        // timestamp quando passou para ENVIADA
  'closed_at',      // timestamp quando passou para FECHADA/RECUSADA
  'motivo_perda',   // obrigatório ao entrar em RECUSADA
  'alcada_nivel',   // 'SIMPLIFICADA' ou 'COMPLETA'
  'import_origem',  // 'IMPORT_LEGADO' quando veio da base histórica
  'contact_id',     // FB-19: FK para CONTACTS — responsavel selecionado nos contatos da empresa
  'contact_phone',  // FB-19: snapshot do telefone do contato no momento da criacao
  'contact_email',  // FB-19: snapshot do email do contato (para envio automatico futuro)
  // FB-20/26/27 — Levantamento tecnico migrado de Oportunidade (guia OPPORTUNITIES sera deletada)
  'product',           // produto/sensor identificado no levantamento
  'max_temp',          // temperatura maxima do processo
  'qty_sensors_xt',    // quantidade de sensores XT
  'qty_sensors_ht',    // quantidade de sensores HT
  'qty_sensors_probe', // quantidade de sensores Probe
  'installation_point',// ponto de instalacao
  'automation_detail', // detalhe de automacao
  'hydro_view',        // configuracao Hydro View
  'infra_distance',    // distancia de Curitiba em km (entrada da calculadora de custos)
  'tamanho_infra',     // FB-20: tamanho da infra em metros (NOVO campo — nao existia em OPPORTUNITIES)
  'tech_notes'         // notas tecnicas livres do levantamento
];

/**
 * Cabeçalhos legados do ProposalEngine original, mantidos para
 * retrocompatibilidade com dados já gravados na planilha.
 */
var PROPOSALS_LEGACY_HEADERS = [
  'id', 'number', 'date', 'type', 'client_id', 'client_name', 'location',
  'responsible', 'status', 'items_json', 'scope_text', 'startup_value',
  'total_value', 'payment_terms', 'delivery_days', 'validity_days',
  'observations', 'ai_review_notes', 'created_by', 'created_at', 'updated_at'
];

/**
 * Cabeçalhos completos F2 = legado + novas colunas.
 */
var PROPOSALS_HEADERS_F2 = PROPOSALS_LEGACY_HEADERS.concat(PROPOSALS_NEW_COLS);

/**
 * Cria a aba PROPOSALS com os cabeçalhos legados se ela ainda não existir.
 * Chamado por Core.Setup.initCoreSheets() (linha 76).
 */
function initProposalsSheet() {
  getOrCreateSheet(PROPOSALS_SHEET, PROPOSALS_LEGACY_HEADERS);
  if (getConfigValue('PROPOSAL_COUNTER') === null) {
    var sheet = ss().getSheetByName('CONFIG');
    sheet.appendRow(['PROPOSAL_COUNTER', '0', 'Sequencial de propostas técnicas']);
  }
}
