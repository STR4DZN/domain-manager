import { buildDomainLedger } from "./ledger.js";
import { calculateDomainUpkeep } from "./upkeep.js";

export function structureEfficiency(structure) {
  if (!structure || !["operational", "damaged"].includes(structure.status)) return 0;
  if (structure.status === "operational") return 100;
  return Math.max(0, Math.min(100, Number(structure.condition ?? 0)));
}

export function workforceCoverageBps(domain, structure) {
  const required = Math.max(0, Number(structure?.workforceRequired ?? 0));
  if (required <= 0) return { required: 0, assigned: 0, ratioBps: 10_000 };
  const groups = new Map((domain?.population?.groups ?? []).map((group) => [group.localId, group]));
  let assigned = 0;
  for (const allocation of domain?.population?.workforce?.allocations ?? []) {
    const target = allocation.target ?? {};
    const matches = (structure?.entityId && target.entityId === structure.entityId)
      || (structure?.uuid && target.uuid === structure.uuid);
    if (!matches) continue;
    const group = groups.get(allocation.groupLocalId);
    if (!group || group.status !== "active") continue;
    assigned += Math.max(0, Number(allocation.count ?? 0));
  }
  return { required, assigned, ratioBps: Math.max(0, Math.min(10_000, Math.floor((assigned * 10_000) / required))) };
}

export function buildStructureStrategicFlows(structure, { domain = null } = {}) {
  const efficiency = structureEfficiency(structure);
  if (efficiency <= 0) return [];
  const workforce = workforceCoverageBps(domain, structure);
  const workforceScale = workforce.ratioBps;
  const key = structure.entityId ?? structure.uuid ?? "unknown";
  const flows = [];

  for (const entry of structure.maintenance ?? []) {
    const nominal = Math.max(0, Number(entry.amount ?? 0));
    const amount = Math.floor((nominal * workforceScale) / 10_000);
    if (!amount) continue;
    flows.push({
      localId: `structure:${key}:maintenance:${entry.resourceId}`,
      name: `${structure.name ?? "Structure"} // manutenção`,
      resourceId: entry.resourceId,
      direction: "outflow",
      amount,
      periodTicks: 1,
      carry: 0,
      category: "upkeep",
      source: `Structure:${structure.name ?? key}`,
      active: true
    });
  }

  for (const entry of structure.production ?? []) {
    const nominal = Math.max(0, Number(entry.amount ?? 0));
    const amount = Math.floor((nominal * efficiency * workforceScale) / 1_000_000);
    if (!amount) continue;
    flows.push({
      localId: `structure:${key}:production:${entry.resourceId}`,
      name: `${structure.name ?? "Structure"} // produção`,
      resourceId: entry.resourceId,
      direction: "inflow",
      amount,
      periodTicks: 1,
      carry: 0,
      category: "production",
      source: `Structure:${structure.name ?? key}`,
      active: true
    });
  }
  return flows;
}

export function buildAgreementStrategicFlows(domain) {
  const flows = [];
  for (const agreement of domain?.agreements ?? []) {
    if (agreement.status !== "active") continue;
    for (const transfer of agreement.transfers ?? []) {
      const amount = Math.max(0, Number(transfer.amountPerTick ?? 0));
      if (!amount) continue;
      flows.push({
        localId: `agreement:${agreement.localId}:${transfer.resourceId}:${transfer.direction}`,
        name: `${agreement.name ?? "Agreement"} // ${transfer.direction}`,
        resourceId: transfer.resourceId,
        direction: transfer.direction === "receive" ? "inflow" : "outflow",
        amount,
        periodTicks: 1,
        carry: 0,
        category: "contract",
        source: `Agreement:${agreement.name ?? agreement.localId}`,
        active: true
      });
    }
  }
  return flows;
}

export function buildStrategicDomainFlows({ domain, catalog, structures = [] }) {
  if (!domain) return [];
  const upkeep = calculateDomainUpkeep({ domainData: domain, catalog });
  return [
    ...(domain.economy?.flows ?? domain.flows ?? []),
    ...upkeep.syntheticFlows,
    ...structures.flatMap((structure) => buildStructureStrategicFlows(structure, { domain })),
    ...buildAgreementStrategicFlows(domain)
  ];
}

export function resourcePolicyMap(domain) {
  return new Map((domain?.economy?.resourcePolicies ?? domain?.resourcePolicies ?? [])
    .map((policy) => [policy.resourceId, policy]));
}

export function buildStrategicDomainLedger({ domain, catalog, structures = [], reservations = [] }) {
  const flows = buildStrategicDomainFlows({ domain, catalog, structures });
  return buildDomainLedger({
    catalog,
    economy: domain?.economy ?? { stocks: [], flows: [], resourcePolicies: [] },
    reservations,
    flows
  });
}
