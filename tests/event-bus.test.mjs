import test from "node:test";
import assert from "node:assert/strict";

const hookCalls = [];
globalThis.Hooks = {
  callAll(name, event) { hookCalls.push({ name, event }); }
};

const { DomainEventBus } = await import("../scripts/core/event-bus.js");

test("EventBus publica evento normalizado para listeners e Foundry Hooks", async () => {
  const bus = new DomainEventBus();
  const received = [];
  bus.subscribe("resources.transferred", async (event) => received.push(event));

  const result = await bus.publish({
    type: "resources.transferred",
    operationId: "op-1",
    actorUserId: "U1",
    entities: ["domain:A"],
    payload: { amount: 10 }
  });

  assert.equal(received.length, 1);
  assert.equal(received[0].payload.amount, 10);
  assert.equal(result.errors.length, 0);
  assert.equal(hookCalls.at(-1).name, "domain-manager.resources.transferred");
});

test("EventBus isola falha de subscriber sem rejeitar publicação", async () => {
  const bus = new DomainEventBus();
  bus.subscribe("x", async () => { throw new Error("subscriber boom"); });

  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    const result = await bus.publish({ type: "x" });
    assert.equal(result.errors.length, 1);
  } finally {
    console.error = originalConsoleError;
  }
});
