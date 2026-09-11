import test from "node:test";
import assert from "node:assert/strict";

// Os models do módulo desestruturam foundry.data.fields no import. Para testar
// apenas o pipeline puro de flags, um stub mínimo é suficiente.
class DummyField {}
class DummyDataModel {}

globalThis.foundry = {
  abstract: { DataModel: DummyDataModel },
  data: {
    fields: {
      ArrayField: DummyField,
      BooleanField: DummyField,
      NumberField: DummyField,
      SchemaField: DummyField,
      StringField: DummyField
    }
  },
  utils: {
    deepClone: (value) => structuredClone(value),
    randomID: (() => {
      let i = 0;
      return () => `RID${++i}`;
    })()
  }
};

const { migrationPipeline, CURRENT_SCHEMA_VERSION } = await import("../scripts/data/migration-pipeline.js");

test("migração v1 -> atual adiciona carry, identidade estável, management e saneia enums legados", () => {
  const input = {
    recordType: "domain",
    schemaVersion: 1,
    data: {
      identity: { category: "Base", nature: "settlement", state: "active", tags: [] },
      economy: {
        stocks: [],
        flows: [{ localId: "f1", name: "Fluxo", resourceId: "food", direction: "inflow", amount: 1, periodTicks: 3, category: "manual", source: "", active: true }]
      },
      conditions: [{ localId: "c1", name: "Crise", description: "", durationTicks: 3, severity: "crisis", category: "environmental", active: true }]
    }
  };

  const migrated = migrationPipeline.migrateDocumentFlags(input, 1);
  assert.equal(migrated.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.equal(migrated.data.identity.nature, "physical");
  assert.equal(migrated.data.economy.flows[0].carry, 0);
  assert.equal(migrated.data.conditions[0].severity, "severe");
  assert.match(migrated.data.entityId, /^domain:RID\d+$/);
  assert.equal(migrated.data.management.preset, "base");
  assert.equal(migrated.data.management.capabilities.economy, true);
  assert.equal(migrated.data.management.capabilities.structures, true);
});

test("migração v0 nunca cria nature settlement inválida", () => {
  const migrated = migrationPipeline.migrateDocumentFlags({ recordType: "domain", schemaVersion: 0, data: {} }, 0);
  assert.equal(migrated.data.identity.nature, "physical");
  assert.equal(migrated.data.identity.category, "Base");
});


test("migração v2 -> v3 preserva management explícito e adiciona entityId a registros existentes", () => {
  const domain = migrationPipeline.migrateDocumentFlags({
    recordType: "domain",
    schemaVersion: 2,
    data: {
      management: { preset: "outpost", capabilities: { diplomacy: true, population: false } }
    }
  }, 2);

  assert.equal(domain.data.management.preset, "outpost");
  assert.equal(domain.data.management.capabilities.diplomacy, true);
  assert.equal(domain.data.management.capabilities.population, false);
  assert.equal(domain.data.management.capabilities.structures, true);
  assert.match(domain.data.entityId, /^domain:RID\d+$/);

  for (const recordType of ["request", "project", "mission"]) {
    const migrated = migrationPipeline.migrateDocumentFlags({
      recordType,
      schemaVersion: 2,
      data: {}
    }, 2);
    assert.match(migrated.data.entityId, new RegExp(`^${recordType}:RID\\d+$`));
  }
});

test("migração v3 preserva entityId já persistido", () => {
  const input = {
    recordType: "domain",
    schemaVersion: 3,
    data: { entityId: "domain:fixed" }
  };
  const migrated = migrationPipeline.migrateDocumentFlags(input, 3);
  assert.equal(migrated.data.entityId, "domain:fixed");
});


test("migração v3 -> v4 estrutura metadados mínimos do histórico legado", () => {
  const migrated = migrationPipeline.migrateDocumentFlags({
    recordType: "domain",
    schemaVersion: 3,
    data: {
      entityId: "domain:fixed",
      history: [{ localId: "h1", title: "Legado", category: "story" }]
    }
  }, 3);
  assert.equal(migrated.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.equal(migrated.data.history[0].eventType, "");
  assert.equal(migrated.data.history[0].operationId, null);
  assert.deepEqual(migrated.data.history[0].entityIds, []);
  assert.deepEqual(migrated.data.history[0].metadata, []);
});


test("migração v4 -> v5 adiciona estado operacional de Mission", () => {
  const migrated = migrationPipeline.migrateDocumentFlags({
    recordType: "mission",
    schemaVersion: 4,
    data: {
      entityId: "mission:fixed",
      primaryDomainUuid: "JournalEntry.D1",
      relatedDomainUuids: [],
      origin: { kind: "manual", uuid: null },
      status: "available",
      briefing: "Recon",
      audienceUserIds: ["P1"],
      objectives: [],
      outcomeSummary: ""
    }
  }, 4);

  assert.equal(migrated.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.deepEqual(migrated.data.assignments, []);
  assert.equal(migrated.data.startedAtWorldTime, null);
  assert.equal(migrated.data.resolvedAtWorldTime, null);
});

test("migração v5 -> v6 adiciona activeProject nulo a Structures legadas", () => {
  const migrated = migrationPipeline.migrateDocumentFlags({
    recordType: "structure",
    schemaVersion: 5,
    data: {
      entityId: "structure:legacy",
      domain: { recordType: "domain", uuid: "JournalEntry.D1", entityId: "domain:D1" },
      description: "Legacy asset",
      category: "power",
      tier: 1,
      maxTier: 2,
      status: "operational",
      condition: 100,
      capacity: 10,
      maintenance: [],
      production: [],
      tags: []
    }
  }, 5);

  assert.equal(migrated.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.equal(migrated.data.activeProject, null);
});

test("migração v5 -> v6 preserva referência activeProject já existente", () => {
  const activeProject = { recordType: "project", uuid: "JournalEntry.P1", entityId: "project:P1" };
  const migrated = migrationPipeline.migrateDocumentFlags({
    recordType: "structure",
    schemaVersion: 5,
    data: {
      entityId: "structure:planned",
      activeProject,
      domain: { recordType: "domain", uuid: "JournalEntry.D1", entityId: "domain:D1" }
    }
  }, 5);

  assert.deepEqual(migrated.data.activeProject, activeProject);
});
