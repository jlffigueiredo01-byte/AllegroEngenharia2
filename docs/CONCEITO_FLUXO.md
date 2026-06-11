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
