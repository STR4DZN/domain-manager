import test from "node:test";
import assert from "node:assert/strict";

class DummyField {}
let nextEntity = 1;
class DummyDataModel {
  constructor(data = {}) {
    this.data = structuredClone(data);
    const typeByClass = {
      DomainModel: "domain",
      ProjectModel: "project",
      StructureModel: "structure"
    };
    const type = typeByClass[this.constructor.name];
    if (!this.data.entityId && type) this.data.entityId = `${type}:TEST${nextEntity++}`;
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
  ["P1", { id: "P1", uuid: "User.P1", name: "Base Commander", isGM: false, active: true }],
  ["P2", { id: "P2", uuid: "User.P2", name: "Visitor", isGM: false, active: true }]
]);
users.get = Map.prototype.get.bind(users);
users.activeGM = users.get("GM");
users.contents = [...users.values()];

let operationLedger = { version: 1, receipts: [] };
let failOperationLedgerWrite = false;
const resourceCatalog = {
  version: 1,
  resources: [
    { id: "metal", name: "Metal", precision: 0, allowNegative: false, unit: "u" },
    { id: "fuel", name: "Combustível", precision: 0, allowNegative: false, unit: "u" },
    { id: "energy", name: "Energia", precision: 0, allowNegative: false, unit: "u" }
  ]
};
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
      if (key === "resourceCatalog") return structuredClone(resourceCatalog);
      return null;
    },
    async set(_moduleId, key, value) {
      if (key === "operationLedger") {
        if (failOperationLedgerWrite) throw new Error("simulated operation ledger failure");
        operationLedger = structuredClone(value);
      }
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
    flags: { "domain-manager": { recordType, schemaVersion: 9, data: structuredClone(data) } },
    getFlag(moduleId, key) { return this.flags[moduleId]?.[key]; },
    testUserPermission(actor, level) { return actor.isGM || Number(this.ownership?.[actor.id] ?? 0) >= level; },
    async update(changes) {
      for (const [key, value] of Object.entries(changes)) {
        if (key === "name") this.name = value;
        else if (key === "ownership") this.ownership = structuredClone(value);
        else applyPath(this, key, value);
      }
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
  },
  async updateDocuments(changes) {
    const result = [];
    for (const update of changes) {
      const doc = [...docs.values()].find((entry) => entry.id === update._id);
      const copy = { ...update };
      delete copy._id;
      await doc.update(copy);
      result.push(doc);
    }
    return result;
  }
};

const { recordIndex } = await import("../scripts/data/record-index.js");
const { dispatchAuthoritativeCommand } = await import("../scripts/commands/execute.js");
const structureActions = await import("../scripts/features/structures/actions.js");

function domainDocument({ stocks = [{ resourceId: "metal", amount: 200 }] } = {}) {
  return makeDocument({
    id: "D1",
    name: "Base Aurelia",
    recordType: "domain",
    ownership: { default: 0, P1: 2 },
    data: {
      entityId: "domain:D1",
      description: "",
      management: { preset: "base", capabilities: { structures: true, projects: true } },
      governance: { controllers: ["P1"] },
      identity: { tags: [] },
      economy: { stocks, flows: [] },
      population: { groups: [], notables: [] },
      conditions: [], relations: [], agreements: [], intel: [], history: [], notifications: []
    }
  });
}

function structureDocument({ status = "operational", condition = 100 } = {}) {
  return makeDocument({
    id: "ST1",
    name: "Reator Helios",
    recordType: "structure",
    ownership: { default: 0, P1: 2 },
    data: {
      entityId: "structure:ST1",
      domain: { recordType: "domain", uuid: "JournalEntry.D1", entityId: "domain:D1" },
      activeProject: null,
      description: "Power core",
      category: "power",
      tier: 1,
      maxTier: 3,
      status,
      condition,
      capacity: 100,
      maintenancePriority: 73,
      workforceRequired: 0,
      maintenance: [{ resourceId: "fuel", amount: 2 }],
      production: [{ resourceId: "energy", amount: 20 }],
      tags: ["critical"]
    }
  });
}

function resetWorld(...documents) {
  docs.clear();
  for (const document of documents) docs.set(document.uuid, document);
  game.journal = documents;
  game.user = users.get("GM");
  operationLedger = { version: 1, receipts: [] };
  failOperationLedgerWrite = false;
  recordIndex.rebuild();
}

function ref(document, recordType, entityId) {
  return { recordType, uuid: document.uuid, entityId };
}

test("GM cria Structure imediata e herda ownership dos controllers do Domain", async () => {
  const domain = domainDocument();
  resetWorld(domain);

  const result = await dispatchAuthoritativeCommand({
    commandType: "structure.create",
    operationId: "structure-create-1",
    payload: {
      name: "Refinaria Sigma",
      domain: ref(domain, "domain", "domain:D1"),
      category: "industry",
      tier: 1,
      maxTier: 4,
      condition: 95,
      capacity: 400,
      maintenance: [{ resourceId: "fuel", amount: 2 }],
      production: [{ resourceId: "energy", amount: 10 }]
    }
  }, { callerUserId: "GM" });

  const created = game.journal.find((entry) => entry.uuid === result.uuid);
  assert.ok(created);
  assert.equal(created.ownership.P1, 2);
  assert.equal(created.getFlag("domain-manager", "data").status, "operational");
  assert.equal(created.getFlag("domain-manager", "data").production[0].amount, 10);
});

test("controlador do Domain pode desligar/reativar Structure, visitante não", async () => {
  const domain = domainDocument();
  const structure = structureDocument();
  resetWorld(domain, structure);

  await dispatchAuthoritativeCommand({
    commandType: "structure.patch",
    operationId: "structure-patch-1",
    payload: {
      structure: ref(structure, "structure", "structure:ST1"),
      patch: { status: "disabled" }
    }
  }, { callerUserId: "P1" });
  assert.equal(structure.getFlag("domain-manager", "data").status, "disabled");

  await assert.rejects(() => dispatchAuthoritativeCommand({
    commandType: "structure.patch",
    operationId: "structure-patch-denied",
    payload: {
      structure: ref(structure, "structure", "structure:ST1"),
      patch: { status: "operational" }
    }
  }, { callerUserId: "P2" }), /não controla/i);
});

test("GM atualiza blueprint estrutural completo", async () => {
  const domain = domainDocument();
  const structure = structureDocument();
  resetWorld(domain, structure);

  await dispatchAuthoritativeCommand({
    commandType: "structure.admin-update",
    operationId: "structure-admin-1",
    payload: {
      structure: ref(structure, "structure", "structure:ST1"),
      name: "Reator Helios II",
      description: "Modernizado",
      category: "power",
      tier: 2,
      maxTier: 4,
      status: "damaged",
      condition: 60,
      capacity: 180,
      maintenance: [{ resourceId: "fuel", amount: 4 }],
      production: [{ resourceId: "energy", amount: 36 }],
      tags: ["critical", "reactor"]
    }
  }, { callerUserId: "GM" });

  const data = structure.getFlag("domain-manager", "data");
  assert.equal(structure.name, "Reator Helios II");
  assert.equal(data.tier, 2);
  assert.equal(data.condition, 60);
  assert.equal(data.maintenancePriority, 73);
  assert.equal(data.activeProject, null);
  assert.equal(data.production[0].amount, 36);
});

test("controlador inicia construção como Project real sem consumir custo reserved imediatamente", async () => {
  const domain = domainDocument();
  resetWorld(domain);

  const command = {
    commandType: "structure.begin-construction",
    operationId: "structure-build-1",
    payload: {
      name: "Hangar Kestrel",
      domain: ref(domain, "domain", "domain:D1"),
      category: "logistics",
      tier: 1,
      maxTier: 3,
      capacity: 20,
      maintenance: [{ resourceId: "fuel", amount: 1 }],
      production: [],
      project: {
        workRequired: 100,
        rateAmount: 20,
        periodTicks: 1,
        costs: [{ resourceId: "metal", mode: "reserved", amount: 80 }]
      }
    }
  };

  const first = await dispatchAuthoritativeCommand(command, { callerUserId: "P1" });
  const second = await dispatchAuthoritativeCommand(command, { callerUserId: "P1" });

  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  const project = game.journal.find((entry) => entry.getFlag("domain-manager", "recordType") === "project");
  const structure = game.journal.find((entry) => entry.getFlag("domain-manager", "recordType") === "structure");
  assert.ok(project);
  assert.ok(structure);
  assert.equal(project.getFlag("domain-manager", "data").status, "active");
  assert.equal(structure.getFlag("domain-manager", "data").status, "planned");
  assert.equal(structure.getFlag("domain-manager", "data").activeProject.entityId, project.getFlag("domain-manager", "data").entityId);
  assert.equal(domain.getFlag("domain-manager", "data").economy.stocks[0].amount, 200);
  assert.equal(operationLedger.receipts.length, 1);
});

test("construção rejeita reserva sem estoque e não deixa documentos órfãos", async () => {
  const domain = domainDocument({ stocks: [{ resourceId: "metal", amount: 20 }] });
  resetWorld(domain);

  await assert.rejects(() => dispatchAuthoritativeCommand({
    commandType: "structure.begin-construction",
    operationId: "structure-build-short",
    payload: {
      name: "Fortaleza",
      domain: ref(domain, "domain", "domain:D1"),
      project: {
        workRequired: 100,
        rateAmount: 10,
        periodTicks: 1,
        costs: [{ resourceId: "metal", mode: "reserved", amount: 80 }]
      }
    }
  }, { callerUserId: "P1" }), /Reserva insuficiente/i);

  assert.equal(game.journal.length, 1);
});

test("Structure rejeita referência UUID/entityId inconsistente", async () => {
  const domain = domainDocument();
  const structure = structureDocument();
  const other = makeDocument({
    id: "ST2",
    name: "Outra",
    recordType: "structure",
    data: { ...structuredClone(structure.getFlag("domain-manager", "data")), entityId: "structure:ST2" }
  });
  resetWorld(domain, structure, other);

  await assert.rejects(() => dispatchAuthoritativeCommand({
    commandType: "structure.patch",
    operationId: "structure-ref-conflict",
    payload: {
      structure: { recordType: "structure", uuid: structure.uuid, entityId: "structure:ST2" },
      patch: { status: "disabled" }
    }
  }, { callerUserId: "P1" }), /entidades diferentes/i);
});

test("Structure recusa formulário obsoleto antes de alterar o registro", async () => {
  const domain = domainDocument();
  const structure = structureDocument();
  structure._stats = { modifiedTime: 200 };
  resetWorld(domain, structure);

  await assert.rejects(() => dispatchAuthoritativeCommand({
    commandType: "structure.patch",
    operationId: "structure-stale-patch",
    payload: {
      structure: ref(structure, "structure", "structure:ST1"),
      expectedModifiedTime: "199",
      patch: { status: "disabled" }
    }
  }, { callerUserId: "P1" }), /mudou enquanto o formulário/i);

  assert.equal(structure.getFlag("domain-manager", "data").status, "operational");
});

test("GM não pode comissionar manualmente Structure com Project ainda vinculado", async () => {
  const domain = domainDocument();
  const structure = structureDocument({ status: "planned" });
  structure.getFlag("domain-manager", "data").activeProject = {
    recordType: "project",
    uuid: "JournalEntry.PR-ACTIVE",
    entityId: "project:PR-ACTIVE"
  };
  resetWorld(domain, structure);

  await assert.rejects(() => dispatchAuthoritativeCommand({
    commandType: "structure.admin-update",
    operationId: "structure-manual-commission",
    payload: {
      structure: ref(structure, "structure", "structure:ST1"),
      name: structure.name,
      description: "Tentativa manual",
      category: "power",
      tier: 1,
      maxTier: 3,
      status: "operational",
      condition: 100,
      capacity: 100,
      maintenancePriority: 50,
      workforceRequired: 0,
      maintenance: [{ resourceId: "fuel", amount: 2 }],
      production: [{ resourceId: "energy", amount: 20 }],
      tags: ["critical"]
    }
  }, { callerUserId: "GM" }), /Project em andamento|comissionamento pela simulação/i);

  const data = structure.getFlag("domain-manager", "data");
  assert.equal(data.status, "planned");
  assert.equal(data.activeProject.entityId, "project:PR-ACTIVE");
});

test("APIs de compatibilidade de Structure delegam ao kernel e preservam operationId", async () => {
  const domain = domainDocument();
  resetWorld(domain);
  const payload = {
    operationId: "legacy-structure-create",
    name: "Refinaria Wrapper",
    domain: ref(domain, "domain", "domain:D1"),
    category: "industry",
    maintenance: [{ resourceId: "fuel", amount: 1 }],
    production: [{ resourceId: "energy", amount: 4 }]
  };

  const first = await structureActions.createStructureAction(payload);
  const second = await structureActions.createStructureAction(payload);

  assert.equal(first.operationId, "legacy-structure-create");
  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  assert.equal(second.uuid, first.uuid);
  assert.equal(game.journal.filter((entry) => entry.getFlag("domain-manager", "recordType") === "structure").length, 1);
  assert.equal(operationLedger.receipts[0].commandType, "structure.create");
});

test("patch parcial via action preserva blueprint e revisão do registro", async () => {
  const domain = domainDocument();
  const structure = structureDocument();
  structure._stats = { modifiedTime: 300 };
  resetWorld(domain, structure);

  const result = await structureActions.patchStructureAction({
    operationId: "legacy-structure-patch",
    structure: ref(structure, "structure", "structure:ST1"),
    expectedModifiedTime: 300,
    patch: { description: "Parada preventiva", status: "disabled" }
  });

  const data = structure.getFlag("domain-manager", "data");
  assert.equal(result.operationId, "legacy-structure-patch");
  assert.equal(data.description, "Parada preventiva");
  assert.equal(data.status, "disabled");
  assert.equal(data.category, "power");
  assert.equal(data.tier, 1);
  assert.deepEqual(data.maintenance, [{ resourceId: "fuel", amount: 2 }]);
  assert.deepEqual(data.production, [{ resourceId: "energy", amount: 20 }]);
});

test("admin-update também recusa revisão obsoleta sem alterar blueprint", async () => {
  const domain = domainDocument();
  const structure = structureDocument();
  structure._stats = { modifiedTime: 400 };
  resetWorld(domain, structure);

  await assert.rejects(() => structureActions.updateStructureAdministrationAction({
    operationId: "legacy-structure-stale-admin",
    structure: ref(structure, "structure", "structure:ST1"),
    expectedModifiedTime: 399,
    name: "Nome obsoleto",
    description: "Não deve persistir",
    category: "industry",
    tier: 2,
    maxTier: 4,
    status: "damaged",
    condition: 50,
    capacity: 200,
    maintenancePriority: 90,
    workforceRequired: 10,
    maintenance: [],
    production: [],
    tags: []
  }), /mudou enquanto o formulário/i);

  assert.equal(structure.name, "Reator Helios");
  assert.equal(structure.getFlag("domain-manager", "data").category, "power");
  assert.equal(operationLedger.receipts.length, 0);
});

test("falha ao gravar receipt desfaz criação direta de Structure", async () => {
  const domain = domainDocument();
  resetWorld(domain);
  failOperationLedgerWrite = true;

  await assert.rejects(() => structureActions.createStructureAction({
    operationId: "structure-create-ledger-failure",
    name: "Estrutura transitória",
    domain: ref(domain, "domain", "domain:D1"),
    maintenance: [],
    production: []
  }), /operation ledger failure/i);

  assert.deepEqual(game.journal.map((entry) => entry.uuid), [domain.uuid]);
  assert.equal(operationLedger.receipts.length, 0);
});

test("falha ao gravar receipt desfaz patch e administração de Structure", async () => {
  const domain = domainDocument();
  const structure = structureDocument();
  resetWorld(domain, structure);
  failOperationLedgerWrite = true;

  await assert.rejects(() => structureActions.patchStructureAction({
    operationId: "structure-patch-ledger-failure",
    structure: ref(structure, "structure", "structure:ST1"),
    patch: { description: "Não deve persistir", status: "disabled" }
  }), /operation ledger failure/i);
  assert.equal(structure.getFlag("domain-manager", "data").description, "Power core");
  assert.equal(structure.getFlag("domain-manager", "data").status, "operational");

  await assert.rejects(() => structureActions.updateStructureAdministrationAction({
    operationId: "structure-admin-ledger-failure",
    structure: ref(structure, "structure", "structure:ST1"),
    name: "Nome transitório",
    description: "Não deve persistir",
    category: "industry",
    tier: 2,
    maxTier: 4,
    status: "damaged",
    condition: 50,
    capacity: 200,
    maintenancePriority: 90,
    workforceRequired: 10,
    maintenance: [],
    production: [],
    tags: []
  }), /operation ledger failure/i);
  assert.equal(structure.name, "Reator Helios");
  assert.equal(structure.getFlag("domain-manager", "data").description, "Power core");
  assert.equal(structure.getFlag("domain-manager", "data").category, "power");
  assert.equal(operationLedger.receipts.length, 0);
});

test("falha ao gravar receipt desfaz Project e Structure da construção", async () => {
  const domain = domainDocument();
  resetWorld(domain);
  failOperationLedgerWrite = true;

  await assert.rejects(() => structureActions.beginStructureConstructionAction({
    operationId: "structure-construction-ledger-failure",
    name: "Hangar transitório",
    domain: ref(domain, "domain", "domain:D1"),
    maintenance: [{ resourceId: "fuel", amount: 1 }],
    production: [],
    project: {
      workRequired: 20,
      rateAmount: 2,
      periodTicks: 1,
      costs: [{ resourceId: "metal", mode: "reserved", amount: 10 }]
    }
  }), /operation ledger failure/i);

  assert.deepEqual(game.journal.map((entry) => entry.uuid), [domain.uuid]);
  assert.equal(operationLedger.receipts.length, 0);
});

test("destruição ou descomissionamento de Structure exige confirmação explícita", async () => {
  const domain = domainDocument();
  const structure = structureDocument();
  resetWorld(domain, structure);
  const payload = {
    structure: ref(structure, "structure", "structure:ST1"),
    name: "Reator Helios",
    description: "Power core",
    category: "power",
    tier: 1,
    maxTier: 3,
    status: "decommissioned",
    condition: 100,
    capacity: 100,
    maintenancePriority: 50,
    workforceRequired: 0,
    maintenance: [],
    production: [],
    tags: []
  };

  await assert.rejects(() => dispatchAuthoritativeCommand({
    commandType: "structure.admin-update",
    operationId: "structure-terminal-unconfirmed",
    payload
  }, { callerUserId: "GM" }), /confirme explicitamente/i);
  assert.equal(structure.getFlag("domain-manager", "data").status, "operational");

  await dispatchAuthoritativeCommand({
    commandType: "structure.admin-update",
    operationId: "structure-terminal-confirmed",
    payload: { ...payload, confirmTerminalTransition: true }
  }, { callerUserId: "GM" });
  assert.equal(structure.getFlag("domain-manager", "data").status, "decommissioned");
});
