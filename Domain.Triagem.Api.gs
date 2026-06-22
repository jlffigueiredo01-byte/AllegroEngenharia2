// =============================================================================
// Domain.Triagem.Api.gs — SGA
// Endpoints do ciclo de triagem. Envelope padrão {ok,data} / {ok,error}.
//
// RBAC:
//   - Endpoints de leitura/ação do João (SGA UI) → requireRole(['DIRETOR_TECNICO'])
//   - Endpoints chamados pelos agentes via clasp run (sonnet/opus) →
//     requireAuth() (executa como o usuário dono do projeto Apps Script,
//     que é o próprio João — não há outra identidade).
//
// Convenção: todo endpoint que retorna linhas passa por sanitizeForClient
// no Service (Date → ISO string para o google.script.run conseguir serializar).
// =============================================================================

/* ───────────────────────── Leitura (UI) ───────────────────────── */

/** Lista triagens com filtros opcionais. */
function Api_triagemList(filtros) {
  try {
    requireRole(['DIRETOR_TECNICO']);
    return { ok: true, data: triagemSvcList(filtros) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/** Detalhe de uma triagem por fb_id. */
function Api_triagemGet(fb_id) {
  try {
    requireRole(['DIRETOR_TECNICO']);
    return { ok: true, data: triagemSvcGetByFbId(fb_id) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/** Contadores por estado — usado pelos badges da UI. */
function Api_triagemKpis() {
  try {
    requireRole(['DIRETOR_TECNICO']);
    return { ok: true, data: triagemSvcKpis() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/* ───────────────────────── Sonnet (clasp run) ───────────────────────── */

/**
 * Chamado pelo Sonnet via clasp run para gravar a análise estruturada.
 * payload: { camada, tipo_confirmado, severidade, esforco, titulo?,
 *            autor_fb?, tela?, analise_md }
 */
function Api_triagemAnalysisUpsert(fb_id, payload) {
  try {
    requireAuth(); // clasp run executa como o owner do projeto (João)
    return { ok: true, data: triagemSvcUpsertAnalysis(fb_id, payload) };
  } catch (e) {
    Logger.log('[Triagem][Api] AnalysisUpsert erro: ' + e.message);
    return { ok: false, error: e.message };
  }
}

/* ───────────────────────── Ações do João (UI) ───────────────────────── */

/** João recusa a triagem com nota. Sincroniza com FEEDBACKS. */
function Api_triagemRecusar(fb_id, nota) {
  try {
    requireRole(['DIRETOR_TECNICO']);
    return { ok: true, data: triagemSvcRecusar(fb_id, nota) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/** João adiciona comentário sem mudar estado. */
function Api_triagemComentar(fb_id, nota) {
  try {
    requireRole(['DIRETOR_TECNICO']);
    return { ok: true, data: triagemSvcComentar(fb_id, nota) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/** João pede reanálise — devolve para Sonnet com nota adicional. */
function Api_triagemPedirReanalise(fb_id, nota) {
  try {
    requireRole(['DIRETOR_TECNICO']);
    return { ok: true, data: triagemSvcPedirReanalise(fb_id, nota) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * João aprova a triagem pelo SGA → gera TAREFA + move estado.
 * nota é opcional (instrução extra do João que vai junto na TAREFA).
 */
function Api_triagemAprovar(fb_id, nota) {
  try {
    requireRole(['DIRETOR_TECNICO']);
    return { ok: true, data: triagemSvcAprovar(fb_id, nota) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/** João marca como publicado em produção (IMPLEMENTADO → PUBLICADO). */
function Api_triagemMarcarPublicado(fb_id) {
  try {
    requireRole(['DIRETOR_TECNICO']);
    return { ok: true, data: triagemSvcMarcarPublicado(fb_id) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Classifica via Sonnet (server-side) todos os FBs em estado NOVO.
 * Botão "🤖 Classificar novos" da guia Triagens. Também instala/garante o
 * trigger periódico (5 min) que faz isso automático daí em diante.
 */
function Api_triagemClassificarPendentes() {
  try {
    requireRole(['DIRETOR_TECNICO']);
    try { instalarTriggerTriagemClassificador(); } catch (e) { /* segue mesmo sem trigger */ }
    return { ok: true, data: triagemSvcClassificarPendentes(10) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/* ───────────────────────── Opus (clasp run) — Fase 2 ───────────────────────── */

/**
 * Opus marca implementação concluída (clasp run).
 * payload: { arquivos_tocados, diff_resumo, snapshot_path, versao_apps_script }
 */
function Api_triagemMarcarImplementado(fb_id, payload) {
  try {
    requireAuth();
    return { ok: true, data: triagemSvcMarcarImplementado(fb_id, payload) };
  } catch (e) {
    Logger.log('[Triagem][Api] MarcarImplementado erro: ' + e.message);
    return { ok: false, error: e.message };
  }
}

/** Opus marca falha durante implementação (clasp run). */
function Api_triagemMarcarFalha(fb_id, erro_msg) {
  try {
    requireAuth();
    return { ok: true, data: triagemSvcMarcarFalha(fb_id, erro_msg) };
  } catch (e) {
    Logger.log('[Triagem][Api] MarcarFalha erro: ' + e.message);
    return { ok: false, error: e.message };
  }
}
