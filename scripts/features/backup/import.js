/**
 * Validação e Importação de Dados do Mundo (Backup Restore).
 */

import { MODULE_ID, RECORD_TYPES } from "../../core/constants.js";
import { upsertResourceInCatalog } from "../economy/rules.js";
import { BACKUP_SCHEMA_VERSION } from "./export.js";

const COLLECTIONS = Object.freeze([
  { key: "domains", recordType: RECORD_TYPES.DOMAIN, fallbackName: "Domínio Importado" },
  { key: "projects", recordType: RECORD_TYPES.PROJECT, fallbackName: "Projeto Importado" },
  { key: "requests", recordType: RECORD_TYPES.REQUEST, fallbackName: "Solicitação Importada" },
  { key: "missions", recordType: RECORD_TYPES.MISSION, fallbackName: "Missão Importada" },
  { key: "squads", recordType: RECORD_TYPES.SQUAD, fallbackName: "Squad Importado" },
  { key: "people", recordType: RECORD_TYPES.PERSON, fallbackName: "Person Importado" },
  { key: "structures", recordType: RECORD_TYPES.STRUCTURE, fallbackName: "Structure Importada" },
  { key: "agreements", recordType: RECORD_TYPES.AGREEMENT, fallbackName: "Agreement Importado" }
]);

function collection(data, key) {
  return Array.isArray(data?.[key]) ? data[key] : [];
}

export function validateImportPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return { valid: false, error: "Arquivo de backup inválido ou vazio." };
  }

  const version = Number(payload.schemaVersion ?? 0);
  if (!version || version > BACKUP_SCHEMA_VERSION) {
    return {
      valid: false,
      error: `Versão de backup incompatível (${payload.schemaVersion ?? "desconhecida"}). Este módulo suporta até v${BACKUP_SCHEMA_VERSION}.`
    };
  }

  const data = payload.data ?? payload;
  const catalog = data.catalog ?? { resources: [] };
  const resources = Array.isArray(catalog.resources)
    ? catalog.resources
    : (Array.isArray(catalog) ? catalog : []);

  const summary = {
    resourceCount: resources.length,
    exportedAt: payload.exportedAt ?? null,
    sourceVersion: payload.moduleVersion ?? null
  };

  for (const { key } of COLLECTIONS) {
    const singular = key === "people" ? "person" : key.replace(/s$/, "");
    summary[`${singular}Count`] = collection(data, key).length;
  }

  return { valid: true, summary };
}


export function prepareImportedRecordData(rawRecordData, existingEntityId = null) {
  const source = rawRecordData && typeof rawRecordData === "object"
    ? rawRecordData
    : {};
  if (!source.entityId && existingEntityId) {
    return { ...source, entityId: existingEntityId };
  }
  return source;
}

function findExistingDocument(recordIndex, recordType, incoming) {
  const entityId = incoming?.data?.entityId ?? incoming?.entityId ?? null;
  if (entityId) {
    const byEntityId = recordIndex.getByEntityId(entityId);
    if (byEntityId?.getFlag?.(MODULE_ID, "recordType") === recordType) {
      return byEntityId;
    }
  }

  const uuid = incoming?.uuid ?? null;
  return uuid ? recordIndex.get(recordType, uuid) : null;
}

export async function executeWorldImport({ payload, mode = "merge" } = {}) {
  if (typeof game !== "undefined" && !game.user?.isGM) {
    throw new Error("Apenas o Mestre (GM) possui autoridade para importar dados do mundo.");
  }

  const validation = validateImportPayload(payload);
  if (!validation.valid) throw new Error(validation.error);
  if (!["merge", "overwrite"].includes(mode)) {
    throw new Error(`Modo de importação inválido: ${mode}`);
  }

  const { recordIndex } = await import("../../data/record-index.js");
  const { createRecord, updateRecord } = await import("../../data/journal-store.js");
  const { getResourceCatalogSetting, setResourceCatalogSetting } = await import("../../core/settings.js");

  const data = payload.data ?? payload;
  const rawCatalog = data.catalog ?? { version: 1, resources: [] };
  const incomingResources = Array.isArray(rawCatalog.resources)
    ? rawCatalog.resources
    : (Array.isArray(rawCatalog) ? rawCatalog : []);

  let finalCatalog;
  if (mode === "overwrite") {
    finalCatalog = {
      version: Number(rawCatalog.version ?? 1),
      resources: incomingResources.map((resource) => ({ ...resource }))
    };
  } else {
    finalCatalog = JSON.parse(JSON.stringify(
      typeof getResourceCatalogSetting === "function"
        ? getResourceCatalogSetting()
        : { version: 1, resources: [] }
    ));
    for (const resource of incomingResources) {
      try {
        finalCatalog = upsertResourceInCatalog(finalCatalog, resource, {
          originalId: finalCatalog.resources?.some((entry) => entry.id === resource.id)
            ? resource.id
            : null
        });
      } catch (err) {
        console.warn("[Domain Manager] Ignorando recurso inválido no merge:", resource?.id, err);
      }
    }
  }

  if (typeof setResourceCatalogSetting === "function") {
    await setResourceCatalogSetting(finalCatalog);
  }

  const imported = { catalog: finalCatalog };

  for (const spec of COLLECTIONS) {
    const incoming = collection(data, spec.key);
    let count = 0;

    for (const item of incoming) {
      const rawRecordData = item.data ?? item;
      const name = item.name ?? spec.fallbackName;
      const existingDoc = findExistingDocument(recordIndex, spec.recordType, item);
      const existingEntityId = existingDoc?.getFlag?.(MODULE_ID, "data")?.entityId ?? null;
      const recordData = prepareImportedRecordData(rawRecordData, existingEntityId);

      if (existingDoc) {
        await updateRecord({
          uuid: existingDoc.uuid,
          recordType: spec.recordType,
          name,
          data: recordData
        });
      } else {
        await createRecord({
          name,
          recordType: spec.recordType,
          data: recordData
        });
      }
      count++;
    }

    const singular = spec.key === "people" ? "person" : spec.key.replace(/s$/, "");
    imported[`${singular}Count`] = count;
  }

  return { success: true, mode, imported };
}
