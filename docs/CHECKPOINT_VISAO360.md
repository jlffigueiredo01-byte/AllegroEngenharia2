# CHECKPOINT — VISÃO 360 v2 (redesenho do coração do SGA)
**Data:** 2026-06-11 · **Executor:** Claude Fable 5 (decisões autônomas, conforme combinado)
**Branch:** `yrdyrsdfgRuflo` (4 commits desta leva)

## 1. Decisão conceitual (docs/CONCEITO_FLUXO.md — LEIA, é vinculante)

- **OPORTUNIDADE** = intenção de negócio + levantamento. **PROPOSTA** = documento
  precificado derivado dela (1→N). **NEGÓCIO** = o evento "proposta FECHADA".
- Cadeia obrigatória: EMPRESA → OPP → PROPOSTA → (FECHADA) → PROJETO + PO + NF →
  BASE → TICKETS. Toda filha carrega o id da mãe; proibido criar solta.
- **Status da oportunidade agora é DERIVADO**: proposta criada → "Elaborando
  proposta"; ENVIADA → "Proposta enviada"; FECHADA → "Proposta fechada";
  RECUSADA → "Proposta recusada". Vocabulário legado mantido (zero migração).

## 2. Backend novo

- `PROPOSALS.opportunity_id` (coluna nova — rode `setupAll` 1×) persistida pelo
  motor; hooks de sincronização do funil em criar/mudar status (nunca bloqueiam).
- `Api_poCreateFromProposal(proposalId, supplierId)`: PO em rascunho com os itens
  Hydronix da proposta FECHADA a preço de COMPRA (tabela − DESCONTO_COMPRA_PCT),
  linhas de serviço ignoradas, timeline registrada.
- `Api_c360(companyId)` (Domain.Visao360.*): o cliente INTEIRO em uma chamada —
  empresa, contatos, funil, projetos+progresso de marcos, POs, base instalada,
  tickets, despesas vinculadas, timeline unificada (50 últimos eventos de todas
  as entidades dele) e KPIs (total fechado, propostas abertas, equipamentos,
  tickets abertos). Read-model CQRS (exceção documentada no arquivo).

## 3. A nova Visão 360 (seção própria 🔎 no menu + `open360(id)` de qualquer tela)

- **Header**: nome, contatos, 4 indicadores do cliente.
- **BARRA DE AÇÕES** — tudo nasce já vinculado: 🎯 Oportunidade · 💰 Proposta
  (escolhe a opp aberta e abre o motor) · 📌 Action Card (responsável + urgente)
  · 🛠️ Chamado (prioridade) · 📦 PO de proposta fechada · 💸 atalho de despesa.
- **Funil encadeado**: cada oportunidade expande suas propostas; cada proposta
  tem ações inline (🖨️ PDF, 📦 gerar PO se FECHADA, 🏗️ pular para o projeto
  derivado — que abre sozinho na tela de Projetos via deep-link).
- **Coluna direita**: linha do tempo unificada do cliente.
- Botão "Visão 360" de Empresas agora abre este workspace.
- Motor de precificação funciona de qualquer contexto (busca a opp via
  `Api_getOpportunity` quando não está na lista local).
- Compras ganhou "📄→📦 Gerar da proposta".

## 4. Roteiro de teste (10 min)

1. Pull → **executar `setupAll`** (cria a coluna opportunity_id) → Ctrl+Shift+R.
2. Menu 🔎 Visão 360 → escolher um cliente → workspace carrega em 1 chamada.
3. 🎯 criar oportunidade → aparece no funil na hora.
4. 💰 Proposta → motor abre pré-populado → Calcular → Criar → volte ao 360:
   a proposta está ANINHADA na oportunidade e o status dela virou
   "Elaborando proposta" sozinho.
5. Marque a proposta como FECHADA (tela Propostas) → 360: status da opp =
   "Proposta fechada", projeto aparece, botão 📦 PO na proposta.
6. 📦 PO → escolher Hydronix → rascunho criado → abrir em Compras.
7. 📌 card e 🛠️ chamado → criados e visíveis na timeline.

## 5. Pendências conhecidas (próxima leva)
Tela de Fornecedores · PDF do PO em inglês + envio por e-mail · Dashboard
"Painel de 8" · auditoria de aderência spec×planilha (campos faltantes tipo o
`language`) · prompt de atualização dos agentes do VS Code · revogar o PAT.
