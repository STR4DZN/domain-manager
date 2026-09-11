/**
 * Snapshot imutável em memória para simulação temporal.
 */

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function buildSimulationSnapshot({ domains = [], projects = [], structures = [], catalog = [] } = {}) {
  const rawResources = Array.isArray(catalog) ? catalog : (catalog?.resources ?? []);
  const normalizedCatalog = rawResources.map((res) => ({
    id: String(res.id ?? "").trim(),
    name: String(res.name ?? "").trim(),
    unit: String(res.unit ?? "").trim(),
    precision: Number(res.precision ?? 0),
    allowNegative: Boolean(res.allowNegative)
  }));

  const normalizedDomains = (domains ?? []).map((dom) => ({
    entityId: dom.data?.entityId ?? dom.entityId ?? null,
    uuid: dom.uuid ?? dom.document?.uuid ?? "",
    name: dom.name ?? dom.document?.name ?? "Domínio",
    population: {
      total: Number(dom.data?.population?.total ?? dom.population?.total ?? 0),
      countMode: dom.data?.population?.countMode ?? dom.population?.countMode ?? "direct",
      groups: (dom.data?.population?.groups ?? dom.population?.groups ?? []).map((g) => ({
        localId: g.localId,
        count: Number(g.count ?? 0),
        includedInTotal: g.includedInTotal !== false
      }))
    },
    security: {
      guardCount: Number(dom.data?.security?.guardCount ?? dom.security?.guardCount ?? 0)
    },
    sustenanceSettings: clone(
      dom.data?.economy?.sustenanceSettings
      ?? dom.economy?.sustenanceSettings
      ?? dom.sustenanceSettings
      ?? null
    ),
    stocks: (dom.data?.economy?.stocks ?? dom.stocks ?? []).map((s) => ({
      resourceId: s.resourceId,
      amount: Number(s.amount ?? 0)
    })),
    flows: (dom.data?.economy?.flows ?? dom.flows ?? []).map((f) => ({
      localId: f.localId,
      name: f.name ?? "",
      resourceId: f.resourceId,
      direction: f.direction ?? "inflow",
      amount: Number(f.amount ?? 0),
      periodTicks: Number(f.periodTicks ?? 1),
      carry: Number(f.carry ?? 0),
      active: f.active !== false,
      category: f.category ?? "production"
    })),
    relations: (dom.data?.relations ?? dom.relations ?? []).map((r) => ({
      localId: r.localId,
      targetDomainUuid: r.targetDomainUuid,
      posture: r.posture ?? "neutral",
      notes: r.notes ?? ""
    })),
    agreements: (dom.data?.agreements ?? dom.agreements ?? []).map((a) => ({
      localId: a.localId,
      name: a.name ?? "Acordo",
      targetDomainUuid: a.targetDomainUuid,
      type: a.type ?? "trade_pact",
      transfers: (a.transfers ?? []).map((t) => ({
        resourceId: t.resourceId,
        direction: t.direction ?? "send",
        amountPerTick: Number(t.amountPerTick ?? 0)
      })),
      durationTicks: a.durationTicks !== null && a.durationTicks !== undefined ? Number(a.durationTicks) : null,
      remainingTicks: a.remainingTicks !== null && a.remainingTicks !== undefined ? Number(a.remainingTicks) : null,
      status: a.status ?? "active",
      notes: a.notes ?? ""
    })),
    intel: (dom.data?.intel ?? dom.intel ?? []).map((i) => ({
      localId: i.localId,
      title: i.title ?? "",
      category: i.category ?? "fact",
      visibility: i.visibility ?? "all_controllers",
      content: i.content ?? "",
      credibility: i.credibility ?? "confirmed",
      source: i.source ?? "",
      revealed: Boolean(i.revealed),
      tags: Array.isArray(i.tags) ? i.tags : []
    })),
    history: (dom.data?.history ?? dom.history ?? []).map((h) => ({
      localId: h.localId,
      timestamp: Number(h.timestamp ?? Date.now()),
      tick: h.tick !== null && h.tick !== undefined ? Number(h.tick) : null,
      title: h.title ?? "",
      category: h.category ?? "story",
      summary: h.summary ?? "",
      details: h.details ?? "",
      significance: h.significance ?? "minor",
      visibility: h.visibility ?? "all"
    }))
  }));

  const normalizedProjects = (projects ?? []).map((proj) => ({
    entityId: proj.data?.entityId ?? proj.entityId ?? null,
    uuid: proj.uuid ?? proj.document?.uuid ?? "",
    name: proj.name ?? proj.document?.name ?? "Project",
    domainUuid: proj.data?.domainUuid ?? proj.data?.primaryDomainUuid ?? proj.domainUuid ?? "",
    status: proj.data?.status ?? proj.status ?? "planned",
    blockedReason: proj.data?.blockedReason ?? proj.blockedReason ?? null,
    work: {
      required: Number(proj.data?.work?.required ?? proj.work?.required ?? 100),
      completed: Number(proj.data?.work?.completed ?? proj.work?.completed ?? 0),
      rateAmount: Number(proj.data?.work?.rateAmount ?? proj.work?.rateAmount ?? 1),
      periodTicks: Number(proj.data?.work?.periodTicks ?? proj.work?.periodTicks ?? 1),
      carry: Number(proj.data?.work?.carry ?? proj.work?.carry ?? 0)
    },
    costs: (proj.data?.costs ?? proj.costs ?? []).map((c) => ({
      localId: c.localId,
      resourceId: c.resourceId,
      amount: Number(c.amount ?? 0),
      consumedAmount: Number(c.consumedAmount ?? 0),
      mode: c.mode ?? "reserved"
    }))
  }));

  const normalizedStructures = (structures ?? []).map((structure) => ({
    entityId: structure.data?.entityId ?? structure.entityId ?? null,
    uuid: structure.uuid ?? structure.document?.uuid ?? "",
    name: structure.name ?? structure.document?.name ?? "Structure",
    domain: clone(structure.data?.domain ?? structure.domain ?? null),
    activeProject: clone(structure.data?.activeProject ?? structure.activeProject ?? null),
    status: structure.data?.status ?? structure.status ?? "planned",
    condition: Number(structure.data?.condition ?? structure.condition ?? 100),
    tier: Number(structure.data?.tier ?? structure.tier ?? 1),
    capacity: Number(structure.data?.capacity ?? structure.capacity ?? 0),
    maintenance: (structure.data?.maintenance ?? structure.maintenance ?? []).map((entry) => ({
      resourceId: entry.resourceId,
      amount: Number(entry.amount ?? 0)
    })),
    production: (structure.data?.production ?? structure.production ?? []).map((entry) => ({
      resourceId: entry.resourceId,
      amount: Number(entry.amount ?? 0)
    }))
  }));

  return {
    timestamp: Date.now(),
    catalog: normalizedCatalog,
    domains: clone(normalizedDomains),
    projects: clone(normalizedProjects),
    structures: clone(normalizedStructures)
  };
}
