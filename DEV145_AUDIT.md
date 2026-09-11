# dev.145 — Project Authority Consolidation Audit

## Baseline
- Fonte: `0.1.0-dev.144`.
- Baseline: **257/257 testes verdes**.
- Schema: **v9**.

## Lacuna confirmada
`features/projects/actions.js` ainda possuía quatro write paths diretos e um hard-delete físico fora do Command Kernel.

## Implementado
- create/update/cost upsert/cost remove convertidos em wrappers dos Commands existentes;
- `expectedModifiedTime` movido para os Commands canônicos de update/custos;
- hard-delete legado desativado;
- provenance por `originRequestUuid` não pode ser fabricado pelo wrapper;
- Structure/Simulation não alteradas.

## Regressão pré-versionamento
- Project focused: **18/18**;
- suíte completa: **260/260**;
- diff funcional contra dev.144: apenas Projects + testes.

## Gate final

### Após versionamento
- versão interna: `0.1.0-dev.145`;
- schema: **v9**;
- syntax check: **161/161 JS/MJS**;
- JSON parse: **7/7**;
- suíte completa: **260/260 testes verdes**.

### ZIP candidata
- extraída em diretório limpo;
- suíte: **260/260**, exit code 0;
- versão/download coerentes com `dev.145`.

### Distribuição final
- ZIP final reextraída em diretório limpo;
- `package.json`, `module.json` e `MODULE_VERSION`: `0.1.0-dev.145`;
- schema final: **v9**;
- suíte dentro da ZIP final: **260/260 testes verdes**, exit code 0;
- SHA-256: `ef7c7db2860e07783f5fb9674ecd70a72209bfc3adf92d06843affd57ae547ab`.

**Veredito: APROVADA COMO CHECKPOINT DEV.145.**
