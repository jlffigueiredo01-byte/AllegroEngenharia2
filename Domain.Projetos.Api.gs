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
    // FB-028: anexos do RDO (fotos/PDFs) vêm como base64 do front → sobem pro Drive
    // e viram fotos_json [{file_id,url,caption,name}]. Usa o campo fotos_json já
    // existente no schema (sem mudança de planilha).
    if (data.fotos && data.fotos.length) {
      data.fotos_json = _projUploadRdoFotos(data.fotos, data.project_id);
    }
    return { ok: true, data: projSvcLancarRdo(data) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Sobe anexos (base64) do RDO para o Drive e devolve a lista de referências.
 * @param {Object[]} fotos  — [{ base64, mime, name }]
 * @param {string}   projectId
 * @return {Object[]} [{ file_id, url, caption, name }]
 */
function _projUploadRdoFotos(fotos, projectId) {
  var out = [];
  var pasta = null;
  try { pasta = drvGetFolder('SISTEMA_FEEDBACK'); } catch (e) { pasta = null; }
  if (!pasta) return out;
  for (var i = 0; i < fotos.length; i++) {
    var a = fotos[i];
    if (!a || !a.base64) continue;
    try {
      var nome = a.name || ('rdo-' + (projectId || '') + '-' + new Date().getTime() + '-' + i);
      var blob = Utilities.newBlob(Utilities.base64Decode(a.base64), a.mime || 'application/octet-stream', nome);
      var file = pasta.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      out.push({ file_id: file.getId(), url: file.getUrl(), caption: a.name || '', name: a.name || file.getName() });
    } catch (eU) { Logger.log('[Projetos] upload RDO foto: ' + eU.message); }
  }
  return out;
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
