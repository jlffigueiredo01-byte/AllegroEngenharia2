// ============================================================
// Domain.Projetos.Service.gs — ALLEGRO Business System
// Regras de negócio para Projetos, RDO e Aceite Técnico (F19-lite).
// NENHUM acesso direto a SpreadsheetApp aqui — usa apenas
// Repository e helpers de Core.*.
// ============================================================

// ------------------------------------------------------------
// projSvcCriarDeProposta
// ------------------------------------------------------------

/**
 * Cria um projeto ao fechar uma proposta.
 * Chamado por Domain.Proposals.Service quando o status muda para FECHADA.
 *
 * @param {string} proposalId — ID da proposta FECHADA
 * @param {string} createdBy  — ID do usuário que fechou a proposta
 * @return {Object} projeto criado
 */
function projSvcCriarDeProposta(proposalId, createdBy) {
  // Usa propRepoGetById() — sem acesso direto à sheet
  var proposal = propRepoGetById(proposalId);
  if (!proposal) throw new Error('Proposta não encontrada: ' + proposalId);
  if (proposal.status !== 'FECHADA') {
    throw new Error('Projeto só pode ser criado de proposta FECHADA. Status atual: ' + proposal.status);
  }

  var id = 'PRJ-' + new Date().getFullYear() + '-' +
    String(getAndIncrementCounter('PROJECT_COUNTER')).padStart(3, '0');

  var pricing = {};
  try { pricing = JSON.parse(proposal.pricing_json || '{}'); } catch (e) {}

  var project = {
    id:                   id,
    proposal_id:          proposalId,
    company_id:           proposal.company_id || proposal.client_id || '',
    title:                proposal.title || ('Projeto ' + proposalId),
    status:               PROJECT_STATUS.PLANEJAMENTO,
    kick_off_date:        '',
    expected_end_date:    '',
    actual_end_date:      '',
    aceite_tecnico_at:    '',
    aceite_tecnico_by:    '',
    aceite_tecnico_file_id: '',
    drive_folder_id:      '',
    total_hh_previsto:    0,
    total_hh_realizado:   0,
    n_tecnicos:           pricing.n_tecnicos || 1,
    alcada_nivel:         proposal.alcada_nivel || 'COMPLETA',
    created_by:           createdBy,
    created_at:           nowISO(),
    updated_at:           nowISO()
  };

  projRepoCreate(project);

  // Vincula o project_id à proposta via Repository — sem acesso direto à sheet
  propRepoUpdate(proposalId, { project_id: id, updated_at: nowISO() });

  appendAuditLog('PROJECT_CREATE', 'PROJECTS', id,
    'Criado de proposta ' + proposalId);
  return project;
}

// ------------------------------------------------------------
// projSvcLancarRdo
// ------------------------------------------------------------

/**
 * Registra um Registro Diário de Obra (RDO).
 *
 * Regras:
 *  - Um RDO por (project_id, date, tecnico_id) — imutável após criação.
 *  - Lança horas automaticamente via horasSvcLancarRdo (F8).
 *  - Compressão de fotos é responsabilidade do frontend (VALIDACAO_V3 §4.4).
 *
 * @param {Object} data
 * @param {string}   data.project_id        — ID do projeto (obrigatório)
 * @param {string}   data.date              — Data ISO YYYY-MM-DD (obrigatório)
 * @param {string}   data.tecnico_id        — ID do técnico (obrigatório)
 * @param {string}  [data.tecnico_nome]     — Nome do técnico
 * @param {string}  [data.clima]            — Um de CLIMA_OPTIONS
 * @param {number}  [data.efetivo_campo]    — Número de pessoas em campo
 * @param {Object[]}[data.atividades_json]  — Array de { descricao, horas, materiais_usados }
 * @param {string[]}[data.ocorrencias_json] — Array de strings
 * @param {Object[]}[data.fotos_json]       — Array de { file_id, caption }
 * @return {Object} RDO criado
 */
function projSvcLancarRdo(data) {
  if (!data.project_id || !data.date || !data.tecnico_id) {
    throw new Error('project_id, date e tecnico_id são obrigatórios no RDO.');
  }

  // Garante imutabilidade: um RDO por dia por técnico
  var existing = rdoRepoGetByDate(data.project_id, data.date);
  if (existing) {
    throw new Error(
      'RDO já existe para ' + data.project_id + ' em ' + data.date +
      '. RDO é imutável e não pode ser alterado.'
    );
  }

  var atividades = data.atividades_json || [];
  var totalHoras = 0;
  for (var i = 0; i < atividades.length; i++) {
    totalHoras += parseFloat(atividades[i].horas) || 0;
  }

  var id = 'RDO-' + getAndIncrementCounter('RDO_COUNTER');
  var rdo = {
    id:               id,
    project_id:       data.project_id,
    date:             data.date,
    tecnico_id:       data.tecnico_id,
    tecnico_nome:     data.tecnico_nome  || '',
    clima:            data.clima         || 'ENSOLARADO',
    efetivo_campo:    data.efetivo_campo || 1,
    atividades_json:  JSON.stringify(atividades),
    ocorrencias_json: JSON.stringify(data.ocorrencias_json || []),
    fotos_json:       JSON.stringify(data.fotos_json       || []),
    horas_lancadas:   totalHoras,
    created_at:       nowISO()
    // Sem updated_at — imutável
  };

  rdoRepoCreate(rdo);

  // Lança horas no timesheet automaticamente (F8)
  if (totalHoras > 0) {
    try {
      horasSvcLancarRdo(data.tecnico_id, data.project_id, id, data.date, totalHoras);
    } catch (e) {
      // Não falha o RDO se o lançamento de horas encontrar problema
      Logger.log('[projSvc] RDO criado mas erro ao lançar horas: ' + e.message);
    }
  }

  // Atualiza total_hh_realizado do projeto e avança status para EM_ANDAMENTO
  var proj = projRepoGetById(data.project_id);
  if (proj) {
    var novoTotal = (parseFloat(proj.total_hh_realizado) || 0) + totalHoras;
    projRepoUpdate(data.project_id, {
      total_hh_realizado: novoTotal,
      status:             PROJECT_STATUS.EM_ANDAMENTO,
      updated_at:         nowISO()
    });
  }

  appendAuditLog('RDO_CREATE', 'PROJECT_RDO', id,
    data.project_id + ' | ' + data.date + ' | ' + totalHoras + 'h');
  return rdo;
}

// ------------------------------------------------------------
// projSvcAceiteTecnico
// ------------------------------------------------------------

/**
 * Registra o Aceite Técnico (fim da entrega).
 *
 * VALIDACAO_V3 §2.2:
 *  - Inicia garantia de serviço (12 meses a partir desta data).
 *  - Deve disparar parcela final no Caixa (integração futura — ver CHECKPOINT_F19.md).
 *  - Aceite técnico é idempotente quanto ao bloqueio: uma vez registrado não pode ser refeito.
 *
 * @param {string} projectId — ID do projeto
 * @param {string} userId    — ID do usuário DIRETOR_TECNICO registrando o aceite
 * @param {string} [fileId]  — ID do arquivo de aceite no Drive (opcional)
 * @return {Object} projeto atualizado
 */
function projSvcAceiteTecnico(projectId, userId, fileId) {
  var proj = projRepoGetById(projectId);
  if (!proj) throw new Error('Projeto não encontrado: ' + projectId);
  if (proj.aceite_tecnico_at) {
    throw new Error('Aceite técnico já registrado em ' + proj.aceite_tecnico_at + '. Operação idempotente bloqueada.');
  }

  var agora = nowISO();
  projRepoUpdate(projectId, {
    aceite_tecnico_at:      agora,
    aceite_tecnico_by:      userId,
    aceite_tecnico_file_id: fileId || '',
    status:                 PROJECT_STATUS.ENTREGUE,
    actual_end_date:        agora.split('T')[0],
    updated_at:             agora
  });

  // Atualiza garantia de serviço dos itens da Base Instalada vinculados ao projeto
  // Usa biRepoGetAll() e biRepoUpdate() do BaseInstalada Repository — sem acesso direto à sheet
  try {
    var seriais = biRepoGetAll();
    for (var i = 0; i < seriais.length; i++) {
      var s = seriais[i];
      if (s.project_id === projectId) {
        biRepoUpdate(s.id, {
          warranty_svc_end:      _projAddMonths(agora.split('T')[0], 12),
          warranty_started_from: 'aceite_tecnico',
          updated_at:            agora
        });
      }
    }
  } catch (e) {
    Logger.log('[projSvc] Aceite técnico: erro ao atualizar garantias de base instalada: ' + e.message);
  }

  appendAuditLog('ACEITE_TECNICO', 'PROJECTS', projectId,
    'Por: ' + userId + (fileId ? ' | Arquivo: ' + fileId : ''));
  return projRepoGetById(projectId);
}

// ------------------------------------------------------------
// projSvcCheckMarcosAtrasados
// ------------------------------------------------------------

/**
 * Verifica todos os marcos PENDENTES e marca os que passaram da due_date
 * como ATRASADO. Chamado pelo Scheduler (hora 5 diariamente).
 *
 * @return {number} quantidade de marcos marcados como ATRASADO
 */
function projSvcCheckMarcosAtrasados() {
  var hoje = new Date().toISOString().split('T')[0];
  // Usa msRepoGetAll() do Projetos Repository — sem acesso direto à sheet
  var marcos = msRepoGetAll();
  var atrasados = 0;

  for (var i = 0; i < marcos.length; i++) {
    var m = marcos[i];
    if (m.status === 'PENDENTE' && m.due_date && m.due_date < hoje) {
      msRepoUpdate(m.id, { status: 'ATRASADO', updated_at: nowISO() });
      atrasados++;
    }
  }

  appendAuditLog('PROJETOS_MARCOS_CHECK', 'PROJECT_MILESTONES', 'SYSTEM',
    atrasados + ' marcos marcados como ATRASADO');
  return atrasados;
}

// ------------------------------------------------------------
// Helper interno
// ------------------------------------------------------------

/**
 * Soma N meses a uma data no formato YYYY-MM-DD.
 * @param {string} dateStr
 * @param {number} months
 * @return {string} nova data YYYY-MM-DD
 */
function _projAddMonths(dateStr, months) {
  var d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().split('T')[0];
}
