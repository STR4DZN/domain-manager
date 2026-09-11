# Mission MVP — dev.133

## Objetivo

O Mission MVP prova o fluxo operacional completo entre GM, jogador, Squad, recursos e consequências usando o Command/Authority Kernel do dev.130 e a UI Foundation do dev.131.

## Lifecycle

1. GM registra uma Mission em um Domain com capability `missions`.
2. GM define audiência, briefing e objetivos.
3. Jogador da audiência escolhe um Squad que controla e compromete efetivo/suprimentos.
4. Preparação não consome recursos; ela grava uma assignment persistente.
5. GM lança a Mission. Todas as assignments são validadas novamente e os suprimentos são consumidos.
6. Squads passam a `deployed` e Mission passa a `active`.
7. GM resolve a Mission com baixas, deltas de moral/condição, notas e estado dos objetivos.
8. Consequências retornam aos Squads, o vínculo `currentMission` é limpo e o resultado permanece no registro da Mission.

## Segurança e autoridade

- Todas as mutações operacionais passam por commands autoritativos.
- `operationId`/ledger impedem repetição de efeitos em retry.
- Jogador precisa pertencer à audiência e controlar o Squad para preparar.
- Launch e Resolve são etapas exclusivas de GM.
- UUID/entityId são cruzados quando ambos existem.
- Batch updates e rollback compensatório seguem as garantias do kernel do dev.130.

## UI — Mission Control

O Mission Control é uma tela operacional própria, não uma adaptação da UI legada. Cada operação apresenta:

- status e identificação;
- audiência;
- objetivos;
- força comprometida;
- unidades preparadas/deployed;
- suprimentos comprometidos;
- Squads disponíveis para preparação;
- Launch control do GM;
- After Action Resolution com consequências por unidade e por objetivo.

A linguagem visual usa teal/ciano para leitura forense/operacional, amber para ação/comando e vermelho apenas para consequência crítica/falha.

## Fora do escopo

- resolução automática de combate;
- rolagens/checagens de sistema de RPG;
- viagem, distância e duração simulada;
- loot/XP/reputação automáticos;
- controle territorial derivado do resultado.

Esses sistemas devem consumir o contrato e os eventos do Mission MVP em versões posteriores, sem alterar o fluxo base.
