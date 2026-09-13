import test from "node:test";
import assert from "node:assert/strict";

class DummyField {}
let nextEntity = 1;
class DummyDataModel {
  constructor(data = {}) {
    this.data = structuredClone(data);
    if (!this.data.entityId && this.constructor.name === "SquadModel") {
      this.data.entityId = `squad:TEST${nextEntity++}`;
    }
  }
  validate() { this.constructor.validateJoint?.(this.data); return true; }
  toObject() { return structuredClone(this.data); }
}

globalThis.foundry = {
  abstract: { DataModel: DummyDataModel },
  data: { fields: { ArrayField: DummyField, BooleanField: DummyField, NumberField: DummyField, SchemaField: DummyField, StringField: DummyField } },
  utils: {
    deepClone: (value) => structuredClone(value),
    randomID: () => `RID${nextEntity++}`
  }
};
globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0, OBSERVER: 2, OWNER: 3 } };
globalThis.Hooks = { callAll() {} };

const docs = new Map();
const users = new Map([
  ["GM", { id: "GM", uuid: "User.GM", name: "Primary GM", isGM: true, active: true }],
  ["P1", { id: "P1", uuid: "User.P1", name: "Operator One", isGM: false, active: true }],
  ["P2", { id: "P2", uuid: "User.P2", name: "Operator Two", isGM: false, active: true }]
]);
users.get = Map.prototype.get.bind(users);
users.activeGM = users.get("GM");
users.contents = [...users.values()];

let operationLedger = { version: 1, receipts: [] };
const dataFolder = { id: "F_DATA", type: "JournalEntry", getFlag: () => true };
const folders = {
  get(id) { return id === dataFolder.id ? dataFolder : null; },
  find(fn) { return fn(dataFolder) ? dataFolder : null; }
};

globalThis.game = {
  user: users.get("GM"),
  users,
  journal: [],
  folders,
  settings: {
    get(_moduleId, key) {
      if (key === "dataFolderId") return dataFolder.id;
      if (key === "operationLedger") return structuredClone(operationLedger);
      return null;
    },
    async set(_moduleId, key, value) {
      if (key === "operationLedger") operationLedger = structuredClone(value);
      return value;
    }
  }
};

globalThis.Folder = { async create() { throw new Error("folder should already exist"); } };

globalThis.fromUuid = async (uuid) => docs.get(uuid) ?? null;

function applyPath(target, path, value) {
  const parts = path.split(".");
  let node = target;
  for (let index = 0; index < parts.length - 1; index++) {
    node[parts[index]] ??= {};
    node = node[parts[index]];
  }
  node[parts.at(-1)] = structuredClone(value);
}

function makeDocument({ id, name, recordType, data, ownership = {} }) {
  const doc = {
    id,
    uuid: `JournalEntry.${id}`,
    documentName: "JournalEntry",
    name,
    ownership: structuredClone(ownership),
    _stats: { modifiedTime: 100 },
    flags: { "domain-manager": { recordType, schemaVersion: 9, data: structuredClone(data) } },
    getFlag(moduleId, key) { return this.flags[moduleId]?.[key]; },
    async update(changes) {
      for (const [key, value] of Object.entries(changes)) {
        if (key === "name") this.name = value;
        else if (key === "ownership") this.ownership = structuredClone(value);
        else applyPath(this, key, value);
      }
      this._stats.modifiedTime += 1;
      return this;
    },
    async delete() {
      docs.delete(this.uuid);
      game.journal = game.journal.filter((entry) => entry.uuid !== this.uuid);
      return this;
    }
  };
  docs.set(doc.uuid, doc);
  return doc;
}

let createCounter = 1;
globalThis.JournalEntry = {
  async create(payload) {
    const flags = payload.flags["domain-manager"];
    const doc = makeDocument({
      id: `CREATED${createCounter++}`,
      name: payload.name,
      recordType: flags.recordType,
      data: flags.data,
      ownership: payload.ownership
    });
    game.journal.push(doc);
    return doc;
  }
};

const { recordIndex } = await import("../scripts/data/record-index.js");
const { dispatchAuthoritativeCommand } = await import("../scripts/commands/execute.js");

function domainDocument() {
  return makeDocument({
    id: "D1",
    name: "Base Aurelia",
    recordType: "domain",
    data: {
      entityId: "domain:D1",
      description: "",
      management: { preset: "base", capabilities: { squads: true } },
      governance: { controllers: [] },
      identity: { tags: [] },
      economy: { stocks: [], flows: [] },
      population: { groups: [], notables: [] },
      conditions: [], relations: [], agreements: [], intel: [], history: [], notifications: []
    }
  });
}

function squadDocument({ controllers = ["P1"], morale = 60 } = {}) {
  return makeDocument({
    id: "S1",
    name: "Raven",
    recordType: "squad",
    ownership: { default: 0, P1: 2 },
    data: {
      entityId: "squad:S1",
      description: "Recon",
      parentDomain: { recordType: "domain", uuid: "JournalEntry.D1", entityId: "domain:D1" },
      governance: { controllers },
      status: "ready",
      capacity: 20,
      strength: 20,
      morale,
      condition: 100,
      composition: [], resources: [], equipment: [], notablePeople: [], currentMission: null, tags: []
    }
  });
}

function resetWorld(...documents) {
  docs.clear();
  for (const document of documents) docs.set(document.uuid, document);
  game.journal = documents;
  game.user = users.get("GM");
  operationLedger = { version: 1, receipts: [] };
  recordIndex.rebuild();
}

test("GM cria Squad pelo Command Kernel e ownership OBSERVER acompanha controllers", async () => {
  const domain = domainDocument();
  resetWorld(domain);

  const result = await dispatchAuthoritativeCommand({
    commandType: "squad.create",
    operationId: "squad-create-1",
    payload: {
      name: "Raven-01",
      parentDomain: { recordType: "domain", uuid: domain.uuid, entityId: "domain:D1" },
      controllerIds: ["P1"],
      capacity: 20,
      strength: 18,
      morale: 70,
      condition: 95,
      status: "ready"
    }
  }, { callerUserId: "GM" });

  const created = game.journal.find((entry) => entry.uuid === result.uuid);
  assert.ok(created);
  assert.equal(created.name, "Raven-01");
  assert.equal(created.ownership.P1, 2);
  assert.equal(created.getFlag("domain-manager", "data").strength, 18);
  assert.deepEqual(created.getFlag("domain-manager", "data").governance.controllers, ["P1"]);
  assert.equal(operationLedger.receipts.length, 1);
});

test("jogador controlador altera estado operacional e retry é idempotente", async () => {
  const domain = domainDocument();
  const squad = squadDocument();
  resetWorld(domain, squad);

  const command = {
    commandType: "squad.patch",
    operationId: "squad-patch-1",
    payload: {
      squad: { recordType: "squad", uuid: squad.uuid, entityId: "squad:S1" },
      patch: { morale: 73, condition: 88, status: "deployed" }
    }
  };
  const first = await dispatchAuthoritativeCommand(command, { callerUserId: "P1" });
  const second = await dispatchAuthoritativeCommand(command, { callerUserId: "P1" });

  const data = squad.getFlag("domain-manager", "data");
  assert.equal(data.morale, 73);
  assert.equal(data.condition, 88);
  assert.equal(data.status, "deployed");
  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  assert.equal(operationLedger.receipts.length, 1);
});

test("jogador não controlador é rejeitado e GM consegue reatribuir controllers", async () => {
  const domain = domainDocument();
  const squad = squadDocument();
  resetWorld(domain, squad);

  await assert.rejects(() => dispatchAuthoritativeCommand({
    commandType: "squad.patch",
    operationId: "squad-patch-denied",
    payload: {
      squad: { recordType: "squad", entityId: "squad:S1" },
      patch: { morale: 20 }
    }
  }, { callerUserId: "P2" }), /não controla/i);

  await dispatchAuthoritativeCommand({
    commandType: "squad.admin-update",
    operationId: "squad-admin-1",
    payload: {
      squad: { recordType: "squad", uuid: squad.uuid, entityId: "squad:S1" },
      name: "Raven Prime",
      controllerIds: ["P2"],
      description: "Reassigned",
      status: "recovering",
      capacity: 24,
      strength: 17,
      morale: 55,
      condition: 68
    }
  }, { callerUserId: "GM" });

  const data = squad.getFlag("domain-manager", "data");
  assert.equal(squad.name, "Raven Prime");
  assert.deepEqual(data.governance.controllers, ["P2"]);
  assert.equal(squad.ownership.P2, 2);
  assert.equal(squad.ownership.P1, undefined);
});

test("referência inconsistente UUID/entityId é rejeitada", async () => {
  const domain = domainDocument();
  const squad1 = squadDocument();
  const squad2 = makeDocument({
    id: "S2", name: "Wolf", recordType: "squad",
    data: { ...structuredClone(squad1.getFlag("domain-manager", "data")), entityId: "squad:S2" }
  });
  resetWorld(domain, squad1, squad2);

  await assert.rejects(() => dispatchAuthoritativeCommand({
    commandType: "squad.patch",
    operationId: "squad-conflict-ref",
    payload: {
      squad: { recordType: "squad", uuid: squad1.uuid, entityId: "squad:S2" },
      patch: { morale: 10 }
    }
  }, { callerUserId: "GM" }), /entidades diferentes/i);
});

test("Squad rejeita formulário operacional obsoleto", async () => {
  const domain = domainDocument();
  const squad = squadDocument();
  resetWorld(domain, squad);

  await assert.rejects(() => dispatchAuthoritativeCommand({
    commandType: "squad.patch",
    operationId: "squad-stale-form",
    payload: {
      squad: { recordType: "squad", uuid: squad.uuid, entityId: "squad:S1" },
      expectedModifiedTime: squad._stats.modifiedTime - 1,
      patch: { morale: 61 }
    }
  }, { callerUserId: "P1" }), /mudou enquanto/i);
  assert.equal(squad.getFlag("domain-manager", "data").morale, 60);
});
