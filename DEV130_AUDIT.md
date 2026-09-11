# DEV130_AUDIT — Transaction & Authority Kernel

## Resultado

O milestone implementa uma autoridade única de escrita, command dispatcher, idempotência persistente, event bus, histórico estruturado e a primeira operação multi-entidade usando o novo kernel.

## Componentes adicionados

- `scripts/commands/registry.js`
- `scripts/commands/execute.js`
- `scripts/authority/idempotency-store.js`
- `scripts/authority/transaction-manager.js`
- `scripts/core/event-bus.js`
- `scripts/features/economy/transfers.js`
- `scripts/features/history/structured.js`
- setting world `operationLedger`

## Autoridade

- `TransactionQueue` exige Primary Active GM.
- Journal store inteiro exige Primary Active GM.
- Resource Catalog oficial exige Primary Active GM para escrita.
- Migration pipeline só executa no Primary Active GM.
- Demais clientes aguardam records chegarem ao schema corrente antes do `recordIndex.rebuild()`.
- Comandos de clientes são encaminhados por socketlib; caller é derivado de `socketdata.userId`.

## Idempotência

Receipts persistentes são guardadas em world setting com retenção limitada. Fingerprints impedem reutilizar um `operationId` com payload diferente.

O retry end-to-end de `resources.transfer` foi testado: a segunda chamada retorna a receipt e não movimenta recursos novamente.

## Transferência

Transferência Domain/Squad usa:

- EntityReference;
- permission check na origem;
- capability economy para Domains;
- catálogo global;
- minor units;
- bulk update de origem + destino;
- rollback compensatório;
- structured history em Domains;
- evento `resources.transferred`.

Foi testada falha parcial simulada do provider: a compensação restaura ambos os saldos e remove a mudança histórica do snapshot novo.

## Simulation

O commit do advance-run foi alterado de updates sequenciais para um único batch de Domains + Projects, com snapshots anteriores para compensação.

O kernel matemático/determinístico do dev.128 permanece inalterado e coberto pela suíte.

## Schema v4

`Domain.history` ganha campos estruturados (`eventType`, `operationId`, `actorUserId`, `entityIds`, `metadata`). Migration v3→v4 adapta histórico legado sem remover campos narrativos.

## Limitações conhecidas

- O Foundry não oferece aqui uma transação ACID de banco exposta ao módulo. O mecanismo usa preflight, bulk update e compensação. Crash abrupto no meio de uma escrita de provider ainda é um risco de infraestrutura.
- Actions legadas ainda não foram todas convertidas em command types; porém qualquer persistência via Journal store já é bloqueada fora do GM primário.
- Algumas mutações de settings além do Resource Catalog ainda são administradas pelo Foundry diretamente.
- `operationLedger` não é incluído no backup por ser estado operacional de deduplicação.
- Não foi realizado smoke test real com dois navegadores/Foundry nesta execução.

## Próximo milestone

`dev.131 — UI Foundation`: decompor a shell monolítica, introduzir navegação capability-aware e controllers/presenters sem reintroduzir regras de domínio dentro da UI.
