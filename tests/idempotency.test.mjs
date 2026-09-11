import test from "node:test";
import assert from "node:assert/strict";

import {
  appendOperationReceipt,
  assertReceiptMatches,
  commandFingerprint,
  findOperationReceipt,
  normalizeOperationLedger,
  stableStringify
} from "../scripts/authority/idempotency-store.js";

test("fingerprint é determinístico independentemente da ordem das chaves", () => {
  const left = commandFingerprint({
    commandType: "resources.transfer",
    callerUserId: "U1",
    payload: { amount: 10, nested: { b: 2, a: 1 } }
  });
  const right = commandFingerprint({
    commandType: "resources.transfer",
    callerUserId: "U1",
    payload: { nested: { a: 1, b: 2 }, amount: 10 }
  });
  assert.equal(left, right);
  assert.equal(stableStringify({ b: 2, a: 1 }), '{"a":1,"b":2}');
});

test("operation ledger deduplica receipt idêntica e rejeita reutilização divergente", () => {
  const receipt = {
    operationId: "op-1",
    commandType: "resources.transfer",
    callerUserId: "U1",
    fingerprint: "abc",
    completedAt: 1,
    result: { ok: true }
  };
  const once = appendOperationReceipt(null, receipt);
  const twice = appendOperationReceipt(once, receipt);
  assert.equal(twice.receipts.length, 1);
  assert.equal(findOperationReceipt(twice, "op-1")?.result.ok, true);

  assert.throws(() => assertReceiptMatches(receipt, {
    commandType: "resources.transfer",
    callerUserId: "U1",
    fingerprint: "different"
  }), /já foi usado/i);
});

test("operation ledger possui retenção limitada", () => {
  let ledger = normalizeOperationLedger();
  for (let i = 0; i < 5; i++) {
    ledger = appendOperationReceipt(ledger, {
      operationId: `op-${i}`,
      commandType: "x",
      callerUserId: "U",
      fingerprint: `${i}`,
      completedAt: i,
      result: { i }
    }, { maxReceipts: 3 });
  }
  assert.deepEqual(ledger.receipts.map((entry) => entry.operationId), ["op-2", "op-3", "op-4"]);
});
