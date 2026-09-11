import test from "node:test";
import assert from "node:assert/strict";
import { simulateAdvance } from "../scripts/simulation/simulate.js";

function baseSnapshot({ stocks = [], policies = [], agreements = [], projects = [], structures = [] } = {}) {
  return {
    catalog: [
      { id: "fuel", name: "Fuel", unit: "u", precision: 0, allowNegative: false },
      { id: "energy", name: "Energy", unit: "u", precision: 0, allowNegative: false },
      { id: "metal", name: "Metal", unit: "u", precision: 0, allowNegative: false }
    ],
    domains: [{
      uuid: "JournalEntry.D1", entityId: "domain:D1", name: "Aurelia",
      population: { total: 0, countMode: "direct", groups: [] },
      security: { guardCount: 0 }, sustenanceSettings: { enabled: false },
      resourcePolicies: policies, stocks, flows: [], relations: [], agreements, intel: [], history: []
    }],
    projects,
    structures
  };
}

function structure(id, { priority = 50, status = "operational", condition = 100, maintenance = [], production = [], activeProject = null } = {}) {
  return {
    uuid: `JournalEntry.${id}`, entityId: `structure:${id}`, name: id,
    domain: { recordType: "domain", uuid: "JournalEntry.D1", entityId: "domain:D1" },
    activeProject, status, condition, tier: 1, capacity: 0, maintenancePriority: priority,
    maintenance, production
  };
}

function resource(report, id) {
  return report.domains[0].resources.find((entry) => entry.resourceId === id);
}
function structureReport(report, id) {
  return report.domains[0].structures.find((entry) => entry.entityId === `structure:${id}`);
}

function applyAggregateReport(snapshot, report) {
  const next = structuredClone(snapshot);
  const domain = next.domains[0];
  domain.stocks = report.domains[0].resources.map((entry) => ({ resourceId: entry.resourceId, amount: entry.allowNegative ? entry.projectedStock : Math.max(0, entry.projectedStock) }));
  const flowMap = new Map((report.domains[0].flows ?? []).map((entry) => [entry.localId, entry]));
  domain.flows = (domain.flows ?? []).map((flow) => ({
    ...flow,
    carry: flowMap.get(flow.localId)?.projectedCarry ?? flow.carry
  }));
  domain.agreements = structuredClone(report.domains[0].agreements ?? domain.agreements);
  const projectMap = new Map(report.projects.map((entry) => [entry.uuid, entry]));
  next.projects = next.projects.map((project) => {
    const rep = projectMap.get(project.uuid);
    if (!rep) return project;
    const costs = new Map(rep.costs.map((entry) => [entry.localId, entry]));
    return {
      ...project,
      status: rep.projectedStatus,
      blockedReason: rep.projectedBlockedReason ?? "",
      work: { ...project.work, completed: rep.projectedCompleted, carry: rep.projectedCarry },
      costs: project.costs.map((cost) => ({ ...cost, consumedAmount: costs.get(cost.localId)?.projectedConsumed ?? cost.consumedAmount }))
    };
  });
  const structureMap = new Map(report.domains[0].structures.map((entry) => [entry.entityId ?? entry.uuid, entry]));
  next.structures = next.structures.map((value) => {
    const rep = structureMap.get(value.entityId ?? value.uuid);
    if (!rep) return value;
    return { ...value, status: rep.projectedStatus, condition: rep.projectedCondition, activeProject: structuredClone(rep.projectedActiveProject ?? null) };
  });
  return next;
}

test("manutenção disputa recurso por prioridade e degrada somente o ativo não atendido", () => {
  const snapshot = baseSnapshot({
    stocks: [{ resourceId: "fuel", amount: 5 }, { resourceId: "energy", amount: 0 }],
    structures: [
      structure("HIGH", { priority: 100, maintenance: [{ resourceId: "fuel", amount: 5 }], production: [{ resourceId: "energy", amount: 10 }] }),
      structure("LOW", { priority: 10, maintenance: [{ resourceId: "fuel", amount: 5 }], production: [{ resourceId: "energy", amount: 10 }] })
    ]
  });
  const report = simulateAdvance({ snapshot, deltaTicks: 1 });
  const high = structureReport(report, "HIGH");
  const low = structureReport(report, "LOW");
  assert.equal(high.serviceRatioBps, 10_000);
  assert.equal(high.projectedCondition, 100);
  assert.equal(low.serviceRatioBps, 0);
  assert.equal(low.projectedStatus, "damaged");
  assert.equal(low.projectedCondition, 95);
  assert.equal(resource(report, "fuel").projectedStock, 0);
  assert.equal(resource(report, "energy").projectedStock, 10);
});

test("storageCapacity clampa estoque no próprio tick e reporta overflow", () => {
  const snapshot = baseSnapshot({
    stocks: [{ resourceId: "energy", amount: 95 }],
    policies: [{ resourceId: "energy", criticalFloor: 0, reserveTarget: 0, storageCapacity: 100 }],
    structures: [structure("GEN", { production: [{ resourceId: "energy", amount: 10 }] })]
  });
  const report = simulateAdvance({ snapshot, deltaTicks: 1 });
  assert.equal(resource(report, "energy").projectedStock, 100);
  assert.equal(resource(report, "energy").storageOverflow, 5);
  assert.ok(report.alerts.some((entry) => entry.type === "storageOverflow" && entry.overflow === 5));
});

test("Agreement com remainingTicks=1 transfere uma única vez em avanço longo", () => {
  const snapshot = baseSnapshot({
    stocks: [{ resourceId: "fuel", amount: 0 }],
    agreements: [{ localId: "A1", name: "Supply", status: "active", remainingTicks: 1, transfers: [{ resourceId: "fuel", direction: "receive", amountPerTick: 3 }] }]
  });
  const report = simulateAdvance({ snapshot, deltaTicks: 3 });
  assert.equal(resource(report, "fuel").projectedStock, 3);
  assert.equal(report.domains[0].agreements[0].status, "terminated");
  assert.equal(report.domains[0].agreements[0].remainingTicks, 0);
});

test("Structure comissionada no tick 1 produz nos ticks seguintes do mesmo avanço", () => {
  const project = {
    uuid: "JournalEntry.P1", entityId: "project:P1", name: "Forge", domainUuid: "JournalEntry.D1", status: "active", blockedReason: "",
    work: { required: 100, completed: 90, rateAmount: 10, periodTicks: 1, carry: 0 }, costs: []
  };
  const snapshot = baseSnapshot({
    stocks: [{ resourceId: "metal", amount: 0 }], projects: [project],
    structures: [structure("FORGE", { status: "planned", production: [{ resourceId: "metal", amount: 5 }], activeProject: { recordType: "project", uuid: project.uuid, entityId: project.entityId } })]
  });
  const report = simulateAdvance({ snapshot, deltaTicks: 3 });
  const forge = structureReport(report, "FORGE");
  assert.equal(report.projects[0].projectedStatus, "completed");
  assert.equal(forge.commissioned, true);
  assert.equal(forge.projectedStatus, "operational");
  assert.equal(forge.production.find((entry) => entry.resourceId === "metal").delta, 10);
  assert.equal(resource(report, "metal").projectedStock, 10);
});

test("advance(3) equivale a três advance(1) para stocks, Agreements, Projects e Structures", () => {
  const project = {
    uuid: "JournalEntry.P1", entityId: "project:P1", name: "Grid", domainUuid: "JournalEntry.D1", status: "active", blockedReason: "",
    work: { required: 100, completed: 90, rateAmount: 10, periodTicks: 1, carry: 0 }, costs: []
  };
  const initial = baseSnapshot({
    stocks: [{ resourceId: "fuel", amount: 7 }, { resourceId: "energy", amount: 0 }, { resourceId: "metal", amount: 0 }],
    agreements: [{ localId: "A1", name: "Fuel", status: "active", remainingTicks: 2, transfers: [{ resourceId: "fuel", direction: "receive", amountPerTick: 1 }] }],
    projects: [project],
    structures: [
      structure("LOAD", { priority: 50, maintenance: [{ resourceId: "fuel", amount: 4 }], production: [{ resourceId: "energy", amount: 8 }] }),
      structure("FORGE", { status: "planned", production: [{ resourceId: "metal", amount: 2 }], activeProject: { recordType: "project", uuid: project.uuid, entityId: project.entityId } })
    ]
  });

  const aggregated = simulateAdvance({ snapshot: initial, deltaTicks: 3 });
  let sequentialState = structuredClone(initial);
  let last;
  for (let i = 0; i < 3; i += 1) {
    last = simulateAdvance({ snapshot: sequentialState, deltaTicks: 1 });
    sequentialState = applyAggregateReport(sequentialState, last);
  }

  const aggregatedState = applyAggregateReport(initial, aggregated);
  assert.deepEqual(aggregatedState.domains[0].stocks, sequentialState.domains[0].stocks);
  assert.deepEqual(aggregatedState.domains[0].agreements, sequentialState.domains[0].agreements);
  assert.deepEqual(aggregatedState.projects, sequentialState.projects);
  assert.deepEqual(aggregatedState.structures, sequentialState.structures);
});

test("thresholds distinguem reserva, piso crítico e estado nominal nos limites", () => {
  const make = (amount) => baseSnapshot({
    stocks: [{ resourceId: "fuel", amount }],
    policies: [{ resourceId: "fuel", criticalFloor: 20, reserveTarget: 50, storageCapacity: 100 }]
  });
  const nominal = resource(simulateAdvance({ snapshot: make(60), deltaTicks: 1 }), "fuel");
  const reserve = resource(simulateAdvance({ snapshot: make(49), deltaTicks: 1 }), "fuel");
  const critical = resource(simulateAdvance({ snapshot: make(20), deltaTicks: 1 }), "fuel");
  assert.equal(nominal.belowReserve, false);
  assert.equal(nominal.critical, false);
  assert.equal(reserve.belowReserve, true);
  assert.equal(reserve.critical, false);
  assert.equal(critical.belowReserve, true);
  assert.equal(critical.critical, true);
});

test("Structure damaged combina condição e serviço parcial sem produzir acima do nominal", () => {
  const snapshot = baseSnapshot({
    stocks: [{ resourceId: "fuel", amount: 5 }, { resourceId: "energy", amount: 0 }],
    structures: [structure("DAMAGED", {
      status: "damaged", condition: 50,
      maintenance: [{ resourceId: "fuel", amount: 10 }],
      production: [{ resourceId: "energy", amount: 20 }]
    })]
  });
  const report = simulateAdvance({ snapshot, deltaTicks: 1 });
  const item = structureReport(report, "DAMAGED");
  assert.equal(item.serviceRatioBps, 5_000);
  assert.equal(item.production[0].delta, 5); // 20 * 50% condição * 50% serviço
  assert.equal(item.projectedCondition, 47);
  assert.equal(resource(report, "fuel").projectedStock, 0);
  assert.equal(resource(report, "energy").projectedStock, 5);
});

test("Structure disabled não consome manutenção nem produz", () => {
  const snapshot = baseSnapshot({
    stocks: [{ resourceId: "fuel", amount: 100 }, { resourceId: "energy", amount: 0 }],
    structures: [structure("OFF", {
      status: "disabled", condition: 0,
      maintenance: [{ resourceId: "fuel", amount: 10 }],
      production: [{ resourceId: "energy", amount: 20 }]
    })]
  });
  const report = simulateAdvance({ snapshot, deltaTicks: 2 });
  assert.equal(resource(report, "fuel").projectedStock, 100);
  assert.equal(resource(report, "energy").projectedStock, 0);
  assert.equal(structureReport(report, "OFF").projectedStatus, "disabled");
});

test("bateria determinística: advance(N) equivale a N×advance(1) em cenários variados", () => {
  // PRNG simples e fixo: cobre combinações de estoque, prioridade, produção,
  // Agreements, carry e storage sem introduzir flakiness na suíte.
  let seed = 0x135135;
  const rand = (max) => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed % max;
  };

  for (let scenario = 0; scenario < 24; scenario += 1) {
    const fuel = 3 + rand(30);
    const capacity = 20 + rand(45);
    const receiveTicks = 1 + rand(4);
    const ticks = 2 + rand(5);
    const initial = baseSnapshot({
      stocks: [
        { resourceId: "fuel", amount: fuel },
        { resourceId: "energy", amount: rand(8) },
        { resourceId: "metal", amount: rand(5) }
      ],
      policies: [
        { resourceId: "energy", criticalFloor: 3, reserveTarget: 8, storageCapacity: capacity }
      ],
      agreements: [{
        localId: `A${scenario}`, name: "Supply", status: "active", remainingTicks: receiveTicks,
        transfers: [{ resourceId: "fuel", direction: "receive", amountPerTick: 1 + rand(4) }]
      }],
      structures: [
        structure(`HI${scenario}`, {
          priority: 80 + rand(21), condition: 70 + rand(31),
          maintenance: [{ resourceId: "fuel", amount: 1 + rand(6) }],
          production: [{ resourceId: "energy", amount: 3 + rand(14) }]
        }),
        structure(`LO${scenario}`, {
          priority: rand(50), condition: 50 + rand(51),
          maintenance: [{ resourceId: "fuel", amount: 1 + rand(6) }],
          production: [{ resourceId: "energy", amount: 2 + rand(10) }]
        })
      ]
    });
    initial.domains[0].flows = [{
      localId: `flow-${scenario}`, resourceId: "metal", direction: "inflow", amount: 1 + rand(5),
      periodTicks: 2 + rand(4), carry: rand(2), active: true
    }];
    // carry precisa estar dentro do período gerado.
    initial.domains[0].flows[0].carry %= initial.domains[0].flows[0].periodTicks;

    const aggregateReport = simulateAdvance({ snapshot: initial, deltaTicks: ticks });
    const aggregateState = applyAggregateReport(initial, aggregateReport);

    let sequentialState = structuredClone(initial);
    for (let i = 0; i < ticks; i += 1) {
      const step = simulateAdvance({ snapshot: sequentialState, deltaTicks: 1 });
      sequentialState = applyAggregateReport(sequentialState, step);
    }

    assert.deepEqual(aggregateState.domains[0].stocks, sequentialState.domains[0].stocks, `stocks divergem no cenário ${scenario}`);
    assert.deepEqual(aggregateState.domains[0].agreements, sequentialState.domains[0].agreements, `agreements divergem no cenário ${scenario}`);
    assert.deepEqual(aggregateState.projects, sequentialState.projects, `projects divergem no cenário ${scenario}`);
    assert.deepEqual(aggregateState.structures, sequentialState.structures, `structures divergem no cenário ${scenario}`);
  }
});
