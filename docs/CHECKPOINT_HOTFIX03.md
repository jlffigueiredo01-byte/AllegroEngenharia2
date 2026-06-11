# CHECKPOINT — HOTFIX-03 (UI Contracts)
**Data:** 2026-06-11 · **Executor:** Claude Fable 5 (auditoria → correção direta no repo)
**Branch:** `fix/hotfix-03-ui-contracts` (3 commits)

## Causa-raiz dos bugs reportados no review do João

1. **Colisão de namespace JS entre telas (bug sistêmico).** Todos os `*UI.html` são
   incluídos no mesmo escopo global. Helpers "privados" com nomes idênticos
   (`_openDetailModal`, `_closeNewModal`, `_updateStats`, ...) existiam em 2–4 telas:
   a última incluída vencia para todas. Por isso: "Cancelar" não fechava a modal de
   Oportunidades (chamava o fechador do QuotesUI), "Ver" não abria nada, e os Action
   Cards não abriam detalhe. **Correção:** prefixo por tela (`_ac/_co/_ct/_op/_qt`)
   em todos os helpers genéricos; `renderQuotes` legado do QuotesUI desativado
   (ProposalBuilderUI é o dono da seção); renderers duplicados do Scripts.html
   renomeados para `_legacy*` (fim da dependência de ordem de include).

2. **"proposalId é obrigatório" ao gerar proposta.** A proposta SALVAVA certo; a tela
   lia `res.id`, mas a API em camadas retorna `{ok, data:{id, number,...}}` →
   `undefined` chegava ao gerador de PDF. **Correção:** handler lê `res.data.id`
   (com fallback) e exibe o `number` da proposta.

3. **Data em formato cru** ("Wed Jun 11 2026 ..."). `formatDate` só entendia
   `YYYY-MM-DD`; valores Date/ISO vindos da planilha via google.script.run passavam
   direto. **Correção:** formatDate robusto (Date, ISO 8601, YYYY-MM-DD).

4. **Foto do cupom não era salva em lugar nenhum** (usada no OCR e descartada).
   **Correção:** `Api_saveExpense` agora arquiva o comprovante no Drive (pasta
   "SGA - Despesas (comprovantes)", id em Script Properties `EXPENSES_FOLDER_ID`),
   grava `foto_file_id` na linha (coluna adicionada de forma idempotente) e a
   listagem mostra 📎 com link para o arquivo.

## O que NÃO era bug (calibração de expectativa)

- **Mapa vazio:** a tela está correta; as empresas ainda não têm lat/lng. Ação
  operacional: logado como DIRETOR_TECNICO, clicar **"Geocodificar Pendentes"** na
  tela do mapa (processa em lote, respeitando cota).
- **Preço "só enxerga o valor da planilha":** correto hoje — o motor de precificação
  (Domain.Pricing, selfTest ok) existe mas ainda não está ligado a esta tela; a
  ligação é a fase F4 (Oportunidade→Proposta) do sprint de UI.
- **Sem tela de Purchase Order / Projetos-RDO / Financeiro / Visão 360 / vínculo de
  despesa a proposta-projeto / Dashboard rico:** backends existem
  (Domain.Compras/Projetos/Caixa/...), **as telas nunca foram construídas**.
  Escopo do próximo sprint de UI (prompt a ser emitido), na ordem do SMO.

## Validação executada aqui
- Grep de funções JS duplicadas entre os HTML: **vazio** após o commit 1.
- `node --check` na soma dos blocos `<script>` de todos os arquivos alterados: **OK**.

## Teste manual no DEV (João — 5 minutos)
1. `clasp push` (DEV) e recarregar o app.
2. Oportunidades → Nova → **Cancelar fecha a modal**; criar → modal fecha sozinha.
3. Tabela de oportunidades → **"Ver" abre o detalhe**; datas em DD/MM/AAAA.
4. Action Cards → abrir um card → detalhe abre.
5. Propostas → montar e **"Gerar e Imprimir"** → PDF abre sem erro de proposalId.
6. Despesas → nova com foto → salva, **aparece na lista com 📎** abrindo o cupom.
7. Mapa → "Geocodificar Pendentes" → pinos aparecem.

## Fora de escopo deste hotfix (próximo prompt)
Telas novas (PO, Projetos/RDO, Financeiro, 360, Fornecedores, Horas), vínculo de
despesa a proposta/projeto, ligação motor→proposta (F4) e dashboard do Painel de 8.
