const GLOBAL_VIEWS = Object.freeze([
  { id: "command", label: "Comando", icon: "fa-solid fa-grid-2", scope: "global" },
  { id: "domains", label: "Registro", icon: "fa-solid fa-sitemap", scope: "global" },
  { id: "operations", label: "Rede Ops", icon: "fa-solid fa-crosshairs", scope: "global" },
  { id: "system", label: "Sistema", icon: "fa-solid fa-wave-square", scope: "global", gmOnly: true }
]);

const DOMAIN_VIEWS = Object.freeze([
  { id: "overview", label: "Overview", icon: "fa-solid fa-chart-network", always: true, workspace: "command" },
  { id: "requests", label: "Requests", icon: "fa-solid fa-inbox", always: true, workspace: "command" },
  { id: "history", label: "Chronology", icon: "fa-solid fa-clock-rotate-left", always: true, workspace: "command" },
  { id: "structures", label: "Infrastructure", icon: "fa-solid fa-building-shield", capability: "structures", workspace: "base" },
  { id: "economy", label: "Logistics", icon: "fa-solid fa-coins", capability: "economy", workspace: "base" },
  { id: "projects", label: "Projects", icon: "fa-solid fa-bars-progress", capability: "projects", workspace: "base" },
  { id: "missions", label: "Missions", icon: "fa-solid fa-location-crosshairs", capability: "missions", workspace: "operations" },
  { id: "squads", label: "Forces", icon: "fa-solid fa-person-military-rifle", capability: "squads", workspace: "operations" },
  { id: "security", label: "Defense", icon: "fa-solid fa-shield-halved", capability: "security", workspace: "operations" },
  { id: "population", label: "Population", icon: "fa-solid fa-people-group", capability: "population", workspace: "civil" },
  { id: "people", label: "Personnel", icon: "fa-solid fa-id-card", capability: "people", workspace: "civil" },
  { id: "intel", label: "Intelligence", icon: "fa-solid fa-satellite-dish", capability: "intel", workspace: "intel" },
  { id: "territory", label: "Territory", icon: "fa-solid fa-map", capability: "territory", workspace: "intel" },
  { id: "diplomacy", label: "Relations", icon: "fa-solid fa-handshake", capability: "diplomacy", workspace: "intel" }
]);

const WORKSPACE_GROUPS = Object.freeze([
  { id: "command", label: "Command", code: "CMD", icon: "fa-solid fa-command", preferred: ["overview", "requests", "history"] },
  { id: "base", label: "Base", code: "BAS", icon: "fa-solid fa-industry-windows", preferred: ["structures", "economy", "projects"] },
  { id: "operations", label: "Operations", code: "OPS", icon: "fa-solid fa-crosshairs", preferred: ["missions", "squads", "security"] },
  { id: "civil", label: "Civil", code: "CIV", icon: "fa-solid fa-people-group", preferred: ["population", "people"] },
  { id: "intel", label: "Intelligence", code: "INT", icon: "fa-solid fa-satellite-dish", preferred: ["intel", "territory", "diplomacy"] }
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

export function buildWorkspaceNavigation(domainData, { activeView = "overview" } = {}) {
  const availableViews = buildDomainNavigation(domainData, { activeView });
  const byId = new Map(availableViews.map((view) => [view.id, view]));
  return WORKSPACE_GROUPS.flatMap((group) => {
    const children = group.preferred.map((id) => byId.get(id)).filter(Boolean);
    if (!children.length) return [];
    const active = children.some((view) => view.id === activeView) || (activeView === "command" && group.id === "command");
    const primary = children[0];
    return [{
      ...group,
      active,
      view: primary.id,
      children,
      childCount: children.length
    }];
  });
}

export function resolveWorkspaceForView(viewId = "overview") {
  return WORKSPACE_GROUPS.find((group) => group.preferred.includes(viewId))?.id ?? "command";
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
  domain: DOMAIN_VIEWS,
  workspaces: WORKSPACE_GROUPS
});
