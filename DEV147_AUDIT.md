# dev.147 — Intel Authority Consolidation Audit

## Baseline
- Fonte: `0.1.0-dev.146`.
- Baseline: **264/264 testes verdes**.
- Schema: **v9**.

## Lacuna confirmada
`features/intel/actions.js` ainda mantinha create/update/remove/reveal com persistência direta de Domain, apesar de já existirem Commands canônicos equivalentes.

## Implementado
- APIs legadas convertidas em wrappers do Command Kernel;
- `updateIntel()` preserva patch parcial por merge somente em memória;
- remove/reveal delegam diretamente aos Commands canônicos;
- nenhuma alteração em contracts/commands/model/UI de Intel.

## Regressão pré-versionamento
- Territory/Diplomacy/Intel focused: **6/6**;
- suíte completa: **265/265**;
- diff funcional contra dev.146: apenas `intel/actions.js` e teste.

## Gate versionado
- versão interna: `0.1.0-dev.147`;
- schema: **v9**;
- syntax check: **164/164 JS/MJS**;
- JSON parse: **7/7**;
- suíte completa: **265/265 testes verdes**.

## ZIP candidata
- extraída em diretório limpo;
- suíte: **265/265**, exit code 0;
- package/module/runtime/download coerentes com `dev.147`.

## Distribuição final
_Pendente._
