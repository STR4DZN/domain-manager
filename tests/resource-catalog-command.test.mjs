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

const gm = { id: "GM", uuid: "User.GM", name: "GM", isGM: true, active: true };
const player = { id: "P1", uuid: "User.P1", name: "Player", isGM: false, active: true };
const users = new Map([[gm.id, gm], [player.id, player]]);
users.activeGM = gm;
users.contents = [gm, player];

let catalog;
let operationLedger;
let modifiedTime;
let domain;
let failNextLedgerWrite;

function setPath(target, path, value) {
  const parts = path.split(".");
  let cursor = target;
  for (const part of parts.slice(0, -1)) { cursor[part] ??= {}; cursor = cursor[part]; }
  cursor[parts.at(-1)] = structuredClone(value);
}

function makeDomain() {
  return {
    id: "D1", uuid: "JournalEntry.D1", documentName: "JournalEntry", name: "Aurelia", ownership: { default: 0 },
    _stats: { modifiedTime },
    flags: { "domain-manager": { recordType: "domain", schemaVersion: 9, data: {
      entityId: "domain:D1", description: "",
      management: { preset: "base", capabilities: { economy: true } },
      governance: { controllers: ["P1"] }, identity: { tags: [] },
      economy: { stocks: [{ resourceId: "fuel", amount: 10 }], flows: [], resourcePolicies: [] },
      population: { total: 0, countMode: "direct", groups: [], notables: [] }, security: { guardCount: 0 },
      conditions: [], relations: [], agreements: [], intel: [], history: [], notifications: []
    } } },
    getFlag(moduleId, key) { return this.flags[moduleId]?.[key]; },
    testUserPermission(actor) { return actor?.isGM === true; },
    async update(changes) {
      for (const [key, value] of Object.entries(changes)) {
        if (key === "name") this.name = value;
        else setPath(this, key, value);
      }
      this._stats.modifiedTime = ++modifiedTime;
      return this;
    }
  };
}

globalThis.game = {
  user: gm, users, journal: [], folders: new Map(), modules: new Map(),
  settings: {
    get(_moduleId, key) {
      if (key === "resourceCatalog") return structuredClone(catalog);
      if (key === "operationLedger") return structuredClone(operationLedger);
      return null;
    },
    async set(_moduleId, key, value) {
      if (key === "resourceCatalog") catalog = structuredClone(value);
      if (key === "operationLedger") {
        if (failNextLedgerWrite) { failNextLedgerWrite = false; throw new Error("ledger unavailable"); }
        operationLedger = structuredClone(value);
      }
      return value;
    }
  }
};
globalThis.fromUuid = async (uuid) => uuid === domain?.uuid ? domain : null;

const { recordIndex } = await import("../scripts/data/record-index.js");
const { dispatchAuthoritativeCommand } = await import("../scripts/commands/execute.js");

function reset({ includeWater = false } = {}) {
  catalog = { version: 1, resources: [
    { id: "fuel", name: "Combustível", unit: "L", precision: 0, allowNegative: false, category: "energia", tags: [] },
    ...(includeWater ? [{ id: "water", name: "Água", unit: "L", precision: 0, allowNegative: false, category: "sustento", tags: [] }] : [])
  ] };
  operationLedger = { version: 1, receipts: [] };
  modifiedTime = 40;
  failNextLedgerWrite = false;
  domain = makeDomain();
  game.user = gm;
  game.journal = [domain];
  recordIndex.rebuild();
}

test("resource-catalog.upsert cria e edita definição com versão otimista e ID estável", async () => {
  reset();
  const create = {
    commandType: "resource-catalog.upsert", operationId: "catalog-create", callerUserId: "GM",
    payload: { expectedCatalogVersion: 1, name: "Água Potável", unit: "L", precision: 1, category: "sustento", tags: ["básico"] }
  };
  const first = await dispatchAuthoritativeCommand(create);
  const duplicate = await dispatchAuthoritativeCommand(create);
  assert.equal(first.resource.id, "agua-potavel");
  assert.equal(first.catalogVersion, 2);
  assert.equal(duplicate.duplicate, true);
  assert.equal(catalog.resources.filter((entry) => entry.id === "agua-potavel").length, 1);

  const edited = await dispatchAuthoritativeCommand({
    commandType: "resource-catalog.upsert", operationId: "catalog-edit", callerUserId: "GM",
    payload: { originalId: "agua-potavel", id: "agua-potavel", expectedCatalogVersion: 2, name: "Água", unit: "litros", precision: 2, category: "sustento", tags: [] }
  });
  assert.equal(edited.resource.id, "agua-potavel");
  assert.equal(edited.resource.name, "Água");
  assert.equal(edited.catalogVersion, 3);
  await assert.rejects(() => dispatchAuthoritativeCommand({
    commandType: "resource-catalog.upsert", operationId: "catalog-rename-id", callerUserId: "GM",
    payload: { originalId: "agua-potavel", id: "water", expectedCatalogVersion: 3, name: "Água", unit: "litros", precision: 2 }
  }), /ID de um recurso existente não pode ser alterado/i);
});

test("catálogo rejeita revisão antiga, não-GM e mudança de precisão de recurso em uso", async () => {
  reset();
  await assert.rejects(() => dispatchAuthoritativeCommand({
    commandType: "resource-catalog.upsert", operationId: "catalog-player", callerUserId: "P1",
    payload: { expectedCatalogVersion: 1, name: "Água", unit: "L", precision: 0 }
  }), /Somente GM/i);
  await assert.rejects(() => dispatchAuthoritativeCommand({
    commandType: "resource-catalog.upsert", operationId: "catalog-stale", callerUserId: "GM",
    payload: { originalId: "fuel", id: "fuel", expectedCatalogVersion: 0, name: "Combustível", unit: "L", precision: 0 }
  }), /catálogo de recursos mudou/i);
  await assert.rejects(() => dispatchAuthoritativeCommand({
    commandType: "resource-catalog.upsert", operationId: "catalog-precision", callerUserId: "GM",
    payload: { originalId: "fuel", id: "fuel", expectedCatalogVersion: 1, name: "Combustível", unit: "L", precision: 2 }
  }), /precisão de um recurso em uso/i);
});

test("resource-catalog.remove bloqueia recurso referenciado e remove recurso sem uso", async () => {
  reset({ includeWater: true });
  await assert.rejects(() => dispatchAuthoritativeCommand({
    commandType: "resource-catalog.remove", operationId: "catalog-remove-used", callerUserId: "GM",
    payload: { resourceId: "fuel", expectedCatalogVersion: 1 }
  }), /ainda é usado por 1 registro/i);

  const removed = await dispatchAuthoritativeCommand({
    commandType: "resource-catalog.remove", operationId: "catalog-remove-free", callerUserId: "GM",
    payload: { resourceId: "water", expectedCatalogVersion: 1 }
  });
  assert.equal(removed.resourceId, "water");
  assert.equal(removed.catalogVersion, 2);
  assert.equal(catalog.resources.some((entry) => entry.id === "water"), false);
});

test("economy.configure rejeita política aberta sobre revisão antiga", async () => {
  reset();
  await assert.rejects(() => dispatchAuthoritativeCommand({
    commandType: "economy.configure", operationId: "economy-stale", callerUserId: "GM",
    payload: {
      domain: { recordType: "domain", entityId: "domain:D1" },
      expectedModifiedTime: 39,
      stocks: [{ resourceId: "fuel", amount: 20 }]
    }
  }), /políticas de recursos estavam abertas/i);
});

test("falha ao gravar receipt restaura o catálogo anterior", async () => {
  reset();
  const before = structuredClone(catalog);
  failNextLedgerWrite = true;
  await assert.rejects(() => dispatchAuthoritativeCommand({
    commandType: "resource-catalog.upsert", operationId: "catalog-rollback", callerUserId: "GM",
    payload: { expectedCatalogVersion: 1, name: "Água", unit: "L", precision: 0 }
  }), /ledger unavailable/);
  assert.deepEqual(catalog, before);
});
