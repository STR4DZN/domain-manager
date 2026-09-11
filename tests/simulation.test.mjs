import test from "node:test";
import assert from "node:assert/strict";

import { buildSimulationSnapshot } from "../scripts/simulation/snapshot.js";
import { simulateAdvance } from "../scripts/simulation/simulate.js";

const catalog = [
  { id: "food", name: "Alimento", unit: "u", precision: 0, allowNegative: false },
  { id: "water", name: "Água", unit: "u", precision: 0, allowNegative: false },
  { id: "metal", name: "Metal", unit: "u", precision: 0, allowNegative: false },
  { id: "credits", name: "Créditos", unit: "cr", precision: 2, allowNegative: false }
];

function domain({ stocks = [], flows = [], population = 0, guards = 0, sustenanceSettings = { enabled: false } } = {}) {
  return {
    uuid: "Domain.test",
    name: "Teste",
    data: {
      population: { total: population, countMode: "direct", groups: [], notables: [] },
      security: { guardCount: guards },
      economy: { stocks, flows, sustenanceSettings },
      relations: [],
      agreements: [],
      intel: [],
      history: []
    }
  };
}

function project({
  uuid = "Project.test",
  stockResource = "metal",
  status = "active",
  required = 10,
  completed = 0,
  rateAmount = 1,
  periodTicks = 1,
  carry = 0,
  costMode = "progressive",
  costAmount = 50,
  consumedAmount = 0
} = {}) {
  return {
    uuid,
    name: "Projeto Teste",
    data: {
      domainUuid: "Domain.test",
      status,
      blockedReason: "",
      work: { required, completed, rateAmount, periodTicks, carry },
      costs: [{ localId: "cost-1", resourceId: stockResource, mode: costMode, amount: costAmount, consumedAmount }]
    }
  };
}

function getResource(report, resourceId) {
  return report.domains[0].resources.find((resource) => resource.resourceId === resourceId);
}

function applyReportToSnapshot(snapshot, report) {
  const next = structuredClone(snapshot);
  const domainReport = report.domains[0];
  const targetDomain = next.domains.find((entry) => entry.uuid === domainReport.uuid);
  targetDomain.stocks = domainReport.resources.map((resource) => ({
    resourceId: resource.resourceId,
    amount: resource.allowNegative ? resource.projectedStock : Math.max(0, resource.projectedStock)
  }));

  const flowMap = new Map((domainReport.flows ?? []).map((flow) => [flow.localId, flow]));
  targetDomain.flows = targetDomain.flows.map((flow) => ({
    ...flow,
    carry: flowMap.get(flow.localId)?.projectedCarry ?? flow.carry
  }));

  const projectMap = new Map(report.projects.map((entry) => [entry.uuid, entry]));
  next.projects = next.projects.map((entry) => {
    const projection = projectMap.get(entry.uuid);
    if (!projection) return entry;
    const costMap = new Map(projection.costs.map((cost) => [cost.localId, cost]));
    return {
      ...entry,
      status: projection.projectedStatus,
      blockedReason: projection.projectedBlockedReason ?? "",
      work: {
        ...entry.work,
        completed: projection.projectedCompleted,
        carry: projection.projectedCarry
      },
      costs: entry.costs.map((cost) => ({
        ...cost,
        consumedAmount: costMap.get(cost.localId)?.projectedConsumed ?? cost.consumedAmount
      }))
    };
  });

  return next;
}

test("snapshot inclui população, segurança, sustento e carry dos fluxos", () => {
  const snapshot = buildSimulationSnapshot({
    domains: [domain({
      population: 250,
      guards: 4,
      sustenanceSettings: { enabled: true, foodPer100: 2, waterPer100: 3, guardUpkeep: 5 },
      stocks: [{ resourceId: "food", amount: 20 }],
      flows: [{ localId: "flow-1", name: "Lento", resourceId: "food", direction: "inflow", amount: 1, periodTicks: 3, carry: 2, active: true }]
    })],
    catalog
  });

  assert.equal(snapshot.domains[0].population.total, 250);
  assert.equal(snapshot.domains[0].security.guardCount, 4);
  assert.equal(snapshot.domains[0].sustenanceSettings.foodPer100, 2);
  assert.equal(snapshot.domains[0].flows[0].carry, 2);
});

test("sustento realmente remove alimento e água do estoque", () => {
  const snapshot = buildSimulationSnapshot({
    domains: [domain({
      population: 100,
      sustenanceSettings: { enabled: true, foodPer100: 1, waterPer100: 1, guardUpkeep: 0 },
      stocks: [
        { resourceId: "food", amount: 10 },
        { resourceId: "water", amount: 10 }
      ]
    })],
    catalog
  });

  const report = simulateAdvance({ snapshot, deltaTicks: 1 });
  assert.equal(getResource(report, "food").projectedStock, 9);
  assert.equal(getResource(report, "water").projectedStock, 9);
});

test("estoque exatamente zero após sustento não é shortfall", () => {
  const snapshot = buildSimulationSnapshot({
    domains: [domain({
      population: 100,
      sustenanceSettings: { enabled: true, foodPer100: 1, waterPer100: 1, guardUpkeep: 0 },
      stocks: [
        { resourceId: "food", amount: 1 },
        { resourceId: "water", amount: 1 }
      ]
    })],
    catalog
  });

  const report = simulateAdvance({ snapshot, deltaTicks: 1 });
  assert.equal(getResource(report, "food").projectedStock, 0);
  assert.equal(getResource(report, "food").shortfall, false);
  assert.equal(report.alerts.some((alert) => alert.type === "famine"), false);
});

test("custo progressivo de Project é descontado do Domain", () => {
  const snapshot = buildSimulationSnapshot({
    domains: [domain({ stocks: [{ resourceId: "metal", amount: 100 }] })],
    projects: [project({ required: 10, rateAmount: 1, periodTicks: 1, costAmount: 50, costMode: "progressive" })],
    catalog
  });

  const report = simulateAdvance({ snapshot, deltaTicks: 1 });
  const metal = getResource(report, "metal");
  const proj = report.projects[0];

  assert.equal(proj.projectedCompleted, 1);
  assert.equal(proj.costs[0].dueNow, 5);
  assert.equal(proj.costs[0].projectedConsumed, 5);
  assert.equal(metal.projectedStock, 95);
  assert.equal(metal.projectCostDelta, -5);
});

test("custo reserved é liquidado ao concluir Project", () => {
  const snapshot = buildSimulationSnapshot({
    domains: [domain({ stocks: [{ resourceId: "metal", amount: 100 }] })],
    projects: [project({ required: 1, rateAmount: 1, periodTicks: 1, costAmount: 20, costMode: "reserved" })],
    catalog
  });

  const report = simulateAdvance({ snapshot, deltaTicks: 1 });
  assert.equal(report.projects[0].projectedStatus, "completed");
  assert.equal(report.projects[0].costs[0].projectedConsumed, 20);
  assert.equal(getResource(report, "metal").projectedStock, 80);
});

test("Project sem recursos pausa o avanço do ciclo sem consumo fictício", () => {
  const snapshot = buildSimulationSnapshot({
    domains: [domain({ stocks: [{ resourceId: "metal", amount: 4 }] })],
    projects: [project({ required: 10, rateAmount: 1, periodTicks: 1, costAmount: 50, costMode: "progressive" })],
    catalog
  });

  const report = simulateAdvance({ snapshot, deltaTicks: 1 });
  const proj = report.projects[0];

  assert.equal(proj.wouldBlock, true);
  assert.equal(proj.projectedStatus, "active");
  assert.equal(proj.projectedCompleted, 0);
  assert.equal(proj.costs[0].projectedConsumed, 0);
  assert.equal(getResource(report, "metal").projectedStock, 4);
  assert.equal(report.alerts.some((alert) => alert.type === "projectFundingShortage"), true);
});

test("Project aplica progresso parcial financiável sem fabricar recursos", () => {
  const snapshot = buildSimulationSnapshot({
    domains: [domain({ stocks: [{ resourceId: "metal", amount: 25 }] })],
    projects: [project({ required: 10, rateAmount: 1, periodTicks: 1, costAmount: 50, costMode: "progressive" })],
    catalog
  });

  const report = simulateAdvance({ snapshot, deltaTicks: 10 });
  const proj = report.projects[0];
  assert.equal(proj.projectedCompleted, 5);
  assert.equal(proj.costs[0].projectedConsumed, 25);
  assert.equal(getResource(report, "metal").projectedStock, 0);
  assert.equal(proj.wouldBlock, true);
});

test("advance(3) equivale a três advance(1) para fluxo persistente com carry", () => {
  const base = buildSimulationSnapshot({
    domains: [domain({
      stocks: [{ resourceId: "metal", amount: 0 }],
      flows: [{ localId: "slow", name: "Lento", resourceId: "metal", direction: "inflow", amount: 1, periodTicks: 3, carry: 0, active: true }]
    })],
    catalog
  });

  const bulk = simulateAdvance({ snapshot: base, deltaTicks: 3 });

  let sequentialSnapshot = structuredClone(base);
  let sequentialReport;
  for (let i = 0; i < 3; i++) {
    sequentialReport = simulateAdvance({ snapshot: sequentialSnapshot, deltaTicks: 1 });
    sequentialSnapshot = applyReportToSnapshot(sequentialSnapshot, sequentialReport);
  }

  assert.equal(getResource(bulk, "metal").projectedStock, getResource(sequentialReport, "metal").projectedStock);
  assert.equal(bulk.domains[0].flows[0].projectedCarry, sequentialReport.domains[0].flows[0].projectedCarry);
});

test("advance(10) equivale a dez advance(1) para Project progressivo limitado por orçamento", () => {
  const base = buildSimulationSnapshot({
    domains: [domain({ stocks: [{ resourceId: "metal", amount: 25 }] })],
    projects: [project({ required: 10, rateAmount: 1, periodTicks: 1, costAmount: 50, costMode: "progressive" })],
    catalog
  });

  const bulk = simulateAdvance({ snapshot: base, deltaTicks: 10 });

  let sequentialSnapshot = structuredClone(base);
  let sequentialReport;
  for (let i = 0; i < 10; i++) {
    sequentialReport = simulateAdvance({ snapshot: sequentialSnapshot, deltaTicks: 1 });
    sequentialSnapshot = applyReportToSnapshot(sequentialSnapshot, sequentialReport);
  }

  assert.equal(bulk.projects[0].projectedCompleted, sequentialReport.projects[0].projectedCompleted);
  assert.equal(bulk.projects[0].costs[0].projectedConsumed, sequentialReport.projects[0].costs[0].projectedConsumed);
  assert.equal(getResource(bulk, "metal").projectedStock, getResource(sequentialReport, "metal").projectedStock);
});

function structure({
  uuid = "Structure.test",
  entityId = "structure:TEST",
  status = "operational",
  condition = 100,
  maintenance = [],
  production = []
} = {}) {
  return {
    uuid,
    name: "Estrutura Teste",
    data: {
      entityId,
      domain: { recordType: "domain", uuid: "Domain.test", entityId: null },
      activeProject: null,
      status,
      condition,
      tier: 1,
      capacity: 10,
      maintenance,
      production
    }
  };
}

test("Structure operational participa da economia como manutenção e produção por tick", () => {
  const extendedCatalog = [
    ...catalog,
    { id: "fuel", name: "Combustível", unit: "u", precision: 0, allowNegative: false },
    { id: "energy", name: "Energia", unit: "u", precision: 0, allowNegative: false }
  ];
  const snapshot = buildSimulationSnapshot({
    domains: [domain({ stocks: [{ resourceId: "fuel", amount: 20 }, { resourceId: "energy", amount: 0 }] })],
    structures: [structure({
      maintenance: [{ resourceId: "fuel", amount: 2 }],
      production: [{ resourceId: "energy", amount: 5 }]
    })],
    catalog: extendedCatalog
  });

  const report = simulateAdvance({ snapshot, deltaTicks: 3 });
  assert.equal(getResource(report, "fuel").projectedStock, 14);
  assert.equal(getResource(report, "energy").projectedStock, 15);
  assert.equal(report.domains[0].structures[0].efficiency, 100);
  assert.equal(report.domains[0].structures[0].maintenance[0].delta, 6);
  assert.equal(report.domains[0].structures[0].production[0].delta, 15);
});

test("Structure damaged reduz produção pela condição sem alterar manutenção", () => {
  const extendedCatalog = [
    ...catalog,
    { id: "fuel", name: "Combustível", unit: "u", precision: 0, allowNegative: false },
    { id: "energy", name: "Energia", unit: "u", precision: 0, allowNegative: false }
  ];
  const snapshot = buildSimulationSnapshot({
    domains: [domain({ stocks: [{ resourceId: "fuel", amount: 20 }, { resourceId: "energy", amount: 0 }] })],
    structures: [structure({
      status: "damaged",
      condition: 50,
      maintenance: [{ resourceId: "fuel", amount: 2 }],
      production: [{ resourceId: "energy", amount: 5 }]
    })],
    catalog: extendedCatalog
  });

  const report = simulateAdvance({ snapshot, deltaTicks: 2 });
  assert.equal(getResource(report, "fuel").projectedStock, 16);
  assert.equal(getResource(report, "energy").projectedStock, 4, "floor(5 * 50%) = 2 por tick");
  assert.equal(report.domains[0].structures[0].efficiency, 50);
});

test("Structure disabled/planned não injeta fluxos econômicos", () => {
  const extendedCatalog = [
    ...catalog,
    { id: "energy", name: "Energia", unit: "u", precision: 0, allowNegative: false }
  ];
  for (const status of ["disabled", "planned", "destroyed", "decommissioned"]) {
    const snapshot = buildSimulationSnapshot({
      domains: [domain({ stocks: [{ resourceId: "energy", amount: 3 }] })],
      structures: [structure({ status, production: [{ resourceId: "energy", amount: 10 }] })],
      catalog: extendedCatalog
    });
    const report = simulateAdvance({ snapshot, deltaTicks: 5 });
    assert.equal(getResource(report, "energy").projectedStock, 3, status);
    assert.equal(report.domains[0].structures[0].active, false, status);
  }
});

test("economia de Structure preserva equivalência advance(N) vs N × advance(1)", () => {
  const extendedCatalog = [
    ...catalog,
    { id: "fuel", name: "Combustível", unit: "u", precision: 0, allowNegative: false },
    { id: "energy", name: "Energia", unit: "u", precision: 0, allowNegative: false }
  ];
  const base = buildSimulationSnapshot({
    domains: [domain({ stocks: [{ resourceId: "fuel", amount: 50 }, { resourceId: "energy", amount: 0 }] })],
    structures: [structure({
      maintenance: [{ resourceId: "fuel", amount: 1 }],
      production: [{ resourceId: "energy", amount: 7 }]
    })],
    catalog: extendedCatalog
  });

  const bulk = simulateAdvance({ snapshot: base, deltaTicks: 7 });
  let sequentialSnapshot = structuredClone(base);
  let sequentialReport = null;
  for (let i = 0; i < 7; i++) {
    sequentialReport = simulateAdvance({ snapshot: sequentialSnapshot, deltaTicks: 1 });
    sequentialSnapshot = applyReportToSnapshot(sequentialSnapshot, sequentialReport);
  }

  assert.equal(getResource(bulk, "fuel").projectedStock, getResource(sequentialReport, "fuel").projectedStock);
  assert.equal(getResource(bulk, "energy").projectedStock, getResource(sequentialReport, "energy").projectedStock);
});

test("risco de manutenção gera alerta específico sem mutar status automaticamente", () => {
  const extendedCatalog = [
    ...catalog,
    { id: "fuel", name: "Combustível", unit: "u", precision: 0, allowNegative: false }
  ];
  const snapshot = buildSimulationSnapshot({
    domains: [domain({ stocks: [{ resourceId: "fuel", amount: 1 }] })],
    structures: [structure({ maintenance: [{ resourceId: "fuel", amount: 3 }] })],
    catalog: extendedCatalog
  });
  const report = simulateAdvance({ snapshot, deltaTicks: 1 });
  assert.equal(report.alerts.some((alert) => alert.type === "structureMaintenanceRisk"), true);
  assert.equal(report.domains[0].structures[0].status, "operational");
});
