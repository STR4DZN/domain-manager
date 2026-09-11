import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeStructureAdminPayload,
  normalizeStructureConstructionPayload,
  normalizeStructureCreatePayload,
  normalizeStructurePatchPayload,
  normalizeStructureResourceEntries
} from "../scripts/features/structures/contracts.js";

test("Structure create normaliza blueprint e perfis de manutenção/produção", () => {
  const result = normalizeStructureCreatePayload({
    name: "Reator Helios",
    domain: { recordType: "domain", entityId: "domain:D1" },
    category: "power",
    tier: 2,
    maxTier: 4,
    capacity: 500,
    maintenance: [{ resourceId: "fuel", amount: 3 }],
    production: [{ resourceId: "energy", amount: 40 }],
    tags: ["reactor", "critical"]
  });

  assert.equal(result.name, "Reator Helios");
  assert.equal(result.status, "operational");
  assert.deepEqual(result.maintenance, [{ resourceId: "fuel", amount: 3 }]);
  assert.deepEqual(result.production, [{ resourceId: "energy", amount: 40 }]);
});

test("Structure resource profile rejeita duplicação e quantidade inválida", () => {
  assert.throws(() => normalizeStructureResourceEntries([
    { resourceId: "fuel", amount: 1 },
    { resourceId: "fuel", amount: 2 }
  ]), /duplicado/i);
  assert.throws(() => normalizeStructureResourceEntries([{ resourceId: "fuel", amount: 0 }]), /inteiro/i);
});

test("Structure patch limita jogador a descrição e operational/disabled", () => {
  const patch = normalizeStructurePatchPayload({
    structure: { recordType: "structure", entityId: "structure:S1" },
    patch: { status: "disabled", description: "Manutenção programada" }
  });
  assert.equal(patch.patch.status, "disabled");
  assert.throws(() => normalizeStructurePatchPayload({
    structure: { recordType: "structure", entityId: "structure:S1" },
    patch: { status: "destroyed" }
  }), /operational e disabled/i);
});

test("Structure admin valida tier/maxTier e perfis", () => {
  assert.throws(() => normalizeStructureAdminPayload({
    structure: { recordType: "structure", entityId: "structure:S1" },
    name: "A",
    tier: 4,
    maxTier: 3
  }), /Tier não pode exceder/i);
});

test("Construction contract força Structure planned e normaliza Project", () => {
  const result = normalizeStructureConstructionPayload({
    name: "Hangar Kestrel",
    domain: { recordType: "domain", uuid: "JournalEntry.D1", entityId: "domain:D1" },
    category: "logistics",
    tier: 1,
    maxTier: 3,
    production: [{ resourceId: "parts", amount: 2 }],
    project: {
      workRequired: 120,
      rateAmount: 15,
      periodTicks: 2,
      costs: [{ resourceId: "metal", mode: "reserved", amount: 80 }]
    }
  });

  assert.equal(result.blueprint.status, "planned");
  assert.equal(result.blueprint.condition, 100);
  assert.equal(result.project.name, "Construção // Hangar Kestrel");
  assert.equal(result.project.workRequired, 120);
  assert.deepEqual(result.project.costs, [{ resourceId: "metal", mode: "reserved", amount: 80 }]);
});
