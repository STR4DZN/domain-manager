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
  data: { fields: { ArrayField: DummyField, BooleanField: DummyField, NumberField: DummyField, SchemaField: DummyField, StringField: DummyField } },
  utils: { deepClone: (value) => structuredClone(value), randomID: () => "RID" }
};
globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0, OBSERVER: 2, OWNER: 3 } };
globalThis.Hooks = { callAll() {} };

const gm = { id: "GM", name: "GM", isGM: true, active: true };
const player = { id: "P1", name: "Player", isGM: false, active: true };
const users = new Map([[gm.id, gm], [player.id, player]]);
users.activeGM = gm; users.contents = [gm, player];
const catalog = { version: 1, resources: [{ id: "fuel", name: "Fuel", unit: "u", precision: 0, allowNegative: false }] };
let operationLedger = { version: 1, receipts: [] };
const documents = new Map();

globalThis.game = {
  user: gm, users, journal: [], folders: new Map(), modules: new Map(),
  settings: {
    get(_moduleId, key) {
      if (key === "resourceCatalog") return structuredClone(catalog);
      if (key === "operationLedger") return structuredClone(operationLedger);
      return null;
    },
    async set(_moduleId, key, value) { if (key === "operationLedger") operationLedger = structuredClone(value); return value; }
  }
};
globalThis.fromUuid = async (uuid) => documents.get(uuid) ?? null;

function setPath(target, path, value) {
  const parts = path.split("."); let cursor = target;
  for (const part of parts.slice(0, -1)) { cursor[part] ??= {}; cursor = cursor[part]; }
  cursor[parts.at(-1)] = structuredClone(value);
}
function makeDomain() {
  const doc = {
    id: "D1", uuid: "JournalEntry.D1", documentName: "JournalEntry", name: "Aurelia", ownership: { default: 0 },
    flags: { "domain-manager": { recordType: "domain", schemaVersion: 9, data: {
      entityId: "domain:D1", description: "",
      management: { preset: "base", capabilities: { economy: true } },
      governance: { controllers: ["P1"] }, identity: { tags: [] },
      economy: { stocks: [{ resourceId: "fuel", amount: 10 }], flows: [], resourcePolicies: [], sustenanceSettings: { enabled: false, foodPer100: 1, waterPer100: 1, guardUpkeep: 1 } },
      population: { total: 0, countMode: "direct", groups: [], notables: [] }, security: { guardCount: 0 },
      conditions: [], relations: [], agreements: [], intel: [], history: [], notifications: []
    } } },
    getFlag(moduleId, key) { return this.flags[moduleId]?.[key]; },
    testUserPermission(actor) { return actor?.isGM === true; },
    async update(changes) { for (const [key, value] of Object.entries(changes)) { if (key === "name") this.name = value; else setPath(this, key, value); } return this; }
  };
  documents.set(doc.uuid, doc); game.journal = [doc]; return doc;
}

const { recordIndex } = await import("../scripts/data/record-index.js");
const { dispatchAuthoritativeCommand } = await import("../scripts/commands/execute.js");

function reset() { documents.clear(); operationLedger = { version: 1, receipts: [] }; const domain = makeDomain(); recordIndex.rebuild(); return domain; }

test("economy.configure persiste políticas/estoque pelo command kernel e é idempotente", async () => {
  const domain = reset();
  const envelope = {
    commandType: "economy.configure", operationId: "eco-1",
    payload: {
      domain: { recordType: "domain", entityId: "domain:D1" },
      stocks: [{ resourceId: "fuel", amount: 80 }],
      resourcePolicies: [{ resourceId: "fuel", criticalFloor: 20, reserveTarget: 50, storageCapacity: 100 }]
    }
  };
  const first = await dispatchAuthoritativeCommand({ ...envelope, callerUserId: "GM" });
  const second = await dispatchAuthoritativeCommand({ ...envelope, callerUserId: "GM" });
  const data = domain.getFlag("domain-manager", "data");
  assert.equal(data.economy.stocks[0].amount, 80);
  assert.deepEqual(data.economy.resourcePolicies, [{ resourceId: "fuel", criticalFloor: 20, reserveTarget: 50, storageCapacity: 100 }]);
  assert.equal(first.entityId, "domain:D1");
  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
});

test("economy.configure rejeita não-GM e política incoerente", async () => {
  reset();
  await assert.rejects(() => dispatchAuthoritativeCommand({
    commandType: "economy.configure", operationId: "eco-player", callerUserId: "P1",
    payload: { domain: { recordType: "domain", entityId: "domain:D1" }, stocks: [{ resourceId: "fuel", amount: 5 }] }
  }), /Somente GM/i);
  await assert.rejects(() => dispatchAuthoritativeCommand({
    commandType: "economy.configure", operationId: "eco-invalid", callerUserId: "GM",
    payload: { domain: { recordType: "domain", entityId: "domain:D1" }, resourcePolicies: [{ resourceId: "fuel", criticalFloor: 60, reserveTarget: 50, storageCapacity: 100 }] }
  }), /Piso crítico/i);
});
