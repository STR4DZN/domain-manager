const GLOBAL_VIEWS = Object.freeze([
  { id: "command", label: "Comando", icon: "fa-solid fa-grid-2", scope: "global" },
  { id: "domains", label: "Domínios", icon: "fa-solid fa-sitemap", scope: "global" },
  { id: "operations", label: "Operações", icon: "fa-solid fa-crosshairs", scope: "global" },
  { id: "system", label: "Sistema", icon: "fa-solid fa-wave-square", scope: "global", gmOnly: true }
]);

const DOMAIN_VIEWS = Object.freeze([
  { id: "overview", label: "Visão Geral", shortLabel: "Overview", icon: "fa-solid fa-chart-network", always: true },
  { id: "economy", label: "Economia", icon: "fa-solid fa-coins", capability: "economy" },
  { id: "population", label: "População", icon: "fa-solid fa-people-group", capability: "population" },
  { id: "people", label: "Pessoas", icon: "fa-solid fa-id-card", capability: "people" },
  { id: "structures", label: "Estruturas", icon: "fa-solid fa-building-shield", capability: "structures" },
  { id: "projects", label: "Projetos", icon: "fa-solid fa-bars-progress", capability: "projects" },
  { id: "squads", label: "Esquadrões", icon: "fa-solid fa-person-military-rifle", capability: "squads" },
  { id: "missions", label: "Missões", icon: "fa-solid fa-location-crosshairs", capability: "missions" },
  { id: "diplomacy", label: "Diplomacia", icon: "fa-solid fa-handshake", capability: "diplomacy" },
  { id: "territory", label: "Território", icon: "fa-solid fa-map", capability: "territory" },
  { id: "intel", label: "Inteligência", icon: "fa-solid fa-satellite-dish", capability: "intel" },
  { id: "security", label: "Segurança", icon: "fa-solid fa-shield-halved", capability: "security" },
  { id: "history", label: "Histórico", icon: "fa-solid fa-clock-rotate-left", always: true }
]);

export function buildGlobalNavigation({ isGM = false, activeView = "command" } = {}) {
  return GLOBAL_VIEWS
    .filter((view) => !view.gmOnly || isGM)
    .map((view) => ({ ...view, active: view.id === activeView }));
}

export function buildDomainNavigation(domainData, { activeView = "overview" } = {}) {
  const capabilities = domainData?.management?.capabilities ?? {};
  return DOMAIN_VIEWS
    .filter((view) => view.always || capabilities[view.capability] === true)
    .map((view) => ({ ...view, active: view.id === activeView }));
}

export function isDomainViewAvailable(domainData, viewId) {
  return buildDomainNavigation(domainData, { activeView: viewId }).some((view) => view.id === viewId);
}

export function normalizeViewForDomain(domainData, requestedView = "overview") {
  if (isDomainViewAvailable(domainData, requestedView)) return requestedView;
  return "overview";
}

export function listDomainViewIds(domainData) {
  return buildDomainNavigation(domainData).map((view) => view.id);
}

export const NAVIGATION_DEFINITIONS = Object.freeze({
  global: GLOBAL_VIEWS,
  domain: DOMAIN_VIEWS
});
