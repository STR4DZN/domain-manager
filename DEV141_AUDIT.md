# dev.141 — Request Mission Bridge Audit

## Baseline

- Fonte: `0.1.0-dev.140`.
- Baseline: **231/231 testes verdes**.
- Schema: **v9**.

## Lacuna confirmada

A Request já podia ser aprovada com `handling=mission`, e Mission já possuía provenance `origin.kind=request`, porém a materialização permanecia em `features/missions/bridge.js` como fluxo legado fora do Command Kernel e sem UI na shell atual.

## Implementado

- `request.create-mission` no Command Registry.
- Evento `request.mission-created`.
- Validação de status/handling/capability/related Domains/stale revision.
- Mission disponível com provenance explícita e audience do solicitante.
- `Request.resultUuid` e history sincronizados.
- deduplicação por origem mesmo sob novo `operationId`.
- rollback compensatório de Request + Mission.
- bridge legado convertido em wrapper do Command Kernel.
- ação explícita **CREATE MISSION** no Request Dossier GM-only.

## Limites deliberados

- Request não vira `fulfilled` ao criar a Mission.
- aprovação não cria Mission automaticamente.
- não há bridge para Project ou Agreement nesta versão.
- nenhum schema/migration novo.

## Regressão pré-versionamento

- focused Request/UI/actions: **16/16**;
- suíte completa: **236/236**;
- Domain model, migration pipeline, Simulation, Strategic Economy, Projects, Structures e Defense: hashes idênticos à dev.140.

## Gate final

### Após versionamento

- versão interna: `0.1.0-dev.141`;
- schema: **v9**;
- syntax check: **160/160 JS/MJS**;
- JSON parse: **7/7**;
- suíte completa: **236/236 testes verdes**.

### Empacotamento

- ZIP candidata extraída em diretório limpo;
- versão interna candidata: `0.1.0-dev.141`;
- suíte dentro da candidata: **236/236 testes verdes**.

### Distribuição final

- ZIP final reextraída em diretório limpo;
- `package.json`, `module.json` e `MODULE_VERSION`: `0.1.0-dev.141`;
- schema final: **v9**;
- suíte dentro da ZIP final: **236/236 testes verdes**;
- SHA-256: `0bf083fe9181565e05b63e57813142e8e1d22b11c40233daf579ab755ef2a065`.

**Veredito: APROVADA COMO CHECKPOINT DEV.141.**
