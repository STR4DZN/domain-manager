# dev.146 — Conditions Authority Consolidation Audit

## Baseline
- Fonte: `0.1.0-dev.145`.
- Baseline: **260/260 testes verdes**.
- Schema: **v9**.

## Lacuna confirmada
`features/conditions/actions.js` ainda possuía quatro write paths diretos de Domain fora do Command Kernel.

## Implementado
- `condition.create`, `condition.update`, `condition.remove` e `condition.toggle`;
- contratos canônicos de payload e resource locks;
- APIs legadas convertidas em wrappers do Command Kernel;
- rollback para o snapshot anterior do Domain;
- eventos estruturados por operação;
- correção de `durationTicks:null`, que agora efetivamente torna a Condition indefinida;
- Simulation/decay automático preservados.

## Regressão pré-versionamento
- Conditions focused: **4/4**;
- suíte completa: **264/264**;
- diff funcional contra dev.145 restrito a Conditions, Command Registry/constants e testes.

## Gate versionado
- versão interna: `0.1.0-dev.146`;
- schema: **v9**;
- syntax check: **164/164 JS/MJS**;
- JSON parse: **7/7**;
- suíte completa: **264/264 testes verdes**.

## ZIP candidata
- extraída em diretório limpo;
- suíte: **264/264**, exit code 0 em rechecagem limpa com `TERM=xterm`;
- `package.json`, `module.json`, `MODULE_VERSION` e `module.json.download` coerentes com `dev.146`.

## Distribuição final
_Pendente até a reextração e validação da ZIP final._
