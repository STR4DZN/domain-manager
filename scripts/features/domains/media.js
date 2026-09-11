import { RECORD_TYPES } from "../../core/constants.js";
import { recordIndex } from "../../data/record-index.js";
import { updateRecord } from "../../data/journal-store.js";
import { decodeRecord } from "../../models/record-codec.js";

const STRING_VISUAL_FIELDS = new Set([
  "visuals.bannerImg",
  "visuals.crestImg",
  "visuals.image",
  "visuals.imageFit",
  "visuals.imagePosition",
  "visuals.themeColorHex"
]);

const NUMBER_VISUAL_FIELDS = new Set([
  "visuals.imageHeight",
  "visuals.imagePosX",
  "visuals.imagePosY",
  "visuals.imageZoom"
]);

function applyMediaField(data, fieldPath, value) {
  data.visuals ??= {};

  if (STRING_VISUAL_FIELDS.has(fieldPath)) {
    const key = fieldPath.slice("visuals.".length);
    data.visuals[key] = String(value ?? "").trim();
    return;
  }

  if (NUMBER_VISUAL_FIELDS.has(fieldPath)) {
    const key = fieldPath.slice("visuals.".length);
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) throw new Error(`Valor visual inválido para '${fieldPath}'.`);
    if (["imagePosX", "imagePosY"].includes(key)) data.visuals[key] = Math.max(0, Math.min(100, numeric));
    else if (key === "imageZoom") data.visuals[key] = Math.max(25, Math.min(400, numeric));
    else if (key === "imageHeight") data.visuals[key] = Math.max(80, Math.min(900, numeric));
    return;
  }

  if (fieldPath?.startsWith("population.notables.")) {
    const [, , notableId, property] = fieldPath.split(".");
    if (property !== "portrait") throw new Error(`Campo de mídia não permitido: '${fieldPath}'.`);
    const notable = data.population?.notables?.find((item) => item.localId === notableId);
    if (!notable) throw new Error(`Pessoa notável '${notableId}' não encontrada.`);
    notable.portrait = String(value ?? "").trim();
    return;
  }

  throw new Error(`Campo de mídia não permitido: '${fieldPath}'.`);
}

function getDomainDraft(domainUuid) {
  if (!domainUuid) throw new Error("Domínio é obrigatório.");
  const document = recordIndex.get(RECORD_TYPES.DOMAIN, domainUuid);
  if (!document) throw new Error(`Domínio '${domainUuid}' não encontrado.`);
  const record = decodeRecord(document);
  return foundry.utils.deepClone(record.data);
}

/** Atualiza um campo de mídia sem depender de dialogs ou DOM. */
export async function updateDomainMediaField({ domainUuid, fieldPath, value }) {
  return updateDomainMediaFields({ domainUuid, fields: [[fieldPath, value]] });
}

/** Atualiza vários campos visuais em uma única persistência. */
export async function updateDomainMediaFields({ domainUuid, fields = [] }) {
  const data = getDomainDraft(domainUuid);
  for (const [fieldPath, value] of fields) applyMediaField(data, fieldPath, value);
  return updateRecord({
    uuid: domainUuid,
    recordType: RECORD_TYPES.DOMAIN,
    data
  });
}
