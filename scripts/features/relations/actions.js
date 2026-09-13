/**
 * APIs legadas de Relations.
 *
 * Relações diplomáticas modernas passam exclusivamente pelo Command Kernel.
 * Os nomes legados de Agreement embutido permanecem apenas para emitir uma
 * orientação de migração; o modelo oficial é o Agreement record independente.
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

async function runRelation(commandType, domainUuid, payload, requestedOperationId) {
  await dispatchAuthoritativeCommand({
    commandType,
    operationId: operationId(requestedOperationId),
    payload: { domain: domainRef(domainUuid), ...payload }
  }, { callerUserId: game.user.id });
  return getRecord(domainUuid);
}

export async function addRelation({
  domainUuid,
  targetDomainUuid,
  posture = "neutral",
  notes = "",
  operationId: requestedOperationId = null
}) {
  const domain = await getRecord(domainUuid);
  return runRelation(COMMAND_TYPES.RELATION_UPSERT, domainUuid, {
    expectedModifiedTime: domain.document?._stats?.modifiedTime ?? null,
    target: domainRef(targetDomainUuid),
    posture,
    score: 0,
    trust: 50,
    tension: 0,
    notes
  }, requestedOperationId);
}

export async function updateRelation({
  domainUuid,
  localId,
  changes = {},
  operationId: requestedOperationId = null
}) {
  const domain = await getRecord(domainUuid);
  const existing = (domain.data.relations ?? []).find((entry) => entry.localId === localId);
  if (!existing) throw new Error(`Relação '${localId}' não encontrada.`);

  const merged = { ...existing, ...changes, localId };
  const targetUuid = merged.target?.uuid ?? merged.targetDomainUuid;
  const targetEntityId = merged.target?.entityId ?? null;

  return runRelation(COMMAND_TYPES.RELATION_UPSERT, domainUuid, {
    expectedModifiedTime: domain.document?._stats?.modifiedTime ?? null,
    localId,
    target: {
      recordType: RECORD_TYPES.DOMAIN,
      uuid: targetUuid ?? null,
      entityId: targetEntityId
    },
    posture: merged.posture ?? "neutral",
    score: merged.score ?? 0,
    trust: merged.trust ?? 50,
    tension: merged.tension ?? 0,
    notes: merged.notes ?? ""
  }, requestedOperationId);
}

export async function removeRelation({
  domainUuid,
  localId,
  operationId: requestedOperationId = null
}) {
  const domain = await getRecord(domainUuid);
  return runRelation(
    COMMAND_TYPES.RELATION_REMOVE,
    domainUuid,
    { expectedModifiedTime: domain.document?._stats?.modifiedTime ?? null, localId },
    requestedOperationId
  );
}

/*
 * Compatibility boundary — embedded Agreements.
 *
 * O formato antigo gravava tratados anônimos dentro do Domain e permitia
 * hard-delete fora do Command Kernel. Ele não possui identidade suficiente
 * para ser convertido com segurança em Agreement record. Os exports continuam
 * presentes para produzir um erro de migração explícito em vez de corromper ou
 * duplicar dados silenciosamente.
 */
function embeddedAgreementUnsupported() {
  throw new Error("Acordos embutidos legados são somente leitura. Migre o registro e use Agreement independente pelo Command Kernel.");
}

export async function addAgreement() { return embeddedAgreementUnsupported(); }
export async function updateAgreement() { return embeddedAgreementUnsupported(); }
export async function removeAgreement() { return embeddedAgreementUnsupported(); }
