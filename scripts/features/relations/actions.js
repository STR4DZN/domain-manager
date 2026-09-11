/**
 * APIs legadas de Relations.
 *
 * Relações diplomáticas modernas passam exclusivamente pelo Command Kernel.
 * Os helpers de Agreement embutido permanecem abaixo como compatibilidade
 * histórica separada: o modelo oficial de novos tratados é Agreement record.
 */

import { COMMAND_TYPES, RECORD_TYPES } from "../../core/constants.js";
import { dispatchAuthoritativeCommand } from "../../commands/execute.js";
import { getRecord, updateRecord } from "../../data/journal-store.js";
import { recordIndex } from "../../data/record-index.js";
import { decodeRecord } from "../../models/record-codec.js";
import { validateAgreementData } from "./rules.js";

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
  return runRelation(COMMAND_TYPES.RELATION_UPSERT, domainUuid, {
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
  return runRelation(
    COMMAND_TYPES.RELATION_REMOVE,
    domainUuid,
    { localId },
    requestedOperationId
  );
}

/*
 * Compatibility boundary — embedded Agreements.
 *
 * Estes três helpers são anteriores ao Agreement record independente criado no
 * schema moderno. Não existe equivalência 1:1 segura para update/remove por
 * localId (o Command Kernel opera Agreement por UUID/entityId e não oferece
 * hard-delete). Mantê-los isolados evita fabricar provenance, duração ou
 * identidade durante uma consolidação de Relations que não é migration.
 */
function generateLocalId(prefix = "agr") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export async function addAgreement({
  domainUuid,
  name,
  targetDomainUuid,
  type = "trade_pact",
  transfers = [],
  durationTicks = null,
  notes = ""
}) {
  if (!game.user.isGM) throw new Error("Apenas o Mestre pode criar acordos diplomáticos.");

  const doc = recordIndex.get(RECORD_TYPES.DOMAIN, domainUuid);
  if (!doc) throw new Error(`Domínio '${domainUuid}' não encontrado.`);

  const decoded = decodeRecord(doc);
  const data = foundry.utils.deepClone(decoded.data);

  if (!Array.isArray(data.agreements)) data.agreements = [];

  const agreementObj = {
    localId: generateLocalId("agr"),
    name: String(name ?? "Acordo").trim(),
    targetDomainUuid,
    type,
    transfers: Array.isArray(transfers) ? transfers : [],
    durationTicks: typeof durationTicks === "number" && durationTicks > 0 ? durationTicks : null,
    remainingTicks: typeof durationTicks === "number" && durationTicks > 0 ? durationTicks : null,
    status: "active",
    notes: String(notes ?? "").trim()
  };

  validateAgreementData(agreementObj);
  data.agreements.push(agreementObj);

  return updateRecord({
    uuid: domainUuid,
    recordType: RECORD_TYPES.DOMAIN,
    data
  });
}

export async function updateAgreement({ domainUuid, localId, changes = {} }) {
  if (!game.user.isGM) throw new Error("Apenas o Mestre pode alterar acordos diplomáticos.");

  const doc = recordIndex.get(RECORD_TYPES.DOMAIN, domainUuid);
  if (!doc) throw new Error(`Domínio '${domainUuid}' não encontrado.`);

  const decoded = decodeRecord(doc);
  const data = foundry.utils.deepClone(decoded.data);

  const list = data.agreements ?? [];
  const idx = list.findIndex((a) => a.localId === localId);
  if (idx === -1) throw new Error(`Acordo '${localId}' não encontrado.`);

  const merged = { ...list[idx], ...changes, localId };
  validateAgreementData(merged);
  list[idx] = merged;
  data.agreements = list;

  return updateRecord({
    uuid: domainUuid,
    recordType: RECORD_TYPES.DOMAIN,
    data
  });
}

export async function removeAgreement({ domainUuid, localId }) {
  if (!game.user.isGM) throw new Error("Apenas o Mestre pode remover acordos diplomáticos.");

  const doc = recordIndex.get(RECORD_TYPES.DOMAIN, domainUuid);
  if (!doc) throw new Error(`Domínio '${domainUuid}' não encontrado.`);

  const decoded = decodeRecord(doc);
  const data = foundry.utils.deepClone(decoded.data);

  data.agreements = (data.agreements ?? []).filter((a) => a.localId !== localId);

  return updateRecord({
    uuid: domainUuid,
    recordType: RECORD_TYPES.DOMAIN,
    data
  });
}
