import test from "node:test";
import assert from "node:assert/strict";

class DummyField {}
class DummyDataModel {
  constructor(data = {}) { this.data = structuredClone(data); }
  validate() { this.constructor.validateJoint?.(this.data); return true; }
  toObject() { return structuredClone(this.data); }
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

globalThis.CONST = {
  DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0, OBSERVER: 2, OWNER: 3 }
};

const docs = new Map();
let failPartialBatchOnce = false;

function applyChange(doc, key, value) {
  if (key === "_id") return;
  if (key === "name") { doc.name = value; return; }
  if (key === "ownership") { doc.ownership = structuredClone(value); return; }
  const parts = key.split(".");
  let target = doc;
  for (let i = 0; i < parts.length - 1; i++) {
    target[parts[i]] ??= {};
    target = target[parts[i]];
  }
  target[parts.at(-1)] = structuredClone(value);
}

function document({ id, name, recordType, data }) {
  const doc = {
    id,
    uuid: `JournalEntry.${id}`,
    documentName: "JournalEntry",
    name,
    ownership: {},
    flags: {
      "domain-manager": { recordType, schemaVersion: 6, data: structuredClone(data) }
    },
    getFlag(moduleId, key) { return this.flags[moduleId]?.[key]; }
  };
  docs.set(doc.uuid, doc);
  return doc;
}

const users = new Map([
  ["GM", { id: "GM", uuid: "User.GM", name: "GM", isGM: true }],
  ["P1", { id: "P1", uuid: "User.P1", name: "Player", isGM: false }],
  ["P2", { id: "P2", uuid: "User.P2", name: "Other", isGM: false }]
]);
users.get = Map.prototype.get.bind(users);
users.activeGM = users.get("GM");

let operationLedger = { version: 1, receipts: [] };
globalThis.game = {
  user: users.get("GM"),
  users,
  journal: [],
  settings: {
    get(_moduleId, key) {
      if (key === "resourceCatalog") {
        return {
          version: 1,
          resources: [{ id: "ammo", name: "Munição", unit: "", precision: 0, allowNegative: false, category: "supply", tags: [] }]
        };
      }
      if (key === "operationLedger") return structuredClone(operationLedger);
      return null;
    },
    async set(_moduleId, key, value) {
      if (key === "operationLedger") operationLedger = structuredClone(value);
      return value;
    }
  }
};

globalThis.fromUuid = async (uuid) => docs.get(uuid) ?? null;
globalThis.JournalEntry = {
  async updateDocuments(updates) {
    const updated = [];
    for (let index = 0; index < updates.length; index++) {
      const change = updates[index];
      const doc = [...docs.values()].find((entry) => entry.id === change._id);
      if (!doc) throw new Error(`doc missing ${change._id}`);
      for (const [key, value] of Object.entries(change)) applyChange(doc, key, value);
      updated.push(doc);
      if (failPartialBatchOnce && index === 0) {
        failPartialBatchOnce = false;
        throw new Error("simulated partial provider failure");
      }
    }
    return updated;
  }
};

const { recordIndex } = await import("../scripts/data/record-index.js");
const { executeResourceTransfer } = await import("../scripts/features/economy/transfers.js");
const { dispatchAuthoritativeCommand } = await import("../scripts/commands/execute.js");

function baseDomain(id, amount, controllers = ["P1"]) {
  return document({
    id,
    name: `Domain ${id}`,
    recordType: "domain",
    data: {
      entityId: `domain:${id}`,
      management: { preset: "base", capabilities: { economy: true } },
      governance: { controllers },
      identity: { tags: [] },
      economy: { stocks: [{ resourceId: "ammo", amount }], flows: [] },
      population: { groups: [], notables: [] },
      conditions: [], relations: [], agreements: [], intel: [], history: [], notifications: []
    }
  });
}

function squad(id, amount, controllers = ["P1"]) {
  return document({
    id,
    name: `Squad ${id}`,
    recordType: "squad",
    data: {
      entityId: `squad:${id}`,
      governance: { controllers },
      capacity: 20,
      strength: 20,
      composition: [],
      resources: [{ resourceId: "ammo", amount }],
      equipment: [],
      notablePeople: [],
      tags: []
    }
  });
}

function resetWorld(...documents) {
  docs.clear();
  for (const doc of documents) docs.set(doc.uuid, doc);
  game.journal = documents;
  operationLedger = { version: 1, receipts: [] };
  recordIndex.rebuild();
}

function stock(doc, resourceId = "ammo") {
  const data = doc.getFlag("domain-manager", "data");
  const entries = doc.getFlag("domain-manager", "recordType") === "domain"
    ? data.economy.stocks
    : data.resources;
  return entries.find((entry) => entry.resourceId === resourceId)?.amount ?? 0;
}

test("transferência Domain -> Squad atualiza os dois lados no mesmo comando", async () => {
  const from = baseDomain("D1", 100);
  const to = squad("S1", 10);
  resetWorld(from, to);

  const execution = await executeResourceTransfer({
    operationId: "op-transfer-1",
    callerUserId: "P1",
    payload: {
      from: { recordType: "domain", entityId: "domain:D1" },
      to: { recordType: "squad", entityId: "squad:S1" },
      resourceId: "ammo",
      amount: 30
    }
  });

  assert.equal(stock(from), 70);
  assert.equal(stock(to), 40);
  assert.equal(execution.result.from.before, 100);
  assert.equal(execution.result.to.after, 40);
  const history = from.getFlag("domain-manager", "data").history;
  assert.equal(history.at(-1).eventType, "resources.transferred");
  assert.equal(history.at(-1).operationId, "op-transfer-1");
});

test("transferência rejeita saldo insuficiente e usuário sem controle da origem", async () => {
  const from = baseDomain("D1", 10);
  const to = squad("S1", 0);
  resetWorld(from, to);

  await assert.rejects(() => executeResourceTransfer({
    operationId: "op-insufficient",
    callerUserId: "P1",
    payload: {
      from: { recordType: "domain", uuid: from.uuid },
      to: { recordType: "squad", uuid: to.uuid },
      resourceId: "ammo",
      amount: 11
    }
  }), /Estoque insuficiente/i);
  assert.equal(stock(from), 10);
  assert.equal(stock(to), 0);

  await assert.rejects(() => executeResourceTransfer({
    operationId: "op-permission",
    callerUserId: "P2",
    payload: {
      from: { recordType: "domain", uuid: from.uuid },
      to: { recordType: "squad", uuid: to.uuid },
      resourceId: "ammo",
      amount: 1
    }
  }), /não controla/i);
});

test("falha parcial simulada no provider aciona compensação e restaura saldos", async () => {
  const from = baseDomain("D1", 100);
  const to = squad("S1", 10);
  resetWorld(from, to);
  failPartialBatchOnce = true;

  await assert.rejects(() => executeResourceTransfer({
    operationId: "op-failure",
    callerUserId: "P1",
    payload: {
      from: { recordType: "domain", entityId: "domain:D1" },
      to: { recordType: "squad", entityId: "squad:S1" },
      resourceId: "ammo",
      amount: 30
    }
  }), /simulated partial provider failure/);

  assert.equal(stock(from), 100);
  assert.equal(stock(to), 10);
  assert.equal(from.getFlag("domain-manager", "data").history.length, 0);
});


test("command dispatcher torna retry da transferência idempotente de ponta a ponta", async () => {
  const from = baseDomain("D1", 100);
  const to = squad("S1", 10);
  resetWorld(from, to);

  const envelope = {
    commandType: "resources.transfer",
    operationId: "op-command-retry",
    payload: {
      from: { recordType: "domain", entityId: "domain:D1" },
      to: { recordType: "squad", entityId: "squad:S1" },
      resourceId: "ammo",
      amount: 30
    }
  };

  const first = await dispatchAuthoritativeCommand(envelope, { callerUserId: "P1" });
  const second = await dispatchAuthoritativeCommand(envelope, { callerUserId: "P1" });

  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  assert.equal(stock(from), 70);
  assert.equal(stock(to), 40);
  assert.equal(operationLedger.receipts.length, 1);
});
