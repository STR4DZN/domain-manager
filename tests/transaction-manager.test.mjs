import test from "node:test";
import assert from "node:assert/strict";

const { TransactionManager } = await import("../scripts/authority/transaction-manager.js");

function harness({ failLedgerWrite = false } = {}) {
  let ledger = { version: 1, receipts: [] };
  const events = [];
  const queue = {
    async enqueue(_key, operation) { return operation(); }
  };
  const eventBus = {
    async publish(event) { events.push(event); return { event, errors: [] }; }
  };
  const manager = new TransactionManager({
    queue,
    readLedger: () => structuredClone(ledger),
    writeLedger: async (next) => {
      if (failLedgerWrite) throw new Error("ledger unavailable");
      ledger = structuredClone(next);
    },
    eventBus,
    authorityCheck: () => true
  });
  return { manager, events, getLedger: () => ledger };
}

test("TransactionManager executa comando uma vez e devolve receipt em retry", async () => {
  const { manager, events, getLedger } = harness();
  let executions = 0;
  const args = {
    operationId: "op-1",
    commandType: "resources.transfer",
    callerUserId: "U1",
    payload: { amount: 5 },
    resourceKeys: ["domain:A", "domain:B"]
  };

  const first = await manager.execute(args, async () => {
    executions++;
    return {
      result: { value: 42 },
      entities: ["domain:A", "domain:B"],
      events: [{ type: "resources.transferred", payload: { amount: 5 } }]
    };
  });
  const second = await manager.execute(args, async () => {
    executions++;
    return { result: { value: 99 } };
  });

  assert.equal(executions, 1);
  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  assert.equal(second.value, 42);
  assert.equal(getLedger().receipts.length, 1);
  assert.deepEqual(events.map((event) => event.type), ["resources.transferred", "command.completed"]);
});

test("TransactionManager rejeita mesmo operationId com payload diferente", async () => {
  const { manager } = harness();
  await manager.execute({
    operationId: "op-shared",
    commandType: "resources.transfer",
    callerUserId: "U1",
    payload: { amount: 5 }
  }, async () => ({ result: { ok: true } }));

  await assert.rejects(() => manager.execute({
    operationId: "op-shared",
    commandType: "resources.transfer",
    callerUserId: "U1",
    payload: { amount: 6 }
  }, async () => ({ result: { ok: true } })), /já foi usado/i);
});

test("TransactionManager aciona rollback se persistência da receipt falhar", async () => {
  const { manager } = harness({ failLedgerWrite: true });
  let rolledBack = false;

  await assert.rejects(() => manager.execute({
    operationId: "op-rollback",
    commandType: "resources.transfer",
    callerUserId: "U1",
    payload: { amount: 5 }
  }, async () => ({
    result: { ok: true },
    rollback: async () => { rolledBack = true; }
  })), /ledger unavailable/);

  assert.equal(rolledBack, true);
});
