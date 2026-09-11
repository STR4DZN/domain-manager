import test from "node:test";
import assert from "node:assert/strict";

import {
  assertUniqueEntityReferences,
  buildEntityId,
  normalizeEntityId,
  normalizeEntityReference
} from "../scripts/core/entity-contracts.js";

test("entityId é namespaced pelo recordType e validável", () => {
  const id = buildEntityId("domain", "ABC123");
  assert.equal(id, "domain:ABC123");
  assert.equal(normalizeEntityId(id, { recordType: "domain" }), id);
  assert.throws(() => normalizeEntityId(id, { recordType: "squad" }), /não pertence/i);
});

test("buildEntityId rejeita recordType fora do contrato", () => {
  assert.throws(() => buildEntityId("resource", "x"), /recordType inválido/i);
});

test("referência aceita uuid, entityId ou ambos e respeita allowedTypes", () => {
  assert.deepEqual(
    normalizeEntityReference({ recordType: "domain", uuid: "JournalEntry.abc" }, { allowedTypes: ["domain"] }),
    { recordType: "domain", uuid: "JournalEntry.abc", entityId: null }
  );

  assert.deepEqual(
    normalizeEntityReference({ recordType: "squad", entityId: "squad:S1" }),
    { recordType: "squad", uuid: null, entityId: "squad:S1" }
  );

  assert.throws(
    () => normalizeEntityReference({ recordType: "person", uuid: "JournalEntry.p" }, { allowedTypes: ["domain"] }),
    /não é permitida/i
  );
  assert.throws(
    () => normalizeEntityReference({ recordType: "domain" }),
    /uuid ou entityId/i
  );
});

test("referências duplicadas são detectadas por identidade estável quando disponível", () => {
  assert.throws(() => assertUniqueEntityReferences([
    { recordType: "squad", uuid: "JournalEntry.a", entityId: "squad:S1" },
    { recordType: "squad", uuid: "JournalEntry.b", entityId: "squad:S1" }
  ]), /duplicada/i);
});
