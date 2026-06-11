// =============================================================================
// Domain.Engenharia.Service.gs
// Allegro Business System — Fase F20 (EDM)
// Regras de negócio do cofre de documentos de engenharia.
// Revisões são imutáveis após APROVADO. Aprovação exige DIRETOR_TECNICO.
// =============================================================================

// ---------------------------------------------------------------------------
// Criação de Documentos
// ---------------------------------------------------------------------------

/**
 * Cria um novo documento no cofre de engenharia.
 *
 * Regras:
 *  - `type` deve ser um valor válido de ENG_DOC_TYPES.
 *  - `discipline` deve ser um valor válido de ENG_DISCIPLINES.
 *  - Número de documento é gerado automaticamente no formato ALG-<TIPO>-<DISC>-NNNN.
 *  - Documento é criado com status EM_ELABORACAO e current_revision = null.
 *
 * @param {{
 *   title: string,
 *   type: string,
 *   discipline: string,
 *   description?: string,
 *   tags?: string,
 *   owner?: string,
 *   proposal_id?: string,
 *   project_id?: string,
 *   company_id?: string,
 *   product_code?: string,
 *   serial?: string
 * }} data - Dados do novo documento.
 * @returns {Object} Documento criado com todos os campos populados.
 * @throws {Error} Se type ou discipline forem inválidos.
 */
function engSvcCreateDoc(data) {
  if (!data.type || ENG_DOC_TYPES.indexOf(data.type) === -1) {
    throw new Error(
      'Tipo de documento inválido: "' + data.type + '". ' +
      'Valores aceitos: ' + ENG_DOC_TYPES.join(', ') + '.'
    );
  }
  if (!data.discipline || ENG_DISCIPLINES.indexOf(data.discipline) === -1) {
    throw new Error(
      'Disciplina inválida: "' + data.discipline + '". ' +
      'Valores aceitos: ' + ENG_DISCIPLINES.join(', ') + '.'
    );
  }
  if (!data.title || String(data.title).trim() === '') {
    throw new Error('O campo "title" é obrigatório para criar um documento.');
  }

  var docNumber = engGenerateDocNumber(data.type, data.discipline);
  var now = nowISO();

  var doc = {
    id:               generateId('ENG'),
    doc_number:       docNumber,
    title:            String(data.title).trim(),
    description:      data.description || '',
    tags:             data.tags || '',
    type:             data.type,
    discipline:       data.discipline,
    current_revision: '',
    status:           'EM_ELABORACAO',
    owner:            data.owner || '',
    proposal_id:      data.proposal_id || '',
    project_id:       data.project_id || '',
    company_id:       data.company_id || '',
    product_code:     data.product_code || '',
    serial:           data.serial || '',
    created_at:       now,
    updated_at:       now
  };

  engRepoCreateDoc(doc);
  appendAuditLog('ENG_DOC_CRIADO', ENG_DOCS_SHEET, docNumber,
    'Documento criado: ' + doc.title + ' (' + docNumber + ')');

  return doc;
}

// ---------------------------------------------------------------------------
// Criação de Revisões
// ---------------------------------------------------------------------------

/**
 * Cria uma nova revisão de um documento existente no cofre.
 *
 * Regras:
 *  - O documento deve existir.
 *  - A primeira revisão é R00; as subsequentes R01, R02, ...
 *  - A partir de R01, `change_description` é obrigatório.
 *  - A nova revisão é criada com status EM_ELABORACAO.
 *  - Se o documento estiver APROVADO, a nova revisão é paralela (não desfaz a aprovação).
 *
 * @param {string} docNumber - Número do documento (ex: ALG-DE-ELE-0001).
 * @param {{
 *   file_id_nativo?: string,
 *   file_id_pdf?: string,
 *   author?: string,
 *   change_description?: string
 * }} revData - Dados da nova revisão.
 * @returns {Object} Revisão criada com todos os campos populados.
 * @throws {Error} Se o documento não existir ou change_description estiver ausente a partir da R01.
 */
function engSvcCreateRevision(docNumber, revData) {
  var doc = engRepoGetDoc(docNumber);
  if (!doc) {
    throw new Error('Documento não encontrado: ' + docNumber + '.');
  }

  var revisions = engRepoGetRevisions(docNumber);
  var nextRevNum = revisions.length;
  var revision = 'R' + String(nextRevNum).padStart(2, '0');

  if (nextRevNum > 0 && (!revData.change_description || String(revData.change_description).trim() === '')) {
    throw new Error(
      'O campo "change_description" é obrigatório a partir da revisão R01. ' +
      'Descreva o que foi alterado em relação à revisão anterior.'
    );
  }

  var now = nowISO();
  var user = getCurrentUser();

  var rev = {
    id:                 generateId('REV'),
    doc_number:         docNumber,
    revision:           revision,
    file_id_nativo:     revData.file_id_nativo || '',
    file_id_pdf:        revData.file_id_pdf || '',
    date:               now,
    author:             revData.author || (user ? user.name : ''),
    change_description: revData.change_description || '',
    status:             'EM_ELABORACAO',
    approved_by:        '',
    approved_at:        ''
  };

  engRepoCreateRevision(rev);
  appendAuditLog('ENG_REV_CRIADA', ENG_DOC_REVISIONS_SHEET, docNumber,
    'Revisão ' + revision + ' criada para ' + docNumber);

  return rev;
}

// ---------------------------------------------------------------------------
// Aprovação de Revisões
// ---------------------------------------------------------------------------

/**
 * Aprova uma revisão de documento.
 *
 * Regras:
 *  - Apenas DIRETOR_TECNICO pode aprovar (verificado pelo chamador em Api.gs).
 *  - A revisão deve existir e estar com status EM_ELABORACAO.
 *  - A revisão aprovada anteriormente (current_revision do doc) é marcada como SUPERSEDED.
 *  - O documento tem current_revision e status atualizados para APROVADO.
 *
 * @param {string} docNumber   - Número do documento (ex: ALG-DE-ELE-0001).
 * @param {string} revision    - Código da revisão a aprovar (ex: R01).
 * @param {string} aprovadorId - ID do usuário aprovador (DIRETOR_TECNICO).
 * @returns {{doc: Object, revision: Object}} Documento e revisão atualizados.
 * @throws {Error} Se o documento ou revisão não existirem, ou a revisão não estiver EM_ELABORACAO.
 */
function engSvcAprovarRevision(docNumber, revision, aprovadorId) {
  var doc = engRepoGetDoc(docNumber);
  if (!doc) {
    throw new Error('Documento não encontrado: ' + docNumber + '.');
  }

  var rev = engRepoGetRevision(docNumber, revision);
  if (!rev) {
    throw new Error(
      'Revisão "' + revision + '" não encontrada no documento ' + docNumber + '.'
    );
  }
  if (rev.status !== 'EM_ELABORACAO') {
    throw new Error(
      'Não é possível aprovar a revisão "' + revision + '" pois seu status atual é "' +
      rev.status + '". Somente revisões EM_ELABORACAO podem ser aprovadas.'
    );
  }

  var now = nowISO();

  // Marca a revisão atualmente aprovada (current_revision) como SUPERSEDED
  if (doc.current_revision && doc.current_revision !== '') {
    var oldRev = engRepoGetRevision(docNumber, doc.current_revision);
    if (oldRev && oldRev.status === 'APROVADO') {
      engRepoUpdateRevision(oldRev.id, { status: 'SUPERSEDED' });
    }
  }

  // Aprova a revisão solicitada
  engRepoUpdateRevision(rev.id, {
    status:      'APROVADO',
    approved_by: aprovadorId,
    approved_at: now
  });

  // Atualiza o documento
  engRepoUpdateDoc(docNumber, {
    current_revision: revision,
    status:           'APROVADO',
    updated_at:       now
  });

  appendAuditLog('ENG_REV_APROVADA', ENG_DOC_REVISIONS_SHEET, docNumber,
    'Revisão ' + revision + ' de ' + docNumber + ' aprovada por ' + aprovadorId);

  // Retorna estado atualizado
  return {
    doc:      engRepoGetDoc(docNumber),
    revision: engRepoGetRevision(docNumber, revision)
  };
}

// ---------------------------------------------------------------------------
// Consultas de Status
// ---------------------------------------------------------------------------

/**
 * Verifica se uma revisão específica de um documento está com status APROVADO.
 * Útil para bloquear uso de revisões EM_ELABORACAO em propostas e projetos.
 *
 * @param {string} docNumber - Número do documento (ex: ALG-DE-ELE-0001).
 * @param {string} revision  - Código da revisão (ex: R00).
 * @returns {boolean} true se a revisão existir e estiver APROVADO; false caso contrário.
 */
function engSvcIsAprovado(docNumber, revision) {
  var rev = engRepoGetRevision(docNumber, revision);
  return rev !== null && rev.status === 'APROVADO';
}

/**
 * Retorna um resumo do documento com a revisão corrente e seu status.
 * Facilita exibição em telas de proposta e projeto.
 *
 * @param {string} docNumber - Número do documento.
 * @returns {{
 *   doc_number: string,
 *   title: string,
 *   status: string,
 *   current_revision: string,
 *   revision_status: string,
 *   is_aprovado: boolean
 * }|null} Resumo do documento ou null se não encontrado.
 */
function engSvcGetDocSummary(docNumber) {
  var doc = engRepoGetDoc(docNumber);
  if (!doc) return null;

  var revStatus = '';
  if (doc.current_revision) {
    var rev = engRepoGetRevision(docNumber, doc.current_revision);
    revStatus = rev ? rev.status : '';
  }

  return {
    doc_number:       doc.doc_number,
    title:            doc.title,
    status:           doc.status,
    current_revision: doc.current_revision || '',
    revision_status:  revStatus,
    is_aprovado:      doc.status === 'APROVADO'
  };
}
