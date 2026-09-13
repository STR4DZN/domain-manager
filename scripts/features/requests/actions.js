import { COMMAND_TYPES, RECORD_TYPES } from "../../core/constants.js";
import { dispatchAuthoritativeCommand } from "../../commands/execute.js";
import { getRecord } from "../../data/journal-store.js";

function commandOperationId(operationId = null) {
  const clean = String(operationId ?? "").trim();
  return clean || foundry.utils.randomID();
}

/**
 * Compatibility wrapper kept for callers created before Request moved to the
 * generic Command Kernel. No persistence or authority decision lives here.
 */
export async function performCreateRequest(payload = {}, callerUserId) {
  const result = await dispatchAuthoritativeCommand({
    commandType: COMMAND_TYPES.REQUEST_CREATE,
    operationId: commandOperationId(payload.operationId),
    payload: {
      domain: payload.domain ?? {
        recordType: RECORD_TYPES.DOMAIN,
        uuid: payload.primaryDomainUuid ?? null,
        entityId: payload.primaryDomainEntityId ?? null
      },
      type: payload.type,
      customTypeLabel: payload.customTypeLabel,
      title: payload.title,
      intent: payload.intent,
      details: payload.details
    }
  }, { callerUserId });

  // Preserve the compact legacy return contract.
  return {
    uuid: result.uuid,
    duplicate: Boolean(result.duplicate)
  };
}

/**
 * Compatibility wrapper for the former direct review action. It dispatches the
 * canonical command and then returns the decoded record, matching the legacy
 * return shape without owning any write path.
 */
export async function reviewRequestAction({
  requestUuid,
  expectedModifiedTime,
  status,
  summary,
  handling = "none",
  operationId = null
}) {
  await dispatchAuthoritativeCommand({
    commandType: COMMAND_TYPES.REQUEST_REVIEW,
    operationId: commandOperationId(operationId),
    payload: {
      request: {
        recordType: RECORD_TYPES.REQUEST,
        uuid: requestUuid,
        entityId: null
      },
      expectedModifiedTime,
      status,
      summary,
      handling
    }
  }, { callerUserId: game.user.id });

  return getRecord(requestUuid);
}

export async function resubmitRequestAction({
  requestUuid,
  expectedModifiedTime,
  type,
  customTypeLabel = "",
  title,
  intent,
  details = "",
  operationId = null
}, callerUserId = game.user.id) {
  await dispatchAuthoritativeCommand({
    commandType: COMMAND_TYPES.REQUEST_RESUBMIT,
    operationId: commandOperationId(operationId),
    payload: {
      request: { recordType: RECORD_TYPES.REQUEST, uuid: requestUuid, entityId: null },
      expectedModifiedTime,
      type,
      customTypeLabel,
      title,
      intent,
      details
    }
  }, { callerUserId });

  return getRecord(requestUuid);
}
