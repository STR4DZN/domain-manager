/**
 * Bloco 14 — Backup & Exportação de Dados do Mundo.
 */

import { MODULE_VERSION } from "../../core/constants.js";

/**
 * Cria a estrutura completa de exportação do mundo em formato serializável.
 * @param {Object} params
 * @param {Object} params.catalog - Catálogo de recursos
 * @param {Array} params.domains - Lista de domínios decodificados
 * @param {Array} params.projects - Lista de projetos decodificados
 * @param {Array} params.requests - Lista de solicitações decodificadas
 * @param {Array} params.missions - Lista de missões decodificadas
 * @param {Object} [params.options]
 * @param {boolean} [params.options.includeHistory=true] - Se deve incluir crônicas/histórico
 * @param {boolean} [params.options.includeIntel=true] - Se deve incluir segredos/conhecimento
 * @returns {Object} Payload exportável
 */
export function createWorldExportPayload({
  catalog = { version: 1, resources: [] },
  domains = [],
  projects = [],
  requests = [],
  missions = [],
  options = {}
} = {}) {
  const includeHistory = options.includeHistory !== false;
  const includeIntel = options.includeIntel !== false;

  const normalizedDomains = (domains ?? []).map((dom) => {
    const rawData = dom.data ? JSON.parse(JSON.stringify(dom.data)) : JSON.parse(JSON.stringify(dom));
    if (!includeHistory && rawData.history) rawData.history = [];
    if (!includeIntel && rawData.intel) rawData.intel = [];

    return {
      uuid: dom.uuid ?? "",
      name: dom.name ?? "Domínio",
      data: rawData
    };
  });

  const normalizedProjects = (projects ?? []).map((proj) => ({
    uuid: proj.uuid ?? "",
    name: proj.name ?? "Projeto",
    data: proj.data ? JSON.parse(JSON.stringify(proj.data)) : JSON.parse(JSON.stringify(proj))
  }));

  const normalizedRequests = (requests ?? []).map((req) => ({
    uuid: req.uuid ?? "",
    name: req.name ?? "Solicitação",
    data: req.data ? JSON.parse(JSON.stringify(req.data)) : JSON.parse(JSON.stringify(req))
  }));

  const normalizedMissions = (missions ?? []).map((mis) => ({
    uuid: mis.uuid ?? "",
    name: mis.name ?? "Missão",
    data: mis.data ? JSON.parse(JSON.stringify(mis.data)) : JSON.parse(JSON.stringify(mis))
  }));

  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    generator: "Domain Manager for Foundry VTT",
    moduleVersion: MODULE_VERSION || "0.1.0-dev.55",
    data: {
      catalog: JSON.parse(JSON.stringify(catalog)),
      domains: normalizedDomains,
      projects: normalizedProjects,
      requests: normalizedRequests,
      missions: normalizedMissions
    }
  };
}
