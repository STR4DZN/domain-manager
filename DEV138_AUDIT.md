# dev.138 — Projects Advanced Audit

## Baseline protegido

- Origem: `domain-manager-v0.1.0-dev.137.zip` atual.
- Baseline antes de alterações: **201/201 testes aprovados**.
- Cópia de rollback preservada separadamente durante o desenvolvimento.
- Schema de entrada: **v9**.
- Schema de saída: **v9**.

## Objetivo

Fechar Projects como vertical slice operacional da arquitetura atual DOMAIN//OS v4, sem reescrever Simulation, Economy, Structures ou migrations.

## Implementado

### Command Kernel

- `project.create`
- `project.update`
- `project.cost-upsert`
- `project.cost-remove`
- resource locks por Domain/Project;
- execução autoritativa e idempotente;
- eventos `project.created` / `project.updated`;
- GM ou controller do Domain como operadores válidos quando `projects` está habilitado.

### Integridade

- conclusão manual rejeitada; Simulation continua dona de `completed`;
- Project terminal não é editável;
- `work.required` congela após início do progresso;
- plano de custos congela após início do progresso;
- consumed costs não são removíveis;
- reserva insuficiente é rejeitada antes do commit;
- status blocked exige justificativa;
- cancelamento isolado de Project ligado a Structure `planned` é rejeitado;
- `entityId` e campos não pertencentes ao contrato operacional são preservados em update.

### UI v4

- Project Pipeline continua worklist, sem card gallery;
- seleção master-detail;
- Project Dossier no Context Inspector;
- telemetria de work/rate/carry/costs;
- linked Structures;
- Command Console para create/update;
- editor dedicado de custos;
- controles condicionados a authority/capability;
- nenhuma ação manual de complete.

## Bug encontrado durante a auditoria

Um teste positivo de `project.update` detectou que o draft operacional não preservava `entityId`, fazendo o Journal Store bloquear o update antes do commit. A correção preserva explicitamente a identidade imutável e os demais campos de modelo existentes. O caso ganhou teste de regressão.

## Arquivos deliberadamente não alterados

- `scripts/simulation/advance-run.js`
- `scripts/simulation/simulate.js`
- modelos de Domain/Structure/Economy
- migration pipeline
- `SCHEMA_VERSION`

## Revisão visual

A composição foi comparada contra o preview atual `dm-v4-projects.png` da própria linha dev.134+ / DOMAIN//OS v4. A engineering queue, densidade e anatomia App Sidebar → Workspace → Context Inspector foram preservadas. O browser headless do ambiente não conseguiu emitir um novo screenshot por limitação de runtime/DBus; por isso nenhuma alteração adicional foi feita com base em render incompleto.

## Gate final

- **216/216 testes aprovados** na árvore versionada `0.1.0-dev.138`.
- **152 arquivos JS/MJS** aprovados em `node --check`.
- `package.json`, `module.json` e `MODULE_VERSION` coerentes em `0.1.0-dev.138`.
- `SCHEMA_VERSION = 9` confirmado.
- CSS recompilado pelo `pretest`.
- O ZIP de release é reextraído em diretório limpo e testado novamente antes da entrega.
