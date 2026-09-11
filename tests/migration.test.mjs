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

test("migração v6 -> v7 adiciona políticas econômicas e prioridade de manutenção", () => {
  const domain = migrationPipeline.migrateDocumentFlags({
    recordType: "domain", schemaVersion: 6,
    data: { entityId: "domain:legacy", economy: { stocks: [], flows: [] } }
  }, 6);
  assert.equal(domain.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.deepEqual(domain.data.economy.resourcePolicies, []);

  const structure = migrationPipeline.migrateDocumentFlags({
    recordType: "structure", schemaVersion: 6,
    data: { entityId: "structure:legacy", status: "operational", condition: 100 }
  }, 6);
  assert.equal(structure.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.equal(structure.data.maintenancePriority, 50);
});

test("migração v6 -> v7 preserva políticas e prioridade já definidas", () => {
  const policies = [{ resourceId: "fuel", criticalFloor: 10, reserveTarget: 20, storageCapacity: 100 }];
  const domain = migrationPipeline.migrateDocumentFlags({
    recordType: "domain", schemaVersion: 6,
    data: { entityId: "domain:configured", economy: { stocks: [], flows: [], resourcePolicies: policies } }
  }, 6);
  assert.deepEqual(domain.data.economy.resourcePolicies, policies);

  const structure = migrationPipeline.migrateDocumentFlags({
    recordType: "structure", schemaVersion: 6,
    data: { entityId: "structure:critical", maintenancePriority: 95 }
  }, 6);
  assert.equal(structure.data.maintenancePriority, 95);
});

test("migração v7 -> v8 adiciona moral, workforce e staffing sem perder dados civis", () => {
  const domain = migrationPipeline.migrateDocumentFlags({
    recordType: "domain",
    schemaVersion: 7,
    data: {
      entityId: "domain:civil",
      population: {
        total: 120,
        countMode: "direct",
        groups: [
          { localId: "g1", name: "Operários", count: 80, includedInTotal: true, quality: "Estável", status: "active", assignment: "Mineração" },
          { localId: "g2", name: "Reserva", count: 40, includedInTotal: true, quality: "Insatisfeito", status: "inactive", assignment: "" }
        ],
        notables: []
      }
    }
  }, 7);

  assert.equal(domain.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.equal(domain.data.population.morale, 60);
  assert.equal(domain.data.population.groups[0].morale, 70);
  assert.equal(domain.data.population.groups[0].workforceEligible, 80);
  assert.equal(domain.data.population.groups[1].morale, 40);
  assert.equal(domain.data.population.groups[1].workforceEligible, 40);
  assert.deepEqual(domain.data.population.workforce.allocations, []);
  assert.equal(domain.data.population.groups[0].assignment, "Mineração");
});

test("migração v7 -> v8 preserva workforce/moral explícitos e adiciona workforceRequired a Structure", () => {
  const allocation = {
    localId: "wa1",
    groupLocalId: "g1",
    target: { recordType: "structure", entityId: "structure:S1" },
    count: 4,
    role: "Operadores"
  };
  const domain = migrationPipeline.migrateDocumentFlags({
    recordType: "domain", schemaVersion: 7,
    data: {
      entityId: "domain:civil",
      population: {
        total: 10,
        countMode: "direct",
        morale: 82,
        groups: [{ localId: "g1", name: "Técnicos", count: 10, morale: 91, workforceEligible: 6 }],
        workforce: { allocations: [allocation] },
        notables: []
      }
    }
  }, 7);
  assert.equal(domain.data.population.morale, 82);
  assert.equal(domain.data.population.groups[0].morale, 91);
  assert.equal(domain.data.population.groups[0].workforceEligible, 6);
  assert.deepEqual(domain.data.population.workforce.allocations, [allocation]);

  const structure = migrationPipeline.migrateDocumentFlags({
    recordType: "structure", schemaVersion: 7,
    data: { entityId: "structure:S1", maintenancePriority: 90 }
  }, 7);
  assert.equal(structure.data.workforceRequired, 0);
});

test("migração v7 -> v8 adiciona estado humano mínimo a Person legado", () => {
  const person = migrationPipeline.migrateDocumentFlags({
    recordType: "person", schemaVersion: 7,
    data: { entityId: "person:P1", role: "Medic" }
  }, 7);
  assert.equal(person.data.portrait, "");
  assert.equal(person.data.morale, 60);
  assert.equal(person.data.condition, 100);
});

test("migração v8 -> v9 adiciona território e moderniza relações/intel sem apagar legado", () => {
  const migrated = migrationPipeline.migrateDocumentFlags({
    recordType: "domain",
    schemaVersion: 8,
    data: {
      entityId: "domain:D1",
      relations: [{ localId: "r1", targetDomainUuid: "JournalEntry.D2", posture: "friendly", notes: "Legado" }],
      intel: [{ localId: "i1", title: "Contato", category: "fact", visibility: "gm_only", content: "", credibility: "confirmed", source: "", revealed: false, tags: [] }]
    }
  }, 8);

  assert.equal(migrated.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.deepEqual(migrated.data.territory, {
    controlState: "unknown",
    controller: null,
    control: 0,
    strategicValue: 0,
    influence: [],
    notes: ""
  });
  assert.deepEqual(migrated.data.relations[0].target, {
    recordType: "domain",
    uuid: "JournalEntry.D2",
    entityId: null
  });
  assert.equal(migrated.data.relations[0].targetDomainUuid, "JournalEntry.D2");
  assert.equal(migrated.data.relations[0].score, 0);
  assert.equal(migrated.data.relations[0].trust, 50);
  assert.equal(migrated.data.relations[0].tension, 0);
  assert.equal(migrated.data.intel[0].targetDomain, null);
});

test("migração v8 -> v9 preserva estado territorial e referências modernas explícitas", () => {
  const target = { recordType: "domain", uuid: "JournalEntry.D2", entityId: "domain:D2" };
  const territory = {
    controlState: "contested",
    controller: target,
    control: 64,
    strategicValue: 91,
    influence: [{ localId: "inf1", domain: target, value: 64, notes: "Pressão" }],
    notes: "Fronteira disputada"
  };
  const migrated = migrationPipeline.migrateDocumentFlags({
    recordType: "domain",
    schemaVersion: 8,
    data: {
      entityId: "domain:D1",
      territory,
      relations: [{ localId: "r1", targetDomainUuid: "JournalEntry.D2", target, posture: "rival", score: -45, trust: 12, tension: 88, notes: "" }],
      intel: [{ localId: "i1", title: "Alvo", category: "secret", visibility: "gm_only", targetDomain: target, content: "x", credibility: "likely", source: "agent", revealed: false, tags: [] }]
    }
  }, 8);

  assert.deepEqual(migrated.data.territory, territory);
  assert.deepEqual(migrated.data.relations[0].target, target);
  assert.equal(migrated.data.relations[0].score, -45);
  assert.equal(migrated.data.relations[0].trust, 12);
  assert.equal(migrated.data.relations[0].tension, 88);
  assert.deepEqual(migrated.data.intel[0].targetDomain, target);
});
