import test from "node:test";
import assert from "node:assert/strict";
import { buildStrategicDomainLedger, buildStrategicDomainFlows } from "../scripts/features/economy/strategic.js";
import { normalizeResourcePolicies } from "../scripts/features/economy/contracts.js";

const catalog = { resources: [
  { id: "food", name: "Alimento", precision: 0, allowNegative: false, unit: "u" },
  { id: "water", name: "Água", precision: 0, allowNegative: false, unit: "u" },
  { id: "fuel", name: "Combustível", precision: 0, allowNegative: false, unit: "u" },
  { id: "energy", name: "Energia", precision: 0, allowNegative: false, unit: "u" },
  { id: "credits", name: "Créditos", precision: 2, allowNegative: false, unit: "cr" }
]};

const domain = {
  economy: {
    stocks: [
      { resourceId: "food", amount: 80 },
      { resourceId: "water", amount: 80 },
      { resourceId: "fuel", amount: 40 },
      { resourceId: "energy", amount: 10 }
    ],
    flows: [{ localId: "grid", name: "Grid", resourceId: "energy", direction: "inflow", amount: 5, periodTicks: 1, carry: 0, active: true, source: "manual" }],
    resourcePolicies: [{ resourceId: "fuel", criticalFloor: 20, reserveTarget: 50, storageCapacity: 100 }],
    sustenanceSettings: { enabled: true, foodPer100: 1, waterPer100: 1, guardUpkeep: 1 }
  },
  population: { total: 150, groups: [] },
  security: { guardCount: 0 },
  agreements: [{ localId: "agr1", name: "Pacto", status: "active", transfers: [{ resourceId: "fuel", direction: "receive", amountPerTick: 3 }] }]
};
const structures = [{
  entityId: "structure:reactor",
  name: "Reator",
  status: "operational",
  condition: 100,
  maintenancePriority: 100,
  maintenance: [{ resourceId: "fuel", amount: 4 }],
  production: [{ resourceId: "energy", amount: 20 }]
}];

test("ledger estratégico inclui sustento, Structures, acordos e fluxos persistentes", () => {
  const flows = buildStrategicDomainFlows({ domain, catalog, structures });
  assert.ok(flows.some((flow) => flow.localId === "upkeep_food"));
  assert.ok(flows.some((flow) => flow.localId.includes("structure:reactor:maintenance")));
  assert.ok(flows.some((flow) => flow.localId.startsWith("agreement:agr1")));

  const ledger = buildStrategicDomainLedger({ domain, catalog, structures, reservations: [] });
  const energy = ledger.find((row) => row.resourceId === "energy");
  const fuel = ledger.find((row) => row.resourceId === "fuel");
  assert.equal(energy.netPerTickDisplay, "+25");
  assert.equal(fuel.netPerTickDisplay, "-1");
  assert.equal(fuel.belowReserve, true);
  assert.equal(fuel.critical, false);
  assert.equal(fuel.storageUtilizationPercent, 40);
  assert.equal(fuel.reserveGap, 10);
});

test("políticas rejeitam pisos/reservas/capacidade incoerentes", () => {
  assert.throws(() => normalizeResourcePolicies([
    { resourceId: "fuel", criticalFloor: 60, reserveTarget: 50, storageCapacity: 100 }
  ], catalog), /Piso crítico/i);
  assert.throws(() => normalizeResourcePolicies([
    { resourceId: "fuel", criticalFloor: 10, reserveTarget: 120, storageCapacity: 100 }
  ], catalog), /capacidade/i);
});
