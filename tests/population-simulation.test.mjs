import test from "node:test";
import assert from "node:assert/strict";
import { buildSimulationSnapshot } from "../scripts/simulation/snapshot.js";
import { simulateAdvance } from "../scripts/simulation/simulate.js";

const catalog = [
  { id: "fuel", name: "Fuel", unit: "u", precision: 0, allowNegative: false },
  { id: "energy", name: "Energy", unit: "u", precision: 0, allowNegative: false },
  { id: "food", name: "Food", unit: "u", precision: 0, allowNegative: false },
  { id: "water", name: "Water", unit: "u", precision: 0, allowNegative: false }
];

function domain({ assigned = 4, groupStatus = "active", sustenance = false, food = 20, water = 20 } = {}) {
  return {
    uuid: "JournalEntry.D1", name: "Aurelia",
    data: {
      entityId: "domain:D1",
      population: {
        total: 100, countMode: "direct", morale: 60,
        groups: [{ localId: "G1", name: "Technicians", count: 10, includedInTotal: true, status: groupStatus, morale: 70, workforceEligible: 6, assignment: "Engineering", quality: "Estável" }],
        workforce: { allocations: assigned > 0 ? [{ localId: "W1", groupLocalId: "G1", target: { recordType: "structure", uuid: "JournalEntry.S1", entityId: "structure:S1" }, count: assigned, role: "Operators" }] : [] },
        notables: []
      },
      security: { guardCount: 0 },
      economy: {
        stocks: [{ resourceId: "fuel", amount: 20 }, { resourceId: "energy", amount: 0 }, { resourceId: "food", amount: food }, { resourceId: "water", amount: water }],
        flows: [], resourcePolicies: [],
        sustenanceSettings: { enabled: sustenance, foodPer100: 1, waterPer100: 1, guardUpkeep: 0 }
      },
      relations: [], agreements: [], intel: [], history: []
    }
  };
}

function structure({ required = 4 } = {}) {
  return {
    uuid: "JournalEntry.S1", name: "Reactor",
    data: {
      entityId: "structure:S1",
      domain: { recordType: "domain", uuid: "JournalEntry.D1", entityId: "domain:D1" },
      activeProject: null, status: "operational", condition: 100, tier: 1, capacity: 0, maintenancePriority: 80,
      workforceRequired: required,
      maintenance: [{ resourceId: "fuel", amount: 4 }],
      production: [{ resourceId: "energy", amount: 10 }]
    }
  };
}

function resource(report, id) { return report.domains[0].resources.find((entry) => entry.resourceId === id); }

function applyReport(snapshot, report) {
  const next = structuredClone(snapshot);
  const domainReport = report.domains[0];
  const targetDomain = next.domains[0];
  targetDomain.stocks = domainReport.resources.map((entry) => ({ resourceId: entry.resourceId, amount: entry.allowNegative ? entry.projectedStock : Math.max(0, entry.projectedStock) }));
  if (domainReport.population) {
    targetDomain.population.morale = domainReport.population.projectedMorale;
    const moraleByGroup = new Map(domainReport.population.groups.map((entry) => [entry.localId, entry.projectedMorale]));
    targetDomain.population.groups = targetDomain.population.groups.map((entry) => ({ ...entry, morale: moraleByGroup.get(entry.localId) ?? entry.morale }));
  }
  const structureReport = domainReport.structures[0];
  if (structureReport && next.structures[0]) {
    next.structures[0].status = structureReport.projectedStatus;
    next.structures[0].condition = structureReport.projectedCondition;
  }
  return next;
}

test("Structure plenamente staffed opera a 100%", () => {
  const snapshot = buildSimulationSnapshot({ domains: [domain({ assigned: 4 })], structures: [structure({ required: 4 })], catalog });
  const report = simulateAdvance({ snapshot, deltaTicks: 1 });
  const s = report.domains[0].structures[0];
  assert.equal(s.workforceRequired, 4);
  assert.equal(s.workforceAssigned, 4);
  assert.equal(s.workforceRatioBps, 10_000);
  assert.equal(s.serviceRatioBps, 10_000);
  assert.equal(resource(report, "fuel").projectedStock, 16);
  assert.equal(resource(report, "energy").projectedStock, 10);
  assert.equal(s.projectedCondition, 100);
});

test("Structure sub-staffed reduz manutenção/produção e degrada condição", () => {
  const snapshot = buildSimulationSnapshot({ domains: [domain({ assigned: 2 })], structures: [structure({ required: 4 })], catalog });
  const report = simulateAdvance({ snapshot, deltaTicks: 1 });
  const s = report.domains[0].structures[0];
  assert.equal(s.workforceAssigned, 2);
  assert.equal(s.workforceRatioBps, 5_000);
  assert.equal(s.resourceServiceRatioBps, 10_000);
  assert.equal(s.serviceRatioBps, 5_000);
  assert.equal(resource(report, "fuel").projectedStock, 18, "manutenção é atendida proporcionalmente ao serviço disponível");
  assert.equal(resource(report, "energy").projectedStock, 5);
  assert.equal(s.projectedStatus, "damaged");
  assert.equal(s.projectedCondition, 97);
});

test("Structure sem requisito de workforce permanece plena sem allocations", () => {
  const snapshot = buildSimulationSnapshot({ domains: [domain({ assigned: 0 })], structures: [structure({ required: 0 })], catalog });
  const report = simulateAdvance({ snapshot, deltaTicks: 1 });
  const s = report.domains[0].structures[0];
  assert.equal(s.workforceRatioBps, 10_000);
  assert.equal(s.serviceRatioBps, 10_000);
  assert.equal(resource(report, "energy").projectedStock, 10);
});

test("allocation de grupo inativo não conta como workforce operacional", () => {
  const snapshot = buildSimulationSnapshot({ domains: [domain({ assigned: 4, groupStatus: "inactive" })], structures: [structure({ required: 4 })], catalog });
  const report = simulateAdvance({ snapshot, deltaTicks: 1 });
  const s = report.domains[0].structures[0];
  assert.equal(s.workforceAssigned, 0);
  assert.equal(s.workforceRatioBps, 0);
  assert.equal(resource(report, "energy").projectedStock, 0);
  assert.equal(s.projectedCondition, 95);
});

test("workforce degradante preserva equivalência advance(N) vs N × advance(1)", () => {
  const base = buildSimulationSnapshot({ domains: [domain({ assigned: 2 })], structures: [structure({ required: 4 })], catalog });
  const bulk = simulateAdvance({ snapshot: base, deltaTicks: 3 });
  let seqSnapshot = structuredClone(base); let seqReport = null;
  for (let i = 0; i < 3; i++) { seqReport = simulateAdvance({ snapshot: seqSnapshot, deltaTicks: 1 }); seqSnapshot = applyReport(seqSnapshot, seqReport); }
  assert.equal(resource(bulk, "fuel").projectedStock, resource(seqReport, "fuel").projectedStock);
  assert.equal(resource(bulk, "energy").projectedStock, resource(seqReport, "energy").projectedStock);
  assert.equal(bulk.domains[0].structures[0].projectedCondition, seqReport.domains[0].structures[0].projectedCondition);
  assert.equal(bulk.domains[0].structures[0].projectedStatus, seqReport.domains[0].structures[0].projectedStatus);
});

test("fome+seca reduzem moral uma vez por tick e preservam determinismo", () => {
  const base = buildSimulationSnapshot({ domains: [domain({ assigned: 0, sustenance: true, food: 0, water: 0 })], structures: [], catalog });
  const bulk = simulateAdvance({ snapshot: base, deltaTicks: 2 });
  assert.equal(bulk.domains[0].population.projectedMorale, 50);
  assert.equal(bulk.domains[0].population.groups[0].projectedMorale, 60);
  const famine = bulk.alerts.find((entry) => entry.type === "famine");
  const drought = bulk.alerts.find((entry) => entry.type === "drought");
  assert.deepEqual(famine.occurrenceTicks, [1, 2]);
  assert.deepEqual(drought.occurrenceTicks, [1, 2]);

  let seqSnapshot = structuredClone(base); let seqReport = null;
  for (let i = 0; i < 2; i++) { seqReport = simulateAdvance({ snapshot: seqSnapshot, deltaTicks: 1 }); seqSnapshot = applyReport(seqSnapshot, seqReport); }
  assert.equal(bulk.domains[0].population.projectedMorale, seqReport.domains[0].population.projectedMorale);
  assert.equal(bulk.domains[0].population.groups[0].projectedMorale, seqReport.domains[0].population.groups[0].projectedMorale);
});
