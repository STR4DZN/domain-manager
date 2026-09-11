/**
 * Backup & Exportação de Dados do Mundo.
 */

import { MODULE_VERSION } from "../../core/constants.js";

export const BACKUP_SCHEMA_VERSION = 2;

function normalizeRecordList(records, fallbackName, transformData = null) {
  return (records ?? []).map((record) => {
    const rawData = record.data
      ? JSON.parse(JSON.stringify(record.data))
      : JSON.parse(JSON.stringify(record));
    const data = transformData ? transformData(rawData) : rawData;
    return {
      uuid: record.uuid ?? "",
      name: record.name ?? fallbackName,
      data
    };
  });
}

export function createWorldExportPayload({
  catalog = { version: 1, resources: [] },
  domains = [],
  projects = [],
  requests = [],
  missions = [],
  squads = [],
  people = [],
  structures = [],
  agreements = [],
  options = {}
} = {}) {
  const includeHistory = options.includeHistory !== false;
  const includeIntel = options.includeIntel !== false;

  const normalizedDomains = normalizeRecordList(domains, "Domínio", (rawData) => {
    if (!includeHistory && rawData.history) rawData.history = [];
    if (!includeIntel && rawData.intel) rawData.intel = [];
    return rawData;
  });

  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    generator: "Domain Manager for Foundry VTT",
    moduleVersion: MODULE_VERSION,
    data: {
      catalog: JSON.parse(JSON.stringify(catalog)),
      domains: normalizedDomains,
      projects: normalizeRecordList(projects, "Projeto"),
      requests: normalizeRecordList(requests, "Solicitação"),
      missions: normalizeRecordList(missions, "Missão"),
      squads: normalizeRecordList(squads, "Squad"),
      people: normalizeRecordList(people, "Person"),
      structures: normalizeRecordList(structures, "Structure"),
      agreements: normalizeRecordList(agreements, "Agreement")
    }
  };
}
