# dev.134.2 — Presentation Reset Audit

## Objetivo
Substituir integralmente a arquitetura de apresentação do dev.134.1 sem alterar o kernel, regras, commands, schemas ou contratos operacionais.

## Problema confirmado no dev.134.1
A UI tecnicamente nova ainda mantinha a anatomia anterior: rail vertical + Entity Deck fixo + navegação horizontal extensa + dashboard de KPIs/cards. O resultado era uma skin FUI sobre o mesmo produto antigo.

## Mudança estrutural
A anatomia antiga foi removida. O app passa a usar:

`Command Header → Stage + Context Console → Workspace Dock`

Dentro de um Domain, a navegação é agrupada em cinco workspaces:
- Command
- Base
- Operations
- Civil
- Intelligence

Cada workspace possui composição própria e apenas seus subsistemas aparecem no Subsystem Strip.

## Apresentação removida
- Command Rail vertical.
- Entity Deck fixo.
- Barra global com todas as views do Domain.
- Overview baseado em fila de KPI cards.
- Node Matrix formada apenas por cards em grid.
- dialogs genéricos da geração anterior.
- animações decorativas infinitas.

## Apresentação adicionada
- DOMAIN//OS Command Header.
- Context Console contextual.
- Workspace Dock inferior.
- Domain Vector e telemetria contextual.
- Command node constellation e Strategic Load.
- Resource Flow matrix/schematic.
- Infrastructure bus e industrial asset cards.
- Mission Control com retícula e lanes operacionais.
- Civil demographic core/group index.
- Intelligence territory scope/cartography.
- Command Consoles para formulários e operações transitórias.
- acentos semânticos por workspace.

## Autoavaliação visual iterativa
As telas foram renderizadas em Chromium e inspecionadas durante o desenvolvimento, não avaliadas apenas pelo CSS.

### Command
- identidade: forte;
- deixou de usar KPI grid;
- topologia central cria foco operacional;
- contexto lateral é subordinado ao stage.

### Overview
- três áreas assimétricas: core, flows e alerts;
- active operations vira lane própria;
- sem retorno ao dashboard genérico.

### Infrastructure
- bus de ativos + cards industriais;
- manutenção/output e Project link são parte da leitura do ativo;
- composição não reaproveita Overview.

### Missions
- retícula, objective telemetry, committed units e action lane;
- Operations possui acento próprio.

### Civil
- demographic instrument + group index;
- evita KPI cards; leitura populacional é uma ferramenta distinta.

### Intelligence
- spatial scope com grid/orbits/reticle/callout;
- composição claramente diferente das áreas administrativas.

### Command Consoles
- dialogs transformados em consoles do próprio sistema;
- telemetria, campos maiores, economic matrices e geometria compartilhada com o app.

## Compact layout
Foi renderizado um Overview em 1120×700. O app preserva stage, Context Console e Workspace Dock sem ressuscitar a anatomia antiga. Microtextos críticos receberam incremento de legibilidade.

## Contratos de regressão visual
A suíte agora impede:
- retorno de `dm-command-rail`, `dm-entity-deck`, `dm-domain-tabs` e KPI grid legado;
- animações decorativas infinitas;
- remoção do novo frame/Workspace Dock;
- perda dos novos Command Consoles;
- perda do canvas inicial 1480×880 e breakpoint compacto.

## Limites deliberados
- Foundry ainda fornece o frame externo da ApplicationV2; o interior do app é integralmente DOMAIN//OS.
- Preview Chromium é uma verificação visual de apresentação, não substitui smoke test dentro do Foundry real.
- O reset não introduz features de gameplay e mantém schema v6.
