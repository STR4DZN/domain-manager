import test from "node:test";
import assert from "node:assert/strict";

class DummyField {}
let nextEntity = 1;
class DummyDataModel {
  constructor(data = {}) {
    this.data = structuredClone(data);
    const typeByClass = { DomainModel: "domain", ProjectModel: "project", StructureModel: "structure" };
    const type = typeByClass[this.constructor.name];
    if (!this.data.entityId && type) this.data.entityId = `${type}:TEST${nextEntity++}`;
  }
  validate() { this.constructor.validateJoint?.(this.data); return true; }
  toObject() { return structuredClone(this.data); }
}

globalThis.foundry = {
  abstract: { DataModel: DummyDataModel },
  data: { fields: { ArrayField: DummyField, BooleanField: DummyField, NumberField: DummyField, SchemaField: DummyField, StringField: DummyField } },
  utils: { deepClone: (value) => structuredClone(value), randomID: () => `RID${nextEntity++}` }
};
globalThis.CONST = { USER_ROLES: { ASSISTANT: 3 }, DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0, OBSERVER: 2, OWNER: 3 } };
globalThis.Hooks = { callAll() {} };

const docs = new Map();
const users = new Map([
  ["GM", { id: "GM", uuid: "User.GM", name: "Primary GM", isGM: true, active: true }],
  ["P1", { id: "P1", uuid: "User.P1", name: "Assistant", role: 3, isGM: false, active: true }],
  ["P2", { id: "P2", uuid: "User.P2", name: "Visitor", isGM: false, active: true }]
]);
users.get = Map.prototype.get.bind(users);
users.activeGM = users.get("GM");
users.contents = [...users.values()];

let operationLedger = { version: 1, receipts: [] };
const resourceCatalog = {
  version: 1,
  resources: [
    { id: "metal", name: "Metal", precision: 0, allowNegative: false, unit: "u" },
    { id: "fuel", name: "Combustível", precision: 0, allowNegative: false, unit: "u" }
  ]
};
const dataFolder = { id: "F_DATA", type: "JournalEntry", getFlag: () => true };
const folders = {
  get(id) { return id === dataFolder.id ? dataFolder : null; },
  find(fn) { return fn(dataFolder) ? dataFolder : null; }
};

globalThis.game = {
  user: users.get("GM"), users, journal: [], folders,
  settings: {
    get(_moduleId, key) {
      if (key === "dataFolderId") return dataFolder.id;
      if (key === "operationLedger") return structuredClone(operationLedger);
      if (key === "resourceCatalog") return structuredClone(resourceCatalog);
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

function domainDocument({ stocks = [{ resourceId: "metal", amount: 100 }, { resourceId: "fuel", amount: 30 }] } = {}) {
  return makeDocument({
    id: "D1",
    name: "Base Aurelia",
    recordType: "domain",
    ownership: { default: 0, P1: 2 },
    data: {
      entityId: "domain:D1",
      description: "",
      management: { preset: "base", capabilities: { projects: true, structures: true, economy: true } },
      governance: { controllers: ["P1"] },
      identity: { tags: [] },
      economy: { stocks, flows: [], sustenanceSettings: { enabled: false } },
      population: { groups: [], notables: [] },
      conditions: [], relations: [], agreements: [], intel: [], history: [], notifications: []
    }
  });
}

function projectDocument({ completed = 0, status = "active", costs = [] } = {}) {
  return makeDocument({
    id: "PR1",
    name: "Fortificar perímetro",
    recordType: "project",
    ownership: { default: 0, P1: 2 },
    data: {
      entityId: "project:PR1",
      domainUuid: "JournalEntry.D1",
      originRequestUuid: null,
      description: "Reforço estrutural.",
      status,
      blockedReason: "",
      work: { required: 100, completed, rateAmount: 10, periodTicks: 1, carry: 0 },
      costs
    }
  });
}

function structureDocument(project) {
  return makeDocument({
    id: "ST1",
    name: "Bastião Norte",
    recordType: "structure",
    ownership: { default: 0, P1: 2 },
    data: {
      entityId: "structure:ST1",
      domain: { recordType: "domain", uuid: "JournalEntry.D1", entityId: "domain:D1" },
      activeProject: { recordType: "project", uuid: project.uuid, entityId: "project:PR1" },
      description: "",
      category: "defense",
      tier: 1,
      maxTier: 3,
      status: "planned",
      condition: 100,
      capacity: 0,
      maintenancePriority: 50,
      workforceRequired: 0,
      maintenance: [], production: [], tags: []
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

function ref(document, recordType, entityId) {
  return { recordType, uuid: document.uuid, entityId };
}

function command(commandType, operationId, payload, callerUserId = "P1") {
  return dispatchAuthoritativeCommand({ commandType, operationId, callerUserId, payload });
}

test("controller cria Project ativo pelo Command Kernel e reserva custo sem consumir estoque", async () => {
  const domain = domainDocument();
  resetWorld(domain);
  const result = await command("project.create", "project-create-1", {
    domain: ref(domain, "domain", "domain:D1"),
    name: "Expansão da doca",
    description: "Nova ala logística.",
    status: "active",
    workRequired: 120,
    rateAmount: 12,
    periodTicks: 2,
    costs: [{ resourceId: "metal", mode: "reserved", amount: 60 }]
  });

  assert.equal(result.status, "active");
  assert.equal(result.workRequired, 120);
  assert.equal(game.journal.length, 2);
  const project = game.journal.find((entry) => entry.getFlag("domain-manager", "recordType") === "project");
  assert.equal(project.ownership.P1, 2);
  assert.equal(domain.getFlag("domain-manager", "data").economy.stocks[0].amount, 100);
});

test("Project ativo rejeita reserva superior ao estoque disponível", async () => {
  const domain = domainDocument({ stocks: [{ resourceId: "metal", amount: 20 }] });
  resetWorld(domain);
  await assert.rejects(() => command("project.create", "project-create-shortage", {
    domain: ref(domain, "domain", "domain:D1"),
    name: "Projeto impossível",
    status: "active",
    workRequired: 10,
    rateAmount: 1,
    periodTicks: 1,
    costs: [{ resourceId: "metal", mode: "reserved", amount: 50 }]
  }), /Reserva insuficiente/);
  assert.equal(game.journal.length, 1);
});

test("Project não pode ser concluído manualmente por project.update", async () => {
  const domain = domainDocument();
  const project = projectDocument();
  resetWorld(domain, project);
  await assert.rejects(() => command("project.update", "project-complete-manual", {
    domain: ref(domain, "domain", "domain:D1"),
    project: ref(project, "project", "project:PR1"),
    name: project.name,
    description: "",
    status: "completed",
    blockedReason: "",
    workRequired: 100,
    rateAmount: 10,
    periodTicks: 1
  }), /não pode ser definido manualmente|Status de Project/);
  assert.equal(project.getFlag("domain-manager", "data").status, "active");
});

test("plano de custos congela depois que o Project inicia progresso", async () => {
  const domain = domainDocument();
  const project = projectDocument({ completed: 10 });
  resetWorld(domain, project);
  await assert.rejects(() => command("project.cost-upsert", "project-cost-after-progress", {
    domain: ref(domain, "domain", "domain:D1"),
    project: ref(project, "project", "project:PR1"),
    cost: { resourceId: "fuel", mode: "progressive", amount: 5 }
  }), /Plano de custos não pode ser alterado/);
  assert.equal(project.getFlag("domain-manager", "data").costs.length, 0);
});

test("cancelamento de Project vinculado a Structure planned é bloqueado para não criar órfão", async () => {
  const domain = domainDocument();
  const project = projectDocument();
  const structure = structureDocument(project);
  resetWorld(domain, project, structure);
  await assert.rejects(() => command("project.update", "project-cancel-linked", {
    domain: ref(domain, "domain", "domain:D1"),
    project: ref(project, "project", "project:PR1"),
    name: project.name,
    description: project.getFlag("domain-manager", "data").description,
    status: "cancelled",
    blockedReason: "",
    workRequired: 100,
    rateAmount: 10,
    periodTicks: 1
  }), /Structure planned/);
  assert.equal(project.getFlag("domain-manager", "data").status, "active");
  assert.notEqual(structure.getFlag("domain-manager", "data").activeProject, null);
});

test("controller atualiza Project pelo Command Kernel sem tocar no progresso acumulado", async () => {
  const domain = domainDocument();
  const project = projectDocument({ status: "planned" });
  resetWorld(domain, project);
  const result = await command("project.update", "project-update-positive", {
    domain: ref(domain, "domain", "domain:D1"),
    project: ref(project, "project", "project:PR1"),
    name: "Fortificar perímetro revisado",
    description: "Prioridade elevada.",
    status: "active",
    blockedReason: "",
    workRequired: 100,
    rateAmount: 20,
    periodTicks: 2
  });
  assert.equal(result.status, "active");
  assert.equal(result.workCompleted, 0);
  assert.equal(result.rateAmount, 20);
  assert.equal(result.periodTicks, 2);
  assert.equal(project.name, "Fortificar perímetro revisado");
  assert.equal(project.getFlag("domain-manager", "data").work.completed, 0);
});

test("custo de Project pode ser criado, editado e removido antes do primeiro progresso", async () => {
  const domain = domainDocument();
  const project = projectDocument({ status: "planned" });
  resetWorld(domain, project);
  const added = await command("project.cost-upsert", "project-cost-add", {
    domain: ref(domain, "domain", "domain:D1"),
    project: ref(project, "project", "project:PR1"),
    cost: { resourceId: "fuel", mode: "progressive", amount: 5 }
  });
  assert.equal(added.costs.length, 1);
  const localId = added.costs[0].localId;
  assert.ok(localId);
  assert.equal(added.costs[0].amount, 5);

  const edited = await command("project.cost-upsert", "project-cost-edit", {
    domain: ref(domain, "domain", "domain:D1"),
    project: ref(project, "project", "project:PR1"),
    cost: { localId, resourceId: "fuel", mode: "progressive", amount: 8 }
  });
  assert.equal(edited.costs.length, 1);
  assert.equal(edited.costs[0].localId, localId);
  assert.equal(edited.costs[0].amount, 8);

  const removed = await command("project.cost-remove", "project-cost-remove", {
    domain: ref(domain, "domain", "domain:D1"),
    project: ref(project, "project", "project:PR1"),
    localId
  });
  assert.deepEqual(removed.costs, []);
});

test("usuário que não é Mestre nem Assistente não altera Project", async () => {
  const domain = domainDocument();
  const project = projectDocument({ status: "planned" });
  resetWorld(domain, project);
  await assert.rejects(() => command("project.update", "project-update-visitor", {
    domain: ref(domain, "domain", "domain:D1"),
    project: ref(project, "project", "project:PR1"),
    name: project.name,
    description: "Tentativa indevida.",
    status: "active",
    blockedReason: "",
    workRequired: 100,
    rateAmount: 10,
    periodTicks: 1
  }, "P2"), /Mestre ou Assistente/);
  assert.equal(project.getFlag("domain-manager", "data").status, "planned");
});

test("Project bloqueado exige razão explícita", async () => {
  const domain = domainDocument();
  const project = projectDocument({ status: "active" });
  resetWorld(domain, project);
  await assert.rejects(() => command("project.update", "project-block-no-reason", {
    domain: ref(domain, "domain", "domain:D1"),
    project: ref(project, "project", "project:PR1"),
    name: project.name,
    description: project.getFlag("domain-manager", "data").description,
    status: "blocked",
    blockedReason: "",
    workRequired: 100,
    rateAmount: 10,
    periodTicks: 1
  }), /exige motivo/);
});

test("retry idempotente de project.create não duplica o registro", async () => {
  const domain = domainDocument();
  resetWorld(domain);
  const payload = {
    domain: ref(domain, "domain", "domain:D1"),
    name: "Projeto idempotente",
    status: "planned",
    workRequired: 50,
    rateAmount: 5,
    periodTicks: 1,
    costs: []
  };
  const first = await command("project.create", "project-create-idempotent", payload);
  const second = await command("project.create", "project-create-idempotent", payload);
  assert.equal(first.uuid, second.uuid);
  assert.equal(second.duplicate, true);
  assert.equal(game.journal.filter((entry) => entry.getFlag("domain-manager", "recordType") === "project").length, 1);
});

test("Project commands preservam expectedModifiedTime do contrato legado", async () => {
  const domain = domainDocument();
  const project = projectDocument({ status: "planned" });
  project._stats = { modifiedTime: 200 };
  resetWorld(domain, project);

  await assert.rejects(() => command("project.update", "project-stale-update", {
    domain: ref(domain, "domain", "domain:D1"),
    project: ref(project, "project", "project:PR1"),
    expectedModifiedTime: 199,
    name: project.name,
    description: "stale",
    status: "active",
    blockedReason: "",
    workRequired: 100,
    rateAmount: 10,
    periodTicks: 1
  }), /mudou enquanto o formulário/i);

  await assert.rejects(() => command("project.cost-upsert", "project-stale-cost", {
    domain: ref(domain, "domain", "domain:D1"),
    project: ref(project, "project", "project:PR1"),
    expectedModifiedTime: 199,
    cost: { resourceId: "fuel", mode: "progressive", amount: 5 }
  }), /mudou enquanto o formulário/i);
});

test("Project com progresso não pode regredir para planned", async () => {
  const domain = domainDocument();
  const project = projectDocument({ status: "active", completed: 20 });
  resetWorld(domain, project);

  await assert.rejects(() => command("project.update", "project-regress-planned", {
    domain: ref(domain, "domain", "domain:D1"),
    project: ref(project, "project", "project:PR1"),
    name: project.name,
    description: "Tentativa de regressão",
    status: "planned",
    blockedReason: "",
    workRequired: 100,
    rateAmount: 10,
    periodTicks: 1
  }), /não pode voltar ao estado planned/i);

  assert.equal(project.getFlag("domain-manager", "data").status, "active");
});

test("APIs legadas de Project delegam ao kernel e podem excluir Project sem Structure vinculada", async () => {
  const domain = domainDocument();
  const project = projectDocument({ status: "planned" });
  resetWorld(domain, project);
  const actions = await import("../scripts/features/projects/actions.js");

  const created = await actions.createProjectAction({
    domainUuid: domain.uuid,
    name: "Projeto Wrapper",
    description: "Compatibilidade",
    status: "planned",
    workRequired: 20,
    rateAmount: 2,
    periodTicks: 1,
    operationId: "legacy-project-create"
  });
  assert.equal(created.recordType, "project");

  await actions.updateProjectAction({
    projectUuid: project.uuid,
    name: "Project Compat Atualizado",
    description: "Via kernel",
    status: "active",
    blockedReason: "",
    workRequired: 100,
    rateAmount: 10,
    periodTicks: 1,
    operationId: "legacy-project-update"
  });
  assert.equal(project.name, "Project Compat Atualizado");

  await assert.rejects(() => actions.createProjectAction({
    domainUuid: domain.uuid,
    name: "Provenance falsa",
    status: "planned",
    workRequired: 10,
    rateAmount: 1,
    periodTicks: 1,
    originRequestUuid: "JournalEntry.R1",
    operationId: "legacy-project-origin"
  }), /bridge canônico|provenance/i);

  await actions.deleteProjectAction({ projectUuid: project.uuid, operationId: "legacy-project-delete" });
  assert.equal(game.journal.includes(project), false, "Project deve ser removido fisicamente");
});

test("updateProjectAction preserva patch parcial, campos sistêmicos e retry idempotente", async () => {
  const domain = domainDocument();
  const project = projectDocument({ status: "planned" });
  project.flags["domain-manager"].data.presentation = { accent: "amber", pinned: true };
  resetWorld(domain, project);
  const actions = await import("../scripts/features/projects/actions.js");

  const patch = {
    projectUuid: project.uuid,
    changes: {
      data: { description: "Somente este campo mudou." },
      work: { rateAmount: 17 }
    },
    operationId: "legacy-project-partial"
  };

  await actions.updateProjectAction(patch);
  await actions.updateProjectAction(patch);

  const stored = project.getFlag("domain-manager", "data");
  assert.equal(project.name, "Fortificar perímetro");
  assert.equal(stored.description, "Somente este campo mudou.");
  assert.equal(stored.status, "planned");
  assert.deepEqual(stored.work, { required: 100, completed: 0, rateAmount: 17, periodTicks: 1, carry: 0 });
  assert.deepEqual(stored.presentation, { accent: "amber", pinned: true });
  assert.equal(operationLedger.receipts.length, 1, "retry com o mesmo operationId não deve gravar duas vezes");
});

test("wrappers legados preservam defaults canônicos e semântica decimal dos custos", async (t) => {
  const domain = domainDocument();
  resetWorld(domain);
  const actions = await import("../scripts/features/projects/actions.js");
  const fuel = resourceCatalog.resources.find((entry) => entry.id === "fuel");
  const originalPrecision = fuel.precision;
  fuel.precision = 2;
  t.after(() => { fuel.precision = originalPrecision; });

  const created = await actions.createProjectAction({
    domainUuid: domain.uuid,
    name: "Projeto com defaults",
    operationId: "legacy-project-defaults"
  });
  assert.deepEqual(created.data.work, { required: 100, completed: 0, rateAmount: 10, periodTicks: 1, carry: 0 });
  recordIndex.rebuild();

  await actions.upsertProjectCostAction({
    projectUuid: created.uuid,
    resourceId: "fuel",
    mode: "progressive",
    displayAmount: "5,25",
    operationId: "legacy-project-cost-add"
  });
  await actions.upsertProjectCostAction({
    projectUuid: created.uuid,
    resourceId: "fuel",
    mode: "progressive",
    displayAmount: "5,25",
    operationId: "legacy-project-cost-add"
  });

  let stored = docs.get(created.uuid).getFlag("domain-manager", "data");
  assert.equal(stored.costs.length, 1);
  assert.equal(stored.costs[0].amount, 525);

  const localId = stored.costs[0].localId;
  await actions.removeProjectCostAction({
    projectUuid: created.uuid,
    localId,
    operationId: "legacy-project-cost-remove"
  });
  await actions.removeProjectCostAction({
    projectUuid: created.uuid,
    localId,
    operationId: "legacy-project-cost-remove"
  });
  stored = docs.get(created.uuid).getFlag("domain-manager", "data");
  assert.deepEqual(stored.costs, []);
});

test("updateProjectAction encaminha revisão obsoleta e não aplica patch", async () => {
  const domain = domainDocument();
  const project = projectDocument({ status: "planned" });
  project._stats = { modifiedTime: 700 };
  resetWorld(domain, project);
  const actions = await import("../scripts/features/projects/actions.js");

  await assert.rejects(() => actions.updateProjectAction({
    projectUuid: project.uuid,
    expectedModifiedTime: 699,
    changes: { description: "Patch obsoleto" },
    operationId: "legacy-project-stale-patch"
  }), /mudou enquanto o formulário/i);

  assert.equal(project.getFlag("domain-manager", "data").description, "Reforço estrutural.");
});

test("wrapper de Project chamado por controller usa a autoridade remota", async () => {
  const domain = domainDocument();
  const project = projectDocument({ status: "planned" });
  resetWorld(domain, project);

  const handlers = new Map();
  const remoteCalls = [];
  game.modules = new Map([["domain-manager", { version: "test", socket: true }]]);
  globalThis.socketlib = {
    registerModule() {
      return {
        register(name, handler) { handlers.set(name, handler); },
        async executeAsGM(name, envelope) {
          remoteCalls.push({ name, envelope: structuredClone(envelope), callerUserId: game.user.id });
          const caller = game.user;
          game.user = users.get("GM");
          try {
            return await handlers.get(name).call({ socketdata: { userId: caller.id } }, envelope);
          } finally {
            game.user = caller;
          }
        }
      };
    }
  };

  const { registerAuthoritySocket } = await import("../scripts/authority/socket.js");
  registerAuthoritySocket();
  const actions = await import("../scripts/features/projects/actions.js");
  game.user = users.get("P1");

  await actions.updateProjectAction({
    projectUuid: project.uuid,
    changes: { description: "Executado no GM primário" },
    operationId: "legacy-project-remote"
  });

  assert.equal(remoteCalls.length, 1);
  assert.equal(remoteCalls[0].name, "command.execute");
  assert.equal(remoteCalls[0].callerUserId, "P1");
  assert.equal(remoteCalls[0].envelope.commandType, "project.update");
  assert.equal(project.getFlag("domain-manager", "data").description, "Executado no GM primário");
  assert.equal(operationLedger.receipts[0].callerUserId, "P1");
});
