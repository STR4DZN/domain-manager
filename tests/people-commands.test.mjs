import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

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
  ["GM2", { id: "GM2", uuid: "User.GM2", name: "Secondary GM", isGM: true, active: true }],
  ["P1", { id: "P1", uuid: "User.P1", name: "Controller", isGM: false, active: true }],
  ["P2", { id: "P2", uuid: "User.P2", name: "Visitor", isGM: false, active: true }]
]);
users.get = Map.prototype.get.bind(users);
users.activeGM = users.get("GM");
users.contents = [...users.values()];

const docs = new Map();
let modifiedClock = 100;
let operationLedger = { version: 1, receipts: [] };
let failLedgerWrite = false;
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
    async set(_m, key, value) {
      if (key === "operationLedger" && failLedgerWrite) throw new Error("ledger unavailable");
      if (key === "operationLedger") operationLedger = structuredClone(value);
      return value;
    }
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
    const doc = makeDoc({ id: payload._id ?? `NEW${createCounter++}`, name: payload.name, recordType: flags.recordType, data: flags.data, ownership: payload.ownership });
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
  docs.clear(); for (const d of documents) docs.set(d.uuid, d); game.journal = documents; operationLedger = { version: 1, receipts: [] }; failLedgerWrite = false; game.user = users.get("GM"); recordIndex.rebuild();
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

test("Population rejeita formulário obsoleto e edição não recria grupo removido", async () => {
  const d = domain(); reset(d);
  const initialRevision = d._stats.modifiedTime;
  await assert.rejects(() => command("population.configure", "pop-stale", {
    domain: ref(d, "domain"), expectedModifiedTime: initialRevision - 1, total: 99, countMode: "direct", morale: 70
  }), /mudou enquanto estava aberto/i);
  assert.equal(d.getFlag("domain-manager", "data").population.total, 10);

  await assert.rejects(() => command("population.group-upsert", "group-missing-update", {
    domain: ref(d, "domain"), expectedModifiedTime: d._stats.modifiedTime, localId: "removed-group",
    name: "Grupo removido", count: 3, workforceEligible: 3, morale: 60, status: "active"
  }), /não pode recriar/i);
  assert.equal(d.getFlag("domain-manager", "data").population.groups.length, 0);
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

test("Person update rejeita revisão obsoleta sem sobrescrever cadastro", async () => {
  const d = domain(); reset(d);
  const created = await command("person.create", "person-stale-create", {
    domain: ref(d, "domain"), name: "Lina", role: "Scout", morale: 70, condition: 90, status: "active"
  });
  const personDoc = recordIndex.getByEntityId(created.entityId);
  const revision = personDoc._stats.modifiedTime;
  await personDoc.update({ name: "Lina Atual" });
  await assert.rejects(() => command("person.update", "person-stale-update", {
    person: ref(personDoc, "person"), expectedModifiedTime: revision, name: "Lina Antiga", role: "Scout",
    morale: 70, condition: 90, status: "active"
  }), /mudou enquanto estava aberto/i);
  assert.equal(personDoc.name, "Lina Atual");
});

test("Person rejeita visitante e Squad pertencente a outro Domain", async () => {
  const d1 = domain(); const d2 = domain({ id: "D2", entityId: "domain:D2" }); const sq2 = squad(d2, { id: "SQ2", entityId: "squad:SQ2" }); reset(d1, d2, sq2);
  await assert.rejects(() => command("person.create", "person-denied", { domain: ref(d1, "domain"), name: "Visitor", morale: 60, condition: 100 }, "P2"), /não controla/i);
  await assert.rejects(() => command("person.create", "person-cross", { domain: ref(d1, "domain"), name: "Wrong Squad", squad: ref(sq2, "squad"), morale: 60, condition: 100 }), /não pertence/i);
});

test("People legacy actions não mantêm escrita paralela e bloqueiam Notable embutido", async () => {
  const source = fs.readFileSync(new URL("../scripts/features/people/actions.js", import.meta.url), "utf8");
  for (const forbidden of ["updateRecord", "createRecord", "document.update", "transactionQueue"]) {
    assert.equal(source.includes(forbidden), false, `write path legado em People: ${forbidden}`);
  }
  const d = domain(); reset(d);
  const actions = await import("../scripts/features/people/actions.js");
  await actions.updatePopulationSummaryAction({
    domainUuid: d.uuid,
    expectedModifiedTime: d._stats.modifiedTime,
    total: 42,
    countMode: "direct",
    operationId: "people-action-population"
  });
  assert.equal(d.getFlag("domain-manager", "data").population.total, 42);
  await assert.rejects(() => actions.upsertNotableAction({ domainUuid: d.uuid }), /somente leitura/i);
});

test("Domain create/update/media passam pelo kernel para GM secundário", async () => {
  reset();
  const created = await command("domain.create", "domain-create-1", {
    name: "Estação Aurora",
    description: "Entreposto orbital",
    category: "Estação",
    nature: "physical",
    state: "active",
    managementPreset: "outpost",
    controllerIds: ["P1"]
  }, "GM2");
  const createdDocument = recordIndex.getByEntityId(created.entityId);
  assert.ok(createdDocument);
  assert.equal(created.name, "Estação Aurora");
  assert.equal(created.preset, "outpost");

  const updated = await command("domain.update", "domain-update-1", {
    domain: ref(createdDocument, "domain"),
    name: "Estação Aurora Prime",
    description: "Entreposto principal",
    category: "Estação",
    nature: "physical",
    state: "active",
    tags: ["orbital"],
    controllerIds: ["P1"],
    locatedInUuid: null,
    administrativeParentUuid: null,
    managementPreset: "custom",
    capabilities: { economy: true, people: true, projects: true }
  }, "GM2");
  assert.equal(updated.name, "Estação Aurora Prime");
  assert.equal(updated.preset, "custom");
  assert.equal(createdDocument.name, "Estação Aurora Prime");
  assert.equal(createdDocument.getFlag("domain-manager", "data").management.capabilities.people, true);
  assert.equal(createdDocument.getFlag("domain-manager", "data").management.capabilities.missions, false);

  const media = await command("domain.media-update", "domain-media-1", {
    domain: ref(createdDocument, "domain"),
    fields: [
      ["visuals.bannerImg", "images/aurora.webp"],
      ["visuals.imagePosX", 72]
    ]
  }, "GM2");
  assert.equal(media.uuid, createdDocument.uuid);
  assert.equal(createdDocument.getFlag("domain-manager", "data").visuals.bannerImg, "images/aurora.webp");
  assert.equal(createdDocument.getFlag("domain-manager", "data").visuals.imagePosX, 72);
});

test("Domain commands rejeitam caller que não é GM", async () => {
  const d = domain(); reset(d);
  await assert.rejects(() => command("domain.create", "domain-denied-create", {
    name: "Inválido"
  }, "P1"), /Somente GM/i);
  await assert.rejects(() => command("domain.media-update", "domain-denied-media", {
    domain: ref(d, "domain"),
    fields: [["visuals.bannerImg", "images/nope.webp"]]
  }, "P1"), /Somente GM/i);
});

test("Domain delete bloqueia registros com dependências e preserva todos os documentos", async () => {
  const parent = domain();
  const child = domain({ id: "D2", entityId: "domain:D2" });
  child.flags["domain-manager"].data.hierarchy = {
    locatedInUuid: parent.uuid,
    administrativeParentUuid: null
  };
  const linkedStructure = structure(parent);
  reset(parent, child, linkedStructure);

  await assert.rejects(() => command("domain.delete", "domain-delete-blocked", {
    domain: ref(parent, "domain"),
    confirmation: "domain:D1"
  }, "GM2"), /2 vinculaç/i);

  assert.ok(recordIndex.get("domain", parent.uuid));
  assert.ok(recordIndex.get("domain", child.uuid));
  assert.ok(recordIndex.get("structure", linkedStructure.uuid));
});

test("Domain delete exige confirmação exata, aceita GM secundário e é idempotente", async () => {
  const removable = domain();
  reset(removable);

  await assert.rejects(() => command("domain.delete", "domain-delete-wrong-confirmation", {
    domain: ref(removable, "domain"),
    confirmation: "D1"
  }, "GM2"), /domain:D1/i);

  const envelope = { domain: ref(removable, "domain"), confirmation: "domain:D1" };
  const first = await command("domain.delete", "domain-delete-success", envelope, "GM2");
  const duplicate = await command("domain.delete", "domain-delete-success", envelope, "GM2");
  assert.equal(first.entityId, "domain:D1");
  assert.equal(first.duplicate, false);
  assert.equal(duplicate.duplicate, true);
  assert.equal(recordIndex.get("domain", removable.uuid), null);
  assert.equal(docs.has(removable.uuid), false);
});

test("Domain delete restaura o mesmo JournalEntry se a receipt não puder ser persistida", async () => {
  const removable = domain();
  reset(removable);
  failLedgerWrite = true;

  await assert.rejects(() => command("domain.delete", "domain-delete-rollback", {
    domain: ref(removable, "domain"),
    confirmation: "domain:D1"
  }, "GM2"), /ledger unavailable/i);

  assert.ok(docs.has(removable.uuid));
  assert.equal(recordIndex.get("domain", removable.uuid)?.uuid, removable.uuid);
  assert.equal(recordIndex.get("domain", removable.uuid)?.name, removable.name);
});

test("bridges legadas de Domain usam somente o Command Kernel", () => {
  const actionsSource = fs.readFileSync(new URL("../scripts/features/domains/actions.js", import.meta.url), "utf8");
  const mediaSource = fs.readFileSync(new URL("../scripts/features/domains/media.js", import.meta.url), "utf8");
  const commandsSource = fs.readFileSync(new URL("../scripts/features/domains/commands.js", import.meta.url), "utf8");

  for (const [label, source] of [["actions", actionsSource], ["media", mediaSource]]) {
    assert.match(source, /executeCommandAuthoritatively/, `${label} precisa delegar ao kernel`);
    assert.doesNotMatch(
      source,
      /createRecord|updateRecord|deleteRecord|recordIndex|decodeRecord|\.document\.update|JournalEntry\./,
      `${label} não pode manter uma rota de escrita paralela`
    );
  }
  assert.match(actionsSource, /COMMAND_TYPES\.DOMAIN_CREATE/);
  assert.match(actionsSource, /COMMAND_TYPES\.DOMAIN_UPDATE/);
  assert.match(mediaSource, /COMMAND_TYPES\.DOMAIN_MEDIA_UPDATE/);
  assert.doesNotMatch(commandsSource, /from\s+["']\.\/actions\.js["']/);
  assert.doesNotMatch(commandsSource, /from\s+["']\.\/media\.js["']/);
});

test("bridges de create/update preservam retorno legado, revisão e idempotência", async () => {
  reset();
  const actions = await import("../scripts/features/domains/actions.js");
  const createPayload = {
    name: "Porto Celeste",
    description: "Entreposto de fronteira",
    category: "Porto",
    nature: "physical",
    state: "active",
    tags: ["fronteira"],
    controllerIds: ["P1"],
    managementPreset: "outpost",
    operationId: "legacy-domain-create"
  };

  const created = await actions.createDomainAction(createPayload);
  const duplicate = await actions.createDomainAction(createPayload);
  assert.equal(created.uuid, duplicate.uuid);
  assert.equal(created.recordType, "domain");
  assert.equal(game.journal.length, 1, "retry da bridge não pode criar outro Domain");
  assert.equal(operationLedger.receipts.length, 1);

  const revision = created.document._stats.modifiedTime;
  const updatePayload = {
    domainUuid: created.uuid,
    expectedModifiedTime: revision,
    name: "Porto Celeste Prime",
    description: "Entreposto ampliado",
    category: "Porto",
    nature: "physical",
    state: "active",
    tags: ["fronteira", "comercial"],
    controllerIds: ["P1"],
    locatedInUuid: null,
    administrativeParentUuid: null,
    operationId: "legacy-domain-update"
  };
  const updated = await actions.updateDomainAction(updatePayload);
  const updateRetry = await actions.updateDomainAction(updatePayload);
  assert.equal(updated.document.name, "Porto Celeste Prime");
  assert.equal(updateRetry.document.name, "Porto Celeste Prime");
  assert.equal(operationLedger.receipts.length, 2, "retry da bridge deve reutilizar a receipt do update");

  await assert.rejects(() => actions.updateDomainAction({
    ...updatePayload,
    expectedModifiedTime: revision,
    description: "Edição obsoleta",
    operationId: "legacy-domain-update-stale"
  }), /mudou enquanto o formulário/i);
  assert.equal(created.document.getFlag("domain-manager", "data").description, "Entreposto ampliado");
});

test("bridge de mídia preserva revisão, valida campos e deduplica retry", async () => {
  const d = domain();
  reset(d);
  const media = await import("../scripts/features/domains/media.js");
  const revision = d._stats.modifiedTime;
  const payload = {
    domainUuid: d.uuid,
    expectedModifiedTime: revision,
    fields: [
      ["visuals.bannerImg", "images/aurelia.webp"],
      ["visuals.imagePosX", 140]
    ],
    operationId: "legacy-domain-media"
  };

  await media.updateDomainMediaFields(payload);
  await media.updateDomainMediaFields(payload);
  const stored = d.getFlag("domain-manager", "data");
  assert.equal(stored.visuals.bannerImg, "images/aurelia.webp");
  assert.equal(stored.visuals.imagePosX, 100, "coordenada visual continua limitada pelo contrato");
  assert.equal(operationLedger.receipts.length, 1);

  const staleRevision = d._stats.modifiedTime;
  await d.update({ name: "Aurelia alterada" });
  await assert.rejects(() => media.updateDomainMediaField({
    domainUuid: d.uuid,
    expectedModifiedTime: staleRevision,
    fieldPath: "visuals.crestImg",
    value: "images/crest.webp",
    operationId: "legacy-domain-media-stale"
  }), /mudou enquanto a edição de aparência/i);
  assert.equal(d.getFlag("domain-manager", "data").visuals.crestImg, undefined);

  await assert.rejects(() => media.updateDomainMediaField({
    domainUuid: d.uuid,
    fieldPath: "visuals.script",
    value: "não permitido",
    operationId: "legacy-domain-media-invalid"
  }), /Campo de mídia não permitido/i);
});

test("rollback do kernel desfaz create e mídia feitos pelas bridges legadas", async () => {
  reset();
  const actions = await import("../scripts/features/domains/actions.js");
  failLedgerWrite = true;
  await assert.rejects(() => actions.createDomainAction({
    name: "Domain transitório",
    controllerIds: [],
    operationId: "legacy-domain-create-rollback"
  }), /ledger unavailable/i);
  assert.equal(game.journal.length, 0, "Domain criado deve ser removido se a receipt falhar");

  const d = domain();
  d.flags["domain-manager"].data.visuals = { bannerImg: "images/original.webp" };
  reset(d);
  const media = await import("../scripts/features/domains/media.js");
  failLedgerWrite = true;
  await assert.rejects(() => media.updateDomainMediaField({
    domainUuid: d.uuid,
    fieldPath: "visuals.bannerImg",
    value: "images/nao-commitado.webp",
    operationId: "legacy-domain-media-rollback"
  }), /ledger unavailable/i);
  assert.equal(
    d.getFlag("domain-manager", "data").visuals.bannerImg,
    "images/original.webp",
    "rollback deve restaurar os dados anteriores"
  );
});

test("Person exige confirmação terminal e sai da unidade ao morrer ou se aposentar", async () => {
  const d = domain();
  const sq = squad(d);
  reset(d, sq);
  const created = await command("person.create", "person-terminal-create", {
    domain: ref(d, "domain"),
    name: "Rosa Vidal",
    role: "Piloto",
    morale: 70,
    condition: 82,
    status: "active",
    squad: ref(sq, "squad")
  });
  const person = recordIndex.getByEntityId(created.entityId);
  const terminalPayload = {
    person: ref(person, "person"),
    expectedModifiedTime: person._stats.modifiedTime,
    name: "Rosa Vidal",
    role: "Piloto veterana",
    morale: 70,
    condition: 82,
    status: "retired",
    squad: ref(sq, "squad")
  };

  await assert.rejects(
    () => command("person.update", "person-terminal-unconfirmed", terminalPayload),
    /confirme explicitamente/i
  );
  assert.equal(person.getFlag("domain-manager", "data").status, "active");
  assert.equal(person.getFlag("domain-manager", "data").squad.entityId, "squad:SQ1");

  await command("person.update", "person-terminal-confirmed", {
    ...terminalPayload,
    confirmTerminalTransition: true
  });
  assert.equal(person.getFlag("domain-manager", "data").status, "retired");
  assert.equal(person.getFlag("domain-manager", "data").squad, null);
});
