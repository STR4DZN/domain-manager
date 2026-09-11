import { EVENT_TYPES, RECORD_TYPES } from "../../core/constants.js";
import { ERROR_CODES, ModuleError } from "../../core/errors.js";
import { hasCapability } from "../../core/management-contracts.js";
import { getResourceCatalogSetting } from "../../core/settings.js";
import { createRecord, deleteRecord, updateRecordsBatch } from "../../data/journal-store.js";
import { recordIndex } from "../../data/record-index.js";
import { decodeRecord } from "../../models/record-codec.js";
import {
  normalizeMissionCreatePayload,
  normalizeMissionPreparePayload,
  normalizeMissionReferencePayload,
  normalizeMissionReleasePayload,
  normalizeMissionResolvePayload
} from "./contracts.js";

function resolve(reference, expectedType) {
  const byId = reference.entityId ? recordIndex.getByEntityId(reference.entityId) : null;
  const byUuid = reference.uuid ? recordIndex.get(expectedType, reference.uuid) : null;
  if (byId && byUuid && byId.uuid !== byUuid.uuid) {
    throw new ModuleError(ERROR_CODES.CONFLICT, "A referência aponta para UUID e entityId de entidades diferentes.");
  }
  const document = byId ?? byUuid;
  if (!document) throw new ModuleError(ERROR_CODES.NOT_FOUND, `${expectedType} não encontrado.`);
  const record = decodeRecord(document);
  if (record.recordType !== expectedType) throw new ModuleError(ERROR_CODES.VALIDATION, `Registro não corresponde a ${expectedType}.`);
  return record;
}

function ref(record) { return { recordType: record.recordType, uuid: record.uuid, entityId: record.data.entityId }; }
function user(callerUserId) {
  const found = game.users.get(callerUserId);
  if (!found) throw new ModuleError(ERROR_CODES.PERMISSION, `Usuário não encontrado: ${callerUserId}`);
  return found;
}
function assertGM(callerUserId) {
  const found = user(callerUserId);
  if (!found.isGM) throw new ModuleError(ERROR_CODES.PERMISSION, "Somente GM pode executar esta etapa da Mission.");
  return found;
}
function controllers(record) { return record.data?.governance?.controllers ?? []; }
function sameRef(reference, record) { return reference?.uuid === record.uuid || reference?.entityId === record.data.entityId; }
function clamp(value) { return Math.max(0, Math.min(100, Math.floor(Number(value) || 0))); }
function worldTime() { return Number(game.time?.worldTime ?? Math.floor(Date.now() / 1000)); }

function assertAudience(ids) {
  for (const id of ids) {
    const candidate = game.users.get(id);
    if (!candidate || candidate.isGM) throw new ModuleError(ERROR_CODES.VALIDATION, `Audiência inválida: ${id}`);
  }
}

function missionResult(record) {
  return {
    uuid: record.uuid,
    entityId: record.data.entityId,
    name: record.document.name,
    status: record.data.status,
    assignments: record.data.assignments?.length ?? 0
  };
}

function ensureSquadBelongsToMissionDomain(squad, mission) {
  const parent = squad.data.parentDomain;
  if (!parent) throw new ModuleError(ERROR_CODES.VALIDATION, "Squad não possui Domain pai.");
  const allowed = new Set([mission.data.primaryDomainUuid, ...(mission.data.relatedDomainUuids ?? [])]);
  if (parent.uuid && allowed.has(parent.uuid)) return;
  const parentDocument = parent.entityId ? recordIndex.getByEntityId(parent.entityId) : null;
  if (parentDocument && allowed.has(parentDocument.uuid)) return;
  throw new ModuleError(ERROR_CODES.VALIDATION, "Squad não pertence a um Domain vinculado à Mission.");
}

function assignmentFor(missionData, squad) {
  return (missionData.assignments ?? []).find((assignment) => sameRef(assignment.squad, squad)) ?? null;
}

function stockAmount(squad, resourceId) {
  return Number(squad.data.resources?.find((entry) => entry.resourceId === resourceId)?.amount ?? 0);
}

function setSquadStock(data, resourceId, amount) {
  const resources = structuredClone(data.resources ?? []);
  const current = resources.find((entry) => entry.resourceId === resourceId);
  if (current) current.amount = amount;
  else resources.push({ resourceId, amount });
  data.resources = resources;
}

export async function executeMissionCreate({ payload, callerUserId }) {
  assertGM(callerUserId);
  const normalized = normalizeMissionCreatePayload(payload);
  const domain = resolve(normalized.primaryDomain, RECORD_TYPES.DOMAIN);
  if (!hasCapability(domain.data, "missions")) {
    throw new ModuleError(ERROR_CODES.VALIDATION, `O Domain '${domain.document.name}' não possui capability missions.`);
  }
  assertAudience(normalized.audienceUserIds);

  const created = await createRecord({
    recordType: RECORD_TYPES.MISSION,
    name: normalized.name,
    controllerIds: normalized.audienceUserIds,
    data: {
      primaryDomainUuid: domain.uuid,
      relatedDomainUuids: [],
      origin: { kind: "manual", uuid: null },
      status: normalized.status,
      briefing: normalized.briefing,
      audienceUserIds: normalized.audienceUserIds,
      objectives: normalized.objectives,
      assignments: [],
      startedAtWorldTime: null,
      resolvedAtWorldTime: null,
      outcomeSummary: ""
    }
  });

  return {
    result: missionResult(created),
    entities: [domain.data.entityId, created.data.entityId],
    events: [{ type: EVENT_TYPES.MISSION_CREATED, entities: [domain.data.entityId, created.data.entityId], payload: missionResult(created) }],
    rollback: () => deleteRecord(created.uuid)
  };
}

export async function executeMissionPrepare({ payload, callerUserId }) {
  const normalized = normalizeMissionPreparePayload(payload);
  const mission = resolve(normalized.mission, RECORD_TYPES.MISSION);
  const squad = resolve(normalized.squad, RECORD_TYPES.SQUAD);
  const caller = user(callerUserId);
  if (mission.data.status !== "available") throw new ModuleError(ERROR_CODES.CONFLICT, "Mission precisa estar disponível para preparação.");
  if (!caller.isGM) {
    if (!mission.data.audienceUserIds.includes(caller.id)) throw new ModuleError(ERROR_CODES.PERMISSION, "Você não faz parte da audiência desta Mission.");
    if (!controllers(squad).includes(caller.id)) throw new ModuleError(ERROR_CODES.PERMISSION, "Você não controla este Squad.");
  }
  ensureSquadBelongsToMissionDomain(squad, mission);
  if (normalized.committedStrength > squad.data.strength) throw new ModuleError(ERROR_CODES.CONFLICT, "Efetivo comprometido excede o efetivo atual do Squad.");
  if (squad.data.currentMission && !sameRef(squad.data.currentMission, mission)) throw new ModuleError(ERROR_CODES.CONFLICT, "Squad já está comprometido com outra Mission.");

  const catalog = new Set((getResourceCatalogSetting().resources ?? []).map((resource) => resource.id));
  for (const resource of normalized.resources) {
    if (!catalog.has(resource.resourceId)) throw new ModuleError(ERROR_CODES.VALIDATION, `Recurso desconhecido: ${resource.resourceId}`);
    if (stockAmount(squad, resource.resourceId) < resource.amount) throw new ModuleError(ERROR_CODES.CONFLICT, `Squad não possui ${resource.resourceId} suficiente para o compromisso.`);
  }

  const beforeMission = foundry.utils.deepClone(mission.data);
  const beforeSquad = foundry.utils.deepClone(squad.data);
  const missionData = foundry.utils.deepClone(mission.data);
  const squadData = foundry.utils.deepClone(squad.data);
  const existing = assignmentFor(missionData, squad);
  const assignment = {
    localId: existing?.localId ?? foundry.utils.randomID(),
    squad: ref(squad),
    committedStrength: normalized.committedStrength,
    resources: normalized.resources,
    state: "prepared",
    result: existing?.result ?? { casualties: 0, moraleDelta: 0, conditionDelta: 0, notes: "" }
  };
  missionData.assignments = (missionData.assignments ?? []).filter((entry) => !sameRef(entry.squad, squad));
  missionData.assignments.push(assignment);
  squadData.currentMission = ref(mission);

  const updated = await updateRecordsBatch([
    { uuid: mission.uuid, recordType: RECORD_TYPES.MISSION, data: missionData },
    { uuid: squad.uuid, recordType: RECORD_TYPES.SQUAD, data: squadData }
  ]);
  const updatedMission = updated.find((record) => record.recordType === RECORD_TYPES.MISSION) ?? mission;
  return {
    result: { ...missionResult(updatedMission), squadEntityId: squad.data.entityId, committedStrength: normalized.committedStrength },
    entities: [mission.data.entityId, squad.data.entityId],
    events: [{ type: EVENT_TYPES.MISSION_PREPARED, entities: [mission.data.entityId, squad.data.entityId], payload: { committedStrength: normalized.committedStrength } }],
    rollback: () => updateRecordsBatch([
      { uuid: mission.uuid, recordType: RECORD_TYPES.MISSION, data: beforeMission },
      { uuid: squad.uuid, recordType: RECORD_TYPES.SQUAD, data: beforeSquad }
    ])
  };
}

export async function executeMissionRelease({ payload, callerUserId }) {
  const normalized = normalizeMissionReleasePayload(payload);
  const mission = resolve(normalized.mission, RECORD_TYPES.MISSION);
  const squad = resolve(normalized.squad, RECORD_TYPES.SQUAD);
  const caller = user(callerUserId);
  if (!["planned", "available"].includes(mission.data.status)) throw new ModuleError(ERROR_CODES.CONFLICT, "Squad só pode ser liberado antes do lançamento da Mission.");
  if (!caller.isGM && !controllers(squad).includes(caller.id)) throw new ModuleError(ERROR_CODES.PERMISSION, "Você não controla este Squad.");
  const existing = assignmentFor(mission.data, squad);
  if (!existing) throw new ModuleError(ERROR_CODES.NOT_FOUND, "Squad não está preparado para esta Mission.");

  const beforeMission = foundry.utils.deepClone(mission.data);
  const beforeSquad = foundry.utils.deepClone(squad.data);
  const missionData = foundry.utils.deepClone(mission.data);
  const squadData = foundry.utils.deepClone(squad.data);
  missionData.assignments = missionData.assignments.filter((entry) => !sameRef(entry.squad, squad));
  if (sameRef(squadData.currentMission, mission)) squadData.currentMission = null;
  await updateRecordsBatch([
    { uuid: mission.uuid, recordType: RECORD_TYPES.MISSION, data: missionData },
    { uuid: squad.uuid, recordType: RECORD_TYPES.SQUAD, data: squadData }
  ]);
  return {
    result: { missionEntityId: mission.data.entityId, squadEntityId: squad.data.entityId, released: true },
    entities: [mission.data.entityId, squad.data.entityId],
    events: [{ type: EVENT_TYPES.MISSION_RELEASED, entities: [mission.data.entityId, squad.data.entityId], payload: {} }],
    rollback: () => updateRecordsBatch([
      { uuid: mission.uuid, recordType: RECORD_TYPES.MISSION, data: beforeMission },
      { uuid: squad.uuid, recordType: RECORD_TYPES.SQUAD, data: beforeSquad }
    ])
  };
}

export async function executeMissionLaunch({ payload, callerUserId }) {
  assertGM(callerUserId);
  const normalized = normalizeMissionReferencePayload(payload);
  const mission = resolve(normalized.mission, RECORD_TYPES.MISSION);
  if (mission.data.status !== "available") throw new ModuleError(ERROR_CODES.CONFLICT, "Somente Mission disponível pode ser lançada.");
  if (!(mission.data.assignments?.length)) throw new ModuleError(ERROR_CODES.CONFLICT, "Mission precisa de pelo menos um Squad preparado.");

  const catalog = new Set((getResourceCatalogSetting().resources ?? []).map((resource) => resource.id));
  const beforeMission = foundry.utils.deepClone(mission.data);
  const missionData = foundry.utils.deepClone(mission.data);
  const squadUpdates = [];
  const rollback = [];

  for (const assignment of missionData.assignments) {
    const squad = resolve(assignment.squad, RECORD_TYPES.SQUAD);
    if (!sameRef(squad.data.currentMission, mission)) throw new ModuleError(ERROR_CODES.CONFLICT, `Squad ${squad.document.name} não está mais comprometido com a Mission.`);
    if (squad.data.strength < assignment.committedStrength) throw new ModuleError(ERROR_CODES.CONFLICT, `Squad ${squad.document.name} perdeu efetivo antes do lançamento.`);
    const data = foundry.utils.deepClone(squad.data);
    rollback.push({ uuid: squad.uuid, recordType: RECORD_TYPES.SQUAD, data: foundry.utils.deepClone(squad.data) });
    for (const resource of assignment.resources ?? []) {
      if (!catalog.has(resource.resourceId)) throw new ModuleError(ERROR_CODES.VALIDATION, `Recurso desconhecido: ${resource.resourceId}`);
      const before = stockAmount(squad, resource.resourceId);
      if (before < resource.amount) throw new ModuleError(ERROR_CODES.CONFLICT, `Squad ${squad.document.name} não possui ${resource.resourceId} suficiente no lançamento.`);
      setSquadStock(data, resource.resourceId, before - resource.amount);
    }
    data.status = "deployed";
    squadUpdates.push({ uuid: squad.uuid, recordType: RECORD_TYPES.SQUAD, data });
    assignment.state = "deployed";
  }

  missionData.status = "active";
  missionData.startedAtWorldTime = worldTime();
  const updates = [{ uuid: mission.uuid, recordType: RECORD_TYPES.MISSION, data: missionData }, ...squadUpdates];
  await updateRecordsBatch(updates);
  return {
    result: { missionEntityId: mission.data.entityId, status: "active", assignments: missionData.assignments.length },
    entities: [mission.data.entityId, ...missionData.assignments.map((entry) => entry.squad.entityId).filter(Boolean)],
    events: [{ type: EVENT_TYPES.MISSION_LAUNCHED, entities: [mission.data.entityId], payload: { assignments: missionData.assignments.length } }],
    rollback: () => updateRecordsBatch([{ uuid: mission.uuid, recordType: RECORD_TYPES.MISSION, data: beforeMission }, ...rollback])
  };
}

export async function executeMissionResolve({ payload, callerUserId }) {
  assertGM(callerUserId);
  const normalized = normalizeMissionResolvePayload(payload);
  const mission = resolve(normalized.mission, RECORD_TYPES.MISSION);
  if (mission.data.status !== "active") throw new ModuleError(ERROR_CODES.CONFLICT, "Somente Mission ativa pode ser resolvida.");

  const resultBySquad = new Map(normalized.results.map((entry) => [entry.squad.entityId ?? entry.squad.uuid, entry]));
  const beforeMission = foundry.utils.deepClone(mission.data);
  const missionData = foundry.utils.deepClone(mission.data);
  const updates = [];
  const rollback = [];

  for (const assignment of missionData.assignments ?? []) {
    const squad = resolve(assignment.squad, RECORD_TYPES.SQUAD);
    const result = resultBySquad.get(squad.data.entityId) ?? resultBySquad.get(squad.uuid) ?? {
      casualties: 0, moraleDelta: 0, conditionDelta: 0, notes: ""
    };
    if (result.casualties > assignment.committedStrength || result.casualties > squad.data.strength) {
      throw new ModuleError(ERROR_CODES.CONFLICT, `Baixas inválidas para ${squad.document.name}.`);
    }
    const data = foundry.utils.deepClone(squad.data);
    rollback.push({ uuid: squad.uuid, recordType: RECORD_TYPES.SQUAD, data: foundry.utils.deepClone(squad.data) });
    data.strength = Math.max(0, data.strength - result.casualties);
    data.morale = clamp(data.morale + result.moraleDelta);
    data.condition = clamp(data.condition + result.conditionDelta);
    data.currentMission = null;
    data.status = data.strength === 0 ? "inactive" : (result.casualties > 0 || result.conditionDelta < 0 ? "recovering" : "ready");
    updates.push({ uuid: squad.uuid, recordType: RECORD_TYPES.SQUAD, data });
    assignment.state = "returned";
    assignment.result = {
      casualties: result.casualties,
      moraleDelta: result.moraleDelta,
      conditionDelta: result.conditionDelta,
      notes: result.notes
    };
  }

  const objectiveMap = new Map(normalized.objectiveResults.map((entry) => [entry.localId, entry.status]));
  missionData.objectives = (missionData.objectives ?? []).map((objective) => objectiveMap.has(objective.localId)
    ? { ...objective, status: objectiveMap.get(objective.localId) }
    : objective);
  missionData.status = normalized.status;
  missionData.outcomeSummary = normalized.outcomeSummary;
  missionData.resolvedAtWorldTime = worldTime();
  await updateRecordsBatch([{ uuid: mission.uuid, recordType: RECORD_TYPES.MISSION, data: missionData }, ...updates]);

  return {
    result: { missionEntityId: mission.data.entityId, status: normalized.status, outcomeSummary: normalized.outcomeSummary },
    entities: [mission.data.entityId, ...missionData.assignments.map((entry) => entry.squad.entityId).filter(Boolean)],
    events: [{ type: EVENT_TYPES.MISSION_RESOLVED, entities: [mission.data.entityId], payload: { status: normalized.status } }],
    rollback: () => updateRecordsBatch([{ uuid: mission.uuid, recordType: RECORD_TYPES.MISSION, data: beforeMission }, ...rollback])
  };
}
