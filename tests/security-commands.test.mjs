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
let operationLedger = { version: 1, receipts: [] };
const documents = new Map();

globalThis.game = {
  user: gm, users, journal: [], folders: new Map(), modules: new Map(),
  settings: {
    get(_moduleId, key) {
      if (key === "resourceCatalog") return { version: 1, resources: [] };
      if (key === "operationLedger") return structuredClone(operationLedger);
      return null;
    },
    async set(_moduleId, key, value) {
      if (key === "operationLedger") operationLedger = structuredClone(value);
      return value;
    }
  }
};
globalThis.fromUuid = async (uuid) => documents.get(uuid) ?? null;

function setPath(target, path, value) {
  const parts = path.split("."); let cursor = target;
  for (const part of parts.slice(0, -1)) { cursor[part] ??= {}; cursor = cursor[part]; }
  cursor[parts.at(-1)] = structuredClone(value);
}

function makeDomain({ securityEnabled = true } = {}) {
  const doc = {
    id: "D1", uuid: "JournalEntry.D1", documentName: "JournalEntry", name: "Aurelia", ownership: { default: 0, P1: 2 },
    flags: { "domain-manager": { recordType: "domain", schemaVersion: 9, data: {
      entityId: "domain:D1", description: "", identity: { tags: [] },
      management: { preset: "base", capabilities: { security: securityEnabled } },
      governance: { controllers: ["P1"] },
      economy: { stocks: [], flows: [], resourcePolicies: [] },
      population: { total: 100, countMode: "direct", morale: 60, groups: [], workforce: { allocations: [] }, notables: [] },
      security: { defenseRating: 12, guardCount: 4, fortifications: ["Outer Wall"] },
      conditions: [], relations: [], agreements: [], intel: [], history: [], notifications: []
    } } },
    getFlag(moduleId, key) { return this.flags[moduleId]?.[key]; },
    testUserPermission(actor) { return actor?.isGM === true || actor?.id === "P1"; },
    async update(changes) {
      for (const [key, value] of Object.entries(changes)) {
        if (key === "name") this.name = value;
        else if (key === "ownership") this.ownership = structuredClone(value);
        else setPath(this, key, value);
      }
      return this;
    }
  };
  documents.set(doc.uuid, doc); game.journal = [doc]; return doc;
}

const { recordIndex } = await import("../scripts/data/record-index.js");
const { dispatchAuthoritativeCommand } = await import("../scripts/commands/execute.js");

function reset(options = {}) {
  documents.clear(); operationLedger = { version: 1, receipts: [] };
  const domain = makeDomain(options); recordIndex.rebuild(); return domain;
}

function envelope(operationId, payload, callerUserId = "GM") {
  return dispatchAuthoritativeCommand({ commandType: "security.configure", operationId, payload }, { callerUserId });
}

test("security.configure persiste Defense pelo Command Kernel e é idempotente", async () => {
  const domain = reset();
  const payload = {
    domain: { recordType: "domain", uuid: domain.uuid, entityId: "domain:D1" },
    defenseRating: 35,
    guardCount: 12,
    fortifications: ["Outer Wall", "Point Defense Array"]
  };
  const first = await envelope("sec-1", payload);
  const second = await envelope("sec-1", payload);
  const security = domain.getFlag("domain-manager", "data").security;
  assert.deepEqual(security, { defenseRating: 35, guardCount: 12, fortifications: ["Outer Wall", "Point Defense Array"] });
  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  assert.equal(first.security.defenseRating, 35);
});

test("security.configure rejeita player e Domain sem capability security", async () => {
  const domain = reset();
  const payload = { domain: { recordType: "domain", entityId: "domain:D1" }, defenseRating: 20, guardCount: 5, fortifications: [] };
  await assert.rejects(() => envelope("sec-player", payload, "P1"), /Apenas GM/i);

  reset({ securityEnabled: false });
  await assert.rejects(() => envelope("sec-cap", payload), /capability security/i);
});

test("security.configure valida inteiros e fortificações duplicadas", async () => {
  reset();
  const base = { domain: { recordType: "domain", entityId: "domain:D1" }, defenseRating: 10, guardCount: 2 };
  await assert.rejects(() => envelope("sec-neg", { ...base, guardCount: -1, fortifications: [] }), /inteiro não-negativo/i);
  await assert.rejects(() => envelope("sec-dup", { ...base, fortifications: ["Wall", " wall "] }), /Fortificação duplicada/i);
});
