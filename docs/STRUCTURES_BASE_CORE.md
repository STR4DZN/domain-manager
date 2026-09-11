# Structures & Base Core — dev.134

## Objetivo

`dev.134` transforma `Structure` de contrato passivo em um ativo físico persistente e operável. O milestone cobre criação, construção financiada, comissionamento por Project, condição, capacidade, manutenção, produção e controle operacional dentro do Strategic Operations System.

O escopo é deliberadamente menor que a economia estratégica do `dev.135`: Structures participam da economia por tick, mas faltas de manutenção ainda não disparam degradação/cascatas automáticas.

## Lifecycle

### Registro direto

Somente GM pode registrar um ativo já existente com `structure.create`.

O ativo nasce com:

- Domain tipado;
- categoria;
- tier/maxTier;
- status e condição;
- capacidade;
- perfil de manutenção;
- perfil de produção;
- tags;
- ownership `OBSERVER` herdado dos controllers do Domain.

### Construção vinculada a Project

`structure.begin-construction` exige as capabilities `structures` e `projects`.

A operação:

1. valida Domain/controlador;
2. valida catálogo de recursos;
3. calcula reservas existentes;
4. rejeita construção se os custos reserved excederem o estoque reservável;
5. cria um `Project active`;
6. cria uma `Structure planned` com `activeProject` apontando para o Project;
7. registra ambos como uma única operação idempotente no Command Kernel.

Custos `reserved` são reservados conceitualmente na criação, mas só são consumidos quando o Project conclui. Custos `progressive` são liquidados proporcionalmente ao progresso pelo Simulation Kernel.

## Comissionamento

Quando `simulateAdvance` determina que o Project vinculado concluiu, `executeAdvanceRun` prepara no mesmo batch:

- novo estoque do Domain;
- Project `completed` e custos liquidados;
- Structure `planned -> operational`;
- `activeProject -> null`;
- histórico estruturado do Domain;
- notificação de comissionamento.

A Structure estava `planned` no snapshot daquele ciclo, portanto **não produz nem consome manutenção no tick em que é comissionada**. Ela começa a participar da economia a partir do próximo avanço. Essa regra evita produção retroativa no mesmo intervalo em que a obra terminou.

## Estados econômicos

### operational

- manutenção: 100% do perfil por tick;
- produção: 100% do perfil por tick.

### damaged

- manutenção: 100%;
- produção: `floor(produção nominal × condition / 100)` por tick.

A condição atua como eficiência produtiva no `dev.134`.

### planned / disabled / destroyed / decommissioned

- manutenção estrutural automática: 0;
- produção automática: 0.

## Falta de manutenção

Se um fluxo de manutenção ultrapassa o estoque disponível, a simulação emite `structureMaintenanceRisk`.

No `dev.134` isso **não altera automaticamente** condition/status. Essa decisão é intencional: degradação progressiva, prioridades, shedding, energia/logística e cascatas pertencem ao `dev.135 — Strategic Economy` e precisam ser projetadas como um sistema consistente, não como side effects locais.

## Commands

- `structure.create` — registro administrativo direto, GM.
- `structure.patch` — operação limitada pelo controller do Domain; descrição e alternância `operational/disabled`.
- `structure.admin-update` — administração completa do blueprint, GM.
- `structure.begin-construction` — cria Project + Structure planned vinculados.

Todas as mutações passam pelo Command/Transaction Kernel; a UI não atualiza Journals diretamente.

## Identidade e referências

`Structure.entityId` permanece imutável.

`domain` e `activeProject` usam referências tipadas `{ recordType, uuid/entityId }`. Quando UUID e entityId são enviados juntos, devem resolver para a mesma entidade; divergência gera conflito.

## Infrastructure Control UI

A página de Structures foi transformada em um aplicativo de infraestrutura com:

- resumo INDEXED / OPERATIONAL / PLANNED / DAMAGED / OFFLINE;
- cards físicos por ativo;
- condição estrutural;
- tier e capacidade;
- vetores de manutenção/produção por tick;
- vínculo e progresso de Project;
- tags;
- registro direto pelo GM;
- criação de construção financiada;
- console operacional para controllers;
- administração completa para GM.

A linguagem segue o design system do `dev.131`: Command OS amber como identidade, ciano para telemetria fria e cores de alerta apenas para estado real.

## Migration v6

Structures de schema v5 recebem `activeProject: null` quando o campo não existe. Uma referência já existente é preservada.

Nenhuma Structure antiga é automaticamente transformada em obra/planned.

## Limites intencionais

Ficam para milestones posteriores:

- degradação automática por falta de manutenção;
- redes de energia e prioridades;
- cadeia logística entre Structures;
- armazenamento/capacidade por recurso;
- dependências entre ativos;
- upgrades/tier via Projects avançados;
- reparo automatizado;
- workforce/population staffing;
- efeitos territoriais.
