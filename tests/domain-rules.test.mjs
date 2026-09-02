import assert from "node:assert/strict";
import test from "node:test";

import { normalizeDomainDraft } from "../scripts/features/domains/rules.js";

test("editar identidade preserva todas as demais seções do domínio", () => {
  const existingData = {
    visuals: {
      bannerImg: "banner.webp",
      crestImg: "crest.webp",
      themeColorHex: "#123456"
    },
    description: "Anterior",
    identity: {
      category: "Base",
      nature: "physical",
      state: "active",
      tags: ["antiga"]
    },
    hierarchy: {
      locatedInUuid: null,
      administrativeParentUuid: null
    },
    population: {
      total: 20,
      countMode: "direct",
      groups: [{ localId: "g1" }],
      notables: [{ localId: "n1" }]
    },
    economy: {
      stocks: [{ resourceId: "ouro", amount: 50 }],
      flows: []
    },
    conditions: [{ localId: "c1", name: "Chuva" }],
    security: { defenseRating: 4, guardCount: 2, fortifications: [] },
    relations: [{ localId: "r1" }],
    agreements: [{ localId: "a1" }],
    intel: [{ localId: "i1" }],
    history: [{ localId: "h1" }],
    governance: { controllers: ["old-user"] }
  };

  const result = normalizeDomainDraft({
    description: "Atualizada",
    category: "Fortaleza",
    nature: "organization",
    state: "active",
    tags: ["nova"],
    controllers: ["new-user"],
    existingData
  });

  assert.equal(result.description, "Atualizada");
  assert.equal(result.identity.category, "Fortaleza");
  assert.deepEqual(result.governance.controllers, ["new-user"]);
  assert.deepEqual(result.visuals, existingData.visuals);
  assert.deepEqual(result.conditions, existingData.conditions);
  assert.deepEqual(result.security, existingData.security);
  assert.deepEqual(result.relations, existingData.relations);
  assert.deepEqual(result.agreements, existingData.agreements);
  assert.deepEqual(result.intel, existingData.intel);
  assert.deepEqual(result.history, existingData.history);
  assert.notEqual(result, existingData);
  assert.notEqual(result.conditions, existingData.conditions);
});
