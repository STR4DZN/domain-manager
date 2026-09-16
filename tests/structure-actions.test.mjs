import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "scripts/features/structures/actions.js"), "utf8");

test("actions legadas de Structure são apenas bridges para o Command Kernel", () => {
  assert.match(source, /executeCommandAuthoritatively/);
  for (const type of [
    "STRUCTURE_CREATE",
    "STRUCTURE_PATCH",
    "STRUCTURE_ADMIN_UPDATE",
    "STRUCTURE_BEGIN_CONSTRUCTION"
  ]) {
    assert.match(source, new RegExp(`COMMAND_TYPES\\.${type}`), `bridge ausente para ${type}`);
  }

  assert.doesNotMatch(source, /journal-store|createRecord|updateRecord|deleteRecord|JournalEntry\.|game\.settings\.set/,
    "actions de compatibilidade não podem manter uma segunda rota de persistência");
});

test("bridge de Structure promove operationId legado à identidade transacional", () => {
  assert.match(source, /operationId:\s*requestedOperationId/);
  assert.match(source, /operationId:\s*String\(requestedOperationId/);
  assert.match(source, /executeCommandAuthoritatively\(\{[\s\S]*?operationId:/);
});
