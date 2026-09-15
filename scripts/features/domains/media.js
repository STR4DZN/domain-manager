import { executeCommandAuthoritatively } from "../../authority/execute.js";
import { COMMAND_TYPES, RECORD_TYPES } from "../../core/constants.js";
import { getRecord } from "../../data/journal-store.js";

function operationId(value = null) {
  return String(value ?? "").trim() || null;
}

function domainReference(uuid) {
  return { recordType: RECORD_TYPES.DOMAIN, uuid, entityId: null };
}

/** Compatibility bridge for callers that still update one media field at a time. */
export function updateDomainMediaField({ fieldPath, value, ...options } = {}) {
  return updateDomainMediaFields({
    ...options,
    fields: [[fieldPath, value]]
  });
}

/** Compatibility bridge. Persistence and authority live in domain.media-update. */
export async function updateDomainMediaFields({
  domainUuid,
  fields = [],
  expectedModifiedTime = null,
  operationId: requestedOperationId = null
} = {}) {
  await executeCommandAuthoritatively({
    commandType: COMMAND_TYPES.DOMAIN_MEDIA_UPDATE,
    payload: {
      domain: domainReference(domainUuid),
      expectedModifiedTime,
      fields
    },
    operationId: operationId(requestedOperationId)
  });
  return getRecord(domainUuid);
}
