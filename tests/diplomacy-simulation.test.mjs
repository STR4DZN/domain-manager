import test from "node:test";
import assert from "node:assert/strict";
import { buildSimulationSnapshot } from "../scripts/simulation/snapshot.js";
import { simulateAdvance } from "../scripts/simulation/simulate.js";

const catalog = [{ id: "fuel", name: "Fuel", unit: "u", precision: 0, allowNegative: false }];

function domain(id, amount, { capacity = 0, reserved = 0 } = {}) {
  return {
    uuid: `JournalEntry.${id}`,
    entityId: `domain:${id}`,
    name: id,
    data: {
      entityId: `domain:${id}`,
      population: { total: 0, countMode: "direct", morale: 60, groups: [], workforce: { allocations: [] } },
      security: { guardCount: 0 },
      economy: {
        sustenanceSettings: { enabled: false },
        resourcePolicies: capacity ? [{ resourceId: "fuel", criticalFloor: 0, reserveTarget: 0, storageCapacity: capacity }] : [],
        stocks: [{ resourceId: "fuel", amount }],
        flows: []
      },
      relations: [], agreements: [], intel: [], history: []
    },
    reserved
  };
}

function ref(id) {
  return { recordType: "domain", uuid: `JournalEntry.${id}`, entityId: `domain:${id}` };
}

function agreement({ amount = 5, periodTicks = 1, carry = 0, status = "active", startTick = null, endTick = null } = {}) {
  return {
    uuid: "JournalEntry.A1",
    entityId: "agreement:A1",
    name: "Supply Pact",
    data: {
      entityId: "agreement:A1",
      description: "",
      parties: [ref("A"), ref("B")],
      type: "trade",
      status,
      startTick,
      endTick,
      transfers: [{ localId: "t1", resourceId: "fuel", fromDomain: ref("A"), toDomain: ref("B"), amount, periodTicks, carry }],
      tags: []
    }
  };
}

function stock(report, domainId) {
  const domainReport = report.domains.find((entry) => entry.entityId === `domain:${domainId}`);
  return domainReport.resources.find((entry) => entry.resourceId === "fuel");
}

function applyReport(snapshot, report) {
  const next = structuredClone(snapshot);
  next.currentTick = report.currentTick;
  for (const domainReport of report.domains) {
    const domain = next.domains.find((entry) => entry.uuid === domainReport.uuid);
    domain.stocks = domainReport.resources.map((entry) => ({
      resourceId: entry.resourceId,
      amount: entry.allowNegative ? entry.projectedStock : Math.max(0, entry.projectedStock)
    }));
  }
  const reportMap = new Map(report.agreements.map((entry) => [entry.entityId ?? entry.uuid, entry]));
  next.agreements = next.agreements.map((entry) => {
    const projected = reportMap.get(entry.entityId ?? entry.uuid);
    if (!projected) return entry;
    const transfers = new Map(projected.transfers.map((transfer) => [transfer.localId, transfer]));
    return {
      ...entry,
      status: projected.projectedStatus,
      transfers: entry.transfers.map((transfer) => ({ ...transfer, carry: transfers.get(transfer.localId)?.projectedCarry ?? transfer.carry }))
    };
  });
  return next;
}

test("Agreement independente conserva estoque entre Domains", () => {
  const snapshot = buildSimulationSnapshot({ domains: [domain("A", 10), domain("B", 1)], agreements: [agreement()], catalog, currentTick: 0 });
  const report = simulateAdvance({ snapshot, deltaTicks: 1 });
  assert.equal(stock(report, "A").projectedStock, 5);
  assert.equal(stock(report, "B").projectedStock, 6);
  assert.equal(report.agreements[0].transfers[0].due, 5);
  assert.equal(report.agreements[0].transfers[0].transferred, 5);
  assert.equal(report.agreements[0].projectedStatus, "active");
});

test("Agreement entra em breached e nunca cria recurso quando origem não cobre obrigação", () => {
  const snapshot = buildSimulationSnapshot({ domains: [domain("A", 3), domain("B", 0)], agreements: [agreement({ amount: 5 })], catalog, currentTick: 0 });
  const report = simulateAdvance({ snapshot, deltaTicks: 1 });
  assert.equal(stock(report, "A").projectedStock, 0);
  assert.equal(stock(report, "B").projectedStock, 3);
  assert.equal(report.agreements[0].projectedStatus, "breached");
  assert.equal(report.agreements[0].transfers[0].shortfall, 2);
  assert.ok(report.alerts.some((entry) => entry.type === "agreementBreach" && entry.missing === 2));
});

test("Agreement periódico preserva carry e advance(N) equivale a N × advance(1)", () => {
  const base = buildSimulationSnapshot({ domains: [domain("A", 10), domain("B", 0)], agreements: [agreement({ amount: 1, periodTicks: 3 })], catalog, currentTick: 10 });
  const bulk = simulateAdvance({ snapshot: base, deltaTicks: 3 });
  let sequential = structuredClone(base);
  let last;
  for (let i = 0; i < 3; i += 1) {
    last = simulateAdvance({ snapshot: sequential, deltaTicks: 1 });
    sequential = applyReport(sequential, last);
  }
  const bulkState = applyReport(base, bulk);
  assert.deepEqual(bulkState.domains.map((entry) => entry.stocks), sequential.domains.map((entry) => entry.stocks));
  assert.deepEqual(bulkState.agreements, sequential.agreements);
  assert.equal(bulk.currentTick, 13);
  assert.equal(stock(bulk, "B").projectedStock, 1);
  assert.equal(bulk.agreements[0].transfers[0].projectedCarry, 0);
});

test("Agreement usa start/end tick inclusivos e expira antes do tick seguinte", () => {
  const snapshot = buildSimulationSnapshot({
    domains: [domain("A", 10), domain("B", 0)],
    agreements: [agreement({ amount: 2, startTick: 2, endTick: 2 })],
    catalog,
    currentTick: 1
  });
  const report = simulateAdvance({ snapshot, deltaTicks: 2 });
  assert.equal(stock(report, "A").projectedStock, 8);
  assert.equal(stock(report, "B").projectedStock, 2);
  assert.equal(report.agreements[0].projectedStatus, "expired");
  assert.equal(report.agreements[0].expiredDuringAdvance, true);
  assert.ok(report.alerts.some((entry) => entry.type === "agreementExpired"));
});

test("recebimento de Agreement respeita storageCapacity e reporta overflow explícito", () => {
  const snapshot = buildSimulationSnapshot({ domains: [domain("A", 10), domain("B", 3, { capacity: 4 })], agreements: [agreement({ amount: 5 })], catalog, currentTick: 0 });
  const report = simulateAdvance({ snapshot, deltaTicks: 1 });
  assert.equal(stock(report, "A").projectedStock, 5);
  assert.equal(stock(report, "B").projectedStock, 4);
  assert.equal(stock(report, "B").storageOverflow, 4);
  assert.equal(report.agreements[0].transfers[0].overflow, 4);
  assert.ok(report.alerts.some((entry) => entry.type === "storageOverflow" && entry.agreementUuid === "JournalEntry.A1"));
});
