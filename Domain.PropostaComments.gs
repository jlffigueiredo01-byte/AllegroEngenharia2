// =============================================================================
// Domain.PropostaComments.gs — Comentários colaborativos em propostas (FB-23)
// Pedido do João: "possibilidade tambem de adicionar comentarios" na Visão Proposta.
// Cada proposta pode receber comentários da equipe (João, Gema, Maria, Jonatan).
// Comentários NÃO substituem o e-mail formal — são para diálogo interno
// (ex: "Maria, sobe o preço do Kit 10%", "João, aprovo o envio").
// =============================================================================

var PROPOSAL_COMMENTS_SHEET = 'PROPOSAL_COMMENTS';
var PROPOSAL_COMMENTS_HEADERS = [
  'id', 'proposal_id', 'author_id', 'author_name', 'author_role',
  'body', 'created_at'
];

/**
 * Inicializa a aba PROPOSAL_COMMENTS. Idempotente.
 * Chamado por Core.Setup.initCoreSheets.
 */
function initProposalCommentsSheet() {
  getOrCreateSheet(PROPOSAL_COMMENTS_SHEET, PROPOSAL_COMMENTS_HEADERS);
}

/**
 * Lista comentários de uma proposta, ordenados por data ASC (mais antigos primeiro).
 * @param {string} proposalId
 * @return {Array}
 */
function propCommSvcList(proposalId) {
  if (!proposalId) return [];
  var all = sheetToObjects(PROPOSAL_COMMENTS_SHEET);
  var out = [];
  for (var i = 0; i < all.length; i++) {
    if (String(all[i].proposal_id || '').trim() === String(proposalId).trim()) {
      out.push(all[i]);
    }
  }
  out.sort(function (a, b) {
    return String(a.created_at || '').localeCompare(String(b.created_at || ''));
  });
  return out;
}

/**
 * Adiciona um comentário a uma proposta. Audit + Timeline obrigatórios.
 * @param {string} proposalId
 * @param {string} body (texto livre, max 2000 chars)
 * @return {Object} comentário criado
 */
function propCommSvcAdd(proposalId, body) {
  var user = requireAuth();
  if (!proposalId) throw new Error('proposalId obrigatorio.');
  body = String(body || '').trim();
  if (!body) throw new Error('Comentario vazio.');
  if (body.length > 2000) throw new Error('Comentario muito longo (max 2000 caracteres).');

  // Confirma que a proposta existe (não vamos ter comentários órfãos)
  var p = (typeof propRepoGetById === 'function') ? propRepoGetById(proposalId) : null;
  if (!p) throw new Error('Proposta nao encontrada: ' + proposalId);

  var seq = getAndIncrementCounter('PROPOSAL_COMMENT_COUNTER');
  var id = 'PC-' + String(seq).padStart(5, '0');
  var now = nowISO();

  var rec = {
    id: id,
    proposal_id: proposalId,
    author_id: user.id || '',
    author_name: user.name || user.id || '',
    author_role: user.role || '',
    body: body,
    created_at: now
  };

  appendRowToSheet(PROPOSAL_COMMENTS_SHEET, rec, PROPOSAL_COMMENTS_HEADERS);
  appendAuditLog('PROPOSAL_COMMENT_ADD', 'PROPOSALS', proposalId,
    'by=' + rec.author_name + ' body_len=' + body.length);
  appendTimelineEvent('Proposta', proposalId, 'COMMENT',
    rec.author_name + ': ' + (body.length > 80 ? body.substring(0, 77) + '...' : body));
  return rec;
}

/**
 * Deleta um comentário (somente o autor ou DIRETOR_TECNICO).
 * @param {string} commentId
 */
function propCommSvcDelete(commentId) {
  var user = requireAuth();
  if (!commentId) throw new Error('commentId obrigatorio.');
  var rows = sheetToObjects(PROPOSAL_COMMENTS_SHEET);
  var found = null;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].id === commentId) { found = rows[i]; break; }
  }
  if (!found) throw new Error('Comentario nao encontrado: ' + commentId);
  if (found.author_id !== user.id && user.role !== 'DIRETOR_TECNICO') {
    throw new Error('Sem permissao para deletar este comentario.');
  }

  // Soft delete: marca como excluído ao invés de remover linha
  updateRowByIdSafe(PROPOSAL_COMMENTS_SHEET, commentId, {
    body: '[comentario excluido por ' + (user.name || user.id) + ' em ' + nowISO() + ']'
  });
  appendAuditLog('PROPOSAL_COMMENT_DELETE', 'PROPOSALS', found.proposal_id,
    'comment=' + commentId + ' by=' + (user.name || user.id));
  return { ok: true, id: commentId };
}

// ======================== API ========================

function Api_propGetComments(proposalId) {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN', 'TECNICO']);
    return { ok: true, data: sanitizeForClient(propCommSvcList(proposalId)) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function Api_propAddComment(proposalId, body) {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN', 'TECNICO']);
    return { ok: true, data: sanitizeForClient(propCommSvcAdd(proposalId, body)) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function Api_propDeleteComment(commentId) {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN', 'TECNICO']);
    return { ok: true, data: propCommSvcDelete(commentId) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Lista action cards vinculados a uma proposta via campo quote_id.
 * Não precisa de novo schema — Action Cards já têm quote_id no AC_HEADERS.
 */
function Api_acGetByProposal(proposalId) {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN', 'TECNICO']);
    if (!proposalId) throw new Error('proposalId obrigatorio.');
    var all = sheetToObjects(AC_SHEET);
    var out = [];
    for (var i = 0; i < all.length; i++) {
      if (String(all[i].quote_id || '').trim() === String(proposalId).trim()) {
        out.push(all[i]);
      }
    }
    out.sort(function (a, b) {
      return String(b.created_at || '').localeCompare(String(a.created_at || ''));
    });
    return { ok: true, data: sanitizeForClient(out) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
