// ============================================================
// Domain.Workflow.Api.gs — ALLEGRO Business System
// API pública do motor de workflow (Fase F3).
// Chamada via google.script.run pelo frontend.
//
// O workflow é majoritariamente interno (disparado por transições
// de proposta), mas estas APIs expõem a fila de aprovações e
// permitem consultas de cards por proposta.
// ============================================================

/**
 * Retorna todos os Action Cards (workflow + manuais) vinculados a
 * uma proposta específica, ordenados do mais recente ao mais antigo.
 *
 * @param {string} proposalId - ID da proposta (ex: 'PROP-2026-0001')
 * @return {{ ok: boolean, data: Object[] }|{ ok: boolean, error: string }}
 */
function Api_wfGetCardsProposta(proposalId) {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN', 'TECNICO']);
    if (!proposalId) throw new Error('proposalId é obrigatório.');

    var rows = sheetToObjects('ACTION_CARDS');
    var cards = rows.filter(function(c) {
      return String(c.quote_id) === String(proposalId);
    });

    // Ordena: bloqueante primeiro, depois por created_at descendente
    cards.sort(function(a, b) {
      if (a.bloqueante !== b.bloqueante) {
        return a.bloqueante === 'TRUE' ? -1 : 1;
      }
      return String(b.created_at || '').localeCompare(String(a.created_at || ''));
    });

    return { ok: true, data: cards };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Retorna a fila de aprovações pendentes do usuário autenticado.
 * VALIDACAO_V3 §3.4: "fila única Minhas aprovações".
 *
 * Ordenação:
 *   1. Cards bloqueantes primeiro
 *   2. Dentro de cada grupo, ordenado por due_at crescente (mais urgente primeiro)
 *
 * @return {{ ok: boolean, data: Object[] }|{ ok: boolean, error: string }}
 */
function Api_wfGetMinhasAprovacoes() {
  try {
    var user = requireRole([
      'DIRETOR_TECNICO',
      'DIRETOR_COMERCIAL',
      'FINANCEIRO_ADMIN',
      'TECNICO'
    ]);

    var rows = sheetToObjects('ACTION_CARDS');
    var pendentes = rows.filter(function(c) {
      return String(c.assigned_to) === String(user.id) &&
             (c.status === 'ABERTO' || c.status === 'SLA_ESTOURADO');
    });

    pendentes.sort(function(a, b) {
      // Bloqueante primeiro
      if (a.bloqueante !== b.bloqueante) {
        return a.bloqueante === 'TRUE' ? -1 : 1;
      }
      // SLA estourado antes de aberto
      if (a.status !== b.status) {
        return a.status === 'SLA_ESTOURADO' ? -1 : 1;
      }
      // Mais próximo do vencimento primeiro
      return String(a.due_at || '').localeCompare(String(b.due_at || ''));
    });

    return { ok: true, data: pendentes };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Conclui um card de workflow manualmente.
 * Permite que o responsável marque o card como CONCLUIDO,
 * destravando transições bloqueantes.
 *
 * @param {string} cardId - ID do card (ex: 'AC-42')
 * @param {string} nota   - Observação obrigatória ao concluir
 * @return {{ ok: boolean }|{ ok: boolean, error: string }}
 */
function Api_wfConcluirCard(cardId, nota) {
  try {
    var user = requireRole([
      'DIRETOR_TECNICO',
      'DIRETOR_COMERCIAL',
      'FINANCEIRO_ADMIN',
      'TECNICO'
    ]);

    if (!cardId) throw new Error('cardId é obrigatório.');
    if (!nota || !String(nota).trim()) throw new Error('Nota é obrigatória ao concluir card.');

    var rows = sheetToObjects('ACTION_CARDS');
    var card = null;
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i].id) === String(cardId)) {
        card = rows[i];
        break;
      }
    }
    if (!card) throw new Error('Card não encontrado: ' + cardId);
    if (card.status === 'CONCLUIDO' || card.status === 'CANCELADO') {
      throw new Error('Card já está ' + card.status + '.');
    }

    var agora = nowISO();
    updateRowById('ACTION_CARDS', cardId, {
      status:       'CONCLUIDO',
      closed_by:    user.id,
      closed_at:    agora,
      close_reason: String(nota).trim(),
      last_member:  user.id,
      last_note:    String(nota).trim(),
      updated_at:   agora
    });

    appendAuditLog('WF_CARD_CONCLUIDO', 'ACTION_CARDS', cardId,
      'Concluído por ' + user.id + ': ' + nota);

    if (card.quote_id) {
      appendTimelineEvent('Proposta', card.quote_id, 'WF_CARD_CONCLUIDO',
        'Card ' + cardId + ' (' + (card.tipo || 'WORKFLOW') + ') concluído por ' + user.id);
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Retorna um resumo do status de workflow de uma proposta:
 * quantos cards abertos, bloqueantes, com SLA estourado e concluídos.
 *
 * @param {string} proposalId
 * @return {{ ok: boolean, data: Object }|{ ok: boolean, error: string }}
 */
function Api_wfGetStatusProposta(proposalId) {
  try {
    requireRole(['DIRETOR_TECNICO', 'DIRETOR_COMERCIAL', 'FINANCEIRO_ADMIN', 'TECNICO']);
    if (!proposalId) throw new Error('proposalId é obrigatório.');

    var rows = sheetToObjects('ACTION_CARDS');
    var cards = rows.filter(function(c) {
      return String(c.quote_id) === String(proposalId) && c.source === 'WORKFLOW';
    });

    var abertos      = 0;
    var bloqueantes  = 0;
    var slaEstourado = 0;
    var concluidos   = 0;

    for (var i = 0; i < cards.length; i++) {
      var c = cards[i];
      if (c.status === 'ABERTO')        { abertos++;      }
      if (c.status === 'SLA_ESTOURADO') { slaEstourado++; abertos++; }
      if (c.status === 'CONCLUIDO')     { concluidos++;   }
      if ((c.status === 'ABERTO' || c.status === 'SLA_ESTOURADO') &&
          c.bloqueante === 'TRUE')       { bloqueantes++;  }
    }

    return {
      ok: true,
      data: {
        total:         cards.length,
        abertos:       abertos,
        bloqueantes:   bloqueantes,
        sla_estourado: slaEstourado,
        concluidos:    concluidos,
        bloqueado:     bloqueantes > 0
      }
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
