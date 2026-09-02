/**
 * Ações e Mutações do Bloco 12: Crônicas e Histórico (History Actions).
 */

import { RECORD_TYPES } from "../../core/constants.js";
import { recordIndex } from "../../data/record-index.js";
import { decodeRecord } from "../../models/record-codec.js";
import { updateRecord } from "../../data/journal-store.js";
import { validateHistoryEventData } from "./rules.js";

function generateLocalId(prefix = "hist") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export async function addHistoryEvent({
  domainUuid,
  title,
  category = "story",
  summary = "",
  details = "",
  significance = "minor",
  tick = null,
  visibility = "all"
}) {
  if (!game.user.isGM) throw new Error("Apenas o Mestre pode registrar crônicas ou eventos no histórico.");

  const doc = recordIndex.get(RECORD_TYPES.DOMAIN, domainUuid);
  if (!doc) throw new Error(`Domínio '${domainUuid}' não encontrado.`);

  const decoded = decodeRecord(doc);
  const data = foundry.utils.deepClone(decoded.data);

  if (!Array.isArray(data.history)) data.history = [];

  const eventObj = {
    localId: generateLocalId("hist"),
    timestamp: Date.now(),
    tick: tick !== null && tick !== undefined ? Number(tick) : null,
    title: String(title ?? "").trim(),
    category,
    summary: String(summary ?? "").trim(),
    details: String(details ?? "").trim(),
    significance,
    visibility
  };

  validateHistoryEventData(eventObj);
  data.history.push(eventObj);

  return updateRecord({
    uuid: domainUuid,
    recordType: RECORD_TYPES.DOMAIN,
    data
  });
}

export async function removeHistoryEvent({ domainUuid, localId }) {
  if (!game.user.isGM) throw new Error("Apenas o Mestre pode remover registros do histórico.");

  const doc = recordIndex.get(RECORD_TYPES.DOMAIN, domainUuid);
  if (!doc) throw new Error(`Domínio '${domainUuid}' não encontrado.`);

  const decoded = decodeRecord(doc);
  const data = foundry.utils.deepClone(decoded.data);

  data.history = (data.history ?? []).filter((h) => h.localId !== localId);

  return updateRecord({
    uuid: domainUuid,
    recordType: RECORD_TYPES.DOMAIN,
    data
  });
}

export async function clearHistory({ domainUuid }) {
  if (!game.user.isGM) throw new Error("Apenas o Mestre pode limpar o histórico.");

  const doc = recordIndex.get(RECORD_TYPES.DOMAIN, domainUuid);
  if (!doc) throw new Error(`Domínio '${domainUuid}' não encontrado.`);

  const decoded = decodeRecord(doc);
  const data = foundry.utils.deepClone(decoded.data);

  data.history = [];

  return updateRecord({
    uuid: domainUuid,
    recordType: RECORD_TYPES.DOMAIN,
    data
  });
}

