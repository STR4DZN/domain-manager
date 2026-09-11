import test from "node:test";
import assert from "node:assert/strict";

import { COMMAND_TYPES } from "../scripts/core/constants.js";
import {
  normalizeSquadAdminPayload,
  normalizeSquadCreatePayload,
  normalizeSquadPatchPayload,
  squadAdminResourceKeys,
  squadCreateResourceKeys,
  squadPatchResourceKeys
} from "../scripts/features/squads/contracts.js";

test("Squad create normaliza identidade, referência, controllers e defaults", () => {
  const payload = normalizeSquadCreatePayload({
    name: "  Raven  ",
    parentDomain: { recordType: "domain", uuid: "JournalEntry.D1", entityId: "domain:D1" },
    controllerIds: ["P1", "P1", "P2"],
    capacity: 20
  });

  assert.equal(payload.name, "Raven");
  assert.equal(payload.strength, 20);
  assert.equal(payload.morale, 60);
  assert.equal(payload.condition, 100);
  assert.equal(payload.status, "ready");
  assert.deepEqual(payload.controllerIds, ["P1", "P2"]);
  assert.deepEqual(squadCreateResourceKeys(payload), ["domain:D1"]);
});

test("Squad create rejeita efetivo acima da capacidade e status desconhecido", () => {
  assert.throws(() => normalizeSquadCreatePayload({
    name: "Raven",
    parentDomain: { recordType: "domain", entityId: "domain:D1" },
    capacity: 10,
    strength: 11
  }), /Efetivo/i);

  assert.throws(() => normalizeSquadCreatePayload({
    name: "Raven",
    parentDomain: { recordType: "domain", entityId: "domain:D1" },
    status: "combat-ready"
  }), /Status de Squad inválido/i);
});

test("Squad patch limita campos operacionais e exige ao menos uma alteração", () => {
  const payload = normalizeSquadPatchPayload({
    squad: { recordType: "squad", entityId: "squad:S1" },
    patch: { morale: 71, condition: 88, status: "deployed", capacity: 900 }
  });

  assert.deepEqual(payload.patch, { status: "deployed", morale: 71, condition: 88 });
  assert.deepEqual(squadPatchResourceKeys(payload), ["squad:S1"]);
  assert.throws(() => normalizeSquadPatchPayload({
    squad: { recordType: "squad", entityId: "squad:S1" },
    patch: { capacity: 50 }
  }), /Nenhuma alteração operacional/i);
});

test("Squad admin valida capacidade, efetivo e controllers", () => {
  const payload = normalizeSquadAdminPayload({
    squad: { recordType: "squad", uuid: "JournalEntry.S1", entityId: "squad:S1" },
    name: "Raven Prime",
    controllerIds: ["P1", "P1"],
    description: "Recon",
    status: "recovering",
    capacity: 24,
    strength: 18,
    morale: 63,
    condition: 74
  });

  assert.equal(payload.name, "Raven Prime");
  assert.deepEqual(payload.controllerIds, ["P1"]);
  assert.deepEqual(payload.patch, {
    description: "Recon",
    status: "recovering",
    capacity: 24,
    strength: 18,
    morale: 63,
    condition: 74
  });
  assert.deepEqual(squadAdminResourceKeys({
    squad: { recordType: "squad", entityId: "squad:S1" },
    name: "Raven Prime", controllerIds: ["P1"], description: "Recon",
    status: "recovering", capacity: 24, strength: 18, morale: 63, condition: 74
  }), ["squad:S1"]);
});

test("contrato expõe tipos distintos para criação, operação e administração", () => {
  assert.equal(COMMAND_TYPES.SQUAD_CREATE, "squad.create");
  assert.equal(COMMAND_TYPES.SQUAD_PATCH, "squad.patch");
  assert.equal(COMMAND_TYPES.SQUAD_ADMIN_UPDATE, "squad.admin-update");
});
