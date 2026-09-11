import test from "node:test";
import assert from "node:assert/strict";

import { normalizeFlow } from "../scripts/features/economy/rules.js";

const catalog = {
  resources: [{ id: "metal", name: "Metal", unit: "u", precision: 0, allowNegative: false }]
};

test("normalizeFlow aceita carry válido e o preserva", () => {
  const flow = normalizeFlow({
    localId: "f1",
    name: "Produção lenta",
    resourceId: "metal",
    direction: "inflow",
    amount: 1,
    periodTicks: 3,
    carry: 2,
    category: "production",
    source: "teste",
    active: true
  }, catalog);

  assert.equal(flow.carry, 2);
});

test("normalizeFlow rejeita carry fora do período", () => {
  assert.throws(() => normalizeFlow({
    localId: "f1",
    name: "Inválido",
    resourceId: "metal",
    direction: "inflow",
    amount: 1,
    periodTicks: 3,
    carry: 3,
    active: true
  }, catalog), /carry/);
});

test("Resource contract preserva categoria e normaliza tags únicas", async () => {
  const { normalizeResourceDefinition } = await import("../scripts/features/economy/rules.js");
  const resource = normalizeResourceDefinition({
    id: "heavy-ammo",
    name: "Munição Pesada",
    unit: "caixa",
    precision: 0,
    allowNegative: false,
    category: "military",
    tags: ["ammo", "military", "ammo"]
  });

  assert.equal(resource.category, "military");
  assert.deepEqual(resource.tags, ["ammo", "military"]);
});
