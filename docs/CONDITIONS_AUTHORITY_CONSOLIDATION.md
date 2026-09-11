# Conditions Authority Consolidation — dev.146

A dev.146 remove a autoridade paralela de persistência das APIs legadas de Conditions sem alterar o decay automático da Simulation nem o schema persistido.

## Command Kernel

As operações persistentes passam pelos Commands:

- `condition.create`
- `condition.update`
- `condition.remove`
- `condition.toggle`

Todos são GM-only, serializam pelo mesmo lock do Domain, geram eventos estruturados e fornecem rollback para o estado anterior do Domain.

## Compatibilidade

`conditions/actions.js` continua exportando as quatro APIs antigas, mas agora apenas delega ao Command Kernel. Não há `updateRecord`, `createRecord`, `document.update` ou TransactionQueue própria nesse wrapper.

## Guard rails

- referências precisam apontar para um Domain válido;
- `localId` é obrigatório em update/remove/toggle;
- duração precisa ser inteiro >= 1 ou `null`;
- severity aceita apenas `minor`, `moderate` ou `severe`;
- retry com o mesmo `operationId` é idempotente;
- `durationTicks: null` possui semântica explícita de duração indefinida;
- schema permanece v9;
- Simulation e decay temporal não foram alterados.
