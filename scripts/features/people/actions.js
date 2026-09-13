/**
 * APIs de compatibilidade de People.
 *
 * Toda mutação suportada passa pelo Command Kernel. Notables embutidos são
 * somente leitura: o modelo persistente atual usa Person records independentes.
 */

import { COMMAND_TYPES, RECORD_TYPES } from "../../core/constants.js";
import { dispatchAuthoritativeCommand } from "../../commands/execute.js";
import { getRecord } from "../../data/journal-store.js";

function domainRef(uuid) {
  return { recordType: RECORD_TYPES.DOMAIN, uuid, entityId: null };
}

function operationId(value = null) {
  return String(value ?? "").trim() || foundry.utils.randomID();
}

async function run(commandType, domainUuid, payload, requestedOperationId) {
  await dispatchAuthoritativeCommand({
    commandType,
    operationId: operationId(requestedOperationId),
    payload: { domain: domainRef(domainUuid), ...payload }
  }, { callerUserId: game.user.id });
  return getRecord(domainUuid);
}

export async function updatePopulationSummaryAction({
  domainUuid,
  expectedModifiedTime,
  total,
  countMode,
  operationId: requestedOperationId = null
}) {
  const domain = await getRecord(domainUuid);
  return run(COMMAND_TYPES.POPULATION_CONFIGURE, domainUuid, {
    expectedModifiedTime,
    total,
    countMode,
    morale: domain.data.population?.morale ?? 60
  }, requestedOperationId);
}

export async function upsertGroupAction({
  domainUuid,
  expectedModifiedTime,
  localId = null,
  name,
  count,
  includedInTotal,
  function: functionName,
  quality,
  status,
  assignment,
  operationId: requestedOperationId = null
}) {
  const domain = await getRecord(domainUuid);
  const existing = localId
    ? (domain.data.population?.groups ?? []).find((entry) => entry.localId === localId)
    : null;
  return run(COMMAND_TYPES.POPULATION_GROUP_UPSERT, domainUuid, {
    expectedModifiedTime,
    localId,
    name,
    count,
    includedInTotal,
    function: functionName,
    quality,
    status,
    assignment,
    morale: existing?.morale ?? 60,
    workforceEligible: existing?.workforceEligible ?? count
  }, requestedOperationId);
}

export function removeGroupAction({
  domainUuid,
  expectedModifiedTime,
  localId,
  operationId: requestedOperationId = null
}) {
  return run(COMMAND_TYPES.POPULATION_GROUP_REMOVE, domainUuid, {
    expectedModifiedTime,
    localId
  }, requestedOperationId);
}

function embeddedNotableUnsupported() {
  throw new Error("Notables embutidos legados são somente leitura. Migre o cadastro e use um Person record independente.");
}

export async function upsertNotableAction() { return embeddedNotableUnsupported(); }
export async function removeNotableAction() { return embeddedNotableUnsupported(); }
