import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

class DummyField {}
class DummyDataModel {
  constructor(data = {}) { this.data = structuredClone(data); }
  validate() { this.constructor.validateJoint?.(this.data); return true; }
  toObject() { return structuredClone(this.data); }
}
let rid = 1;
globalThis.foundry = {
  abstract: { DataModel: DummyDataModel },
  data: { fields: { ArrayField: DummyField, BooleanField: DummyField, NumberField: DummyField, SchemaField: DummyField, StringField: DummyField } },
  utils: { deepClone: (value) => structuredClone(value), randomID: () => `RID${rid++}` }
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
      if (key === "operationLedger") return structuredClone(operationLedger);
      if (key === "resourceCatalog") return { version: 1, resources: [] };
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
    id: "D1", uuid: "JournalEntry.D1", documentName: "JournalEntry", name: "Aurelia", ownership: { default: 0, P1: 2 },
    flags: { "domain-manager": { recordType: "domain", schemaVersion: 9, data: {
      entityId: "domain:D1", description: "", identity: { tags: [] },
      management: { preset: "base", capabilities: {} }, governance: { controllers: ["P1"] },
      economy: { stocks: [], flows: [], resourcePolicies: [] },
      population: { total: 100, countMode: "direct", morale: 60, groups: [], workforce: { allocations: [] }, notables: [] },
      security: { defenseRating: 0, guardCount: 0, fortifications: [] },
      conditions: [], relations: [], agreements: [], intel: [], history: [], notifications: []
    } } },
    getFlag(moduleId, key) { return this.flags[moduleId]?.[key]; },
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
function reset() { documents.clear(); operationLedger = { version: 1, receipts: [] }; rid = 1; const domain = makeDomain(); recordIndex.rebuild(); game.user = gm; return domain; }
function domainRef(domain) { return { recordType: "domain", uuid: domain.uuid, entityId: "domain:D1" }; }
function command(type, operationId, payload, callerUserId = "GM") { return dispatchAuthoritativeCommand({ commandType: type, operationId, payload }, { callerUserId }); }

test("condition create/update/toggle/remove opera pelo Command Kernel", async () => {
  const domain = reset();
  const created = await command("condition.create", "cond-create", { domain: domainRef(domain), condition: { name: "Rad Storm", severity: "severe", durationTicks: 3, category: "environmental" } });
  const id = created.condition.localId;
  assert.ok(id);
  assert.equal(domain.getFlag("domain-manager", "data").conditions[0].severity, "severe");

  await command("condition.update", "cond-update", { domain: domainRef(domain), localId: id, patch: { description: "Ionização", severity: "moderate" } });
  assert.equal(domain.getFlag("domain-manager", "data").conditions[0].description, "Ionização");

  await command("condition.update", "cond-indefinite", { domain: domainRef(domain), localId: id, patch: { durationTicks: null } });
  assert.equal(domain.getFlag("domain-manager", "data").conditions[0].durationTicks, null, "durationTicks:null precisa tornar a Condition indefinida");

  await command("condition.toggle", "cond-toggle", { domain: domainRef(domain), localId: id });
  assert.equal(domain.getFlag("domain-manager", "data").conditions[0].active, false);

  await command("condition.remove", "cond-remove", { domain: domainRef(domain), localId: id });
  assert.deepEqual(domain.getFlag("domain-manager", "data").conditions, []);
});

test("Conditions são GM-only e rejeitam referência inexistente", async () => {
  const domain = reset();
  await assert.rejects(() => command("condition.create", "cond-player", { domain: domainRef(domain), condition: { name: "Unauthorized" } }, "P1"), /Apenas GM/i);
  await assert.rejects(() => command("condition.toggle", "cond-missing", { domain: domainRef(domain), localId: "missing" }), /não encontrada/i);
});

test("condition.create é idempotente e não duplica condition em retry", async () => {
  const domain = reset();
  const envelope = { domain: domainRef(domain), condition: { name: "Ashfall", severity: "minor" } };
  const first = await command("condition.create", "cond-idem", envelope);
  const second = await command("condition.create", "cond-idem", envelope);
  assert.equal(first.condition.localId, second.condition.localId);
  assert.equal(second.duplicate, true);
  assert.equal(domain.getFlag("domain-manager", "data").conditions.length, 1);
});

test("legacy Conditions actions são wrappers sem write path próprio", async () => {
  const domain = reset();
  const actions = await import("../scripts/features/conditions/actions.js");
  await actions.createDomainConditionAction({ domainUuid: domain.uuid, condition: { name: "Wrapper Condition" }, operationId: "cond-wrapper" });
  assert.equal(domain.getFlag("domain-manager", "data").conditions.length, 1);

  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const source = fs.readFileSync(path.join(root, "scripts/features/conditions/actions.js"), "utf8");
  for (const forbidden of ["updateRecord", "createRecord", "document.update", "transactionQueue"]) assert.ok(!source.includes(forbidden), `write path legado: ${forbidden}`);
  for (const type of ["CONDITION_CREATE", "CONDITION_UPDATE", "CONDITION_REMOVE", "CONDITION_TOGGLE"]) assert.match(source, new RegExp(`COMMAND_TYPES\\.${type}`));
});
