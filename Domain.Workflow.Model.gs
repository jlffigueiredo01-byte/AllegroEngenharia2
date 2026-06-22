// ============================================================
// Domain.Workflow.Model.gs — ALLEGRO Business System
// Modelo de dados do motor de workflow (Fase F3).
// Define as transições de estado e os cards gerados
// automaticamente em cada transição de proposta.
// ECOSSISTEMA_V2 §2 + VALIDACAO_V3 §3.1 + §3.2
// ============================================================

/**
 * Colunas extras adicionadas à aba ACTION_CARDS pelo módulo Workflow.
 * Apenas colunas não presentes no schema base de Domain.ActionCards.Model.
 * initWorkflowColumns() garante que só insere o que ainda não existe.
 */
var WF_AC_EXTRA_COLS = [
  'tipo',        // tipo de card de workflow (ex: LEVANTAMENTO, REVISAO_FINANCEIRO)
  'source',      // 'WORKFLOW' | 'MANUAL' — distingue cards auto dos manuais
  'bloqueante',  // 'TRUE' | 'FALSE' — card bloqueante impede transição sem fechamento
  'sla_h',       // prazo em horas a partir da criação
  'due_at',      // ISO timestamp de vencimento (created_at + sla_h)
  'closed_by',   // ID do usuário que fechou o card
  'closed_at',   // ISO timestamp de fechamento
  'close_reason' // motivo do fechamento (ex: 'Autocomplete: estado avançou')
];

/**
 * Definição de todas as transições de estado de propostas e os
 * Action Cards que devem ser criados automaticamente em cada uma.
 *
 * Campos de cardDef:
 *   assignee_role  {string}  Papel do usuário que receberá o card (chave em USERS.role)
 *   title_prefix   {string}  Prefixo do título; o título da proposta é concatenado
 *   tipo           {string}  Tipo do card — indexado para busca/validação
 *   sla_key        {string}  Chave em CONFIG para leitura do prazo em horas (fallback: 24h)
 *   alcada_required {boolean} Se true: só cria o card quando alcada_nivel === 'COMPLETA'
 *                             Se false (ou omitido): sempre cria
 */
var WORKFLOW_TRANSITIONS = {
  DEMANDA_LEVANTAMENTO: {
    from: 'DEMANDA',
    to:   'LEVANTAMENTO',
    cards: [
      {
        assignee_role:   'TECNICO',
        title_prefix:    'Levantamento: ',
        tipo:            'LEVANTAMENTO',
        sla_key:         'SLA_LEVANTAMENTO_H',
        alcada_required: false
      }
    ]
  },

  LEVANTAMENTO_PROPOSTA: {
    from: 'LEVANTAMENTO',
    to:   'PROPOSTA_GERADA',
    cards: [
      {
        assignee_role:   'DIRETOR_COMERCIAL',
        title_prefix:    'Revisar proposta: ',
        tipo:            'REVISAO_PROPOSTA',
        sla_key:         'SLA_REVISAO_PROPOSTA_H',
        alcada_required: false
      }
    ]
  },

  PROPOSTA_EM_REVISAO: {
    from: 'PROPOSTA_GERADA',
    to:   'EM_REVISAO',
    cards: [
      {
        // Lista de papeis que podem REVISAR financeiramente, em ordem de preferencia.
        // O primeiro user encontrado vira assignee. Mas qualquer um destes pode FECHAR o card.
        assignee_role:   ['FINANCEIRO_ADMIN', 'DIRETOR_TECNICO', 'DIRETOR_COMERCIAL'],
        title_prefix:    'Revisar financeiro: ',
        tipo:            'REVISAO_FINANCEIRO',
        sla_key:         'SLA_REVISAO_FINANCEIRO_H',
        alcada_required: true  // só cria se proposta >= ALCADA_SIMPLIFICADA
      }
    ]
  },

  EM_REVISAO_APROVADA: {
    from: 'EM_REVISAO',
    to:   'APROVADA_ENVIO',
    cards: [
      {
        assignee_role:   'DIRETOR_COMERCIAL',
        title_prefix:    'Enviar proposta aprovada: ',
        tipo:            'ENVIO_PROPOSTA',
        sla_key:         'SLA_ENVIO_PROPOSTA_H',
        alcada_required: false
      }
    ]
  },

  APROVADA_ENVIADA: {
    from: 'APROVADA_ENVIO',
    to:   'ENVIADA',
    cards: [
      {
        assignee_role:   'DIRETOR_COMERCIAL',
        title_prefix:    'Registrar retorno do cliente: ',
        tipo:            'FOLLOWUP_ENVIADA',
        sla_key:         'SLA_RETORNO_CLIENTE_H',
        alcada_required: false
      }
    ]
  },

  ENVIADA_FECHADA: {
    from: 'ENVIADA',
    to:   'FECHADA',
    cards: [
      {
        assignee_role:   'DIRETOR_TECNICO',
        title_prefix:    'Iniciar projeto: ',
        tipo:            'KICKOFF',
        sla_key:         'SLA_KICKOFF_H',
        alcada_required: false
      },
      {
        assignee_role:   'FINANCEIRO_ADMIN',
        title_prefix:    'Emitir NF: ',
        tipo:            'EMISSAO_NF',
        sla_key:         'SLA_EMISSAO_NF_H',
        alcada_required: false
      }
    ]
  },

  ENVIADA_RECUSADA: {
    from: 'ENVIADA',
    to:   'RECUSADA',
    cards: [
      {
        assignee_role:   'DIRETOR_COMERCIAL',
        title_prefix:    'Follow-up pós-recusa: ',
        tipo:            'FOLLOWUP_RECUSADA',
        sla_key:         'SLA_FOLLOWUP_H',
        alcada_required: false
      }
    ]
  }
};

/**
 * Garante que as colunas extras do Workflow existam na aba ACTION_CARDS.
 * Chamado por initCoreSheets() após initActionCardSheets().
 * Seguro para sistemas em produção — não apaga dados.
 */
function initWorkflowColumns() {
  var sheet = ss().getSheetByName('ACTION_CARDS');
  if (!sheet) return; // initActionCardSheets() deve ter sido chamado antes
  var lastCol = sheet.getLastColumn();
  var headerRow = lastCol > 0
    ? sheet.getRange(1, 1, 1, lastCol).getValues()[0]
    : [];
  for (var i = 0; i < WF_AC_EXTRA_COLS.length; i++) {
    if (headerRow.indexOf(WF_AC_EXTRA_COLS[i]) === -1) {
      lastCol += 1;
      sheet.getRange(1, lastCol).setValue(WF_AC_EXTRA_COLS[i]);
      headerRow.push(WF_AC_EXTRA_COLS[i]);
    }
  }
}
