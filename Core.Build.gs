// =============================================================================
// Core.Build.gs — SGA · versão do build + changelog de implementações
// =============================================================================
//  ┌───────────────────────────────────────────────────────────────────────┐
//  │  ÚLTIMA IMPLEMENTAÇÃO:  2026-06-23 22:00 (America/Sao_Paulo)            │
//  │  VERSÃO EM PRODUÇÃO:    v2026.06.23-6                                   │
//  └───────────────────────────────────────────────────────────────────────┘
//
//  Este arquivo é a FONTE DA VERDADE da versão do sistema. O agente bumpa
//  SGA_BUILD + adiciona uma linha no CHANGELOG a cada deploy. getBuildVersion()
//  é carimbado no cliente (window.SGA_BUILD, via Index.html) e aparece no
//  diagnóstico de cada feedback — assim o João sabe QUAL versão gerou um report.
//
//  Formato da versão: AAAA.MM.DD  (uma data por dia de deploy; se houver mais de
//  um deploy no mesmo dia, sufixar -2, -3, ...).
//
// =============================================================================
//  CHANGELOG (mais recente no topo)
// -----------------------------------------------------------------------------
//  2026.07.08-2 — Sprint noturna (FBs + revisão geral):
//                 FB-00042: proposta SEM infra não cobra mais Kit/MO Infra —
//                 calculadora linear zera kit/mo com 0 metros; motor não soma
//                 mobilização sem pontos nem força 1 dia de campo sem MO.
//                 FB-00037: Chamados ganham ✏️ Editar (título/descrição/
//                 prioridade com SLA recalculado), 🗑 Cancelar (fecha com nota,
//                 histórico preservado) e 🗂 Abrir Action Card vinculado.
//                 FB-00038: Action Card ganha 💬 comentários (no histórico),
//                 📎 anexos (Drive 07-Empresa/ActionCards/<card>) e 👥
//                 participantes (auto-inclui quem comenta/anexa).
//                 FB-00035: topbar mobile — "safe center" + compacto (o menu
//                 rolava pro lado e cortava o início).
//                 Revisão geral T1 (TAREFA-FB com \n real), T2 (reanálise
//                 reprocessa EM_TRIAGEM + nota do João no prompt), T3
//                 (APROVADO→IMPLEMENTADO/FALHOU validado antes da escrita),
//                 T4 (webhook roteia para services — PIN quebrou as Api_*),
//                 T6 (anexos de feedback sem link público), T7b (PIN com
//                 hash SHA-256 + migração transparente), T15 (ensureColumns
//                 getLastColumn), T17 (anti prompt-injection na triagem).
//  2026.07.08-1 — Acesso 100% ANÔNIMO por PIN (decisão João: sem conta Google).
//                 Sessões por TOKEN em ScriptProperties (UserProperties não
//                 identifica usuário anônimo); toda Api_* roteada por
//                 Api_dispatch(token, fn, args) — injeção automática no wrapper
//                 do FeedbackDiag (overlay/telemetria continuam vendo o nome
//                 real). Lockout global (8 falhas / 5 min, ScriptProperties).
//                 PIN fora da trilha de telemetria (input #pin-input + cliques
//                 no login-screen ignorados). Requer redeploy com acesso
//                 "Qualquer pessoa" (anônimo) + "Executar como: Eu".
//  2026.06.30-1 — Login por PIN de 4 dígitos (substitui auth por email Google).
//                 FB-00036: stop polluting Action Cards board (SLA Estourado +
//                 [SISTEMA] Integridade não criam mais cards, audit log e email
//                 só). Auto-cleanup de cards-lixo na 1ª abertura.
//                 FB-00039: versão + data/hora da implantação no sidebar
//                 (canto superior esquerdo, abaixo do logo SGA).
//                 FB-00040: campos de enrichment IA (razão social, CNPJ,
//                 telefone, e-mail, setor, descrição) agora EDITÁVEIS no
//                 cadastro e edição de empresa — IA preenche, usuário ajusta
//                 (CNPJ varia entre unidades da mesma empresa).
//                 FB-00041: tipos de cliente atualizados — Orgânico /
//                 Inorgânico / Automação ou Fabricante (substitui Empresa /
//                 Órgão / Produtor / Cooperativa).
//                 Chatbot reescrito para o lançamento (cobre todos os módulos
//                 + queries de dados personalizadas, com sheet names corretos
//                 — antes a busca estava silenciosamente quebrada).
//  2026.06.23-6 — Overlay: silencia chat (Api_chatMessage), revisão IA da proposta
//                 (Api_reviewProposalScope) e o módulo de feedback (Api_fbCriar
//                 "Enviando...", Api_fbMeus skeleton) — todos têm loading próprio.
//                 Lista _SGA_SILENT_APIS extensível no FeedbackDiag.
//  2026.06.23-5 — Code-review (core domain) + overlay de loading padrão:
//                 • Overlay de loading automático em TODO clique de ação (blur+
//                   spinner) — bloqueia 2º clique; leituras ficam silenciosas.
//                 • #1 alçada: _wfGetAlcada delega a _calcAlcadaNivel (mesma
//                   chave SETUP_CALC_ALCADA_SIMPLIFICADA) — fim do "tudo COMPLETA".
//                 • #4 ticket: comentário registra quem respondeu (SLA atribuído).
//                 • #6 pricing: qty 0 deixa de virar 1.
//                 • #7 triagem: concatena blocos de texto da Anthropic.
//                 • #10 proposta: motivo_perda só grava se informado (não apaga).
//                 Não alterados (decisão): #2 autocomplete card, #3 safeNumber,
//                 #5 digest de triagem, #8/#9 limites de cabo (default já seguro).
//  2026.06.23-4 — PRODUCTS ganha supplier_id (FK -> SUPPLIERS). PO gerado da
//                 proposta agora DERIVA o fornecedor do produto: agrupa por
//                 fornecedor, 1 PO por fornecedor, na moeda do fornecedor.
//                 Seletor de fornecedor vira "Automático (pelo produto)" com
//                 override opcional (Compras + Visão 360).
//  2026.06.23-3 — FB-34: cards de follow-up saem do kanban de Action Cards
//                 (ficam só no aviso do Dashboard). FEEDBACKS auto-adiciona a
//                 coluna `criado_por` faltante (ensureColumns) — sem editar a
//                 planilha à mão.
//  2026.06.23-2 — Correção de raiz: FEEDBACKS gravado HEADER-AWARE (corrige o
//                 desalinhamento de colunas "Quando: Joao" que quebrava o filtro
//                 do "Meus Reportes" e o contexto_json do diagnóstico FB-033).
//                 "Meus Reportes" match robusto (id/email/nome/USR-NOME).
//  2026.06.23 — FB-031: PO gerado da proposta passa a incluir SÓ produtos
//                       Hydronix (exclui categoria SERVICO / MO-INFRA, MO-STARTUP).
//               FB-032: "Meus Reportes" ordenado do mais recente p/ o mais antigo.
//               FB-033: diagnóstico de feedback enriquecido (print automático,
//                       trilha de interações, captura de google.script.run que
//                       falham, console.error/warn, entidade ativa, versão do
//                       deploy) — novo FeedbackDiag.html + este Core.Build.gs.
//  2026.06.18 — Triagem server-side (Sonnet classifica NOVO→TRIADO + trigger 5min).
//               FB-028 Projetos (marco c/ feedback, RDO maior + anexos);
//               FB-029 Compras (documento SC, gera→aprova→emite, email fornecedor);
//               FB-030 Melhorias ordenado; bypass de alçada; "Eu reviso este card";
//               Meus Reportes (match robusto); 3 bugs P0 (fluxograma, Nova Empresa,
//               Novo Usuário); OpportunitiesUI fora do bundle.
// =============================================================================

/** Versão do build em produção. Bumpar a cada deploy. */
var SGA_BUILD = '2026.07.08-2';

/** Data e hora desta implantação (BRT). Bumpar junto com SGA_BUILD a cada deploy. */
var SGA_DEPLOYED_AT = '2026-07-08 23:20 BRT';

/**
 * Retorna a versão do build em execução.
 * Carimbada no cliente pelo Index.html: window.SGA_BUILD = "<?= getBuildVersion() ?>".
 * @return {string}
 */
function getBuildVersion() {
  // Se houver APP_VERSION semântica no CONFIG, combina (ex.: "2026.06.23 · app 3.2").
  try {
    var appV = getConfigValue('APP_VERSION');
    if (appV) return SGA_BUILD + ' · ' + appV;
  } catch (e) {}
  return SGA_BUILD;
}

/**
 * Retorna a data/hora da última implantação (FB-00039).
 * Exibida no canto esquerdo do menu (sidebar-brand).
 * @return {string}
 */
function getDeployedAt() {
  return SGA_DEPLOYED_AT;
}
