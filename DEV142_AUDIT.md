# dev.142 — Request Lifecycle Closure Audit

## Baseline

- Fonte: `0.1.0-dev.141`.
- Baseline: **236/236 testes verdes**.
- Schema: **v9**.

## Lacuna confirmada

`RequestModel` já declarava `withdrawn` e `fulfilled`, mas a build atual não possuía comandos oficiais para chegar a esses estados. Além disso, review/materialização/lifecycle não compartilhavam o mesmo lock da Request e um resultado já materializado ainda podia ter a decisão reaberta por comando direto.

## Implementado

- `request.withdraw` no Command Registry.
- `request.fulfill` no Command Registry.
- eventos `request.withdrawn` e `request.fulfilled`.
- retirada exclusiva do solicitante em `submitted/under-review/needs-changes`.
- fulfillment GM-only para `immediate` explícito ou Mission canônica `resolved`.
- Mission `failed` não cumpre Request.
- rollback compensatório em ambos os comandos.
- stale-revision support nos dois comandos.
- lock único por Request para review, create-mission e lifecycle.
- review congelado para `withdrawn`, `fulfilled` ou Request com `resultUuid`.
- Request Dossier com `WITHDRAW REQUEST`, `MARK FULFILLED` e Mission state.

## Limites deliberados

- não há bridge Request → Project/Agreement;
- Mission failed deixa Request aprovada e não fulfilled;
- nenhum fulfillment automático;
- nenhum schema/migration novo.

## Regressão pré-versionamento

- focused Request/UI/actions: **28/28**;
- suíte completa: **248/248**;
- Simulation, Domain model, Strategic Economy, Projects e Structures: hashes idênticos à dev.141.

## Gate final

### Após versionamento

- versão interna: `0.1.0-dev.142`;
- schema: **v9**;
- syntax check: **160/160 JS/MJS**;
- JSON parse: **7/7**;
- suíte completa: **248/248 testes verdes**.

### ZIP candidata

- extraída em diretório limpo;
- `package.json`, `module.json` e `MODULE_VERSION`: `0.1.0-dev.142`;
- schema: **v9**;
- suíte dentro da candidata: **248/248 testes verdes**.

### Distribuição final

- ZIP final reextraída em diretório limpo;
- `package.json`, `module.json` e `MODULE_VERSION`: `0.1.0-dev.142`;
- schema final: **v9**;
- suíte dentro da ZIP final: **248/248 testes verdes**;
- SHA-256: `44a666e6c785ddd4a6b1014665b07647716b736f95950f3187c1e75793713ba8`.

**Veredito: APROVADA COMO CHECKPOINT DEV.142.**
