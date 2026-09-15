import { executeCommandAuthoritatively } from "../../authority/execute.js";
import { COMMAND_TYPES, RECORD_TYPES } from "../../core/constants.js";
import { getRecord } from "../../data/journal-store.js";

function operationId(value = null) {
  return String(value ?? "").trim() || null;
}

function domainReference(uuid) {
  return { recordType: RECORD_TYPES.DOMAIN, uuid, entityId: null };
}

/** Compatibility bridge. Persistence and authority live in domain.create. */
export async function createDomainAction(payload = {}) {
  const {
    operationId: requestedOperationId = null,
    ...commandPayload
  } = payload ?? {};
  const result = await executeCommandAuthoritatively({
    commandType: COMMAND_TYPES.DOMAIN_CREATE,
    payload: commandPayload,
    operationId: operationId(requestedOperationId)
  });
  return getRecord(result.uuid);
}

/** Compatibility bridge. Persistence and authority live in domain.update. */
export async function updateDomainAction(payload = {}) {
  const {
    domainUuid,
    operationId: requestedOperationId = null,
    ...commandPayload
  } = payload ?? {};
  await executeCommandAuthoritatively({
    commandType: COMMAND_TYPES.DOMAIN_UPDATE,
    payload: {
      domain: domainReference(domainUuid),
      ...commandPayload
    },
    operationId: operationId(requestedOperationId)
  });
  return getRecord(domainUuid);
}
