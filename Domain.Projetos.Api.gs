// ============================================================
// Domain.Projetos.Api.gs — ALLEGRO Business System
// API pública para Projetos, Marcos e RDO (F19-lite).
// Todas as funções retornam { ok: true, data } ou { ok: false, error }.
// ============================================================

/**
 * Retorna todos os projetos, com filtro opcional por status.
 *
 * @param {Object} [filters]
 * @param {string} [filters.status] — filtra por PROJECT_STATUS
 * @return {{ ok: boolean, data?: Object[], error?: string }}
 */
function Api_projGetAll(filters) {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN', 'TECNICO']);
    var projects = projRepoGetAll();
    if (filters && filters.status) {
      projects = projects.filter(function(p) { return p.status === filters.status; });
    }
    return { ok: true, data: projects };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Retorna um projeto pelo ID.
 *
 * @param {string} id
 * @return {{ ok: boolean, data?: Object, error?: string }}
 */
function Api_projGetById(id) {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN', 'TECNICO']);
    var p = projRepoGetById(id);
    if (!p) return { ok: false, error: 'Projeto não encontrado: ' + id };
    return { ok: true, data: p };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Lança um RDO para o projeto.
 * O tecnico_id e tecnico_nome são preenchidos automaticamente com o usuário
 * autenticado se não informados.
 *
 * @param {Object} data — ver projSvcLancarRdo para campos aceitos
 * @return {{ ok: boolean, data?: Object, error?: string }}
 */
function Api_projLancarRdo(data) {
  try {
    var user = requireRole(['DIRETOR_TECNICO', 'TECNICO']);
    if (!data.tecnico_id)   data.tecnico_id   = user.id;
    if (!data.tecnico_nome) data.tecnico_nome = user.name;
    return { ok: true, data: projSvcLancarRdo(data) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Retorna todos os RDOs de um projeto.
 *
 * @param {string} projectId
 * @return {{ ok: boolean, data?: Object[], error?: string }}
 */
function Api_projGetRdos(projectId) {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN', 'TECNICO']);
    return { ok: true, data: rdoRepoGetByProject(projectId) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Registra o Aceite Técnico do projeto (fim da entrega).
 * Exige papel DIRETOR_TECNICO.
 *
 * @param {string} projectId
 * @param {string} [fileId] — ID do arquivo de aceite no Drive (opcional)
 * @return {{ ok: boolean, data?: Object, error?: string }}
 */
function Api_projAceiteTecnico(projectId, fileId) {
  try {
    var user = requireRole(['DIRETOR_TECNICO']);
    return { ok: true, data: projSvcAceiteTecnico(projectId, user.id, fileId) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Adiciona um marco (milestone) a um projeto.
 * Exige papel DIRETOR_TECNICO.
 *
 * @param {string} projectId
 * @param {string} title
 * @param {string} dueDate     — formato YYYY-MM-DD
 * @param {string} [description]
 * @return {{ ok: boolean, data?: Object, error?: string }}
 */
function Api_projAddMilestone(projectId, title, dueDate, description) {
  try {
    requireRole(['DIRETOR_TECNICO']);
    if (!projectId || !title || !dueDate) {
      throw new Error('projectId, title e dueDate são obrigatórios.');
    }
    var id = 'MS-' + getAndIncrementCounter('MILESTONE_COUNTER');
    var ms = {
      id:           id,
      project_id:   projectId,
      title:        title,
      description:  description || '',
      due_date:     dueDate,
      completed_at: '',
      status:       'PENDENTE',
      created_at:   nowISO(),
      updated_at:   nowISO()
    };
    msRepoCreate(ms);
    appendAuditLog('MILESTONE_CREATE', 'PROJECT_MILESTONES', id,
      title + ' — ' + dueDate);
    return { ok: true, data: ms };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Retorna todos os marcos de um projeto.
 *
 * @param {string} projectId
 * @return {{ ok: boolean, data?: Object[], error?: string }}
 */
function Api_projGetMilestones(projectId) {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN', 'TECNICO']);
    return { ok: true, data: msRepoGetByProject(projectId) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Marca um marco como concluído.
 * Exige papel DIRETOR_TECNICO.
 *
 * @param {string} milestoneId
 * @return {{ ok: boolean, data?: Object, error?: string }}
 */
function Api_projConcluirMilestone(milestoneId) {
  try {
    requireRole(['DIRETOR_TECNICO']);
    if (!milestoneId) throw new Error('milestoneId é obrigatório.');
    var agora = nowISO();
    msRepoUpdate(milestoneId, {
      status:       'CONCLUIDO',
      completed_at: agora,
      updated_at:   agora
    });
    appendAuditLog('MILESTONE_COMPLETE', 'PROJECT_MILESTONES', milestoneId, 'Concluído manualmente.');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
