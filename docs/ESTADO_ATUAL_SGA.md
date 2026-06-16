# SGA — ESTADO ATUAL & SINCRONIZAÇÃO DOS AGENTES
**Atualizado em 2026-06-12 · branch `yrdyrsdfgRuflo`**

> **Para que serve este arquivo:** o João desenvolveu várias sessões direto no
> repositório (via assistente Fable). Os agentes locais no VS Code ficaram para
> trás. **Leia este documento antes de continuar o desenvolvimento** — ele põe
> você no estado presente do sistema, as regras que viraram lei e os contratos
> técnicos. Depois do `clasp pull`, o código local reflete tudo que está aqui.

---

## 0. Como retomar (checklist do agente)
1. `clasp pull` na branch de trabalho (o código é a fonte da verdade).
2. Ler, nesta ordem: `docs/CONCEITO_FLUXO.md` (conceito + as DUAS leis novas),
   este arquivo, `docs/POLITICA_AUTONOMIA_AGENTES.md` (o que você pode publicar
   sozinho) e `PROMPT_TRIAGEM.md` (ciclo de feedback). Se você tiver um
   prompt-mestre próprio na máquina (instruções dos agentes), cruze com §5 —
   este documento prevalece onde houver divergência, por ser mais recente.
3. Antes de QUALQUER feature nova, aplicar o **checklist da Interligação Total**
   (§3) e o **Padrão de Navegação** (§4). Não são sugestões — são vinculantes.

---

## 1. O que é o SGA hoje
Sistema de Gestão Allegro — GAS (Apps Script) + Google Sheets como banco, SPA de
página única servida por `Index.html`. **105 arquivos `.gs`, 21 telas `.html`,
~195 APIs públicas (`Api_*`), 36 abas.** Arquitetura em camadas por domínio
(`Domain.X.Model/Repository/Service/Api.gs`) + núcleo (`Core.*`).

Equipe (4): João (DIRETOR_TECNICO), Gema (DIRETOR_COMERCIAL), Maria
(FINANCEIRO_ADMIN), Jonatan (TECNICO). Conversa de produto em PT-BR.

---

## 2. O que mudou nas últimas sessões (o que seus agentes NÃO têm)
Ordem cronológica dos blocos de trabalho recentes (ver `git log` para o detalhe):

**Propostas v2.2** — template redesenhado (capa, sumário executivo com cards,
prova social, CTA de aceite), conteúdo rico de produto (foto, descritivo,
datasheet), **fluxograma de solução editável** (`flow_json`), **editor completo
da proposta** na UI (itens/textos/condições), **controle de etapas do funil** e
**revisões Rn+1** (original vira SUBSTITUIDA, preservada). Imutabilidade
server-side a partir de APROVADA_ENVIO.

**Navegação agrupada + Dashboard v2** — sidebar em grupos (Comercial/Operações/
Suprimentos/Financeiro); dashboard com Painel-de-8 KPIs, funil em barras ∝ R$,
série de 6 meses (SVG), fila "Precisa de você", **mapa do Brasil** (GeoChart por
UF) e botão **🔄 ATUALIZAR TUDO** (cascata de manutenção, só DIRETOR_TECNICO).

**Importação da base legada** — `Domain.ImportLegado.gs`: `importarBaseLegada()`
(run-once, idempotente) traz ~137 empresas, ~170 propostas históricas e ~111
contatos das abas `IMPORT_*_RAW`. `corrigirImportacao()` repara dados já
importados (valores inflados 10×, marcação `import_origem`). Geocodificação com
fallback cidade+UF.

**Chamados / pós-venda 8D-lite** — `ChamadosUI.html` + `Domain.Tickets.*`: ciclo
ABERTO→EM_ATENDIMENTO→[AGUARDANDO_CLIENTE]→RESOLVIDO→FECHADO, feed de interações
(`TICKET_UPDATES`), anexos no Drive, **classificação de origem do erro**
(CLIENTE/HYDRONIX/ALLEGRO/NAO_IDENTIFICADO, endgate obrigatório no fechamento),
**custos por chamado** e **controle de cobrança** (repassar Hydronix / faturar
cliente / absorver). **Despesa vinculada a chamado vira custo automaticamente.**

**Despesas reformuladas** — tela padrão Golden Stone (KPIs, filtros, tabela rica,
vínculos clicáveis, **lançamento manual** além de foto-IA, página dedicada).

**Ciclo de feedback (fase 1)** — `Domain.Feedback.*` + `FeedbackUI.html`: botão
flutuante 💬 captura erro/sugestão/melhoria com print e contexto automático;
**um arquivo `FB-xxxxx.md` por relato** é gravado na hora na pasta
**`00-Sistema/Feedback` do Drive** (NÃO GitHub — ver §6; robusto, sem filtro de
data); no fim do dia, **e-mail de resumo**; "Meus reportes" fecha o ciclo. Triagem pelos
agentes via `PROMPT_TRIAGEM.md`.

---

## 3. LEI 1 — Princípio da Interligação Total (vinculante)
**Nada nasce solto, nada morre isolado.** Toda feature nova responde, antes de
ser considerada pronta:
1. **Vínculo de origem** — carrega o id da entidade-mãe?
2. **Efeito colateral integrado** — criar/alterar aqui atualiza o que lá?
3. **Visão 360** — aparece no workspace do cliente?
4. **Dashboard** — alimenta algum KPI/alerta?
5. **Timeline** — o evento fica registrado?

Exemplo canônico: despesa→chamado = 1 digitação, 5 efeitos. (Detalhe em
`docs/CONCEITO_FLUXO.md`.)

## 4. LEI 2 — Padrão de Navegação (vinculante)
- **Entidades de trabalho** (proposta, chamado, projeto, cliente/360, PO, despesa):
  LISTA com busca/filtro → clique → **PÁGINA DEDICADA** na área de conteúdo com
  "← Voltar". Nunca painel embaixo, nunca popup para isso.
- **Ações rápidas de 1 passo** (confirmar, escolher item): modal pequena, OK.
- **`prompt()` do navegador: proibido** em fluxo novo. Migrados: 360, Chamados.
  Pendentes (migrar quando tocar): Propostas (editor/etapas), Compras, Projetos.

---

## 5. Contratos técnicos (resumo)
- **Envelope de toda API:** `{ ok: true, data }` ou `{ ok: false, error }`.
- **Datas:** o Sheets converte células ISO em `Date`, e o `google.script.run`
  **não serializa Date** (volta `null` silencioso). Todo endpoint que devolve
  linhas cruas DEVE passar por **`sanitizeForClient()`** (JSON round-trip).
  Já aplicado em `Api_c360`, `Api_dashV2`, `Api_tktGetAll/GetDetail`,
  `Api_getExpenses`, `Api_fbMeus`. **Usar em todo endpoint novo do tipo.**
- **Counters:** `getAndIncrementCounter(key)` (lock, mas cache pode defasar —
  usar guarda de unicidade em ids críticos, como em `tktSvcAbrir`).
- **Colunas novas em aba existente:** derivar de uma fonte única (ex.:
  `PROPOSALS_NEW_COLS`), nunca hardcode — bug já corrigido em
  `initProposalsAddColumns`.
- **Drive:** `drvGetFolder(key)` na taxonomia `Core.Drive.gs`
  (`SISTEMA_FEEDBACK`, `POSVENDA_TICKETS`, `02-Comercial/Propostas`, etc.).
- **UI globais:** `escapeHtml, formatDate, formatBRL, showAlert, showSection,
  ALLEGRO.currentUser{id,name,role}, ALLEGRO.activeSection`. ES5, um `<script>`
  por HTML. `section-content` é a área de conteúdo.
- **RBAC:** `requireRole([...])` / `requireAuth()`. TECNICO vê só o que é dele
  (ex.: despesas próprias).

### Abas principais (36 no total)
USERS, CONFIG, COMPANIES(=…), CONTACTS, OPPORTUNITIES, PROPOSALS, PRODUCTS,
PROJECTS, PROJECT_RDO, PROJECT_MILESTONES, PURCHASE_ORDERS, SUPPLIERS, TICKETS,
TICKET_UPDATES, EXPENSES, INSTALLED_BASE, CALENDAR_EVENTS, ACTION_CARDS,
FEEDBACKS, AUDIT_LOG, TIMELINE, KPI_SNAPSHOT, ENG_DOCS, INVOICES_DB, MATERIALS,
STOCK… (ver `*_SHEET` nos modelos).

### Telas / seções do router
dashboard, visao360, opportunities, quotes, companies, contacts, map, projetos,
agenda, chamados, actioncards, compras, fornecedores, expenses, melhorias,
usuarios, config.

---

## 6. Ciclo de feedback — fluxo de trabalho dos agentes
- O SGA grava `feedback-AAAA-MM-DD.md` em **`00-Sistema/Feedback` no Drive**.
  Com o Google Drive para Desktop sincronizando, vira arquivo local.
- **Código continua via `clasp pull`** (não migramos para GitHub). Feedback é
  dado (Drive); código é código (clasp). Trilhos separados.
- Agente lê o `.md`, segue `PROMPT_TRIAGEM.md`, escreve `PLANO-AAAA-MM-DD.md`.
  **Agente PROPÕE, João decide. Nada implementa/mergeia sem aprovação.**
- Após aprovação: implementar citando `FB-xxxxx`, atualizar `status` na aba
  FEEDBACKS (→IMPLEMENTADO/RECUSADO) com `resolucao_nota` (o usuário vê).

---

## 7. Backlog declarado (pendentes, em ordem de prioridade conversada)
1. Migrar **Propostas** (editor `_ped`/etapas `_pst`), **Compras**, **Projetos**
   para o padrão página-dedicada (Lei 2).
2. **PDF do PO em inglês** + envio por e-mail ao fornecedor (idioma já no cadastro).
3. Campo de **ROI do cliente** no sumário executivo da proposta (Gema, caso a caso).
4. **Relatório de custo de não-qualidade por origem** no dashboard (quando houver
   volume de chamados classificados).
5. Ciclo de feedback **fase 2**: disparo automático da triagem pelos agentes.

## 7c. Tela de Usuários — FEITA
Seção `usuarios` (só DIRETOR_TECNICO): lista todos (ativos/inativos), cria,
edita nome/papel e ativa/desativa (desativar preserva histórico; não exclui).
Login é por conta Google — o e-mail é a chave e não é editável após criado.
APIs: Api_usersGetAll, Api_usersCreate, Api_usersUpdate, Api_usersSetActive
(todas DIRETOR_TECNICO; auditadas). Sem PIN — descartado: a conta Google já
autentica.

## 7b. Guia de Melhorias (admin) — FEITA (FB-00004/FB-00012)
Seção `melhorias` (só DIRETOR_TECNICO): vê todos os feedbacks de todos os
usuários, filtra por tipo/status, marca status com nota (Api_fbGetAll,
Api_fbMarcarStatus — escrevem na aba FEEDBACKS com auditoria; RBAC estrito).

---

## 8. Validações antes de cada entrega (herdadas do fluxo atual)
- `node --check` nos blocos `<script>` de cada HTML alterado.
- Checagem de funções duplicadas entre HTMLs (deve ser vazio).
- Harness Node com stubs para lógica GAS crítica (ver exemplos de importação).
- Mensagens de commit/alteração descritivas; uma entrega por assunto.
