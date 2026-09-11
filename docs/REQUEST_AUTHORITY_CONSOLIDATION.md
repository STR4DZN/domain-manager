# Request Authority Consolidation — dev.143

## Objetivo

Eliminar a última implementação paralela de mutação de Request sem quebrar integrações legadas.

## Situação anterior

A UI, o socket moderno e os commands já utilizavam o Command Kernel, mas `scripts/features/requests/actions.js` ainda exportava uma implementação antiga capaz de criar/revisar Requests diretamente com `createRecord`, `updateRecord` e `transactionQueue`.

## Mudança

As exports legadas foram preservadas:
- `performCreateRequest()`;
- `reviewRequestAction()`.

Porém agora são somente wrappers do Command Kernel:
- criação → `request.create`;
- revisão → `request.review`.

Nenhuma decisão de autoridade, persistência ou idempotência permanece no arquivo legado.

## Compatibilidade

- `performCreateRequest()` preserva o retorno compacto `{ uuid, duplicate }`;
- `reviewRequestAction()` retorna novamente o record decodificado após o command, preservando o formato esperado por callers antigos;
- o endpoint socket legado `request.create` já delegava ao Command Kernel e permanece inalterado.

## Fora de escopo

- outros `actions.js` legados de features diferentes;
- remoção das exports de compatibilidade;
- alterações de schema, UI ou gameplay.
