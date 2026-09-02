import { RECORD_TYPES } from "../../core/constants.js";
import { recordIndex } from "../../data/record-index.js";
import { updateRecord } from "../../data/journal-store.js";
import { decodeRecord } from "../../models/record-codec.js";

const VISUAL_FIELDS = new Set([
  "visuals.bannerImg",
  "visuals.crestImg",
  "visuals.themeColorHex"
]);

/** Atualiza mídia persistida sem depender de FilePicker, dialogs ou DOM. */
export async function updateDomainMediaField({
  domainUuid,
  fieldPath,
  value
}) {
  if (!domainUuid) throw new Error("Domínio é obrigatório.");

  const document = recordIndex.get(RECORD_TYPES.DOMAIN, domainUuid);
  if (!document) throw new Error(`Domínio '${domainUuid}' não encontrado.`);

  const record = decodeRecord(document);
  const data = foundry.utils.deepClone(record.data);

  if (VISUAL_FIELDS.has(fieldPath)) {
    const key = fieldPath.slice("visuals.".length);
    data.visuals[key] = String(value ?? "").trim();
  } else if (fieldPath?.startsWith("population.notables.")) {
    const [, , notableId, property] = fieldPath.split(".");
    if (property !== "portrait") {
      throw new Error(`Campo de mídia não permitido: '${fieldPath}'.`);
    }

    const notable = data.population.notables.find(
      (item) => item.localId === notableId
    );
    if (!notable) throw new Error(`Pessoa notável '${notableId}' não encontrada.`);
    notable.portrait = String(value ?? "").trim();
  } else {
    throw new Error(`Campo de mídia não permitido: '${fieldPath}'.`);
  }

  return updateRecord({
    uuid: domainUuid,
    recordType: RECORD_TYPES.DOMAIN,
    data
  });
}
