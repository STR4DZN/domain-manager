/**
 * Ações e Mutações do Bloco 11: Segredos e Conhecimento (Intel).
 */

import { RECORD_TYPES } from "../../core/constants.js";
import { recordIndex } from "../../data/record-index.js";
import { decodeRecord } from "../../models/record-codec.js";
import { updateRecord } from "../../data/journal-store.js";
import { validateIntelData } from "./rules.js";

function generateLocalId(prefix = "intel") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export async function addIntel({
  domainUuid,
  title,
  category = "fact",
  visibility = "all_controllers",
  content = "",
  credibility = "confirmed",
  source = "",
  tags = []
}) {
  if (!game.user.isGM) throw new Error("Apenas o Mestre pode registrar novas informações ou segredos.");

  const doc = recordIndex.get(RECORD_TYPES.DOMAIN, domainUuid);
  if (!doc) throw new Error(`Domínio '${domainUuid}' não encontrado.`);

  const decoded = decodeRecord(doc);
  const data = foundry.utils.deepClone(decoded.data);

  if (!Array.isArray(data.intel)) data.intel = [];

  const intelObj = {
    localId: generateLocalId("intel"),
    title: String(title ?? "").trim(),
    category,
    visibility,
    content: String(content ?? "").trim(),
    credibility,
    source: String(source ?? "").trim(),
    revealed: visibility === "public",
    tags: Array.isArray(tags) ? tags : []
  };

  validateIntelData(intelObj);
  data.intel.push(intelObj);

  return updateRecord({
    uuid: domainUuid,
    recordType: RECORD_TYPES.DOMAIN,
    data
  });
}

export async function updateIntel({ domainUuid, localId, changes = {} }) {
  if (!game.user.isGM) throw new Error("Apenas o Mestre pode alterar informações ou segredos.");

  const doc = recordIndex.get(RECORD_TYPES.DOMAIN, domainUuid);
  if (!doc) throw new Error(`Domínio '${domainUuid}' não encontrado.`);

  const decoded = decodeRecord(doc);
  const data = foundry.utils.deepClone(decoded.data);

  const list = data.intel ?? [];
  const idx = list.findIndex((i) => i.localId === localId);
  if (idx === -1) throw new Error(`Informação '${localId}' não encontrada.`);

  const merged = { ...list[idx], ...changes, localId };
  validateIntelData(merged);
  list[idx] = merged;
  data.intel = list;

  return updateRecord({
    uuid: domainUuid,
    recordType: RECORD_TYPES.DOMAIN,
    data
  });
}

export async function removeIntel({ domainUuid, localId }) {
  if (!game.user.isGM) throw new Error("Apenas o Mestre pode remover informações ou segredos.");

  const doc = recordIndex.get(RECORD_TYPES.DOMAIN, domainUuid);
  if (!doc) throw new Error(`Domínio '${domainUuid}' não encontrado.`);

  const decoded = decodeRecord(doc);
  const data = foundry.utils.deepClone(decoded.data);

  data.intel = (data.intel ?? []).filter((i) => i.localId !== localId);

  return updateRecord({
    uuid: domainUuid,
    recordType: RECORD_TYPES.DOMAIN,
    data
  });
}

export async function revealIntel({ domainUuid, localId }) {
  if (!game.user.isGM) throw new Error("Apenas o Mestre pode revelar segredos aos jogadores.");

  return updateIntel({
    domainUuid,
    localId,
    changes: { visibility: "public", revealed: true }
  });
}

