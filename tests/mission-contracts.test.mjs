import test from "node:test";
import assert from "node:assert/strict";

const {
  normalizeMissionCancelPayload,
  normalizeMissionCreatePayload,
  normalizeMissionPreparePayload,
  normalizeMissionResolvePayload,
  normalizeMissionReleasePayload
} = await import("../scripts/features/missions/contracts.js");

const domain = { recordType: "domain", uuid: "JournalEntry.D1", entityId: "domain:D1" };
const mission = { recordType: "mission", uuid: "JournalEntry.M1", entityId: "mission:M1" };
const squad = { recordType: "squad", uuid: "JournalEntry.S1", entityId: "squad:S1" };

test("Mission create normaliza audiência e objetivos para operação disponível", () => {
  const value = normalizeMissionCreatePayload({
    name: " Operação Farol ",
    primaryDomain: domain,
    audienceUserIds: ["P1", "P1", "P2"],
    briefing: " Reconhecer setor ",
    objectives: [{ title: " Localizar transmissor ", optional: false }]
  });

  assert.equal(value.name, "Operação Farol");
  assert.equal(value.status, "available");
  assert.deepEqual(value.audienceUserIds, ["P1", "P2"]);
  assert.equal(value.objectives[0].localId, "objective-1");
  assert.equal(value.objectives[0].status, "pending");
});

test("Mission prepare rejeita recurso duplicado e efetivo inválido", () => {
  assert.throws(() => normalizeMissionPreparePayload({
    mission,
    squad,
    committedStrength: 0,
    resources: []
  }), /Efetivo comprometido/i);

  assert.throws(() => normalizeMissionPreparePayload({
    mission,
    squad,
    committedStrength: 4,
    resources: [
      { resourceId: "ammo", amount: 10 },
      { resourceId: "ammo", amount: 5 }
    ]
  }), /duplicado/i);
});

test("Mission release exige apenas referências válidas", () => {
  const value = normalizeMissionReleasePayload({ mission, squad });
  assert.equal(value.mission.entityId, "mission:M1");
  assert.equal(value.squad.entityId, "squad:S1");
});

test("Mission resolve aceita consequências operacionais e rejeita status final inválido", () => {
  const value = normalizeMissionResolvePayload({
    mission,
    status: "resolved",
    outcomeSummary: "Alvo assegurado",
    results: [{ squad, casualties: 2, moraleDelta: 5, conditionDelta: -10, notes: "Contato pesado" }],
    objectiveResults: [{ localId: "objective-1", status: "completed" }]
  });

  assert.equal(value.results[0].casualties, 2);
  assert.equal(value.results[0].conditionDelta, -10);
  assert.equal(value.objectiveResults[0].status, "completed");

  assert.throws(() => normalizeMissionResolvePayload({ mission, status: "cancelled" }), /resolved ou failed/i);
});

test("Mission cancel exige motivo e snapshot sem Squads duplicados", () => {
  const value = normalizeMissionCancelPayload({
    mission,
    expectedModifiedTime: 101,
    reason: "  Janela operacional encerrada  ",
    squads: [{ squad, expectedModifiedTime: 202 }]
  });

  assert.equal(value.reason, "Janela operacional encerrada");
  assert.equal(value.expectedModifiedTime, 101);
  assert.equal(value.squads[0].expectedModifiedTime, 202);

  assert.throws(() => normalizeMissionCancelPayload({ mission, reason: "   " }), /motivo/i);
  assert.throws(() => normalizeMissionCancelPayload({
    mission,
    reason: "Encerrar",
    squads: [{ squad }, { squad }]
  }), /duplicados/i);
});
