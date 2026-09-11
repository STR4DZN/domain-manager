import test from "node:test";
import assert from "node:assert/strict";

class DummyField {}
let entityCounter = 1;
class DummyDataModel {
  constructor(data = {}) {
    this.data = structuredClone(data);
    const typeByClass = { DomainModel: "domain", StructureModel: "structure", SquadModel: "squad", PersonModel: "person" };
    const type = typeByClass[this.constructor.name];
    if (!this.data.entityId && type) this.data.entityId = `${type}:AUTO${entityCounter++}`;
  }
  validate() { this.constructor.validateJoint?.(this.data); return true; }
  toObject() { return structuredClone(this.data); }
}

globalThis.foundry = {
  abstract: { DataModel: DummyDataModel },
  data: { fields: { ArrayField: DummyField, BooleanField: DummyField, NumberField: DummyField, SchemaField: DummyField, StringField: DummyField } },
  utils: { deepClone: (value) => structuredClone(value), randomID: () => `RID${entityCounter++}` }
};
globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0, OBSERVER: 2, OWNER: 3 } };
globalThis.Hooks = { callAll() {} };

const users = new Map([
  ["GM", { id: "GM", uuid: "User.GM", name: "Primary GM", isGM: true, active: true }],
  ["P1", { id: "P1", uuid: "User.P1", name: "Controller", isGM: false, active: true }],
  ["P2", { id: "P2", uuid: "User.P2", name: "Visitor", isGM: false, active: true }]
]);
users.get = Map.prototype.get.bind(users);
users.activeGM = users.get("GM");
users.contents = [...users.values()];

const docs = new Map();
let operationLedger = { version: 1, receipts: [] };
const dataFolder = { id: "DATA", type: "JournalEntry", getFlag: () => true };
const folders = { get: (id) => id === "DATA" ? dataFolder : null, find: (fn) => fn(dataFolder) ? dataFolder : null };

globalThis.game = {
  user: users.get("GM"), users, journal: [], folders, modules: new Map(),
  settings: {
    get(_m, key) {
      if (key === "dataFolderId") return "DATA";
      if (key === "operationLedger") return structuredClone(operationLedger);
      return null;
    },
    async set(_m, key, value) { if (key === "operationLedger") operationLedger = structuredClone(value); return value; }
  }
};
globalThis.Folder = { async create() { throw new Error("folder exists"); } };
globalThis.fromUuid = async (uuid) => docs.get(uuid) ?? null;

function setPath(target, path, value) {
  const parts = path.split("."); let cursor = target;
  for (const part of parts.slice(0, -1)) { cursor[part] ??= {}; cursor = cursor[part]; }
  cursor[parts.at(-1)] = structuredClone(value);
}
function makeDoc({ id, name, recordType, data, ownership = {} }) {
  const doc = {
    id, uuid: `JournalEntry.${id}`, documentName: "JournalEntry", name,
    ownership: structuredClone(ownership),
    flags: { "domain-manager": { recordType, schemaVersion: 9, data: structuredClone(data) } },
    getFlag(moduleId, key) { return this.flags[moduleId]?.[key]; },
    testUserPermission(actor, level) { return actor.isGM || Number(this.ownership?.[actor.id] ?? 0) >= level; },
    async update(changes) {
      for (const [key, value] of Object.entries(changes)) {
        if (key === "name") this.name = value;
        else if (key === "ownership") this.ownership = structuredClone(value);
        else setPath(this, key, value);
      }
      recordIndexRef?.upsert(this);
      return this;
    },
    async delete() { docs.delete(this.uuid); game.journal = game.journal.filter((entry) => entry.uuid !== this.uuid); recordIndexRef?.remove(this.uuid); return this; }
  };
  docs.set(doc.uuid, doc); return doc;
}

let createCounter = 1;
let recordIndexRef = null;
globalThis.JournalEntry = {
  async create(payload) {
    const flags = payload.flags["domain-manager"];
    const doc = makeDoc({ id: `NEW${createCounter++}`, name: payload.name, recordType: flags.recordType, data: flags.data, ownership: payload.ownership });
    game.journal.push(doc); recordIndexRef?.upsert(doc); return doc;
  },
  async updateDocuments(changes) {
    const out = [];
    for (const update of changes) {
      const doc = [...docs.values()].find((entry) => entry.id === update._id);
      const copy = { ...update }; delete copy._id; await doc.update(copy); out.push(doc);
    }
    return out;
  }
};

const { recordIndex } = await import("../scripts/data/record-index.js");
recordIndexRef = recordIndex;
const { dispatchAuthoritativeCommand } = await import("../scripts/commands/execute.js");

function domain({ id = "D1", entityId = "domain:D1", controllers = ["P1"], population = true, people = true } = {}) {
  return makeDoc({ id, name: `Domain ${id}`, recordType: "domain", ownership: { default: 0, P1: 2 }, data: {
    entityId, description: "",
    management: { preset: "base", capabilities: { population, people, structures: true, squads: true } },
    governance: { controllers }, identity: { tags: [] },
    economy: { stocks: [], flows: [], resourcePolicies: [] },
    population: { total: 10, countMode: "direct", morale: 60, groups: [], workforce: { allocations: [] }, notables: [] },
    security: { guardCount: 0 }, conditions: [], relations: [], agreements: [], intel: [], history: [], notifications: []
  }});
}
function structure(domainDoc, { id = "S1", entityId = "structure:S1", workforceRequired = 4 } = {}) {
  return makeDoc({ id, name: `Structure ${id}`, recordType: "structure", data: {
    entityId,
    domain: { recordType: "domain", uuid: domainDoc.uuid, entityId: domainDoc.getFlag("domain-manager", "data").entityId },
    activeProject: null, description: "", category: "industry", tier: 1, maxTier: 1, status: "operational", condition: 100,
    capacity: 0, maintenancePriority: 50, workforceRequired, maintenance: [], production: [], tags: []
  }});
}
function squad(domainDoc, { id = "SQ1", entityId = "squad:SQ1" } = {}) {
  return makeDoc({ id, name: `Squad ${id}`, recordType: "squad", data: {
    entityId,
    description: "",
    parentDomain: { recordType: "domain", uuid: domainDoc.uuid, entityId: domainDoc.getFlag("domain-manager", "data").entityId },
    governance: { controllers: ["P1"] }, status: "ready", capacity: 20, strength: 10, morale: 60, condition: 100,
    composition: [], resources: [], equipment: [], notablePeople: [], currentMission: null, tags: []
  }});
}
function ref(doc, type) { const data = doc.getFlag("domain-manager", "data"); return { recordType: type, uuid: doc.uuid, entityId: data.entityId }; }
function reset(...documents) {
  docs.clear(); for (const d of documents) docs.set(d.uuid, d); game.journal = documents; operationLedger = { version: 1, receipts: [] }; game.user = users.get("GM"); recordIndex.rebuild();
}

async function command(commandType, operationId, payload, callerUserId = "P1") {
  return dispatchAuthoritativeCommand({ commandType, operationId, payload }, { callerUserId });
}

test("controlador configura população e retry é idempotente", async () => {
  const d = domain(); reset(d);
  const envelope = { domain: ref(d, "domain"), total: 240, countMode: "direct", morale: 74 };
  const first = await command("population.configure", "pop-conf-1", envelope);
  const second = await command("population.configure", "pop-conf-1", envelope);
  const data = d.getFlag("domain-manager", "data");
  assert.equal(data.population.total, 240);
  assert.equal(data.population.morale, 74);
  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
});

test("population commands respeitam controlador e capability", async () => {
  const d = domain(); reset(d);
  await assert.rejects(() => command("population.configure", "pop-denied", { domain: ref(d, "domain"), total: 10, morale: 60, countMode: "direct" }, "P2"), /não controla/i);
  const noCapability = domain({ id: "D2", entityId: "domain:D2", population: false }); reset(noCapability);
  await assert.rejects(() => command("population.configure", "pop-cap", { domain: ref(noCapability, "domain"), total: 10, morale: 60, countMode: "direct" }), /capability population/i);
});

test("grupo civil + workforce validam capacidade, Domain da Structure e remoção segura", async () => {
  const d1 = domain(); const st1 = structure(d1); reset(d1, st1);
  const created = await command("population.group-upsert", "group-1", {
    domain: ref(d1, "domain"), name: "Engenheiros", count: 10, workforceEligible: 6, morale: 80, status: "active", function: "Engineering"
  });
  const localId = created.group.localId;
  assert.ok(localId);

  await command("population.workforce-set", "wf-1", { domain: ref(d1, "domain"), allocations: [
    { groupLocalId: localId, target: ref(st1, "structure"), count: 4, role: "Operators" }
  ]});
  assert.equal(d1.getFlag("domain-manager", "data").population.workforce.allocations[0].count, 4);

  await assert.rejects(() => command("population.workforce-set", "wf-over", { domain: ref(d1, "domain"), allocations: [
    { groupLocalId: localId, target: ref(st1, "structure"), count: 7 }
  ]}), /excede elegíveis/i);
  await assert.rejects(() => command("population.group-remove", "group-remove-blocked", { domain: ref(d1, "domain"), localId }), /alocações/i);

  const d2 = domain({ id: "D2", entityId: "domain:D2" }); const st2 = structure(d2, { id: "S2", entityId: "structure:S2" }); reset(d1, st1, d2, st2);
  await assert.rejects(() => command("population.workforce-set", "wf-cross", { domain: ref(d1, "domain"), allocations: [
    { groupLocalId: localId, target: ref(st2, "structure"), count: 1 }
  ]}), /não pertence/i);
});

test("Person create/update usa people capability, ownership do Domain e Squad compatível", async () => {
  const d = domain(); const sq = squad(d); reset(d, sq);
  const created = await command("person.create", "person-1", {
    domain: ref(d, "domain"), name: "Helena Torres", role: "Medical Officer", specialization: "Trauma", morale: 83, condition: 92,
    status: "active", squad: ref(sq, "squad"), tags: ["medic"]
  });
  const personDoc = recordIndex.getByEntityId(created.entityId);
  assert.ok(personDoc);
  assert.equal(personDoc.ownership.P1, 2);
  assert.equal(personDoc.getFlag("domain-manager", "data").primaryDomain.entityId, "domain:D1");
  assert.equal(personDoc.getFlag("domain-manager", "data").squad.entityId, "squad:SQ1");

  const updated = await command("person.update", "person-2", {
    person: { recordType: "person", entityId: created.entityId }, name: "Dr. Helena Torres", role: "Chief Medical Officer", specialization: "Trauma", morale: 88, condition: 95,
    status: "active", squad: ref(sq, "squad"), tags: ["medic", "command"]
  });
  assert.equal(updated.name, "Dr. Helena Torres");
  assert.equal(updated.morale, 88);
  assert.equal(personDoc.name, "Dr. Helena Torres");
});

test("Person rejeita visitante e Squad pertencente a outro Domain", async () => {
  const d1 = domain(); const d2 = domain({ id: "D2", entityId: "domain:D2" }); const sq2 = squad(d2, { id: "SQ2", entityId: "squad:SQ2" }); reset(d1, d2, sq2);
  await assert.rejects(() => command("person.create", "person-denied", { domain: ref(d1, "domain"), name: "Visitor", morale: 60, condition: 100 }, "P2"), /não controla/i);
  await assert.rejects(() => command("person.create", "person-cross", { domain: ref(d1, "domain"), name: "Wrong Squad", squad: ref(sq2, "squad"), morale: 60, condition: 100 }), /não pertence/i);
});
