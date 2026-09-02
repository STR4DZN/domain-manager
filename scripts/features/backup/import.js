/**
 * Bloco 14 — Validação e Importação de Dados do Mundo (Backup Restore).
 */

import { RECORD_TYPES } from "../../core/constants.js";
import { upsertResourceInCatalog } from "../economy/rules.js";

/**
 * Valida o payload de importação antes de executar qualquer alteração.
 * @param {Object} payload - Objeto parseado do arquivo JSON de backup
 * @returns {Object} { valid: boolean, error?: string, summary?: Object }
 */
export function validateImportPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return { valid: false, error: "Arquivo de backup inválido ou vazio." };
  }

  if (!payload.schemaVersion || payload.schemaVersion > 1) {
    return {
      valid: false,
      error: `Versão de esquema incompatível (${payload.schemaVersion ?? "desconhecida"}). Este módulo suporta esquema v1.`
    };
  }

  const data = payload.data ?? payload;
  const catalog = data.catalog ?? { resources: [] };
  const domains = Array.isArray(data.domains) ? data.domains : [];
  const projects = Array.isArray(data.projects) ? data.projects : [];
  const requests = Array.isArray(data.requests) ? data.requests : [];
  const missions = Array.isArray(data.missions) ? data.missions : [];
  const resources = Array.isArray(catalog.resources) ? catalog.resources : (Array.isArray(catalog) ? catalog : []);

  return {
    valid: true,
    summary: {
      resourceCount: resources.length,
      domainCount: domains.length,
      projectCount: projects.length,
      requestCount: requests.length,
      missionCount: missions.length,
      exportedAt: payload.exportedAt ?? null,
      sourceVersion: payload.moduleVersion ?? null
    }
  };
}

/**
 * Executa a importação dos dados no mundo do Foundry VTT.
 * @param {Object} params
 * @param {Object} params.payload - Payload validado
 * @param {string} [params.mode="merge"] - "overwrite" ou "merge"
 * @returns {Promise<Object>} Resultado da importação
 */
export async function executeWorldImport({ payload, mode = "merge" } = {}) {
  if (typeof game !== "undefined" && !game.user?.isGM) {
    throw new Error("Apenas o Mestre (GM) possui autoridade para importar dados do mundo.");
  }

  const validation = validateImportPayload(payload);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const { recordIndex } = await import("../../data/record-index.js");
  const { createRecord, updateRecord } = await import("../../data/journal-store.js");
  const { getResourceCatalogSetting, setResourceCatalogSetting } = await import("../../core/settings.js");

  const data = payload.data ?? payload;
  const rawCatalog = data.catalog ?? { version: 1, resources: [] };
  const incomingResources = Array.isArray(rawCatalog.resources) ? rawCatalog.resources : (Array.isArray(rawCatalog) ? rawCatalog : []);
  const incomingDomains = Array.isArray(data.domains) ? data.domains : [];
  const incomingProjects = Array.isArray(data.projects) ? data.projects : [];
  const incomingRequests = Array.isArray(data.requests) ? data.requests : [];
  const incomingMissions = Array.isArray(data.missions) ? data.missions : [];

  let finalCatalog;
  if (mode === "overwrite") {
    finalCatalog = {
      version: 1,
      resources: incomingResources
    };
  } else {
    // Mode Merge: mesclar recursos no catálogo atual
    let currentCatalog = typeof getResourceCatalogSetting === "function" ? getResourceCatalogSetting() : { version: 1, resources: [] };
    finalCatalog = JSON.parse(JSON.stringify(currentCatalog));
    for (const res of incomingResources) {
      try {
        finalCatalog = upsertResourceInCatalog(finalCatalog, res, { overwrite: true });
      } catch (err) {
        console.warn("[Domain Manager] Ignorando recurso duplicado/inválido no merge:", res?.id, err);
      }
    }
  }

  if (typeof setResourceCatalogSetting === "function") {
    await setResourceCatalogSetting(finalCatalog);
  }

  // Importar Domínios
  const importedDomainUuids = [];
  for (const dom of incomingDomains) {
    const domainData = dom.data ?? dom;
    const name = dom.name ?? domainData.identity?.name ?? "Domínio Importado";
    
    // Se existir uuid e documento no recordIndex e mode === merge -> updateRecord
    const existingDoc = dom.uuid ? recordIndex.get(RECORD_TYPES.DOMAIN, dom.uuid) : null;
    if (existingDoc && mode === "merge") {
      await updateRecord({
        uuid: dom.uuid,
        recordType: RECORD_TYPES.DOMAIN,
        data: domainData
      });
      importedDomainUuids.push(dom.uuid);
    } else {
      const created = await createRecord({
        name,
        recordType: RECORD_TYPES.DOMAIN,
        data: domainData
      });
      importedDomainUuids.push(created?.uuid ?? dom.uuid);
    }
  }

  // Importar Projetos
  const importedProjectUuids = [];
  for (const proj of incomingProjects) {
    const projData = proj.data ?? proj;
    const name = proj.name ?? "Projeto Importado";
    const existingDoc = proj.uuid ? recordIndex.get(RECORD_TYPES.PROJECT, proj.uuid) : null;
    if (existingDoc && mode === "merge") {
      await updateRecord({
        uuid: proj.uuid,
        recordType: RECORD_TYPES.PROJECT,
        data: projData
      });
      importedProjectUuids.push(proj.uuid);
    } else {
      const created = await createRecord({
        name,
        recordType: RECORD_TYPES.PROJECT,
        data: projData
      });
      importedProjectUuids.push(created?.uuid ?? proj.uuid);
    }
  }

  // Importar Solicitações
  const importedRequestUuids = [];
  for (const req of incomingRequests) {
    const reqData = req.data ?? req;
    const name = req.name ?? "Solicitação Importada";
    const created = await createRecord({
      name,
      recordType: RECORD_TYPES.REQUEST,
      data: reqData
    });
    importedRequestUuids.push(created?.uuid ?? req.uuid);
  }

  // Importar Missões
  const importedMissionUuids = [];
  for (const mis of incomingMissions) {
    const misData = mis.data ?? mis;
    const name = mis.name ?? "Missão Importada";
    const created = await createRecord({
      name,
      recordType: RECORD_TYPES.MISSION,
      data: misData
    });
    importedMissionUuids.push(created?.uuid ?? mis.uuid);
  }

  return {
    success: true,
    mode,
    imported: {
      catalog: finalCatalog,
      domainCount: importedDomainUuids.length,
      projectCount: importedProjectUuids.length,
      requestCount: importedRequestUuids.length,
      missionCount: importedMissionUuids.length
    }
  };
}
