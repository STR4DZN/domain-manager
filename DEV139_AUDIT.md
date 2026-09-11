# dev.139 — Defense Operations Audit

## Baseline protegido

- Origem: `domain-manager-v0.1.0-dev.138.zip` validado e salvo na Library.
- Baseline antes de alterações: **216/216 testes aprovados**.
- Schema de entrada: **v9**.
- Schema de saída: **v9**.

## Objetivo

Transformar a capability `security`, que já possuía schema, view e impacto em risco/upkeep, em um vertical slice operacional pelo Command Kernel sem introduzir guerra, combate automático ou novos modelos persistentes.

## Implementado

### Command Kernel

- `security.configure`;
- resource lock por Domain;
- GM-only;
- capability `security` obrigatória;
- idempotência pelo ledger já existente;
- evento `security.configured`;
- rollback do handler.

### Integridade

- `defenseRating` e `guardCount` exigem inteiros não-negativos;
- fortificações vazias são descartadas;
- fortificações duplicadas por nome normalizado são rejeitadas;
- nenhum estado derivado é persistido.

### UI

- Defense Grid passa de read-only para operacional;
- Effective Defense derivado;
- Scarcity Risk / Unrest Risk derivados com fatores explicativos;
- Fortification Layers preservadas;
- Command Console GM-only;
- UI grava exclusivamente por `security.configure`.

## Superfícies deliberadamente intocadas

Os seguintes arquivos permaneceram byte-a-byte idênticos à dev.138 durante o desenvolvimento funcional:

- `scripts/models/domain-model.js`;
- `scripts/simulation/advance-run.js`;
- `scripts/simulation/simulate.js`;
- `scripts/features/economy/strategic.js`;
- `scripts/features/structures/commands.js`;
- `scripts/data/migration-pipeline.js`.

## Validação pré-bump

- **222/222 testes aprovados** após a implementação funcional.
- Testes novos cobrem command, idempotência, permissão, capability, validação e fronteira UI/derived-state.
- Action contract e first-frame ApplicationV2 permanecem verdes.

## Limites deliberados

- `guardCount` permanece agregado e não é derivado automaticamente de Workforce/Squad;
- fortificações permanecem strings do contrato existente;
- nenhum sistema de guerra/combate automático foi adicionado;
- smoke test manual no Foundry VTT v13 real continua recomendado.

## Gate final — pré-empacotamento

- versão alinhada em package/module/runtime: `0.1.0-dev.139`;
- schema permanece `9`;
- **156** arquivos JS/MJS aprovados em `node --check`;
- **7** JSONs válidos;
- **222/222** testes automatizados aprovados após o bump;
- CSS recompilado a partir de `styles/app/*.css`;
- action contract e first-frame permanecem verdes.

A ZIP candidata foi reextraída em diretório limpo e aprovada com **222/222 testes**.

## Gate final de distribuição

- candidate ZIP extraída em diretório limpo: **222/222** testes;
- versão interna extraída: `0.1.0-dev.139`;
- nenhuma migration nova; schema permanece `9`;
- release final será empacotado com este audit incluído e revalidado após a última geração da ZIP.
