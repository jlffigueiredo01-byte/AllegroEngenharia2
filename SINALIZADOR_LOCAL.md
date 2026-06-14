# SINALIZADOR_LOCAL.md — disparo automático ao chegar arquivo (Modelo 4)

Guardado para **quando o disparo manual cansar**. Faz a sua máquina
perceber o arquivo novo e acionar o agente sozinha — sem ficar em loop
e sem o SGA precisar alcançar o computador.

> **Não monte isto agora.** Comece pelo Modelo 1 (`COMANDO_TRIAGEM.md`).
> Volte aqui só depois de o ciclo já ter rodado várias vezes e você
> confiar na classificação dos agentes.

---

## O que ele faz (em uma frase)
- Vigia a pasta do Drive na sua máquina.
- Quando um `feedback-*.md` novo aparece → dispara o agente uma vez.

## Pré-requisitos
- Google Drive para Desktop instalado e sincronizando.
- VS Code + agente já configurados e funcionando no Modelo 1.
- Máquina ligada (o sinalizador mora nela).

---

## Como montar (Windows) — visão geral

**Passo 1 — descobrir a pasta local do feedback**
- Abra o Drive no explorador de arquivos.
- Navegue até `00-Sistema/Feedback`.
- Copie o caminho local (algo como `G:\Meu Drive\...\00-Sistema\Feedback`).

**Passo 2 — criar o gatilho**
- Duas opções, da mais simples à mais robusta:
  - **a) Agendador de Tarefas** (na verdade é o Modelo 2, mas resolve):
    cria uma tarefa que roda o agente toda manhã num horário fixo.
  - **b) Vigia de pasta** (o Modelo 4 de verdade): um pequeno script
    PowerShell que usa o `FileSystemWatcher` do Windows — fica dormindo
    de graça e só acorda quando a pasta muda.

**Passo 3 — o que o gatilho executa**
- O mesmo comando do `COMANDO_TRIAGEM.md`, rodado de forma não interativa
  no agente (modo headless/linha de comando).

---

## Quando vale a pena
- Você esquece de rodar a triagem e o feedback acumula.
- Quer a sensação "chegou solicitação → o agente já avalia".
- Não se importa em deixar a máquina ligada.

## Quando NÃO vale
- Você lembra de rodar o comando sem dor → fique no Modelo 1.
- Quer rodar sem depender da máquina ligada → pule direto para a nuvem.

---

## Próximo degrau (quando largar a máquina)
- Mover o agente para a nuvem: o próprio lote diário dispara, e você
  aprova pelo celular. Tudo que já existe (o .md no Drive, os prompts,
  a política de camadas, a separação /dev e /exec) continua igual —
  muda só ONDE o agente roda e QUEM o dispara.

> Quando chegar nesse ponto, me peça o desenho da versão em nuvem.
