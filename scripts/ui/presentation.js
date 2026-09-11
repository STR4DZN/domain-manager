function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

export function formatPercent(value) {
  return `${Math.round(clamp(value, 0, 100))}%`;
}

export function statusTone(value) {
  const normalized = String(value ?? "").toLowerCase();
  if (["destroyed", "failed", "hostile", "critical", "blocked", "breached", "dead"].includes(normalized)) return "critical";
  if (["damaged", "paused", "tense", "recovering", "warning", "injured", "inactive"].includes(normalized)) return "warning";
  if (["active", "operational", "ready", "allied", "friendly", "completed", "resolved", "nominal"].includes(normalized)) return "nominal";
  return "neutral";
}

export function meterSegments(value, { segments = 10 } = {}) {
  const pct = clamp(value, 0, 100);
  const lit = Math.round((pct / 100) * segments);
  return Array.from({ length: segments }, (_, index) => ({ on: index < lit }));
}

export function buildDomainCard(record, { selectedUuid = null } = {}) {
  const data = record.data ?? {};
  return {
    uuid: record.uuid,
    entityId: data.entityId,
    name: record.document?.name ?? "Domínio",
    description: data.description ?? "",
    category: data.identity?.category ?? "Base",
    state: data.identity?.state ?? "active",
    stateTone: statusTone(data.identity?.state),
    preset: data.management?.preset ?? "base",
    selected: record.uuid === selectedUuid,
    population: Number(data.population?.total ?? 0),
    controllers: data.governance?.controllers?.length ?? 0,
    tags: data.identity?.tags ?? []
  };
}

export function summarizeDomainTelemetry({ domain, projects = [], missions = [], squads = [], structures = [] } = {}) {
  const data = domain?.data ?? {};
  const stocks = data.economy?.stocks ?? [];
  const flows = data.economy?.flows ?? [];
  const activeProjects = projects.filter((p) => ["active", "blocked", "paused"].includes(p.data?.status)).length;
  const activeMissions = missions.filter((m) => ["available", "active", "planned"].includes(m.data?.status)).length;
  const readySquads = squads.filter((s) => ["ready", "deployed"].includes(s.data?.status)).length;
  const operationalStructures = structures.filter((s) => s.data?.status === "operational").length;

  return {
    population: Number(data.population?.total ?? 0),
    resourceKinds: stocks.length,
    activeFlows: flows.filter((flow) => flow.active).length,
    activeProjects,
    activeMissions,
    readySquads,
    operationalStructures,
    conditions: data.conditions?.length ?? 0,
    intel: data.intel?.length ?? 0
  };
}

export function createSparkline(values = []) {
  const clean = values.map(Number).filter(Number.isFinite);
  if (clean.length < 2) return "";
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const span = max - min || 1;
  const width = 100;
  const height = 30;
  return clean.map((value, index) => {
    const x = (index / (clean.length - 1)) * width;
    const y = height - ((value - min) / span) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}
