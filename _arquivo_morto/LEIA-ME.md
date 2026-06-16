# Código arquivado (morto)

Arquivos movidos para cá por estarem órfãos — nenhuma UI ativa os chama.
Renomeados para `.txt` para o clasp não os enviar ao Apps Script.
Reversível: basta mover de volta e restaurar a extensão.

## Removidos em 2026-06-12 (auditoria da planilha)
- **Domain.Quotes.gs.txt** — backend da aba QUOTE_HEADERS (desenho legado,
  substituído por PROPOSALS). 6 Api_*Quote* que nenhuma tela chamava.
- **QuotesUI.html.txt** — tela órfã que lia Api_getQuotes; o menu "Propostas"
  usa renderQuotes do ProposalBuilderUI (sobre PROPOSALS), não esta.

## Dívida técnica conhecida (NÃO mexido — risco de colisão)
- **Domain.Import.gs** (continua na raiz) — importador LEGADO, substituído por
  Domain.ImportLegado.gs. Suas Api_* não são chamadas por ninguém, mas tem
  helpers de nome genérico (_parseBRL, _extractUF...) que podem colidir se
  removidos sem cuidado. Ainda recria a aba QUOTE_HEADERS. Candidato a remoção
  futura, com revisão dedicada.

## Aba QUOTE_HEADERS na planilha
Está vazia (0 linhas). Não é mais alimentada por código ativo. Pode ser deixada
como está (não atrapalha) ou removida manualmente quando quiser.

## Dívida — sanitizeForClient em endpoints de abas vazias (2026-06-16)
O bug de serialização de Date (google.script.run não serializa Date → null)
foi corrigido nos endpoints de abas VIVAS: Proposals, ActionCards, Companies,
Contacts, Tickets, Expenses, Dashboard, Visao360, Feedback.

Endpoints de abas hoje VAZIAS ainda retornam dados crus (risco latente, não
ativo — só falham quando a aba tiver linhas com células de data):
Agenda, BaseInstalada, Caixa, Compliance, Compras, Email, Engenharia, Estoque,
Frota, Horas, NotasFiscais, Projetos (parcial).
Ao ativar cada módulo, aplicar sanitizeForClient(...) no retorno (envolver o
data: de listagens/getById). Padrão já estabelecido nos domínios vivos.

## Concorrência — Níveis 1 e 2 (2026-06-16)
4 usuários simultâneos. Auditoria de locks:
- NÍVEL 1: criado updateRowByIdSafe (com lock) em Core.Spreadsheet.gs.
  Aplicado SÓ nas escritas "soltas" (fora de lock): Companies, ConfigPanel,
  Contacts, Expenses, Feedback.Api, Opportunities, Products, Tickets.Service,
  Users, Workflow.Api. As escritas dentro dos Repository.gs continuam usando
  updateRowById cru (já têm lock próprio — usar Safe lá causaria DEADLOCK,
  pois o LockService do GAS não é reentrante).
- NÍVEL 2: helper generateUniqueSequentialId (Core.Config.gs) generaliza a
  guarda de unicidade dos tickets. Aplicado em: Proposals (inline, gera
  id+number juntos), Companies, ActionCards (cards), Contacts.

DÍVIDA (Nível 2 não aplicado — baixo volume/risco): Agenda, BaseInstalada,
Caixa, Compliance, Compras, Engenharia, Horas, NotasFiscais, Projetos e os
history/append-only (ACH, TKU). Aplicar generateUniqueSequentialId quando
cada um entrar em uso intenso. Tickets já tinham a guarda própria.
