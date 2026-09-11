# Strategic Economy — dev.135

## Objetivo

O Strategic Economy transforma a economia do Domain em um sistema temporal determinístico. A UI deixa de exibir apenas fluxos persistentes e passa a representar o mesmo estado que o Simulation Kernel utiliza: estoque, reserva de Projects, sustento, Agreements, manutenção/produção de Structures e políticas por recurso.

## Resource Policy

Cada recurso pode possuir uma policy independente em `Domain.economy.resourcePolicies`:

- `criticalFloor`: disponibilidade igual ou abaixo deste valor é crítica;
- `reserveTarget`: disponibilidade abaixo deste valor está abaixo da reserva estratégica;
- `storageCapacity`: limite físico de estoque; `0` significa ilimitado.

Invariantes:

- valores são inteiros em minor units;
- `criticalFloor <= reserveTarget` quando ambos são usados;
- `reserveTarget <= storageCapacity` quando capacity é finita;
- policies são únicas por `resourceId`.

A configuração administrativa passa pelo command autoritativo `economy.configure`; a UI não grava Journals diretamente.

## Maintenance Priority

Cada Structure possui `maintenancePriority` de `0..100`.

Em um tick, Structures elegíveis são ordenadas por:

1. prioridade decrescente;
2. `entityId/uuid` como desempate estável.

Recursos escassos são alocados nessa ordem. Isso torna a disputa reprodutível e evita dependência da ordem de documentos do Foundry.

## Service Ratio e degradação

Structures `operational` e `damaged` tentam pagar manutenção antes de produzir.

O `serviceRatio` é determinado pelo requisito menos atendido. Se uma Structure recebe apenas parte da manutenção:

- ela consome somente a parcela servida;
- produção do tick é reduzida pelo service ratio;
- produção também respeita a eficiência de condição;
- a condição deteriora de forma determinística;
- `condition <= 0` leva a `disabled`.

Structures `planned`, `disabled`, `destroyed` e `decommissioned` não consomem manutenção nem produzem.

Não existe reparação automática no dev.135.

## Ordem econômica por tick

O kernel processa cada tick individualmente, inclusive quando a chamada externa é `advance(N)`:

1. persistent flows + sustenance;
2. Agreements ativos;
3. alocação de manutenção por prioridade;
4. produção de Structures;
5. settlement/progresso de Projects;
6. storage capacity e thresholds;
7. aplicação do estado intermediário;
8. decremento/encerramento de Agreements;
9. comissionamento de Structures cujos Projects concluíram.

Uma Structure comissionada no tick T passa a participar da economia a partir do tick T+1.

A produção de uma Structure não pode retroativamente financiar a própria manutenção daquele mesmo tick.

## Determinismo

`simulateAdvance(snapshot, N)` deve produzir o mesmo estado persistível que N chamadas sucessivas de `simulateAdvance(snapshot, 1)`.

A suíte cobre essa propriedade com cenários fixos e uma bateria determinística de combinações envolvendo:

- carry de flows;
- Agreements temporários;
- prioridades concorrentes;
- manutenção parcial;
- degradação;
- produção;
- storage capacity;
- thresholds.

## Storage

Quando `storageCapacity > 0`, estoque acima da capacidade é descartado no próprio tick e reportado como `storageOverflow`.

Overflow não é transportado ao tick seguinte.

## Thresholds

Estados estratégicos principais:

- `NOMINAL`: acima da reserva-alvo;
- `BELOW RESERVE`: abaixo de `reserveTarget` mas acima do piso crítico;
- `CRITICAL`: igual ou abaixo de `criticalFloor`;
- `SHORTFALL`: obrigações excederam estoque disponível / reservas ultrapassaram disponibilidade.

A UI mostra o estado sem depender somente de cor.

## Strategic Ledger

`buildStrategicDomainLedger()` consolida a leitura operacional usada pela UI. Ele inclui:

- flows persistentes;
- population/security sustenance;
- maintenance e production de Structures;
- Agreements;
- Project reservations;
- disponibilidade;
- direção líquida;
- runway/autonomia;
- reserve gap;
- storage utilization.

O ledger é uma projeção nominal para decisão. A resolução de escassez por prioridade e degradação acontece no Simulation Kernel.

## Persistência

`advance-run` persiste a projeção final do kernel para:

- Domain stocks/flows/Agreements;
- Projects;
- Structures, incluindo `condition` e `status`.

O conjunto continua usando batch compensável. Preview e commit não mantêm engines econômicas paralelas.

## Limites deliberados

O dev.135 não introduz:

- mercado global;
- rotas logísticas geográficas;
- reparação automática;
- power-grid especializado;
- workforce allocation;
- preços dinâmicos;
- IA de produção.

Esses sistemas devem consumir o kernel econômico existente em milestones futuros, não substituí-lo.


## Alertas temporais agregados

O relatório de `simulateAdvance(N)` preserva, para alertas repetidos, `firstTick`, `lastTick`, `occurrences` e `occurrenceTicks`. Consequências civis usam a união dos ticks afetados. Assim, se comida e água faltarem no mesmo tick, a população sofre **uma** ocorrência de crise naquele tick, não duas penalidades independentes pelo mesmo instante.

Isso mantém a equivalência semântica entre um avanço agregado e avanços unitários também para fome/desabastecimento.
