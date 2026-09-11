import { COMMAND_TYPES, RECORD_TYPES } from "../../core/constants.js";
import { ERROR_CODES, ModuleError } from "../../core/errors.js";
import { dispatchAuthoritativeCommand } from "../../commands/execute.js";
import { getRecord } from "../../data/journal-store.js";

function operationId(value = null) {
  const clean = String(value ?? "").trim();
  return clean || foundry.utils.randomID();
}

function reference(recordType, uuid) {
  return { recordType, uuid, entityId: null };
}

/**
 * Compatibility wrapper for callers created before Mission moved completely to
 * the generic Command Kernel. Manual creation remains supported; derived
 * Missions must use their canonical bridge so provenance/deduplication stays
 * authoritative.
 */
export async function createMissionAction({
  name,
  primaryDomainUuid,
  relatedDomainUuids = [],
  audienceUserIds = [],
  status = "planned",
  briefing = "",
  outcomeSummary = "",
  originKind = "manual",
  originUuid = null,
  operationId: requestedOperationId = null
}) {
  if (originKind !== "manual" || originUuid) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      "Mission derivada não pode ser criada pela API legada. Use o bridge canônico da entidade de origem."
    );
  }

  const result = await dispatchAuthoritativeCommand({
    commandType: COMMAND_TYPES.MISSION_CREATE,
    operationId: operationId(requestedOperationId),
    payload: {
      name,
      primaryDomain: reference(RECORD_TYPES.DOMAIN, primaryDomainUuid),
      relatedDomains: (relatedDomainUuids ?? []).map((uuid) => reference(RECORD_TYPES.DOMAIN, uuid)),
      audienceUserIds,
      status,
      briefing,
      outcomeSummary,
      objectives: []
    }
  }, { callerUserId: game.user.id });

  return getRecord(result.uuid);
}

/**
 * Compatibility wrapper for Mission metadata edits. Lifecycle transitions are
 * intentionally not owned here: `status` is treated as an expected current
 * status and the canonical launch/resolve commands remain the only transition
 * path for operational states.
 */
export async function updateMissionAction({
  missionUuid,
  expectedModifiedTime,
  name,
  primaryDomainUuid,
  relatedDomainUuids = [],
  audienceUserIds = [],
  status,
  briefing = "",
  outcomeSummary = "",
  operationId: requestedOperationId = null
}) {
  await dispatchAuthoritativeCommand({
    commandType: COMMAND_TYPES.MISSION_UPDATE,
    operationId: operationId(requestedOperationId),
    payload: {
      mission: reference(RECORD_TYPES.MISSION, missionUuid),
      expectedModifiedTime,
      expectedStatus: status,
      name,
      primaryDomain: reference(RECORD_TYPES.DOMAIN, primaryDomainUuid),
      relatedDomains: (relatedDomainUuids ?? []).map((uuid) => reference(RECORD_TYPES.DOMAIN, uuid)),
      audienceUserIds,
      briefing,
      outcomeSummary
    }
  }, { callerUserId: game.user.id });

  return getRecord(missionUuid);
}

export async function upsertMissionObjectiveAction({
  missionUuid,
  expectedModifiedTime,
  localId = null,
  title,
  description = "",
  status = "pending",
  optional = false,
  operationId: requestedOperationId = null
}) {
  await dispatchAuthoritativeCommand({
    commandType: COMMAND_TYPES.MISSION_OBJECTIVE_UPSERT,
    operationId: operationId(requestedOperationId),
    payload: {
      mission: reference(RECORD_TYPES.MISSION, missionUuid),
      expectedModifiedTime,
      localId,
      title,
      description,
      status,
      optional
    }
  }, { callerUserId: game.user.id });

  return getRecord(missionUuid);
}

export async function removeMissionObjectiveAction({
  missionUuid,
  expectedModifiedTime,
  localId,
  operationId: requestedOperationId = null
}) {
  await dispatchAuthoritativeCommand({
    commandType: COMMAND_TYPES.MISSION_OBJECTIVE_REMOVE,
    operationId: operationId(requestedOperationId),
    payload: {
      mission: reference(RECORD_TYPES.MISSION, missionUuid),
      expectedModifiedTime,
      localId
    }
  }, { callerUserId: game.user.id });

  return getRecord(missionUuid);
}
