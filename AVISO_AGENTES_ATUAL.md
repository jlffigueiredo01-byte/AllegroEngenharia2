# AVISO AOS AGENTES — estado atual (2026-06-16, fim da sessão)

> Este é o aviso CONSOLIDADO e mais recente. Substitui o AVISO_AGENTES_2026-06-16.md.
> Cole-o junto ao COMANDO_TRIAGEM.md. Leia tudo ANTES de triar ou mexer em código.

## 0. PRIMEIRO DE TUDO: o projeto MUDOU de conta (migração de domínio)
O SGA foi migrado da conta pessoal (jlffigueiredo01@gmail.com) para o domínio
Google Workspace da Allegro (@allegro.eng.br). O projeto Apps Script é NOVO
(container-bound na planilha "Allegro Business System" copiada).
- **Antes de qualquer coisa, reaponte o clasp** seguindo o `MIGRACAO_AGENTES.md`:
  `clasp logout` → `clasp login` (conta Allegro) → trocar o `scriptId` no
  `.clasp.json` → `clasp pull` para confirmar.
- O projeto ANTIGO (conta pessoal) continua existindo como backup. NÃO mexa nele.
- Todo trabalho novo vai para o projeto Allegro.

## 1. Faça `clasp pull` ANTES de tudo
Depois de reapontar, puxe a versão nova. Não trabalhe sobre código velho.
GitHub (branch `yrdyrsdfgRuflo`) é a fonte da verdade do código.

## 2. O QUE MUDOU NESTA SESSÃO (não retrabalhe — já está feito)

### a) Feedback: um arquivo por relato (FB-xxxxx.md)
- Cada relato vira `FB-xxxxx.md` na pasta `00-Sistema/Feedback` do Drive.
- Pendente = `FB-xxxxx` que ainda NÃO aparece em nenhum `PLANO-*.md`.
- O dedupe é na triagem (agrupar no PLANO), não na captura.
- FB-00005 a FB-00011 JÁ foram resolvidos pelo João no repositório. NÃO
  retrabalhe; se ainda estiverem como abertos, apenas marque IMPLEMENTADO.

### b) Guia de Melhorias (tela admin) — NOVO
- `MelhoriasUI.html` + endpoints `Api_fbGetAll`, `Api_fbMarcarStatus`.
- Só DIRETOR_TECNICO acessa. Mostra todos os relatos, com filtros e status.

### c) Mesa de comando — aprovar gera tarefa para vocês
- Quando o João marca um relato como APROVADO na guia Melhorias, o sistema
  grava um arquivo `TAREFA-FB-xxxxx.md` na pasta `00-Sistema/Tarefas` do Drive.
- **Esses arquivos de Tarefa são a SUA fila de trabalho prioritária.** Leia a
  pasta Tarefas ANTES de triar feedback novo.
- Verde/amarelo → tarefa de IMPLEMENTAR. Vermelho → tarefa de PROPOR (não
  implementar direto).

### d) Tela de Usuários — NOVO
- `UsuariosUI.html` + `Domain.Users.gs` (`Api_usersGetAll/Create/Update/SetActive`).
- E-mail é editável só quando vazio; imutável depois de definido.
- Login é por conta Google (sem PIN). Não reintroduza PIN.

### e) Concorrência (4 usuários simultâneos) — REGRA IMPORTANTE PARA CÓDIGO
- Existe `updateRowByIdSafe` (com lock) em Core.Spreadsheet.gs.
- Use `updateRowByIdSafe` SOMENTE em escritas "soltas" (fora de um bloco que já
  pegou `LockService.getScriptLock()`).
- Dentro de funções que JÁ pegam lock (vários Repository.gs), continue usando
  `updateRowById` cru. Usar Safe lá causa DEADLOCK (o LockService do GAS não é
  reentrante).
- Para IDs sequenciais, use `generateUniqueSequentialId(sheet, counterKey, fmt, idCol)`
  (Core.Config.gs) em vez de só `getAndIncrementCounter`.

### f) Feedback aceita múltiplos anexos
- `fbSvcCriar` aceita `data.anexos[]`; coluna `anexos_json`. A guia Melhorias
  mostra todos como links clicáveis.

## 3. SUA TAREFA (ordem de prioridade)
1. Reaponte o clasp (Migração) e rode `clasp pull`.
2. Leia a pasta `00-Sistema/Tarefas` — TAREFA-FB-*.md é sua fila prioritária.
3. Depois, trie feedback novo: FB-*.md sem PLANO correspondente (FB-00012+).
4. Respeite a POLITICA_AUTONOMIA (semáforo verde/amarelo/vermelho).
5. clasp NÃO traz .md — baixe a documentação do GitHub (branch yrdyrsdfgRuflo).

## 4. NÃO FAÇA
- Não mexa no projeto antigo (conta pessoal).
- Não reintroduza PIN de login.
- Não adicione lock dentro de updateRowById (deadlock).
- Não retrabalhe FB-00005..00011 (já resolvidos).
- Não implemente tarefa VERMELHA direto — proponha e aguarde aprovação.
