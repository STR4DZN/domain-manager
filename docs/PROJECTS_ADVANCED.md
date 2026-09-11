# Projects Advanced — dev.138

## Escopo

A dev.138 transforma a view **Projects** da DOMAIN//OS v4 em uma ferramenta operacional real, sem alterar o schema v9 e sem mudar a matemática da Simulation.

A fonte desta implementação é a build `0.1.0-dev.137` atual. O milestone preserva o lifecycle já existente de Project, os custos `reserved`/`progressive` e o commissioning Project → Structure realizado pela Simulation.

## Command Kernel

Projects passam a possuir os seguintes commands autoritativos:

- `project.create`
- `project.update`
- `project.cost-upsert`
- `project.cost-remove`

Todos passam pelo TransactionManager, idempotency ledger e autoridade do Primary Active GM. GM ou controller do Domain pode operar Projects quando a capability `projects` está habilitada.

## Invariantes

- `completed` pertence à Simulation e não pode ser definido manualmente.
- `completed` e `cancelled` são estados terminais e imutáveis pelos commands de edição.
- `work.required` não pode ser alterado depois que existe progresso.
- o plano de custos não pode ser alterado depois do primeiro progresso.
- custo já consumido não pode ser removido.
- custo `reserved` é validado contra o estoque disponível e demais reservas do Domain.
- custos duplicados pelo mesmo `resourceId + mode` são rejeitados.
- status `blocked` exige `blockedReason`.
- Project vinculado a uma Structure ainda `planned` não pode ser cancelado isoladamente, evitando Structure órfã.
- `entityId` é preservado em updates; campos do modelo que não fazem parte do contrato operacional também são preservados.

## UI DOMAIN//OS v4

A view Projects continua uma engineering worklist densa, não uma card gallery. A dev.138 adiciona:

- seleção de Project na worklist;
- Project Dossier no Context Inspector;
- progresso, taxa, carry e plano de custos;
- linked Structures;
- criação e edição via Command Console;
- criação/edição/remoção de custos antes do primeiro progresso;
- controles condicionados à autoridade e capability;
- nenhuma ação manual de conclusão.

## Compatibilidade

- `schemaVersion`: **9** (sem migration nova).
- Simulation e `advance-run.js`: sem mudança neste milestone.
- Structure commissioning: preservado sem mudança.
- Economy/Strategic Ledger: preservado sem mudança.

## Validação

O gate de dev.138 inclui regressão integral da dev.137, testes específicos de commands e contratos estáticos da nova UI. O número final de testes é registrado em `DEV138_AUDIT.md` após o empacotamento.
