import test from "node:test";
import assert from "node:assert/strict";
import {
  formatPercent,
  meterSegments,
  statusTone,
  summarizeDomainTelemetry
} from "../scripts/ui/presentation.js";

test("statusTone mantém semântica de estado", () => {
  assert.equal(statusTone("operational"), "nominal");
  assert.equal(statusTone("blocked"), "critical");
  assert.equal(statusTone("recovering"), "warning");
  assert.equal(statusTone("unknown"), "neutral");
});

test("meterSegments produz quantidade determinística", () => {
  const segments = meterSegments(61, { segments: 10 });
  assert.equal(segments.length, 10);
  assert.equal(segments.filter((item) => item.on).length, 6);
});

test("percentual é clampado", () => {
  assert.equal(formatPercent(150), "100%");
  assert.equal(formatPercent(-2), "0%");
});

test("telemetria agrega registros relacionados", () => {
  const telemetry = summarizeDomainTelemetry({
    domain: { data: { population: { total: 20 }, economy: { stocks: [{ resourceId: "food" }], flows: [{ active: true }] }, conditions: [{ localId: "c" }], intel: [] } },
    projects: [{ data: { status: "active" } }, { data: { status: "completed" } }],
    missions: [{ data: { status: "available" } }],
    squads: [{ data: { status: "ready" } }],
    structures: [{ data: { status: "operational" } }]
  });
  assert.equal(telemetry.population, 20);
  assert.equal(telemetry.resourceKinds, 1);
  assert.equal(telemetry.activeFlows, 1);
  assert.equal(telemetry.activeProjects, 1);
  assert.equal(telemetry.activeMissions, 1);
  assert.equal(telemetry.readySquads, 1);
  assert.equal(telemetry.operationalStructures, 1);
  assert.equal(telemetry.conditions, 1);
});
