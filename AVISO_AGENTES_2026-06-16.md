# AVISO AOS AGENTES — sincronização de 2026-06-16

> Cole este aviso junto ao comando de partida (`COMANDO_TRIAGEM.md`).
> O João resolveu vários relatos direto no repositório enquanto os agentes
> estavam parados. Antes de triar qualquer coisa, leia abaixo.

## 1. Faça `clasp pull` ANTES de tudo
O código foi atualizado. Puxe a versão nova antes de ler ou mexer em qualquer
arquivo, senão você trabalha em cima de código velho.

## 2. Mudança no formato do feedback (IMPORTANTE)
O sistema NÃO gera mais um arquivo-do-dia que se reescreve. Agora:
- **Cada relato vira um arquivo próprio: `FB-xxxxx.md`**, gravado na hora do
  envio, na pasta `00-Sistema/Feedback` do Drive.
- Um relato está **pendente** se o seu `FB-xxxxx` ainda NÃO aparece em nenhum
  `PLANO-*.md`.
- O dedupe agora é na triagem (você agrupa no PLANO), não na captura.
- Motivo da mudança: o formato antigo tinha um bug de fuso horário que fazia o
  arquivo sair vazio e a geração parar. O formato por-relato é robusto.

## 3. Relatos JÁ RESOLVIDOS pelo João (NÃO retrabalhe)
Estes foram corrigidos direto no repositório nesta leva. Apenas **confirme que
o status na aba FEEDBACKS está `IMPLEMENTADO`** — se não estiver, avance e pare.
NÃO reimplemente:

| FB | O que era | Como foi resolvido |
|---|---|---|
| FB-00005 | Mapa de clientes vazio | Era operacional (137 sem geocodificar). UX melhorada + botão "Geocodificar agora". |
| FB-00006 | Modo dark | Tema escuro com toggle na sidebar + persistência. |
| FB-00007 | Menu minimizado | Todos os grupos abertos por padrão + itens compactos. |
| FB-00008 | "10" sem unidade no motor | Rótulo "metros" adicionado ao campo. |
| FB-00009 | Erro ao carregar propostas | sanitizeForClient + sort robusto a Date em Api_propGetAll. |
| FB-00010 | Erro ao continuar proposta | sanitizeForClient em propGetById/create/revisão/update. |
| FB-00011 | Feedback parou de gerar .md | Bug de fuso corrigido (um arquivo por relato). |

Os FB-00001 a FB-00004 vocês já trataram no `PLANO-2026-06-15.md` — confirmem
que o status deles está `EM_ANALISE` ou `IMPLEMENTADO`, conforme o caso.

## 4. Sua tarefa agora
1. Avance o status na aba FEEDBACKS dos relatos acima (→ IMPLEMENTADO), com uma
   `resolucao_nota` curta para o usuário ver em "Meus reportes".
2. A partir daqui, triagem normal dos PRÓXIMOS relatos (FB-00012 em diante),
   seguindo `PROMPT_TRIAGEM.md` e `docs/POLITICA_AUTONOMIA_AGENTES.md`.

> Lembrete: vocês PROPÕEM; o João publica (/dev → /exec). Autonomia até AMARELO.
