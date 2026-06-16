# COMANDO_TRIAGEM.md — disparo manual da triagem (Modelo 1)

Cole o bloco abaixo no agente (Claude Code no VS Code) quando quiser
processar o feedback do dia. É o gatilho do **Modelo 1** (você dispara).

---

## O comando (copie tudo entre as linhas)

```
Você vai fazer a triagem do feedback dos usuários do SGA.

Antes de começar, leia:
1. docs/ESTADO_ATUAL_SGA.md      (estado atual do sistema)
2. docs/POLITICA_AUTONOMIA_AGENTES.md  (o que pode publicar sozinho)
3. PROMPT_TRIAGEM.md             (como triar)

Depois:
1. Liste os arquivos FB-*.md na pasta do Drive cujo FB-xxxxx ainda
   NÃO aparece em nenhum PLANO-*.md (= ainda não triados).
2. Para CADA relato:
   - Classifique a camada: VERDE / AMARELO / VERMELHO.
   - VERDE   → corrija na /dev, registre o estado anterior (reversível),
               e me diga o que fez.
   - AMARELO → corrija e teste na /dev, NÃO publique. Me entregue:
               (a) o que era / o que fez, (b) arquivos tocados,
               (c) o que pode ter afetado (checklist Interligação Total),
               (d) link da /dev para eu conferir.
   - VERMELHO → escreva a proposta no PLANO-AAAA-MM-DD.md e PARE.
3. Em TODA ação, cite o FB-xxxxx e atualize o status na aba FEEDBACKS.

Regras duras:
- NÃO publique nada para /exec. Quem publica sou eu.
- Na dúvida entre camadas, SUBA — nunca desça.
- Toque na planilha (Sheets) = sempre VERMELHO (só propor).
```

---

## Quando usar
- Uma vez por dia (ou quando quiser), com o VS Code aberto.
- O arquivo do dia já está na sua máquina (Drive Desktop sincroniza sozinho).

## O que esperar de volta
- 🟢 Verdes: já corrigidos na /dev, esperando você publicar.
- 🟡 Amarelos: prontos e testados, com resumo para você aprovar.
- 🔴 Vermelhos: descritos no PLANO do dia, aguardando sua decisão.

## Seu único trabalho depois
- Conferir os amarelos/verdes na /dev.
- Publicar (/dev → /exec) o que aprovar.
- Decidir os vermelhos.
