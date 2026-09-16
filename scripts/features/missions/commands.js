import { EVENT_TYPES, RECORD_TYPES } from "../../core/constants.js";
import { ERROR_CODES, ModuleError } from "../../core/errors.js";
import { hasCapability } from "../../core/management-contracts.js";
import { getResourceCatalogSetting } from "../../core/settings.js";
import { createRecord, deleteRecord, updateRecord, updateRecordsBatch } from "../../data/journal-store.js";
import { recordIndex } from "../../data/record-index.js";
import { decodeRecord } from "../../models/record-codec.js";
import {
  normalizeMissionCreatePayload,
  normalizeMissionCancelPayload,
  normalizeMissionObjectiveRemovePayload,
  normalizeMissionObjectiveUpsertPayload,
  normalizeMissionPreparePayload,
  normalizeMissionReferencePayload,
  normalizeMissionReleasePayload,
  normalizeMissionResolvePayload,
  normalizeMissionUpdatePayload
} from "./contracts.js";
import { removeObjective, upsertObjective } from "./rules.js";

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

function assertRevision(record, expectedModifiedTime, label = "A Mission") {
  if (expectedModifiedTime == null) return;
  if ((record.document?._stats?.modifiedTime ?? null) !== expectedModifiedTime) {
    throw new ModuleError(ERROR_CODES.CONFLICT, `${label} mudou enquanto o formulário estava aberto.`);
  }
}

function resolveMissionDomains(primaryReference, relatedReferences = []) {
  const primary = resolve(primaryReference, RECORD_TYPES.DOMAIN);
  const related = relatedReferences.map((reference) => resolve(reference, RECORD_TYPES.DOMAIN));
  if (related.some((domain) => domain.uuid === primary.uuid)) {
    throw new ModuleError(ERROR_CODES.VALIDATION, "Domain principal não deve ser repetido como relacionado.");
  }
  if (new Set(related.map((domain) => domain.uuid)).size !== related.length) {
    throw new ModuleError(ERROR_CODES.VALIDATION, "Domains relacionados duplicados na Mission.");
  }
  return { primary, related };
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

function ensurePersonBelongsToMissionDomain(person, mission) {
  const parent = person.data.primaryDomain;
  if (!parent) throw new ModuleError(ERROR_CODES.VALIDATION, "Pessoa não possui Domain principal.");
  const allowed = new Set([mission.data.primaryDomainUuid, ...(mission.data.relatedDomainUuids ?? [])]);
  if (parent.uuid && allowed.has(parent.uuid)) return;
  const parentDocument = parent.entityId ? recordIndex.getByEntityId(parent.entityId) : null;
  if (parentDocument && allowed.has(parentDocument.uuid)) return;
  throw new ModuleError(ERROR_CODES.VALIDATION, "Pessoa não pertence a um Domain vinculado à Mission.");
}

function resolveMissionPeople(references, mission) {
  return (references ?? []).map((reference) => {
    const person = resolve(reference, RECORD_TYPES.PERSON);
    if (["dead", "retired"].includes(person.data.status)) {
      throw new ModuleError(ERROR_CODES.CONFLICT, `Pessoa ${person.document.name} não está disponível para Missions.`);
    }
    ensurePersonBelongsToMissionDomain(person, mission);
    return person;
  });
}

function ensureSquadIsOperational(squad) {
  if (squad.data.status === "disbanded") {
    throw new ModuleError(ERROR_CODES.CONFLICT, `Squad ${squad.document.name} está dissolvido e não pode participar de Missions.`);
  }
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
  const { primary: domain, related } = resolveMissionDomains(normalized.primaryDomain, normalized.relatedDomains);
  if (!hasCapability(domain.data, "missions")) {
    throw new ModuleError(ERROR_CODES.VALIDATION, `O Domain '${domain.document.name}' não possui capability missions.`);
  }
  assertAudience(normalized.audienceUserIds);

  const missionScope = { data: { primaryDomainUuid: domain.uuid, relatedDomainUuids: related.map((entry) => entry.uuid) } };
  const assignedPeople = resolveMissionPeople(normalized.personAssignments, missionScope);
  const created = await createRecord({
    recordType: RECORD_TYPES.MISSION,
    name: normalized.name,
    controllerIds: normalized.audienceUserIds,
    data: {
      primaryDomainUuid: domain.uuid,
      relatedDomainUuids: related.map((entry) => entry.uuid),
      origin: { kind: "manual", uuid: null },
      status: normalized.status,
      briefing: normalized.briefing,
      audienceUserIds: normalized.audienceUserIds,
      objectives: normalized.objectives,
      assignments: [],
      personAssignments: assignedPeople.map(ref),
      startedAtWorldTime: null,
      resolvedAtWorldTime: null,
      outcomeSummary: normalized.outcomeSummary
    }
  });

  return {
    result: missionResult(created),
    entities: [domain.data.entityId, ...related.map((entry) => entry.data.entityId), created.data.entityId],
    events: [{ type: EVENT_TYPES.MISSION_CREATED, entities: [domain.data.entityId, created.data.entityId], payload: missionResult(created) }],
    rollback: () => deleteRecord(created.uuid)
  };
}

export async function executeMissionUpdate({ payload, callerUserId }) {
  assertGM(callerUserId);
  const normalized = normalizeMissionUpdatePayload(payload);
  const mission = resolve(normalized.mission, RECORD_TYPES.MISSION);
  assertRevision(mission, normalized.expectedModifiedTime);
  if (!["planned", "available"].includes(mission.data.status)) {
    throw new ModuleError(ERROR_CODES.CONFLICT, "Somente Missions planejadas ou disponíveis podem ter o planejamento editado.");
  }
  if (normalized.expectedStatus && normalized.expectedStatus !== mission.data.status) {
    throw new ModuleError(
      ERROR_CODES.CONFLICT,
      `Status de Mission não pode ser alterado por mission.update (${mission.data.status} → ${normalized.expectedStatus}). Use o comando de lifecycle correspondente.`
    );
  }
  const { primary, related } = resolveMissionDomains(normalized.primaryDomain, normalized.relatedDomains);
  if (!hasCapability(primary.data, "missions")) {
    throw new ModuleError(ERROR_CODES.VALIDATION, `O Domain '${primary.document.name}' não possui capability missions.`);
  }
  assertAudience(normalized.audienceUserIds);

  const nextDomainUuids = [primary.uuid, ...related.map((entry) => entry.uuid)];
  const currentDomainUuids = [mission.data.primaryDomainUuid, ...(mission.data.relatedDomainUuids ?? [])];
  const domainSetChanged = nextDomainUuids.length !== currentDomainUuids.length
    || nextDomainUuids.some((uuid) => !currentDomainUuids.includes(uuid));
  if (domainSetChanged && (mission.data.assignments?.length ?? 0) > 0) {
    throw new ModuleError(ERROR_CODES.CONFLICT, "Libere os Squads preparados antes de alterar os Domains da Mission.");
  }
  const missionScope = { data: { primaryDomainUuid: primary.uuid, relatedDomainUuids: related.map((entry) => entry.uuid) } };
  const assignedPeople = normalized.personAssignments == null
    ? null
    : resolveMissionPeople(normalized.personAssignments, missionScope);

  const before = {
    name: mission.document.name,
    data: foundry.utils.deepClone(mission.data),
    controllers: [...(mission.data.audienceUserIds ?? [])]
  };
  const data = foundry.utils.deepClone(mission.data);
  data.primaryDomainUuid = primary.uuid;
  data.relatedDomainUuids = related.map((entry) => entry.uuid);
  data.briefing = normalized.briefing;
  data.audienceUserIds = normalized.audienceUserIds;
  data.outcomeSummary = normalized.outcomeSummary;
  if (assignedPeople) data.personAssignments = assignedPeople.map(ref);
  if (normalized.objectives) {
    const objectiveIds = new Set();
    data.objectives = normalized.objectives.map((objective) => {
      const localId = objective.localId.startsWith("new-objective-") ? foundry.utils.randomID() : objective.localId;
      if (objectiveIds.has(localId)) {
        throw new ModuleError(ERROR_CODES.VALIDATION, `Objetivo duplicado: ${localId}`);
      }
      objectiveIds.add(localId);
      return { ...objective, localId };
    });
  }

  const updated = await updateRecord({
    uuid: mission.uuid,
    recordType: RECORD_TYPES.MISSION,
    name: normalized.name,
    data,
    controllerIds: normalized.audienceUserIds
  });
  return {
    result: missionResult(updated),
    entities: [mission.data.entityId, primary.data.entityId, ...related.map((entry) => entry.data.entityId)],
    events: [{ type: EVENT_TYPES.MISSION_UPDATED, entities: [mission.data.entityId], payload: missionResult(updated) }],
    rollback: () => updateRecord({
      uuid: mission.uuid,
      recordType: RECORD_TYPES.MISSION,
      name: before.name,
      data: before.data,
      controllerIds: before.controllers
    })
  };
}

export async function executeMissionObjectiveUpsert({ payload, callerUserId }) {
  assertGM(callerUserId);
  const normalized = normalizeMissionObjectiveUpsertPayload(payload);
  const mission = resolve(normalized.mission, RECORD_TYPES.MISSION);
  assertRevision(mission, normalized.expectedModifiedTime);
  if (!["planned", "available"].includes(mission.data.status)) {
    throw new ModuleError(ERROR_CODES.CONFLICT, "Objetivos só podem ser editados antes do lançamento da Mission.");
  }
  const before = foundry.utils.deepClone(mission.data);
  const data = foundry.utils.deepClone(mission.data);
  const objective = {
    ...normalized.objective,
    localId: normalized.localId || foundry.utils.randomID()
  };
  data.objectives = upsertObjective(data.objectives, objective);
  const updated = await updateRecord({
    uuid: mission.uuid,
    recordType: RECORD_TYPES.MISSION,
    name: mission.document.name,
    data,
    controllerIds: mission.data.audienceUserIds
  });
  return {
    result: { ...missionResult(updated), objective },
    entities: [mission.data.entityId],
    events: [{ type: EVENT_TYPES.MISSION_OBJECTIVE_UPDATED, entities: [mission.data.entityId], payload: objective }],
    rollback: () => updateRecord({
      uuid: mission.uuid,
      recordType: RECORD_TYPES.MISSION,
      name: mission.document.name,
      data: before,
      controllerIds: mission.data.audienceUserIds
    })
  };
}

export async function executeMissionObjectiveRemove({ payload, callerUserId }) {
  assertGM(callerUserId);
  const normalized = normalizeMissionObjectiveRemovePayload(payload);
  const mission = resolve(normalized.mission, RECORD_TYPES.MISSION);
  assertRevision(mission, normalized.expectedModifiedTime);
  if (!["planned", "available"].includes(mission.data.status)) {
    throw new ModuleError(ERROR_CODES.CONFLICT, "Objetivos só podem ser removidos antes do lançamento da Mission.");
  }
  const existing = (mission.data.objectives ?? []).find((entry) => entry.localId === normalized.localId) ?? null;
  const before = foundry.utils.deepClone(mission.data);
  const data = foundry.utils.deepClone(mission.data);
  data.objectives = removeObjective(data.objectives, normalized.localId);
  const updated = await updateRecord({
    uuid: mission.uuid,
    recordType: RECORD_TYPES.MISSION,
    name: mission.document.name,
    data,
    controllerIds: mission.data.audienceUserIds
  });
  return {
    result: { ...missionResult(updated), localId: normalized.localId, removed: Boolean(existing) },
    entities: [mission.data.entityId],
    events: [{ type: EVENT_TYPES.MISSION_OBJECTIVE_REMOVED, entities: [mission.data.entityId], payload: { localId: normalized.localId, removed: Boolean(existing) } }],
    rollback: () => updateRecord({
      uuid: mission.uuid,
      recordType: RECORD_TYPES.MISSION,
      name: mission.document.name,
      data: before,
      controllerIds: mission.data.audienceUserIds
    })
  };
}

export async function executeMissionPrepare({ payload, callerUserId }) {
  const normalized = normalizeMissionPreparePayload(payload);
  const mission = resolve(normalized.mission, RECORD_TYPES.MISSION);
  const squad = resolve(normalized.squad, RECORD_TYPES.SQUAD);
  assertRevision(mission, normalized.expectedMissionModifiedTime);
  assertRevision(squad, normalized.expectedSquadModifiedTime, "O Squad");
  const caller = user(callerUserId);
  if (mission.data.status !== "available") throw new ModuleError(ERROR_CODES.CONFLICT, "Mission precisa estar disponível para preparação.");
  if (!caller.isGM) {
    if (!mission.data.audienceUserIds.includes(caller.id)) throw new ModuleError(ERROR_CODES.PERMISSION, "Você não faz parte da audiência desta Mission.");
    if (!controllers(squad).includes(caller.id)) throw new ModuleError(ERROR_CODES.PERMISSION, "Você não controla este Squad.");
  }
  ensureSquadBelongsToMissionDomain(squad, mission);
  ensureSquadIsOperational(squad);
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
  assertRevision(mission, normalized.expectedMissionModifiedTime);
  assertRevision(squad, normalized.expectedSquadModifiedTime, "O Squad");
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

export async function executeMissionPublish({ payload, callerUserId }) {
  assertGM(callerUserId);
  const normalized = normalizeMissionReferencePayload(payload);
  const mission = resolve(normalized.mission, RECORD_TYPES.MISSION);
  assertRevision(mission, normalized.expectedModifiedTime);
  if (mission.data.status !== "planned") {
    throw new ModuleError(ERROR_CODES.CONFLICT, "Somente uma Mission planejada pode ser publicada.");
  }

  const before = foundry.utils.deepClone(mission.data);
  const data = foundry.utils.deepClone(mission.data);
  data.status = "available";
  const updated = await updateRecord({
    uuid: mission.uuid,
    recordType: RECORD_TYPES.MISSION,
    name: mission.document.name,
    data,
    controllerIds: mission.data.audienceUserIds
  });
  return {
    result: missionResult(updated),
    entities: [mission.data.entityId],
    events: [{ type: EVENT_TYPES.MISSION_PUBLISHED, entities: [mission.data.entityId], payload: missionResult(updated) }],
    rollback: () => updateRecord({
      uuid: mission.uuid,
      recordType: RECORD_TYPES.MISSION,
      name: mission.document.name,
      data: before,
      controllerIds: mission.data.audienceUserIds
    })
  };
}

export async function executeMissionLaunch({ payload, callerUserId }) {
  assertGM(callerUserId);
  const normalized = normalizeMissionReferencePayload(payload);
  const mission = resolve(normalized.mission, RECORD_TYPES.MISSION);
  assertRevision(mission, normalized.expectedModifiedTime);
  if (mission.data.status !== "available") throw new ModuleError(ERROR_CODES.CONFLICT, "Somente Mission disponível pode ser lançada.");
  if (!((mission.data.assignments?.length ?? 0) + (mission.data.personAssignments?.length ?? 0))) {
    throw new ModuleError(ERROR_CODES.CONFLICT, "Mission precisa de pelo menos uma Força ou Pessoa designada.");
  }
  const suppliedSquads = normalized.squads.map((reference) => resolve(reference, RECORD_TYPES.SQUAD));
  if (suppliedSquads.length !== mission.data.assignments.length
    || mission.data.assignments.some((assignment) => !suppliedSquads.some((squad) => sameRef(assignment.squad, squad)))) {
    throw new ModuleError(ERROR_CODES.CONFLICT, "A lista de Squads mudou antes do lançamento. Reabra a confirmação.");
  }

  const catalog = new Set((getResourceCatalogSetting().resources ?? []).map((resource) => resource.id));
  const beforeMission = foundry.utils.deepClone(mission.data);
  const missionData = foundry.utils.deepClone(mission.data);
  const squadUpdates = [];
  const rollback = [];

  for (const assignment of missionData.assignments) {
    const squad = resolve(assignment.squad, RECORD_TYPES.SQUAD);
    ensureSquadIsOperational(squad);
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

export async function executeMissionCancel({ payload, callerUserId }) {
  assertGM(callerUserId);
  const normalized = normalizeMissionCancelPayload(payload);
  const mission = resolve(normalized.mission, RECORD_TYPES.MISSION);
  assertRevision(mission, normalized.expectedModifiedTime);
  if (!["planned", "available", "active"].includes(mission.data.status)) {
    throw new ModuleError(ERROR_CODES.CONFLICT, "Somente Mission planejada, disponível ou ativa pode ser cancelada.");
  }

  const assignedSquads = (mission.data.assignments ?? []).map((assignment) => resolve(assignment.squad, RECORD_TYPES.SQUAD));
  if (normalized.squads.length !== assignedSquads.length
    || assignedSquads.some((squad) => !normalized.squads.some((snapshot) => sameRef(snapshot.squad, squad)))) {
    throw new ModuleError(ERROR_CODES.CONFLICT, "Os Squads da Mission mudaram. Reabra a confirmação de cancelamento.");
  }

  const beforeMission = foundry.utils.deepClone(mission.data);
  const missionData = foundry.utils.deepClone(mission.data);
  const updates = [];
  const rollback = [];

  for (const assignment of missionData.assignments ?? []) {
    const squad = resolve(assignment.squad, RECORD_TYPES.SQUAD);
    const snapshot = normalized.squads.find((entry) => sameRef(entry.squad, squad));
    assertRevision(squad, snapshot?.expectedModifiedTime ?? null, "O Squad");
    if (squad.data.currentMission && !sameRef(squad.data.currentMission, mission)) {
      throw new ModuleError(ERROR_CODES.CONFLICT, `Squad ${squad.document.name} está comprometido com outra Mission.`);
    }

    const data = foundry.utils.deepClone(squad.data);
    rollback.push({ uuid: squad.uuid, recordType: RECORD_TYPES.SQUAD, data: foundry.utils.deepClone(squad.data) });
    if (sameRef(data.currentMission, mission)) data.currentMission = null;
    if (data.status === "deployed") data.status = Number(data.strength ?? 0) > 0 ? "ready" : "inactive";
    updates.push({ uuid: squad.uuid, recordType: RECORD_TYPES.SQUAD, data });
    assignment.state = "returned";
  }

  const cancelledAtWorldTime = worldTime();
  missionData.status = "cancelled";
  missionData.outcomeSummary = normalized.reason;
  missionData.resolvedAtWorldTime = cancelledAtWorldTime;
  await updateRecordsBatch([{ uuid: mission.uuid, recordType: RECORD_TYPES.MISSION, data: missionData }, ...updates]);

  const returnedAssignments = (missionData.assignments ?? []).map((assignment) => ({
    localId: assignment.localId,
    squad: assignment.squad,
    state: assignment.state
  }));
  const entityIds = [mission.data.entityId, ...assignedSquads.map((squad) => squad.data.entityId).filter(Boolean)];
  return {
    result: {
      missionEntityId: mission.data.entityId,
      status: "cancelled",
      reason: normalized.reason,
      cancelledAtWorldTime,
      assignments: returnedAssignments
    },
    entities: entityIds,
    events: [{
      type: EVENT_TYPES.MISSION_CANCELLED,
      entities: entityIds,
      payload: {
        reason: normalized.reason,
        cancelledAtWorldTime,
        assignments: returnedAssignments.length
      }
    }],
    rollback: () => updateRecordsBatch([
      { uuid: mission.uuid, recordType: RECORD_TYPES.MISSION, data: beforeMission },
      ...rollback
    ])
  };
}

export async function executeMissionResolve({ payload, callerUserId }) {
  assertGM(callerUserId);
  const normalized = normalizeMissionResolvePayload(payload);
  const mission = resolve(normalized.mission, RECORD_TYPES.MISSION);
  assertRevision(mission, normalized.expectedModifiedTime);
  if (mission.data.status !== "active") throw new ModuleError(ERROR_CODES.CONFLICT, "Somente Mission ativa pode ser resolvida.");

  const assignedSquads = (mission.data.assignments ?? []).map((assignment) => resolve(assignment.squad, RECORD_TYPES.SQUAD));
  if (normalized.results.length !== assignedSquads.length
    || normalized.results.some((result) => !assignedSquads.some((squad) => sameRef(result.squad, squad)))) {
    throw new ModuleError(ERROR_CODES.CONFLICT, "Os Squads da Mission mudaram. Reabra o relatório final.");
  }
  const missionObjectiveIds = (mission.data.objectives ?? []).map((objective) => objective.localId);
  if (normalized.objectiveResults.length !== missionObjectiveIds.length
    || normalized.objectiveResults.some((result) => !missionObjectiveIds.includes(result.localId))) {
    throw new ModuleError(ERROR_CODES.CONFLICT, "Os objetivos da Mission mudaram. Reabra o relatório final.");
  }

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
