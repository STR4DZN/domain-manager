/**
 * Ações e Mutações do Bloco 10: Relações e Acordos Diplomáticos.
 */

import { RECORD_TYPES } from "../../core/constants.js";
import { recordIndex } from "../../data/record-index.js";
import { decodeRecord } from "../../models/record-codec.js";
import { updateRecord } from "../../data/journal-store.js";
import { validateRelationData, validateAgreementData } from "./rules.js";

function generateLocalId(prefix = "rel") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export async function addRelation({ domainUuid, targetDomainUuid, posture = "neutral", notes = "" }) {
  if (!game.user.isGM) throw new Error("Apenas o Mestre pode alterar relações diplomáticas.");

  const doc = recordIndex.get(RECORD_TYPES.DOMAIN, domainUuid);
  if (!doc) throw new Error(`Domínio '${domainUuid}' não encontrado.`);

  const decoded = decodeRecord(doc);
  const data = foundry.utils.deepClone(decoded.data);

  if (!Array.isArray(data.relations)) data.relations = [];

  const existingIndex = data.relations.findIndex((r) => r.targetDomainUuid === targetDomainUuid);
  const relationObj = {
    localId: existingIndex >= 0 ? data.relations[existingIndex].localId : generateLocalId("rel"),
    targetDomainUuid,
    posture,
    notes: String(notes ?? "").trim()
  };

  validateRelationData(relationObj);

  if (existingIndex >= 0) {
    data.relations[existingIndex] = relationObj;
  } else {
    data.relations.push(relationObj);
  }

  return updateRecord({
    uuid: domainUuid,
    recordType: RECORD_TYPES.DOMAIN,
    data
  });
}

export async function updateRelation({ domainUuid, localId, changes = {} }) {
  if (!game.user.isGM) throw new Error("Apenas o Mestre pode alterar relações diplomáticas.");

  const doc = recordIndex.get(RECORD_TYPES.DOMAIN, domainUuid);
  if (!doc) throw new Error(`Domínio '${domainUuid}' não encontrado.`);

  const decoded = decodeRecord(doc);
  const data = foundry.utils.deepClone(decoded.data);

  const list = data.relations ?? [];
  const idx = list.findIndex((r) => r.localId === localId);
  if (idx === -1) throw new Error(`Relação '${localId}' não encontrada.`);

  const merged = { ...list[idx], ...changes, localId };
  validateRelationData(merged);
  list[idx] = merged;
  data.relations = list;

  return updateRecord({
    uuid: domainUuid,
    recordType: RECORD_TYPES.DOMAIN,
    data
  });
}

export async function removeRelation({ domainUuid, localId }) {
  if (!game.user.isGM) throw new Error("Apenas o Mestre pode remover relações diplomáticas.");

  const doc = recordIndex.get(RECORD_TYPES.DOMAIN, domainUuid);
  if (!doc) throw new Error(`Domínio '${domainUuid}' não encontrado.`);

  const decoded = decodeRecord(doc);
  const data = foundry.utils.deepClone(decoded.data);

  data.relations = (data.relations ?? []).filter((r) => r.localId !== localId);

  return updateRecord({
    uuid: domainUuid,
    recordType: RECORD_TYPES.DOMAIN,
    data
  });
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
