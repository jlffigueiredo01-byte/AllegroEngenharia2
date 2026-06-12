# SGA — CONCEITO CANÔNICO DO FLUXO (decisão de arquitetura, 2026-06-11)

**Problema:** "o que é uma oportunidade? quando vira proposta? quando vira negócio?"
estava indefinido. Esta é a definição vinculante — código e UI seguem isto.

## As três entidades e a regra de ouro

| Entidade | O que é | Nasce quando | Morre quando |
|---|---|---|---|
| **OPORTUNIDADE** | Uma INTENÇÃO de negócio identificada num cliente, com o levantamento técnico. | Comercial identifica demanda. | Vira GANHA (proposta fechou) ou PERDIDA. |
| **PROPOSTA** | O DOCUMENTO comercial PRECIFICADO derivado de uma oportunidade. 1 oportunidade → N propostas/revisões. | Botão "Gerar Proposta (Motor)" na oportunidade. | FECHADA, RECUSADA, SUBSTITUIDA ou CANCELADA. |
| **NEGÓCIO** | Não é uma entidade — é o EVENTO "proposta FECHADA". | — | — |

**Regra de ouro do encadeamento (estilo TIA Portal — tudo carrega o vínculo upstream):**
```
EMPRESA → OPORTUNIDADE → PROPOSTA —(FECHADA)→ PROJETO (execução)
                                            → PO (suprimento)
                                            → Parcelas/NF (financeiro)
PROJETO → BASE INSTALADA (seriais) → TICKETS (pós-venda)
```
Toda linha gravada carrega o id da entidade-mãe: a proposta tem `opportunity_id`,
o projeto e o PO têm `proposal_id`, o ticket tem `company_id` (e serial quando houver).
**É proibido criar entidade-filha solta** — a UI sempre cria a partir do contexto.

## Status da oportunidade: DERIVADO, nunca digitado

O status da oportunidade passa a ser sincronizado automaticamente pelos eventos da
proposta (o vocabulário existente é mantido — sem migração de dados):

| Evento na proposta | Status da oportunidade |
|---|---|
| Proposta criada (motor) | `Elaborando proposta` |
| Proposta ENVIADA | `Proposta enviada` |
| Proposta FECHADA | `Proposta fechada` (= GANHA) |
| Proposta RECUSADA (sem outra ativa) | `Proposta recusada` (= PERDIDA) |

O usuário ainda pode mudar manualmente (ex.: `Cancelada`), mas o caminho feliz é
automático. Mexer no funil = mexer na proposta.

## Visão 360 = o coração operacional

A Visão 360 deixa de ser um painel de leitura e vira **o workspace do cliente**:
tudo que existe dele (funil encadeado, projetos, POs, base instalada, tickets,
despesas, timeline unificada) e tudo que pode ser criado dele (oportunidade,
proposta via motor, action card, chamado, PO de proposta fechada) — sempre
nascendo já vinculado. Um endpoint único (`Api_c360`) entrega o workspace em uma
chamada.


## Princípio da Interligação Total (vinculante — pedido do João, 12/06/2026)

Inspiração TIA Portal: **nada nasce solto, nada morre isolado.** Toda
funcionalidade nova DEVE responder este checklist antes de ser considerada
pronta:

1. **Vínculo de origem** — a entidade carrega o id da mãe? (despesa→chamado,
   proposta→oportunidade, PO→proposta...)
2. **Efeito colateral integrado** — criar/alterar aqui atualiza o que lá?
   (despesa em chamado = custo no chamado; proposta fechada = projeto + PO)
3. **Visão 360** — aparece no workspace do cliente?
4. **Dashboard** — alimenta algum KPI/alerta?
5. **Timeline** — o evento fica registrado?

Exemplo canônico: despesa vinculada a chamado vira custo do chamado, entra na
Visão 360 do cliente, soma no endgate de cobrança e aparece na timeline — uma
digitação, cinco efeitos.


## Padrão de Navegação (vinculante — 12/06/2026)

Comportamento ÚNICO em todo o SGA:

1. **Entidades de trabalho** (proposta, chamado, projeto, cliente/360, PO):
   LISTA com busca/filtro → clique → **PÁGINA DEDICADA** ocupando a área de
   conteúdo, com botão "← Voltar" no topo. Nunca painel embaixo, nunca popup.
2. **Ações rápidas de um passo** (confirmar, escolher fornecedor): modal
   centralizada pequena, OK.
3. **prompts() do navegador**: proibidos em fluxo novo; migrar os existentes
   para formulários inline na página dedicada.

Status da migração: Visão 360 ✔ · Chamados ✔ · Propostas (editor/etapas) —
próxima leva · Compras/Projetos — próxima leva.
