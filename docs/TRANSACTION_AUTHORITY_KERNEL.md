# Domain Manager — Transaction & Authority Kernel

**Module version:** `0.1.0-dev.130`  
**Record schema:** `4`

O `dev.130` introduz a infraestrutura que deve ser usada por mutações críticas futuras. O objetivo é evitar que cada feature implemente autoridade, idempotência, concorrência e eventos de forma independente.

## 1. Autoridade única

A autoridade persistente do mundo é o **GM primário ativo** (`game.users.activeGM`).

A regra é aplicada em mais de um nível:

- `TransactionQueue` só executa no GM primário;
- `TransactionManager` exige GM primário;
- `journal-store` exige GM primário para create/update/delete/batch update;
- Resource Catalog oficial só pode ser alterado pelo GM primário;
- migrations são executadas somente pelo GM primário;
- outros clientes aguardam o schema atual antes de reconstruir o índice.

Isso impede dois GMs de manterem filas de mutação independentes para o mesmo mundo.

## 2. Command envelope

Comandos autoritativos usam:

```js
{
  commandType: "resources.transfer",
  operationId: "...",
  payload: { ... }
}
```

O usuário de origem **não é confiado ao payload remoto**. Via socket, ele é obtido de `socketdata.userId` e injetado no dispatcher.

Clientes podem chamar a API pública:

```js
game.domainManager.executeCommand({
  commandType,
  operationId,
  payload
});
```

Se o cliente já for o GM primário, o comando executa localmente. Caso contrário, é encaminhado via socketlib para a autoridade.

## 3. Idempotência persistente

O setting world `operationLedger` mantém receipts de comandos concluídos.

Uma receipt contém:

```text
operationId
commandType
callerUserId
fingerprint
completedAt
result
```

O fingerprint inclui tipo, usuário e payload com serialização canônica. Assim:

- repetir o mesmo `operationId` com o mesmo comando retorna o resultado anterior sem executar novamente;
- reutilizar o mesmo ID com outro payload, tipo ou caller gera conflito;
- receipts sobrevivem reconnect/reload do cliente;
- a retenção padrão é limitada às 500 receipts mais recentes.

O ledger é operacional e não faz parte do backup normal do mundo.

## 4. TransactionManager

Fluxo de um comando:

```text
Client
  ↓
Authority routing
  ↓
Command dispatcher
  ↓
TransactionQueue
  ↓
Idempotency check
  ↓
Handler
  ↓
Persist state
  ↓
Persist receipt
  ↓
Publish events
  ↓
Return result
```

Events são publicados **depois** da receipt. Subscriber com erro não invalida uma mutação já commitada.

Handlers que persistem estado podem fornecer uma função `rollback`. Se a persistência da receipt falhar depois da mudança de estado, o manager tenta compensar a mutação.

## 5. Batch persistence

`updateRecordsBatch()` valida todos os records antes da persistência e usa `JournalEntry.updateDocuments()` para enviar múltiplas mudanças em uma única operação da coleção do Foundry.

Invariantes preservadas:

- record type não muda;
- `entityId` não muda;
- `entityId` continua único;
- todos os dados passam pelo DataModel atual antes do batch.

Isso reduz a janela de estado parcial. Quando uma operação crítica possui snapshots anteriores, uma compensação adicional é executada se o provider lançar erro.

> Foundry não expõe neste módulo uma transação ACID de banco de dados. Portanto “atômico” aqui significa: preflight completo + bulk document operation + rollback compensatório. Uma queda abrupta do processo/host exatamente no meio de uma escrita do provider continua sendo uma limitação externa que deve ser considerada em hardening futuro.

## 6. Primeira command feature: Resource Transfer

`resources.transfer` suporta holders:

- `Domain`
- `Squad`

Payload:

```js
{
  from: { recordType, uuid?, entityId? },
  to:   { recordType, uuid?, entityId? },
  resourceId,
  amount // minor units inteiro positivo
}
```

Validações:

- referências tipadas válidas;
- origem e destino distintos;
- usuário controla a origem, salvo GM;
- Domain precisa ter capability `economy`;
- recurso precisa existir no catálogo;
- saldo precisa ser suficiente quando `allowNegative=false`;
- limites de minor units;
- ambos os lados são atualizados no mesmo batch.

Domains recebem histórico estruturado de entrada/saída com o mesmo `operationId`.

## 7. Event Bus

O `DomainEventBus` produz envelopes:

```js
{
  eventId,
  type,
  operationId,
  actorUserId,
  timestamp,
  entities,
  payload
}
```

O evento é enviado para:

1. listeners internos inscritos no bus;
2. Foundry Hook `${MODULE_ID}.${event.type}`.

Eventos iniciais:

```text
resources.transferred
command.completed
```

## 8. Histórico estruturado

O schema v4 amplia entradas de `Domain.history` com:

```text
eventType
operationId
actorUserId
entityIds[]
metadata[{key,value}]
```

Os campos narrativos antigos continuam existindo. Isso permite simultaneamente:

- leitura humana;
- filtros/automação por tipo;
- correlação por operação;
- auditoria de atores e entidades.

Histórico legado é migrado para os novos campos com valores neutros.

## 9. Simulation commit

O `advance-run` não persiste mais cada Domain/Project imediatamente durante o loop.

Agora:

```text
snapshot
  ↓
simulate
  ↓
prepare all Domain mutations
  ↓
prepare all Project mutations
  ↓
one bulk update
  ↓
world time sync
  ↓
hooks
```

Há snapshots anteriores para compensação caso o bulk provider reporte falha depois de alteração parcial.

## 10. Limites deliberados

O `dev.130` cria o kernel e migra as invariantes de persistência, mas não converte automaticamente toda action legada em um command type.

Ainda ficam para milestones posteriores:

- commands dedicados para Mission/Project/Structure lifecycle;
- transaction recovery journal para crash abrupto de processo/host;
- UI para transferências;
- histórico estruturado próprio de Squad/Person/Structure;
- remapeamento cross-world de UUIDs legados;
- testes dentro de uma instância Foundry real com múltiplos clientes.
