import test from "node:test";
import assert from "node:assert/strict";

import { normalizeDomainDraft } from "../scripts/features/domains/rules.js";

test("editar dados básicos do Domain preserva sustenanceSettings e campos econômicos desconhecidos", () => {
  const existingData = {
    description: "Antes",
    identity: { category: "Base", nature: "physical", state: "active", tags: [] },
    hierarchy: { locatedInUuid: null, administrativeParentUuid: null },
    population: { total: 10, countMode: "direct", groups: [], notables: [] },
    economy: {
      sustenanceSettings: { enabled: true, foodPer100: 2, waterPer100: 3, guardUpkeep: 4 },
      stocks: [{ resourceId: "food", amount: 10 }],
      flows: [],
      futureField: { keep: true }
    },
    governance: { controllers: ["u1"] },
    conditions: []
  };

  const normalized = normalizeDomainDraft({
    description: "Depois",
    category: "Colônia",
    nature: "physical",
    state: "active",
    tags: ["teste"],
    controllers: ["u1"],
    locatedInUuid: null,
    administrativeParentUuid: null,
    existingData
  });

  assert.deepEqual(normalized.economy.sustenanceSettings, existingData.economy.sustenanceSettings);
  assert.deepEqual(normalized.economy.futureField, { keep: true });
  assert.deepEqual(normalized.economy.stocks, existingData.economy.stocks);
});

test("Domain novo recebe preset base por padrão", () => {
  const normalized = normalizeDomainDraft({
    description: "Base",
    category: "Base",
    nature: "physical",
    state: "active"
  });

  assert.equal(normalized.management.preset, "base");
  assert.equal(normalized.management.capabilities.economy, true);
  assert.equal(normalized.management.capabilities.diplomacy, true);
});

test("editar Domain preserva management existente quando a UI antiga não o envia", () => {
  const existingData = {
    description: "Antes",
    identity: { category: "Posto", nature: "physical", state: "active", tags: [] },
    hierarchy: { locatedInUuid: null, administrativeParentUuid: null },
    management: {
      preset: "outpost",
      capabilities: {
        economy: true,
        population: false,
        people: true,
        structures: true,
        projects: true,
        squads: true,
        missions: true,
        diplomacy: true,
        territory: false,
        intel: true,
        security: true
      }
    },
    population: { total: 0, countMode: "direct", groups: [], notables: [] },
    economy: { stocks: [], flows: [] },
    governance: { controllers: [] }
  };

  const normalized = normalizeDomainDraft({
    description: "Depois",
    category: "Posto",
    nature: "physical",
    state: "active",
    existingData
  });

  assert.deepEqual(normalized.management, existingData.management);
});

test("capabilities explícitas podem sobrescrever um preset no Domain", () => {
  const normalized = normalizeDomainDraft({
    category: "Operação",
    managementPreset: "squad",
    capabilities: { population: true, structures: true }
  });

  assert.equal(normalized.management.preset, "squad");
  assert.equal(normalized.management.capabilities.population, true);
  assert.equal(normalized.management.capabilities.structures, true);
  assert.equal(normalized.management.capabilities.diplomacy, false);
});
