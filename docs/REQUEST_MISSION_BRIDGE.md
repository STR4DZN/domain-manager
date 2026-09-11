# Request → Mission Bridge — dev.141

## Objetivo

Materializar de forma explícita e segura uma Request já aprovada/roteada como Mission, usando o Command Kernel atual e sem alterar schema v9.

## Comando

`request.create-mission`

Pré-condições:
- caller é GM;
- Request existe e permanece na revisão esperada quando `expectedModifiedTime` é enviado;
- `status === approved`;
- `gmDecision.handling === mission`;
- Domain principal existe e possui capability `missions`;
- Domains relacionados ainda existem.

## Resultado

Quando não existe Mission para a origem:
- cria Mission `available`;
- `Mission.origin = { kind: "request", uuid: request.uuid }`;
- solicitante não-GM vira audience/OBSERVER;
- briefing deriva de `intent + details`;
- Request recebe `resultUuid = mission.uuid` e history `mission-created`.

A Request continua `approved`. Criar uma Mission não significa que o pedido foi integralmente `fulfilled`.

## Deduplicação semântica

Além da idempotência por `operationId`, o bridge procura Mission por `origin.kind=request + origin.uuid`. Uma segunda execução com outro `operationId` reutiliza a Mission canônica e não duplica a operação.

## Atomicidade compensatória

Se a Mission for criada mas a atualização da Request falhar, a Mission recém-criada é removida antes de propagar o erro.

Se o estado for persistido, mas a receipt de idempotência falhar, o rollback da transação restaura a Request e remove a Mission criada.

## Compatibilidade

`createMissionFromRequestAction()` permanece como API de compatibilidade, mas agora é apenas wrapper do Command Kernel `request.create-mission`.
