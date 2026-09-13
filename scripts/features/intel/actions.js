/**
 * APIs legadas de Intel.
 *
 * Compatibilidade apenas: toda mutação persistente passa pelo Command Kernel.
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

export async function addIntel({
  domainUuid,
  title,
  category = "fact",
  visibility = "all_controllers",
  content = "",
  credibility = "confirmed",
  source = "",
  tags = [],
  operationId: id = null
}) {
  const domain = await getRecord(domainUuid);
  return run(COMMAND_TYPES.INTEL_UPSERT, domainUuid, {
    expectedModifiedTime: domain.document?._stats?.modifiedTime ?? null,
    title,
    category,
    visibility,
    content,
    credibility,
    source,
    tags
  }, id);
}

export async function updateIntel({ domainUuid, localId, changes = {}, operationId: id = null }) {
  const domain = await getRecord(domainUuid);
  const existing = (domain.data.intel ?? []).find((entry) => entry.localId === localId);
  if (!existing) throw new Error(`Informação '${localId}' não encontrada.`);

  const merged = { ...existing, ...changes, localId };
  return run(COMMAND_TYPES.INTEL_UPSERT, domainUuid, {
    expectedModifiedTime: domain.document?._stats?.modifiedTime ?? null,
    localId,
    title: merged.title,
    category: merged.category,
    visibility: merged.visibility,
    targetDomain: merged.targetDomain ?? null,
    content: merged.content,
    credibility: merged.credibility,
    source: merged.source,
    revealed: merged.revealed,
    tags: merged.tags
  }, id);
}

export async function removeIntel({ domainUuid, localId, operationId: id = null }) {
  const domain = await getRecord(domainUuid);
  return run(COMMAND_TYPES.INTEL_REMOVE, domainUuid, { expectedModifiedTime: domain.document?._stats?.modifiedTime ?? null, localId }, id);
}

export async function revealIntel({ domainUuid, localId, operationId: id = null }) {
  const domain = await getRecord(domainUuid);
  return run(COMMAND_TYPES.INTEL_REVEAL, domainUuid, { expectedModifiedTime: domain.document?._stats?.modifiedTime ?? null, localId }, id);
}
