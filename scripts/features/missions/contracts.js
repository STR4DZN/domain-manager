import { MISSION_STATUSES, RECORD_TYPES } from "../../core/constants.js";
import { normalizeEntityReference } from "../../core/entity-contracts.js";
import { ERROR_CODES, ModuleError } from "../../core/errors.js";
import { normalizeObjective } from "./rules.js";

function text(value) { return String(value ?? "").trim(); }
function uniqueIds(values = []) { return [...new Set((values ?? []).map(text).filter(Boolean))]; }
function revision(value, label = "expectedModifiedTime") {
  if (value == null || value === "") return null;
  const normalized = Number(value);
  if (!Number.isSafeInteger(normalized) || normalized < 0) {
    throw new ModuleError(ERROR_CODES.VALIDATION, `${label} precisa ser um inteiro não-negativo.`);
  }
  return normalized;
}
function int(value, { min, max, label }) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new ModuleError(ERROR_CODES.VALIDATION, `${label} precisa estar entre ${min} e ${max}.`);
  }
  return n;
}
function people(references = []) {
  const normalized = (references ?? []).map((entry) =>
    normalizeEntityReference(entry, { allowedTypes: [RECORD_TYPES.PERSON] })
  );
  const keys = normalized.map((entry) => entry.entityId ?? entry.uuid);
  if (new Set(keys).size !== keys.length) {
    throw new ModuleError(ERROR_CODES.VALIDATION, "Pessoas duplicadas na Mission.");
  }
  return normalized;
}

export function normalizeMissionCreatePayload(payload = {}) {
  const name = text(payload.name);
  if (!name) throw new ModuleError(ERROR_CODES.VALIDATION, "Nome da Mission é obrigatório.");
  const status = text(payload.status || "available");
  if (!["planned", "available"].includes(status)) {
    throw new ModuleError(ERROR_CODES.VALIDATION, "Mission nova precisa iniciar como planned ou available.");
  }
  const objectives = (payload.objectives ?? []).map((objective, index) => normalizeObjective({
    localId: text(objective.localId) || `objective-${index + 1}`,
    title: objective.title,
    description: objective.description ?? "",
    status: "pending",
    optional: Boolean(objective.optional)
  }));
  if (new Set(objectives.map((objective) => objective.localId)).size !== objectives.length) {
    throw new ModuleError(ERROR_CODES.VALIDATION, "Objetivos duplicados na Mission.");
  }
  const relatedDomains = (payload.relatedDomains ?? []).map((entry) =>
    normalizeEntityReference(entry, { allowedTypes: [RECORD_TYPES.DOMAIN] })
  );
  const uniqueRelated = new Set(relatedDomains.map((entry) => entry.entityId ?? entry.uuid));
  if (uniqueRelated.size !== relatedDomains.length) {
    throw new ModuleError(ERROR_CODES.VALIDATION, "Domains relacionados duplicados na Mission.");
  }
  return {
    name,
    primaryDomain: normalizeEntityReference(payload.primaryDomain, { allowedTypes: [RECORD_TYPES.DOMAIN] }),
    relatedDomains,
    audienceUserIds: uniqueIds(payload.audienceUserIds),
    status,
    briefing: text(payload.briefing),
    objectives,
    personAssignments: people(payload.personAssignments),
    outcomeSummary: text(payload.outcomeSummary)
  };
}

export function missionCreateResourceKeys(payload = {}) {
  const normalized = normalizeMissionCreatePayload(payload);
  return [
    normalized.primaryDomain.entityId ?? normalized.primaryDomain.uuid,
    ...(normalized.relatedDomains ?? []).map((entry) => entry.entityId ?? entry.uuid),
    ...normalized.personAssignments.map((entry) => entry.entityId ?? entry.uuid)
  ].filter(Boolean);
}

export function normalizeMissionUpdatePayload(payload = {}) {
  const name = text(payload.name);
  if (!name) throw new ModuleError(ERROR_CODES.VALIDATION, "Nome da Mission é obrigatório.");
  const relatedDomains = (payload.relatedDomains ?? []).map((entry) =>
    normalizeEntityReference(entry, { allowedTypes: [RECORD_TYPES.DOMAIN] })
  );
  const uniqueRelated = new Set(relatedDomains.map((entry) => entry.entityId ?? entry.uuid));
  if (uniqueRelated.size !== relatedDomains.length) {
    throw new ModuleError(ERROR_CODES.VALIDATION, "Domains relacionados duplicados na Mission.");
  }
  const expectedStatus = payload.expectedStatus == null ? null : text(payload.expectedStatus);
  if (expectedStatus && !MISSION_STATUSES.includes(expectedStatus)) {
    throw new ModuleError(ERROR_CODES.VALIDATION, `Status de Mission inválido: ${expectedStatus}`);
  }
  return {
    mission: normalizeEntityReference(payload.mission, { allowedTypes: [RECORD_TYPES.MISSION] }),
    expectedModifiedTime: revision(payload.expectedModifiedTime),
    expectedStatus,
    name,
    primaryDomain: normalizeEntityReference(payload.primaryDomain, { allowedTypes: [RECORD_TYPES.DOMAIN] }),
    relatedDomains,
    audienceUserIds: uniqueIds(payload.audienceUserIds),
    briefing: text(payload.briefing),
    outcomeSummary: text(payload.outcomeSummary),
    personAssignments: payload.personAssignments == null ? null : people(payload.personAssignments),
    objectives: payload.objectives == null ? null : (payload.objectives ?? []).map((objective, index) => normalizeObjective({
      localId: text(objective.localId) || `new-objective-${index + 1}`,
      title: objective.title,
      description: objective.description ?? "",
      status: objective.status ?? "pending",
      optional: Boolean(objective.optional)
    }))
  };
}

export function missionUpdateResourceKeys(payload = {}) {
  const normalized = normalizeMissionUpdatePayload(payload);
  return [
    normalized.mission.entityId ?? normalized.mission.uuid,
    normalized.primaryDomain.entityId ?? normalized.primaryDomain.uuid,
    ...normalized.relatedDomains.map((entry) => entry.entityId ?? entry.uuid),
    ...(normalized.personAssignments ?? []).map((entry) => entry.entityId ?? entry.uuid)
  ].filter(Boolean);
}

export function normalizeMissionObjectiveUpsertPayload(payload = {}) {
  const localId = text(payload.localId) || null;
  const objective = normalizeObjective({
    localId: localId || "pending-command-id",
    title: payload.title,
    description: payload.description ?? "",
    status: payload.status ?? "pending",
    optional: Boolean(payload.optional)
  });
  return {
    mission: normalizeEntityReference(payload.mission, { allowedTypes: [RECORD_TYPES.MISSION] }),
    expectedModifiedTime: revision(payload.expectedModifiedTime),
    localId,
    objective
  };
}

export function missionObjectiveUpsertResourceKeys(payload = {}) {
  const normalized = normalizeMissionObjectiveUpsertPayload(payload);
  return [normalized.mission.entityId ?? normalized.mission.uuid].filter(Boolean);
}

export function normalizeMissionObjectiveRemovePayload(payload = {}) {
  const localId = text(payload.localId);
  if (!localId) throw new ModuleError(ERROR_CODES.VALIDATION, "Objetivo exige localId.");
  return {
    mission: normalizeEntityReference(payload.mission, { allowedTypes: [RECORD_TYPES.MISSION] }),
    expectedModifiedTime: revision(payload.expectedModifiedTime),
    localId
  };
}

export function missionObjectiveRemoveResourceKeys(payload = {}) {
  const normalized = normalizeMissionObjectiveRemovePayload(payload);
  return [normalized.mission.entityId ?? normalized.mission.uuid].filter(Boolean);
}

function normalizeCommittedResources(resources = []) {
  const result = [];
  const seen = new Set();
  for (const entry of resources ?? []) {
    const resourceId = text(entry.resourceId);
    if (!resourceId) continue;
    if (seen.has(resourceId)) throw new ModuleError(ERROR_CODES.VALIDATION, `Recurso duplicado na preparação: ${resourceId}`);
    seen.add(resourceId);
    const amount = int(entry.amount ?? 0, { min: 0, max: 9_000_000_000_000, label: `Quantidade de ${resourceId}` });
    if (amount > 0) result.push({ resourceId, amount });
  }
  return result;
}

export function normalizeMissionPreparePayload(payload = {}) {
  return {
    mission: normalizeEntityReference(payload.mission, { allowedTypes: [RECORD_TYPES.MISSION] }),
    squad: normalizeEntityReference(payload.squad, { allowedTypes: [RECORD_TYPES.SQUAD] }),
    expectedMissionModifiedTime: revision(payload.expectedMissionModifiedTime, "expectedMissionModifiedTime"),
    expectedSquadModifiedTime: revision(payload.expectedSquadModifiedTime, "expectedSquadModifiedTime"),
    committedStrength: int(payload.committedStrength, { min: 1, max: 100000, label: "Efetivo comprometido" }),
    resources: normalizeCommittedResources(payload.resources)
  };
}

export function missionPrepareResourceKeys(payload = {}) {
  const normalized = normalizeMissionPreparePayload(payload);
  return [
    normalized.mission.entityId ?? normalized.mission.uuid,
    normalized.squad.entityId ?? normalized.squad.uuid
  ].filter(Boolean);
}

export function normalizeMissionReferencePayload(payload = {}) {
  return {
    mission: normalizeEntityReference(payload.mission, { allowedTypes: [RECORD_TYPES.MISSION] }),
    expectedModifiedTime: revision(payload.expectedModifiedTime),
    squads: (payload.squads ?? []).map((entry) => normalizeEntityReference(entry, { allowedTypes: [RECORD_TYPES.SQUAD] }))
  };
}

export function missionReferenceResourceKeys(payload = {}) {
  const normalized = normalizeMissionReferencePayload(payload);
  return [
    normalized.mission.entityId ?? normalized.mission.uuid,
    ...normalized.squads.map((entry) => entry.entityId ?? entry.uuid)
  ].filter(Boolean);
}

export function normalizeMissionReleasePayload(payload = {}) {
  const base = normalizeMissionPreparePayload({ ...payload, committedStrength: payload.committedStrength ?? 1, resources: [] });
  return {
    mission: base.mission,
    squad: base.squad,
    expectedMissionModifiedTime: base.expectedMissionModifiedTime,
    expectedSquadModifiedTime: base.expectedSquadModifiedTime
  };
}

export function missionReleaseResourceKeys(payload = {}) {
  const normalized = normalizeMissionReleasePayload(payload);
  return [normalized.mission.entityId ?? normalized.mission.uuid, normalized.squad.entityId ?? normalized.squad.uuid].filter(Boolean);
}

export function normalizeMissionResolvePayload(payload = {}) {
  const mission = normalizeEntityReference(payload.mission, { allowedTypes: [RECORD_TYPES.MISSION] });
  const status = text(payload.status);
  if (!["resolved", "failed"].includes(status)) {
    throw new ModuleError(ERROR_CODES.VALIDATION, "Resolução exige status resolved ou failed.");
  }
  const results = (payload.results ?? []).map((result) => ({
    squad: normalizeEntityReference(result.squad, { allowedTypes: [RECORD_TYPES.SQUAD] }),
    casualties: int(result.casualties ?? 0, { min: 0, max: 100000, label: "Baixas" }),
    moraleDelta: int(result.moraleDelta ?? 0, { min: -100, max: 100, label: "Delta de moral" }),
    conditionDelta: int(result.conditionDelta ?? 0, { min: -100, max: 100, label: "Delta de condição" }),
    notes: text(result.notes)
  }));
  const resultKeys = results.map((entry) => entry.squad.entityId ?? entry.squad.uuid);
  if (new Set(resultKeys).size !== resultKeys.length) {
    throw new ModuleError(ERROR_CODES.VALIDATION, "Resultados duplicados para o mesmo Squad.");
  }
  const objectiveResults = (payload.objectiveResults ?? []).map((result) => {
    const localId = text(result.localId);
    const objectiveStatus = text(result.status);
    if (!localId || !["pending", "completed", "failed"].includes(objectiveStatus)) {
      throw new ModuleError(ERROR_CODES.VALIDATION, "Resultado de objetivo inválido.");
    }
    return { localId, status: objectiveStatus };
  });
  if (new Set(objectiveResults.map((entry) => entry.localId)).size !== objectiveResults.length) {
    throw new ModuleError(ERROR_CODES.VALIDATION, "Resultados duplicados para o mesmo objetivo.");
  }
  return {
    mission,
    expectedModifiedTime: revision(payload.expectedModifiedTime),
    status,
    outcomeSummary: text(payload.outcomeSummary),
    results,
    objectiveResults
  };
}

export function missionResolveResourceKeys(payload = {}) {
  const normalized = normalizeMissionResolvePayload(payload);
  return [
    normalized.mission.entityId ?? normalized.mission.uuid,
    ...normalized.results.map((entry) => entry.squad.entityId ?? entry.squad.uuid)
  ].filter(Boolean);
}

export function normalizeMissionCancelPayload(payload = {}) {
  const reason = text(payload.reason);
  if (!reason) {
    throw new ModuleError(ERROR_CODES.VALIDATION, "Informe o motivo do cancelamento da Mission.");
  }
  if (reason.length > 4000) {
    throw new ModuleError(ERROR_CODES.VALIDATION, "O motivo do cancelamento deve ter no máximo 4000 caracteres.");
  }

  const squads = (payload.squads ?? []).map((entry) => ({
    squad: normalizeEntityReference(entry?.squad ?? entry, { allowedTypes: [RECORD_TYPES.SQUAD] }),
    expectedModifiedTime: revision(entry?.expectedModifiedTime, "expectedModifiedTime do Squad")
  }));
  const squadKeys = squads.map((entry) => entry.squad.entityId ?? entry.squad.uuid);
  if (new Set(squadKeys).size !== squadKeys.length) {
    throw new ModuleError(ERROR_CODES.VALIDATION, "O snapshot de cancelamento contém Squads duplicados.");
  }

  return {
    mission: normalizeEntityReference(payload.mission, { allowedTypes: [RECORD_TYPES.MISSION] }),
    expectedModifiedTime: revision(payload.expectedModifiedTime),
    reason,
    squads
  };
}

export function missionCancelResourceKeys(payload = {}) {
  const normalized = normalizeMissionCancelPayload(payload);
  return [
    normalized.mission.entityId ?? normalized.mission.uuid,
    ...normalized.squads.map((entry) => entry.squad.entityId ?? entry.squad.uuid)
  ].filter(Boolean);
}
