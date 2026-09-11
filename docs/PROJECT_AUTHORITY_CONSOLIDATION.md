# Project Authority Consolidation — dev.145

A dev.145 remove o último write path legado conhecido de Projects sem alterar Simulation, commissioning de Structures ou schema.

## Compatibilidade

`projects/actions.js` continua exportando create/update/cost APIs, mas todas delegam ao Command Kernel.

`deleteProjectAction()` permanece exportada por compatibilidade, porém hard-delete físico é recusado. Projects devem usar lifecycle de cancelamento para preservar histórico, UUID e referências.

## Guard rails

- `expectedModifiedTime` agora é validado no próprio `project.update`, `project.cost-upsert` e `project.cost-remove`;
- `originRequestUuid` não pode ser fabricado pela API legada sem bridge canônico;
- nenhuma operação legada escreve diretamente no Journal;
- schema permanece v9.
