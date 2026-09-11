import test from "node:test";
import assert from "node:assert/strict";

class DummyField {}
class DummyDataModel {
  constructor(data = {}) {
    this.data = structuredClone(data);
  }
  validate() {
    this.constructor.validateJoint?.(this.data);
    return true;
  }
  toObject() {
    return structuredClone(this.data);
  }
}

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
    randomID: () => "RANDOM"
  }
};

const { RecordIndex } = await import("../scripts/data/record-index.js");

function doc(uuid, recordType, data) {
  const flags = {
    "domain-manager": {
      recordType,
      schemaVersion: 9,
      data
    }
  };
  return {
    uuid,
    documentName: "JournalEntry",
    flags,
    getFlag(moduleId, key) {
      return flags[moduleId]?.[key];
    }
  };
}

test("RecordIndex indexa entidades novas por relações e entityId", () => {
  const index = new RecordIndex();

  const squad = doc("JournalEntry.S1", "squad", {
    entityId: "squad:S1",
    parentDomain: { recordType: "domain", uuid: "JournalEntry.D1", entityId: "domain:D1" },
    capacity: 20,
    strength: 20,
    composition: [],
    resources: [],
    equipment: [],
    notablePeople: [],
    governance: { controllers: [] },
    tags: []
  });
  const person = doc("JournalEntry.P1", "person", {
    entityId: "person:P1",
    primaryDomain: { recordType: "domain", uuid: "JournalEntry.D1", entityId: "domain:D1" },
    squad: { recordType: "squad", uuid: "JournalEntry.S1", entityId: "squad:S1" },
    tags: []
  });
  const structure = doc("JournalEntry.B1", "structure", {
    entityId: "structure:B1",
    domain: { recordType: "domain", uuid: "JournalEntry.D1", entityId: "domain:D1" },
    activeProject: { recordType: "project", uuid: "JournalEntry.PR1", entityId: "project:PR1" },
    tier: 1,
    maxTier: 1,
    maintenance: [],
    production: [],
    tags: []
  });
  const agreement = doc("JournalEntry.A1", "agreement", {
    entityId: "agreement:A1",
    parties: [
      { recordType: "domain", uuid: "JournalEntry.D1", entityId: "domain:D1" },
      { recordType: "domain", uuid: "JournalEntry.D2", entityId: "domain:D2" }
    ],
    transfers: [],
    tags: []
  });

  for (const document of [squad, person, structure, agreement]) index.upsert(document);

  assert.equal(index.getByEntityId("squad:S1")?.uuid, "JournalEntry.S1");
  assert.deepEqual(index.squadsForDomain("JournalEntry.D1").map((d) => d.uuid), ["JournalEntry.S1"]);
  assert.deepEqual(index.peopleForDomain("JournalEntry.D1").map((d) => d.uuid), ["JournalEntry.P1"]);
  assert.deepEqual(index.peopleForSquad("JournalEntry.S1").map((d) => d.uuid), ["JournalEntry.P1"]);
  assert.deepEqual(index.structuresForDomain("JournalEntry.D1").map((d) => d.uuid), ["JournalEntry.B1"]);
  assert.deepEqual(index.agreementsForDomain("JournalEntry.D2").map((d) => d.uuid), ["JournalEntry.A1"]);
  assert.deepEqual(index.squadsForDomain("domain:D1").map((d) => d.uuid), ["JournalEntry.S1"]);
  assert.deepEqual(index.peopleForSquad("squad:S1").map((d) => d.uuid), ["JournalEntry.P1"]);
  assert.deepEqual(index.structuresForDomain("domain:D1").map((d) => d.uuid), ["JournalEntry.B1"]);
  assert.deepEqual(index.structuresForProject("JournalEntry.PR1").map((d) => d.uuid), ["JournalEntry.B1"]);
  assert.deepEqual(index.structuresForProject("project:PR1").map((d) => d.uuid), ["JournalEntry.B1"]);
  assert.deepEqual(index.agreementsForDomain("domain:D2").map((d) => d.uuid), ["JournalEntry.A1"]);
});

test("RecordIndex rejeita colisão de entityId entre documentos", () => {
  const index = new RecordIndex();
  index.upsert(doc("JournalEntry.S1", "squad", {
    entityId: "squad:shared",
    capacity: 1,
    strength: 0,
    composition: [],
    resources: [],
    equipment: [],
    notablePeople: [],
    governance: { controllers: [] },
    tags: []
  }));

  assert.throws(() => index.upsert(doc("JournalEntry.S2", "squad", {
    entityId: "squad:shared",
    capacity: 1,
    strength: 0,
    composition: [],
    resources: [],
    equipment: [],
    notablePeople: [],
    governance: { controllers: [] },
    tags: []
  })), /entityId duplicado/i);
});

test("RecordIndex.locatedChildren devolve Domains filhos e nunca tenta reinterpretá-los como Person", () => {
  const index = new RecordIndex();
  const parent = doc("JournalEntry.D1", "domain", {
    entityId: "domain:D1", identity: { tags: [] }, governance: { controllers: [] }, hierarchy: { locatedInUuid: null, administrativeParentUuid: null },
    economy: { stocks: [], flows: [], resourcePolicies: [] }, population: { groups: [], notables: [] }
  });
  const child = doc("JournalEntry.D2", "domain", {
    entityId: "domain:D2", identity: { tags: [] }, governance: { controllers: [] }, hierarchy: { locatedInUuid: parent.uuid, administrativeParentUuid: null },
    economy: { stocks: [], flows: [], resourcePolicies: [] }, population: { groups: [], notables: [] }
  });
  index.upsert(parent); index.upsert(child);
  assert.deepEqual(index.locatedChildren(parent.uuid).map((entry) => entry.uuid), [child.uuid]);
});
