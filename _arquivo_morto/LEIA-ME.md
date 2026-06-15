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
