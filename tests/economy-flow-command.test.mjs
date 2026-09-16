import test from "node:test";
import assert from "node:assert/strict";

class DummyField {}
class DummyDataModel {
  constructor(data = {}) { this.data = structuredClone(data); }
  validate() { this.constructor.validateJoint?.(this.data); return true; }
  toObject() { return structuredClone(this.data); }
}

let generatedId = 0;
globalThis.foundry = {
  abstract: { DataModel: DummyDataModel },
  data: { fields: {
    ArrayField: DummyField,
    BooleanField: DummyField,
    NumberField: DummyField,
    SchemaField: DummyField,
    StringField: DummyField
  } },
  utils: {
    deepClone: (value) => structuredClone(value),
    randomID: () => `FLOW-${++generatedId}`
  }
};
globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0, OBSERVER: 2, OWNER: 3 } };
globalThis.Hooks = { callAll() {} };

const gm = { id: "GM", uuid: "User.GM", name: "GM", isGM: true, active: true };
const player = { id: "P1", uuid: "User.P1", name: "Player", isGM: false, active: true };
const users = new Map([[gm.id, gm], [player.id, player]]);
users.activeGM = gm;
users.contents = [gm, player];

const catalog = { version: 1, resources: [
  { id: "fuel", name: "Combustível", unit: "L", precision: 0, allowNegative: false, category: "energia", tags: [] },
  { id: "water", name: "Água", unit: "L", precision: 1, allowNegative: false, category: "sustento", tags: [] }
] };
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
    id: "D1",
    uuid: "JournalEntry.D1",
    documentName: "JournalEntry",
    name: "Aurelia",
    ownership: { default: 0 },
    _stats: { modifiedTime },
    flags: { "domain-manager": {
      recordType: "domain",
      schemaVersion: 9,
      data: {
        entityId: "domain:D1",
        description: "",
        management: { preset: "base", capabilities: { economy: true } },
        governance: { controllers: ["P1"] },
        identity: { tags: [] },
        economy: {
          stocks: [{ resourceId: "fuel", amount: 10 }],
          flows: [{
            localId: "existing",
            name: "Gerador",
            resourceId: "fuel",
            direction: "outflow",
            amount: 4,
            periodTicks: 3,
            carry: 2,
            category: "consumption",
            source: "Usina",
            active: true
          }],
          resourcePolicies: [],
          sustenanceSettings: { enabled: false, foodPer100: 1, waterPer100: 1, guardUpkeep: 1 }
        },
        population: { total: 0, countMode: "direct", groups: [], notables: [] },
        security: { guardCount: 0 },
        conditions: [], relations: [], agreements: [], intel: [], history: [], notifications: []
      }
    } },
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
  user: gm,
  users,
  journal: [],
  folders: new Map(),
  modules: new Map(),
  settings: {
    get(_moduleId, key) {
      if (key === "resourceCatalog") return structuredClone(catalog);
      if (key === "operationLedger") return structuredClone(operationLedger);
      return null;
    },
    async set(_moduleId, key, value) {
      if (key === "operationLedger") {
        if (failNextLedgerWrite) {
          failNextLedgerWrite = false;
          throw new Error("ledger unavailable");
        }
        operationLedger = structuredClone(value);
      }
      return value;
    }
  }
};
globalThis.fromUuid = async (uuid) => uuid === domain?.uuid ? domain : null;

const { recordIndex } = await import("../scripts/data/record-index.js");
const { dispatchAuthoritativeCommand } = await import("../scripts/commands/execute.js");

function reset() {
  generatedId = 0;
  operationLedger = { version: 1, receipts: [] };
  modifiedTime = 100;
  failNextLedgerWrite = false;
  domain = makeDomain();
  game.user = gm;
  game.journal = [domain];
  recordIndex.rebuild();
}

function flowPayload(overrides = {}) {
  return {
    domain: { recordType: "domain", entityId: "domain:D1" },
    name: "Entrega de água",
    resourceId: "water",
    direction: "inflow",
    amount: 125,
    periodTicks: 2,
    category: "trade",
    source: "Caravana",
    active: true,
    ...overrides
  };
}

test("economy.flow-upsert cria um fluxo e retry com o mesmo operationId é idempotente", async () => {
  reset();
  const command = {
    commandType: "economy.flow-upsert",
    operationId: "flow-create",
    callerUserId: "GM",
    payload: flowPayload({ expectedModifiedTime: 100 })
  };
  const first = await dispatchAuthoritativeCommand(command);
  const retry = await dispatchAuthoritativeCommand(command);
  const flows = domain.getFlag("domain-manager", "data").economy.flows;
  assert.equal(first.flow.localId, "FLOW-1");
  assert.equal(first.flow.amount, 125);
  assert.equal(first.duplicate, false);
  assert.equal(retry.duplicate, true);
  assert.equal(flows.filter((flow) => flow.localId === "FLOW-1").length, 1);
});

test("edição preserva carry com o mesmo período e o reinicia quando a cadência muda", async () => {
  reset();
  await dispatchAuthoritativeCommand({
    commandType: "economy.flow-upsert",
    operationId: "flow-edit-same-period",
    callerUserId: "GM",
    payload: flowPayload({
      localId: "existing",
      expectedModifiedTime: 100,
      resourceId: "fuel",
      amount: 9,
      periodTicks: 3
    })
  });
  let edited = domain.getFlag("domain-manager", "data").economy.flows.find((flow) => flow.localId === "existing");
  assert.equal(edited.carry, 2);
  assert.equal(edited.amount, 9);

  await dispatchAuthoritativeCommand({
    commandType: "economy.flow-upsert",
    operationId: "flow-edit-new-period",
    callerUserId: "GM",
    payload: flowPayload({
      localId: "existing",
      expectedModifiedTime: domain._stats.modifiedTime,
      resourceId: "fuel",
      amount: 7,
      periodTicks: 5
    })
  });
  edited = domain.getFlag("domain-manager", "data").economy.flows.find((flow) => flow.localId === "existing");
  assert.equal(edited.carry, 0);
  assert.equal(edited.periodTicks, 5);
});

test("flow-upsert rejeita não-GM, capability ausente, revisão antiga e edição desaparecida", async () => {
  reset();
  await assert.rejects(() => dispatchAuthoritativeCommand({
    commandType: "economy.flow-upsert",
    operationId: "flow-player",
    callerUserId: "P1",
    payload: flowPayload()
  }), /Somente GM/i);

  domain.getFlag("domain-manager", "data").management.capabilities.economy = false;
  await assert.rejects(() => dispatchAuthoritativeCommand({
    commandType: "economy.flow-upsert",
    operationId: "flow-no-capability",
    callerUserId: "GM",
    payload: flowPayload()
  }), /capability economy/i);
  domain.getFlag("domain-manager", "data").management.capabilities.economy = true;

  await assert.rejects(() => dispatchAuthoritativeCommand({
    commandType: "economy.flow-upsert",
    operationId: "flow-stale",
    callerUserId: "GM",
    payload: flowPayload({ expectedModifiedTime: 99 })
  }), /fluxo estava aberto/i);
  await assert.rejects(() => dispatchAuthoritativeCommand({
    commandType: "economy.flow-upsert",
    operationId: "flow-missing",
    callerUserId: "GM",
    payload: flowPayload({ localId: "missing", expectedModifiedTime: 100 })
  }), /não existe mais/i);
});

test("economy.flow-remove exige revisão atual e remove somente o fluxo escolhido", async () => {
  reset();
  await assert.rejects(() => dispatchAuthoritativeCommand({
    commandType: "economy.flow-remove",
    operationId: "flow-remove-stale",
    callerUserId: "GM",
    payload: {
      domain: { recordType: "domain", entityId: "domain:D1" },
      expectedModifiedTime: 99,
      localId: "existing"
    }
  }), /remoção do fluxo estava aberta/i);

  const result = await dispatchAuthoritativeCommand({
    commandType: "economy.flow-remove",
    operationId: "flow-remove",
    callerUserId: "GM",
    payload: {
      domain: { recordType: "domain", entityId: "domain:D1" },
      expectedModifiedTime: 100,
      localId: "existing"
    }
  });
  assert.equal(result.localId, "existing");
  assert.equal(domain.getFlag("domain-manager", "data").economy.flows.length, 0);
});

test("falha na receipt restaura os fluxos anteriores", async () => {
  reset();
  const before = structuredClone(domain.getFlag("domain-manager", "data").economy.flows);
  failNextLedgerWrite = true;
  await assert.rejects(() => dispatchAuthoritativeCommand({
    commandType: "economy.flow-upsert",
    operationId: "flow-rollback",
    callerUserId: "GM",
    payload: flowPayload({ expectedModifiedTime: 100 })
  }), /ledger unavailable/);
  assert.deepEqual(domain.getFlag("domain-manager", "data").economy.flows, before);
});
