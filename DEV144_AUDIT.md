# dev.144 — Mission Authority Consolidation Audit

## Baseline

- Fonte: `0.1.0-dev.143`.
- Baseline: **250/250 testes verdes**.
- Schema: **v9**.

## Lacuna confirmada

`features/missions/actions.js` ainda possuía create/update/objective writes diretos fora do Command Kernel, apesar do lifecycle moderno de Mission já usar Commands.

## Implementado

- `mission.update`;
- `mission.objective-upsert`;
- `mission.objective-remove`;
- `createMissionAction`, `updateMissionAction`, `upsertMissionObjectiveAction` e `removeMissionObjectiveAction` convertidos em wrappers;
- criação derivada (`request/project`) bloqueada no wrapper legado; bridges canônicos continuam responsáveis por provenance;
- mudança de status por `mission.update` bloqueada;
- mudança de topologia de Domain bloqueada com Squad preparado;
- teste permanente de coerência `package.json ↔ module.json ↔ MODULE_VERSION ↔ download`.

## Regressão pré-versionamento

- Mission focused: **14/14**;
- suíte completa antes do bump: **255/255**;
- diff funcional contra dev.143 restrito a Mission, Command Registry/constants e testes.

## Gate final

### Após versionamento
- versão interna: `0.1.0-dev.144`;
- schema: **v9**;
- syntax check: **161/161 JS/MJS**;
- JSON parse: **7/7**;
- suíte completa: **257/257 testes verdes**.

### ZIP candidata
- extraída em diretório limpo;
- versão interna e manifest: `0.1.0-dev.144`;
- `download` aponta para `v0.1.0-dev.144`;
- suíte dentro da candidata: **257/257 testes verdes**.

### Distribuição final
- ZIP final reextraída em diretório limpo;
- `package.json`, `module.json` e `MODULE_VERSION`: `0.1.0-dev.144`;
- schema final: **v9**;
- suíte dentro da ZIP final: **257/257 testes verdes**;
- SHA-256: `1b2b03f359abac067506018db57754c64fa308b2435dacb3d5004a90795392d7`.

**Veredito: APROVADA COMO CHECKPOINT DEV.144.**
