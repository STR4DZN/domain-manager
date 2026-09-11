import { MISSION_STATUSES, RECORD_TYPES } from "../../core/constants.js";
import { normalizeEntityReference } from "../../core/entity-contracts.js";
import { ERROR_CODES, ModuleError } from "../../core/errors.js";
import { normalizeObjective } from "./rules.js";

function text(value) { return String(value ?? "").trim(); }
function uniqueIds(values = []) { return [...new Set((values ?? []).map(text).filter(Boolean))]; }
function int(value, { min, max, label }) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new ModuleError(ERROR_CODES.VALIDATION, `${label} precisa estar entre ${min} e ${max}.`);
  }
  return n;
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
  return {
    name,
    primaryDomain: normalizeEntityReference(payload.primaryDomain, { allowedTypes: [RECORD_TYPES.DOMAIN] }),
    audienceUserIds: uniqueIds(payload.audienceUserIds),
    status,
    briefing: text(payload.briefing),
    objectives
  };
}

export function missionCreateResourceKeys(payload = {}) {
  const normalized = normalizeMissionCreatePayload(payload);
  return [normalized.primaryDomain.entityId ?? normalized.primaryDomain.uuid].filter(Boolean);
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
  return { mission: normalizeEntityReference(payload.mission, { allowedTypes: [RECORD_TYPES.MISSION] }) };
}

export function missionReferenceResourceKeys(payload = {}) {
  const normalized = normalizeMissionReferencePayload(payload);
  return [normalized.mission.entityId ?? normalized.mission.uuid].filter(Boolean);
}

export function normalizeMissionReleasePayload(payload = {}) {
  const base = normalizeMissionPreparePayload({ ...payload, committedStrength: payload.committedStrength ?? 1, resources: [] });
  return { mission: base.mission, squad: base.squad };
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
  const objectiveResults = (payload.objectiveResults ?? []).map((result) => {
    const localId = text(result.localId);
    const objectiveStatus = text(result.status);
    if (!localId || !["pending", "completed", "failed"].includes(objectiveStatus)) {
      throw new ModuleError(ERROR_CODES.VALIDATION, "Resultado de objetivo inválido.");
    }
    return { localId, status: objectiveStatus };
  });
  return { mission, status, outcomeSummary: text(payload.outcomeSummary), results, objectiveResults };
}

export function missionResolveResourceKeys(payload = {}) {
  const normalized = normalizeMissionResolvePayload(payload);
  return [
    normalized.mission.entityId ?? normalized.mission.uuid,
    ...normalized.results.map((entry) => entry.squad.entityId ?? entry.squad.uuid)
  ].filter(Boolean);
}
