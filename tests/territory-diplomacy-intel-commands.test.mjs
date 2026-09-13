import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

class DummyField {}
let idCounter = 1;
class DummyDataModel {
  constructor(data = {}) {
    this.data = structuredClone(data);
    const types = { DomainModel: "domain", AgreementModel: "agreement" };
    const type = types[this.constructor.name];
    if (!this.data.entityId && type) this.data.entityId = `${type}:AUTO${idCounter++}`;
  }
  validate() { this.constructor.validateJoint?.(this.data); return true; }
  toObject() { return structuredClone(this.data); }
}

globalThis.foundry = {
  abstract: { DataModel: DummyDataModel },
  data: { fields: { ArrayField: DummyField, BooleanField: DummyField, NumberField: DummyField, SchemaField: DummyField, StringField: DummyField } },
  utils: { deepClone: (value) => structuredClone(value), randomID: () => `RID${idCounter++}` }
};
globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0, OBSERVER: 2, OWNER: 3 } };
globalThis.Hooks = { callAll() {} };

const users = new Map([
  ["GM", { id: "GM", uuid: "User.GM", name: "Primary GM", isGM: true, active: true }],
  ["P1", { id: "P1", uuid: "User.P1", name: "Alpha Controller", isGM: false, active: true }],
  ["P2", { id: "P2", uuid: "User.P2", name: "Beta Controller", isGM: false, active: true }]
]);
users.activeGM = users.get("GM");
users.contents = [...users.values()];

const docs = new Map();
let modifiedClock = 100;
let ledger = { version: 1, receipts: [] };
const dataFolder = { id: "DATA", type: "JournalEntry", getFlag: () => true };
const folders = { get: (id) => id === "DATA" ? dataFolder : null, find: (fn) => fn(dataFolder) ? dataFolder : null };
const catalog = { version: 1, resources: [{ id: "fuel", name: "Fuel", unit: "u", precision: 0, allowNegative: false }] };

globalThis.game = {
  user: users.get("GM"), users, journal: [], folders, modules: new Map(),
  settings: {
    get(_module, key) {
      if (key === "dataFolderId") return "DATA";
      if (key === "operationLedger") return structuredClone(ledger);
      if (key === "resourceCatalog") return structuredClone(catalog);
      return null;
    },
    async set(_module, key, value) { if (key === "operationLedger") ledger = structuredClone(value); return value; }
  }
};
globalThis.Folder = { async create() { throw new Error("folder exists"); } };
globalThis.fromUuid = async (uuid) => docs.get(uuid) ?? null;

function setPath(target, path, value) {
  const parts = path.split("."); let cursor = target;
  for (const part of parts.slice(0, -1)) { cursor[part] ??= {}; cursor = cursor[part]; }
  cursor[parts.at(-1)] = structuredClone(value);
}
let recordIndexRef = null;
function makeDoc({ id, name, recordType, data, ownership = {} }) {
  const doc = {
    id, uuid: `JournalEntry.${id}`, documentName: "JournalEntry", name,
    _stats: { modifiedTime: modifiedClock++ },
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
      this._stats.modifiedTime = modifiedClock++;
      recordIndexRef?.upsert(this);
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

function domain(id, controller, capabilities = {}) {
  return makeDoc({
    id, name: `Domain ${id}`, recordType: "domain", ownership: { default: 0, [controller]: 2 },
    data: {
      entityId: `domain:${id}`, description: "",
      identity: { tags: [] }, governance: { controllers: [controller] },
      management: { preset: "base", capabilities: { territory: true, diplomacy: true, intel: true, economy: true, ...capabilities } },
      economy: { stocks: [{ resourceId: "fuel", amount: 10 }], flows: [], resourcePolicies: [] },
      population: { total: 0, countMode: "direct", morale: 60, groups: [], workforce: { allocations: [] }, notables: [] },
      security: { guardCount: 0 }, conditions: [], relations: [], agreements: [], intel: [], history: [], notifications: [],
      territory: { controlState: "unknown", controller: null, control: 0, strategicValue: 0, influence: [], notes: "" }
    }
  });
}
function ref(doc, recordType = "domain") {
  const data = doc.getFlag("domain-manager", "data");
  return { recordType, uuid: doc.uuid, entityId: data.entityId };
}
function reset(...documents) {
  docs.clear(); for (const doc of documents) docs.set(doc.uuid, doc);
  game.journal = documents; game.user = users.get("GM"); ledger = { version: 1, receipts: [] };
  recordIndex.rebuild();
}
async function command(commandType, operationId, payload, callerUserId = "GM") {
  return dispatchAuthoritativeCommand({ commandType, operationId, payload }, { callerUserId });
}

test("territory.configure canonicaliza controller/influence e exige GM + capability", async () => {
  const a = domain("A", "P1"); const b = domain("B", "P2"); reset(a, b);
  const result = await command("territory.configure", "terr-1", {
    domain: ref(a), controlState: "contested", controller: ref(a), control: 64, strategicValue: 90,
    influence: [{ domain: ref(a), value: 64, notes: "Local" }, { domain: ref(b), value: 36, notes: "Pressão externa" }], notes: "Border node"
  });
  assert.equal(result.territory.controlState, "contested");
  assert.equal(result.territory.controller.entityId, "domain:A");
  assert.equal(result.territory.influence[1].domain.entityId, "domain:B");
  assert.equal(a.getFlag("domain-manager", "data").territory.strategicValue, 90);
  await assert.rejects(() => command("territory.configure", "terr-player", { domain: ref(a), controlState: "controlled", control: 100, strategicValue: 50 }, "P1"), /Apenas GM/i);
  const blocked = domain("C", "P1", { territory: false }); reset(blocked);
  await assert.rejects(() => command("territory.configure", "terr-cap", { domain: ref(blocked), controlState: "neutral", control: 0, strategicValue: 0 }), /capability territory/i);
});

test("relation.upsert cria edge tipada e rejeita autorrelação", async () => {
  const a = domain("A", "P1"); const b = domain("B", "P2"); reset(a, b);
  const result = await command("relation.upsert", "rel-1", {
    domain: ref(a), target: ref(b), posture: "rival", score: -55, trust: 12, tension: 88, notes: "Frontier dispute"
  });
  assert.equal(result.relation.target.entityId, "domain:B");
  assert.equal(result.relation.targetDomainUuid, b.uuid);
  assert.equal(result.relation.tension, 88);
  assert.equal(a.getFlag("domain-manager", "data").relations.length, 1);
  await assert.rejects(() => command("relation.upsert", "rel-self", { domain: ref(a), target: ref(a), posture: "neutral" }), /consigo mesmo/i);
});

test("Relations rejeita revisão obsoleta e não recria vínculo removido", async () => {
  const a = domain("A", "P1"); const b = domain("B", "P2"); reset(a, b);
  await assert.rejects(() => command("relation.upsert", "rel-stale", {
    domain: ref(a), expectedModifiedTime: a._stats.modifiedTime - 1, target: ref(b), posture: "friendly"
  }), /mudou enquanto estava aberto/i);
  assert.equal(a.getFlag("domain-manager", "data").relations.length, 0);

  await assert.rejects(() => command("relation.upsert", "rel-missing-update", {
    domain: ref(a), expectedModifiedTime: a._stats.modifiedTime, localId: "rel-removed", target: ref(b), posture: "neutral"
  }), /não pode recriar/i);
  assert.equal(a.getFlag("domain-manager", "data").relations.length, 0);
});

test("legacy Relation actions preservam patch parcial e delegam ao Command Kernel", async () => {
  const a = domain("A", "P1"); const b = domain("B", "P2"); reset(a, b);
  const actions = await import("../scripts/features/relations/actions.js");

  await actions.addRelation({
    domainUuid: a.uuid, targetDomainUuid: b.uuid, posture: "friendly", notes: "Legacy API", operationId: "relation-action-create"
  });
  let stored = a.getFlag("domain-manager", "data").relations[0];
  const localId = stored.localId;
  assert.equal(stored.targetDomainUuid, b.uuid);
  assert.equal(stored.target.entityId, "domain:B");
  assert.equal(stored.posture, "friendly");
  assert.equal(stored.trust, 50);

  await actions.updateRelation({
    domainUuid: a.uuid, localId, changes: { notes: "Patched only", trust: 77 }, operationId: "relation-action-update"
  });
  stored = a.getFlag("domain-manager", "data").relations[0];
  assert.equal(stored.posture, "friendly", "patch parcial não pode apagar a postura existente");
  assert.equal(stored.notes, "Patched only");
  assert.equal(stored.trust, 77);
  assert.equal(stored.target.entityId, "domain:B");

  await actions.removeRelation({ domainUuid: a.uuid, localId, operationId: "relation-action-remove" });
  assert.equal(a.getFlag("domain-manager", "data").relations.length, 0);

  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const source = fs.readFileSync(path.join(root, "scripts/features/relations/actions.js"), "utf8");
  const relationSection = source.split("export async function addAgreement")[0];
  for (const forbidden of ["updateRecord({", "createRecord({", "document.update", "transactionQueue"]) {
    assert.ok(!relationSection.includes(forbidden), `write path legado em Relations: ${forbidden}`);
  }
  assert.match(relationSection, /COMMAND_TYPES\.RELATION_UPSERT/);
  assert.match(relationSection, /COMMAND_TYPES\.RELATION_REMOVE/);
});

test("Agreement embutido legado é somente leitura e não conserva write path paralelo", async () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const source = fs.readFileSync(path.join(root, "scripts/features/relations/actions.js"), "utf8");
  for (const forbidden of ["updateRecord", "createRecord", "document.update", "transactionQueue"]) {
    assert.equal(source.includes(forbidden), false, `write path legado em Agreement: ${forbidden}`);
  }
  const actions = await import("../scripts/features/relations/actions.js");
  await assert.rejects(() => actions.removeAgreement({ domainUuid: "JournalEntry.A", localId: "agr-old" }), /somente leitura/i);
});

test("agreement.create cria entidade independente, ownership agregado e valida transferências", async () => {
  const a = domain("A", "P1"); const b = domain("B", "P2"); reset(a, b);
  const created = await command("agreement.create", "agr-1", {
    name: "Fuel Corridor", description: "Strategic supply", parties: [ref(a), ref(b)], type: "trade_pact", status: "active",
    startTick: 5, endTick: 20,
    transfers: [{ resourceId: "fuel", fromDomain: ref(a), toDomain: ref(b), amount: 3, periodTicks: 2, carry: 0 }], tags: ["supply"]
  });
  const doc = recordIndex.getByEntityId(created.entityId);
  assert.ok(doc);
  assert.equal(doc.getFlag("domain-manager", "recordType"), "agreement");
  assert.equal(doc.ownership.P1, 2);
  assert.equal(doc.ownership.P2, 2);
  assert.equal(doc.getFlag("domain-manager", "data").transfers[0].fromDomain.entityId, "domain:A");
  assert.equal(recordIndex.agreementsForDomain(a.uuid).length, 1);
  assert.equal(recordIndex.agreementsForDomain(b.getFlag("domain-manager", "data").entityId).length, 1);

  await assert.rejects(() => command("agreement.create", "agr-bad-resource", {
    name: "Bad", parties: [ref(a), ref(b)], transfers: [{ resourceId: "unobtainium", fromDomain: ref(a), toDomain: ref(b), amount: 1, periodTicks: 1 }]
  }), /Recurso desconhecido/i);
});

test("agreement.status atualiza lifecycle pelo command kernel", async () => {
  const a = domain("A", "P1"); const b = domain("B", "P2"); reset(a, b);
  const created = await command("agreement.create", "agr-status-create", {
    name: "Ceasefire", parties: [ref(a), ref(b)], type: "non_aggression", status: "draft", transfers: []
  });
  const changed = await command("agreement.status", "agr-status-1", { agreement: { recordType: "agreement", entityId: created.entityId }, status: "active" });
  assert.equal(changed.status, "active");
  const doc = recordIndex.getByEntityId(created.entityId);
  assert.equal(doc.getFlag("domain-manager", "data").status, "active");
});

test("Agreement encerrado é terminal e status valida revisão", async () => {
  const a = domain("A", "P1"); const b = domain("B", "P2"); reset(a, b);
  const created = await command("agreement.create", "agr-terminal-create", {
    name: "Final Pact", parties: [ref(a), ref(b)], type: "custom", status: "active", transfers: []
  });
  const agreement = recordIndex.getByEntityId(created.entityId);
  await assert.rejects(() => command("agreement.status", "agr-status-stale", {
    agreement: ref(agreement, "agreement"), expectedModifiedTime: agreement._stats.modifiedTime - 1, status: "suspended"
  }), /mudou enquanto estava aberto/i);
  await command("agreement.status", "agr-terminal", {
    agreement: ref(agreement, "agreement"), expectedModifiedTime: agreement._stats.modifiedTime, status: "terminated"
  });
  await assert.rejects(() => command("agreement.status", "agr-reactivate", {
    agreement: ref(agreement, "agreement"), expectedModifiedTime: agreement._stats.modifiedTime, status: "active"
  }), /não pode ser reativado/i);
  assert.equal(agreement.getFlag("domain-manager", "data").status, "terminated");
});

test("intel.upsert mantém alvo tipado e intel.reveal torna pacote público", async () => {
  const a = domain("A", "P1"); const b = domain("B", "P2"); reset(a, b);
  const upserted = await command("intel.upsert", "intel-1", {
    domain: ref(a), title: "B reactor weakness", category: "secret", visibility: "gm_only", targetDomain: ref(b),
    content: "Cooling manifold exposed", credibility: "likely", source: "Recon Team", tags: ["reactor"]
  });
  const localId = upserted.intel.localId;
  assert.equal(upserted.intel.targetDomain.entityId, "domain:B");
  assert.equal(upserted.intel.revealed, false);
  const revealed = await command("intel.reveal", "intel-reveal", { domain: ref(a), localId });
  assert.equal(revealed.intel.visibility, "public");
  assert.equal(revealed.intel.revealed, true);
  assert.equal(a.getFlag("domain-manager", "data").intel[0].visibility, "public");
});

test("Intel rejeita revisão obsoleta, recriação silenciosa e publicação por edição", async () => {
  const a = domain("A", "P1"); reset(a);
  await assert.rejects(() => command("intel.upsert", "intel-stale", {
    domain: ref(a), expectedModifiedTime: a._stats.modifiedTime - 1, title: "Stale", visibility: "gm_only"
  }), /mudou enquanto a informação estava aberta/i);

  await assert.rejects(() => command("intel.upsert", "intel-missing-update", {
    domain: ref(a), expectedModifiedTime: a._stats.modifiedTime, localId: "intel-removed", title: "Removed", visibility: "gm_only"
  }), /não pode recriar/i);

  const created = await command("intel.upsert", "intel-controlled", {
    domain: ref(a), expectedModifiedTime: a._stats.modifiedTime, title: "Controlled", visibility: "gm_only"
  });
  await assert.rejects(() => command("intel.upsert", "intel-publish-by-edit", {
    domain: ref(a), expectedModifiedTime: a._stats.modifiedTime, localId: created.intel.localId,
    title: "Controlled", visibility: "public"
  }), /Use a ação Revelar/i);
  assert.equal(a.getFlag("domain-manager", "data").intel[0].visibility, "gm_only");
});


test("legacy Intel actions preservam patch parcial e delegam ao Command Kernel", async () => {
  const a = domain("A", "P1"); const b = domain("B", "P2"); reset(a, b);
  const actions = await import("../scripts/features/intel/actions.js");

  await actions.addIntel({
    domainUuid: a.uuid, title: "Legacy Signal", category: "secret", visibility: "gm_only",
    content: "Initial", credibility: "likely", source: "Legacy API", tags: ["signal"], operationId: "intel-action-create"
  });
  let stored = a.getFlag("domain-manager", "data").intel[0];
  const localId = stored.localId;
  assert.equal(stored.title, "Legacy Signal");

  await actions.updateIntel({ domainUuid: a.uuid, localId, changes: { content: "Patched only" }, operationId: "intel-action-update" });
  stored = a.getFlag("domain-manager", "data").intel[0];
  assert.equal(stored.title, "Legacy Signal", "patch parcial não pode apagar campos existentes");
  assert.equal(stored.content, "Patched only");

  await actions.revealIntel({ domainUuid: a.uuid, localId, operationId: "intel-action-reveal" });
  stored = a.getFlag("domain-manager", "data").intel[0];
  assert.equal(stored.visibility, "public");
  assert.equal(stored.revealed, true);

  await actions.removeIntel({ domainUuid: a.uuid, localId, operationId: "intel-action-remove" });
  assert.equal(a.getFlag("domain-manager", "data").intel.length, 0);

  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const source = fs.readFileSync(path.join(root, "scripts/features/intel/actions.js"), "utf8");
  for (const forbidden of ["updateRecord", "createRecord", "document.update", "transactionQueue"]) {
    assert.ok(!source.includes(forbidden), `write path legado: ${forbidden}`);
  }
  for (const type of ["INTEL_UPSERT", "INTEL_REMOVE", "INTEL_REVEAL"]) {
    assert.match(source, new RegExp(`COMMAND_TYPES\\.${type}`));
  }
});
