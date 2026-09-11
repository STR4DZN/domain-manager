# Mission Authority Consolidation — dev.144

A dev.144 remove a segunda autoridade de mutação de Mission sem alterar schema ou lifecycle persistido.

## Command Kernel

Novos comandos:
- `mission.update`
- `mission.objective-upsert`
- `mission.objective-remove`

As operações existentes `mission.create`, `mission.prepare`, `mission.release`, `mission.launch` e `mission.resolve` permanecem canônicas.

## Compatibilidade

`scripts/features/missions/actions.js` continua exportando as APIs antigas, mas agora apenas despacha Commands e lê o resultado. Não possui write path próprio.

Missions derivadas não podem ser criadas diretamente pelo wrapper legado. Request → Mission continua exclusivamente pelo bridge de Request, preservando provenance e deduplicação.

## Guard rails

- update não realiza transição de lifecycle;
- alteração de Domains é bloqueada quando há Squads preparados;
- update e objetivos são GM-only;
- retries são idempotentes pelo Transaction Manager;
- schema permanece v9.
