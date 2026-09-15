/**
 * Pontes de compatibilidade do Bloco 12: toda persistência passa pelo kernel
 * transacional, inclusive quando uma integração ainda usa as ações legadas.
 */

import { executeCommandAuthoritatively } from "../../authority/execute.js";
import { COMMAND_TYPES, RECORD_TYPES } from "../../core/constants.js";
import { getRecord } from "../../data/journal-store.js";

function domainReference(uuid) {
  return { recordType: RECORD_TYPES.DOMAIN, uuid, entityId: null };
}

function operationId(value = null) {
  return String(value ?? "").trim() || null;
}

async function domainRevision(domainUuid, expectedModifiedTime) {
  if (expectedModifiedTime != null && expectedModifiedTime !== "") {
    return expectedModifiedTime;
  }
  const domain = await getRecord(domainUuid);
  return domain.document?._stats?.modifiedTime;
}

async function runHistoryCommand({
  commandType,
  domainUuid,
  expectedModifiedTime = null,
  operationId: requestedOperationId = null,
  payload = {}
}) {
  await executeCommandAuthoritatively({
    commandType,
    operationId: operationId(requestedOperationId),
    payload: {
      domain: domainReference(domainUuid),
      expectedModifiedTime: await domainRevision(domainUuid, expectedModifiedTime),
      ...payload
    }
  });
  return getRecord(domainUuid);
}

export async function addHistoryEvent({
  domainUuid,
  title,
  category = "story",
  summary = "",
  details = "",
  significance = "minor",
  tick = null,
  visibility = "all",
  expectedModifiedTime = null,
  operationId: requestedOperationId = null
}) {
  return runHistoryCommand({
    commandType: COMMAND_TYPES.HISTORY_ADD,
    domainUuid,
    expectedModifiedTime,
    operationId: requestedOperationId,
    payload: {
      entry: { title, category, summary, details, significance, tick, visibility }
    }
  });
}

export async function removeHistoryEvent({
  domainUuid,
  localId,
  expectedModifiedTime = null,
  operationId: requestedOperationId = null
}) {
  return runHistoryCommand({
    commandType: COMMAND_TYPES.HISTORY_REMOVE,
    domainUuid,
    expectedModifiedTime,
    operationId: requestedOperationId,
    payload: { localId }
  });
}

export async function clearHistory({
  domainUuid,
  expectedModifiedTime = null,
  operationId: requestedOperationId = null
}) {
  return runHistoryCommand({
    commandType: COMMAND_TYPES.HISTORY_CLEAR,
    domainUuid,
    expectedModifiedTime,
    operationId: requestedOperationId
  });
}
