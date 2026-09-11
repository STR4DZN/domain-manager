import test from "node:test";
import assert from "node:assert/strict";

import { isPrimaryActiveGM } from "../scripts/authority/primary-gm.js";
import { transactionQueue } from "../scripts/authority/transaction-queue.js";

const primary = { id: "gm1", name: "GM 1", isGM: true };
const secondary = { id: "gm2", name: "GM 2", isGM: true };

globalThis.game = {
  user: primary,
  users: {
    activeGM: primary,
    get(id) { return id === primary.id ? primary : id === secondary.id ? secondary : null; }
  }
};

test("somente o GM primário é reconhecido como autoridade global", () => {
  assert.equal(isPrimaryActiveGM(primary), true);
  assert.equal(isPrimaryActiveGM(secondary), false);
});

test("TransactionQueue serializa operações em FIFO", async () => {
  const order = [];
  const first = transactionQueue.enqueue("test", async () => {
    order.push("a:start");
    await new Promise((resolve) => setTimeout(resolve, 5));
    order.push("a:end");
    return "a";
  });
  const second = transactionQueue.enqueue("test", async () => {
    order.push("b:start");
    order.push("b:end");
    return "b";
  });

  assert.deepEqual(await Promise.all([first, second]), ["a", "b"]);
  assert.deepEqual(order, ["a:start", "a:end", "b:start", "b:end"]);
});


test("TransactionQueue rejeita execução no GM secundário", async () => {
  game.user = secondary;
  await assert.rejects(
    () => transactionQueue.enqueue("secondary", async () => true),
    /Mestre primário/i
  );
  game.user = primary;
});
