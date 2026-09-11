# dev.135 — Strategic Economy Audit

## Escopo

O milestone amplia o kernel v6/DOMAIN//OS v4 sem reconstruir a apresentação global. O schema passa a v7 para persistir políticas econômicas por recurso e prioridade de manutenção de Structures.

## Implementado

- `Domain.economy.resourcePolicies` com critical floor, reserve target e storage capacity.
- `Structure.maintenancePriority` com ordenação determinística.
- Command autoritativo/idempotente `economy.configure`.
- Strategic Domain Ledger consolidando flows, sustenance, Structures, Agreements e Project reservations.
- Simulation Kernel tick-by-tick para avanços agregados.
- Manutenção parcial, produção proporcional e degradação automática.
- Storage overflow real e thresholds estratégicos.
- Agreements temporários processados por tick.
- Commissioning intermediário: Structure concluída no tick T opera a partir de T+1.
- `advance-run` persiste Agreements e projeções finais de Structure vindas do kernel.
- Logistics UI baseada no ledger estratégico + Policy Console.

## Hardening

- Testes de threshold nos limites exatos.
- Teste de Structure damaged com condição × service ratio.
- Teste de Structure disabled sem consumo/produção.
- Bateria determinística com 24 cenários variados comparando `advance(N)` contra N×`advance(1)`.
- Testes de commit real para degradação, disable automático, overflow persistido, breach/expiração de Agreement e commissioning intermediário.
- Alertas temporais agregados carregam `occurrenceTicks`, permitindo aplicar consequências civis por tick real e não por quantidade de recursos em falta.
- Teste prova que fome + seca no mesmo tick contam uma única crise civil e que `advance(2)` equivale a dois `advance(1)` também no estado populacional.
- Testes de UI impedem persistência econômica direta fora do Command Kernel.
- Renderização visual da Logistics matrix e Policy Console antes do release.

## Invariantes

1. Preview e commit devem compartilhar a mesma projeção econômica.
2. Ordem de documentos do Foundry não altera prioridade de manutenção.
3. Produção ocorre depois da alocação de manutenção.
4. Uma Structure não se auto-financia retroativamente no mesmo tick.
5. Capacity é aplicada no tick em que ocorre overflow.
6. `advance(N)` é semanticamente equivalente a N avanços unitários.
7. UI exibe estado econômico, mas não implementa regra de gameplay.

## UI Review

A primeira renderização estratégica ocultava Capacity/Autonomy/State por falta de largura. A composição foi corrigida: a matriz recebe prioridade espacial e o Flow Core funciona como instrumento secundário. A tela final mostra os oito canais de decisão sem navegação horizontal obrigatória no canvas normal.

O Policy Console separa resource thresholds de population/security sustenance e mantém a linguagem de Command Console do DOMAIN//OS.

## Validation

- 160/160 testes no gate final pré-empacotamento.
- 134 arquivos JS/MJS com sintaxe válida.
- 367 imports relativos resolvidos, 0 ausentes.
- 7 JSONs válidos e Handlebars balanceado.
- Versionamento alinhado em package/module/constants: `0.1.0-dev.135`, schema 7.
- Zero seletores das anatomias descartadas e zero animações decorativas infinitas.

## Known limits

- Strategic Ledger representa situação nominal e não tenta simular antecipadamente toda disputa futura de manutenção.
- Histórico continua consolidando um avanço agregado em vez de criar uma entrada por tick.
- Repair/workforce/territorial logistics são milestones futuros.
- Smoke test final em Foundry VTT v13 real continua recomendado após instalação.

## Release gate atual

- 160/160 testes automatizados aprovados.
- Schema v7 com migration v6→v7 coberta.
- DOMAIN//OS v4 preservado; Strategic Economy se adapta ao produto em vez de reconstruir a shell.
- Logistics/Policy Console renderizados e inspecionados visualmente.
