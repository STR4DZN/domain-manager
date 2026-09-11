# dev.148 — Relations Authority Consolidation Audit

## Baseline
- Fonte: `0.1.0-dev.147`.
- Baseline confirmada: **265/265 testes verdes**.
- SHA-256 da fonte persistida: `53430756ee932d7ea0a41785644f77f611cc2447dcad59b515f22330c612a209`.
- Schema: **v9**.

## Lacuna confirmada
`features/relations/actions.js` ainda possuía create/update/remove de relações com persistência direta do Domain, apesar de `relation.upsert` e `relation.remove` já serem Commands canônicos desde a dev.137.

## Implementado
- `addRelation()` convertido em wrapper de `relation.upsert`;
- `updateRelation()` preserva patch parcial por merge somente em memória e delega ao Command Kernel;
- `removeRelation()` convertido em wrapper de `relation.remove`;
- retorno legado continua sendo o Domain decodificado;
- teste permanente cobre create/update/remove pela API legada e proíbe write path direto dentro da seção de Relations.

## Agreements — verificação de paridade
O mesmo arquivo contém APIs históricas de Agreement embedded em `Domain.agreements`. Elas **não** possuem equivalência 1:1 segura com o modelo oficial de Agreement record:
- o modelo moderno usa UUID/entityId próprio e `parties` tipadas;
- update legado identifica Agreement por `Domain + localId`;
- remove legado é hard-delete embedded, enquanto o Command Kernel moderno não expõe hard-delete de Agreement;
- duração/transfers legados possuem contrato diferente de `startTick/endTick` e `amount/periodTicks/carry`.

Por isso esta consolidação não fabrica uma migração implícita. A compatibilidade embedded permanece isolada e novos Agreements continuam usando `agreement.create/update/status`.

## Escopo protegido
- nenhuma alteração em `relations/commands.js` ou `relations/contracts.js`;
- nenhuma alteração em AgreementModel;
- nenhuma alteração em Simulation/advance-run;
- nenhuma migration/schema novo;
- nenhuma mudança de UI.

## Regressão funcional
- Territory/Diplomacy/Intel focused: **7/7**;
- suíte completa: **266/266 testes verdes**;
- diff funcional contra dev.147 restrito a `relations/actions.js` e ao teste de compatibilidade;
- arquivos de versão/changelog/auditoria alterados apenas para o checkpoint.

## Gate versionado
- versão interna: `0.1.0-dev.148`;
- schema: **v9**;
- syntax check: **164/164 JS/MJS**;
- JSON parse: **7/7**;
- suíte completa: **266/266 testes verdes**.

## ZIP candidata
_Pendente._

## Distribuição final
_Pendente._
