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
  utils: {
    deepClone: (value) => structuredClone(value),
    randomID: (() => { let id = 0; return () => `RID${++id}`; })()
  }
};
globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0, OBSERVER: 2, OWNER: 3 } };
const emittedHooks = [];
globalThis.Hooks = { callAll(name, payload) { emittedHooks.push({ name, payload }); } };

const gm = { id: "GM", name: "Primary GM", isGM: true, active: true };
const users = new Map([[gm.id, gm]]);
users.activeGM = gm;
users.contents = [gm];

const catalog = {
  version: 1,
  resources: [{ id: "metal", name: "Metal", unit: "u", precision: 0, allowNegative: false }]
};
const dataFolder = { id: "DATA", type: "JournalEntry", getFlag: () => true };
const folders = {
  get(id) { return id === dataFolder.id ? dataFolder : null; },
  find(fn) { return fn(dataFolder) ? dataFolder : null; }
};

globalThis.game = {
  user: gm,
  users,
  journal: [],
  folders,
  modules: new Map(),
  settings: {
    get(_moduleId, key) {
      if (key === "dataFolderId") return dataFolder.id;
      if (key === "resourceCatalog") return structuredClone(catalog);
      if (key === "syncTimekeeping") return false;
      if (key === "secondsPerTick") return 86400;
      return null;
    },
    async set(_moduleId, _key, value) { return value; }
  }
};
globalThis.Folder = { async create() { throw new Error("data folder should exist"); } };

const documents = new Map();
globalThis.fromUuid = async (uuid) => documents.get(uuid) ?? null;

function setPath(target, path, value) {
  const parts = path.split(".");
  let cursor = target;
  for (const part of parts.slice(0, -1)) {
    cursor[part] ??= {};
    cursor = cursor[part];
  }
  cursor[parts.at(-1)] = structuredClone(value);
}

function makeDocument({ id, name, recordType, data }) {
  const document = {
    id,
    uuid: `JournalEntry.${id}`,
    documentName: "JournalEntry",
    name,
    ownership: { default: 0 },
    flags: { "domain-manager": { recordType, schemaVersion: 9, data: structuredClone(data) } },
    getFlag(moduleId, key) { return this.flags[moduleId]?.[key]; },
    testUserPermission(actor) { return actor?.isGM === true; },
    async update(changes) {
      for (const [key, value] of Object.entries(changes)) {
        if (key === "name") this.name = value;
        else setPath(this, key, value);
      }
      return this;
    }
  };
  documents.set(document.uuid, document);
  return document;
}

globalThis.JournalEntry = {
  async updateDocuments(updates) {
    const result = [];
    for (const update of updates) {
      const document = [...documents.values()].find((entry) => entry.id === update._id);
      assert.ok(document, `document ${update._id} must exist`);
      const changes = { ...update };
      delete changes._id;
      await document.update(changes);
      result.push(document);
    }
    return result;
  }
};

const { recordIndex } = await import("../scripts/data/record-index.js");
const { executeAdvanceRun } = await import("../scripts/simulation/advance-run.js");

function buildWorld({ projectCompleted = 90 } = {}) {
  documents.clear();
  emittedHooks.length = 0;

  const domain = makeDocument({
    id: "D1",
    name: "Base Aurelia",
    recordType: "domain",
    data: {
      entityId: "domain:D1",
      description: "",
      management: { preset: "base", capabilities: { structures: true, projects: true, economy: true } },
      governance: { controllers: [] },
      identity: { tags: [] },
      economy: { stocks: [{ resourceId: "metal", amount: 50 }], flows: [], sustenanceSettings: { enabled: false } },
      population: { total: 0, countMode: "direct", groups: [], notables: [] },
      security: { guardCount: 0 },
      conditions: [], relations: [], agreements: [], intel: [], history: [], notifications: []
    }
  });

  const project = makeDocument({
    id: "P1",
    name: "Construção // Reator Helios",
    recordType: "project",
    data: {
      entityId: "project:P1",
      domainUuid: domain.uuid,
      originRequestUuid: null,
      description: "",
      status: "active",
      blockedReason: "",
      work: { required: 100, completed: projectCompleted, rateAmount: 10, periodTicks: 1, carry: 0 },
      costs: [{ localId: "cost-metal", resourceId: "metal", mode: "reserved", amount: 20, consumedAmount: 0 }]
    }
  });

  const structure = makeDocument({
    id: "S1",
    name: "Reator Helios",
    recordType: "structure",
    data: {
      entityId: "structure:S1",
      domain: { recordType: "domain", uuid: domain.uuid, entityId: "domain:D1" },
      activeProject: { recordType: "project", uuid: project.uuid, entityId: "project:P1" },
      description: "Power core",
      category: "power",
      tier: 1,
      maxTier: 3,
      status: "planned",
      condition: 100,
      capacity: 100,
      maintenance: [],
      production: [{ resourceId: "metal", amount: 5 }],
      tags: ["critical"]
    }
  });

  game.journal = [domain, project, structure];
  recordIndex.rebuild();
  return { domain, project, structure };
}

test("Project concluído comissiona Structure no mesmo advance batch", async () => {
  const { domain, project, structure } = buildWorld();

  const result = await executeAdvanceRun({ deltaTicks: 1, fromWorldTimeHook: true });

  const domainData = domain.getFlag("domain-manager", "data");
  const projectData = project.getFlag("domain-manager", "data");
  const structureData = structure.getFlag("domain-manager", "data");

  assert.equal(result.success, true);
  assert.deepEqual(result.updatedStructures, [structure.uuid]);
  assert.equal(domainData.economy.stocks.find((entry) => entry.resourceId === "metal").amount, 30,
    "reserved construction cost must settle when Project completes");
  assert.equal(projectData.status, "completed");
  assert.equal(projectData.work.completed, 100);
  assert.equal(projectData.costs[0].consumedAmount, 20);
  assert.equal(structureData.status, "operational");
  assert.equal(structureData.activeProject, null);
  assert.ok(domainData.history.some((entry) => entry.category === "structure" && entry.title.includes("Reator Helios")));
  assert.ok(domainData.notifications.some((entry) => entry.category === "structure" && entry.title.includes("Reator Helios")));
  assert.ok(emittedHooks.some((entry) => entry.name === "domain-manager.advanceRun" && entry.payload.updatedStructures.includes(structure.uuid)));
});

test("Structure permanece planned quando Project ainda não conclui", async () => {
  const { project, structure } = buildWorld({ projectCompleted: 70 });

  const result = await executeAdvanceRun({ deltaTicks: 1, fromWorldTimeHook: true });

  const projectData = project.getFlag("domain-manager", "data");
  const structureData = structure.getFlag("domain-manager", "data");
  assert.equal(projectData.status, "active");
  assert.equal(projectData.work.completed, 80);
  assert.equal(structureData.status, "planned");
  assert.notEqual(structureData.activeProject, null);
  assert.deepEqual(result.updatedStructures, []);
});


test("Structure comissionada no primeiro tick produz nos ticks seguintes do mesmo advance", async () => {
  const { domain, project, structure } = buildWorld();
  const result = await executeAdvanceRun({ deltaTicks: 3, fromWorldTimeHook: true });

  const domainData = domain.getFlag("domain-manager", "data");
  const projectData = project.getFlag("domain-manager", "data");
  const structureData = structure.getFlag("domain-manager", "data");
  const metal = domainData.economy.stocks.find((entry) => entry.resourceId === "metal");
  const structureReport = result.report.domains[0].structures.find((entry) => entry.entityId === "structure:S1");

  assert.equal(projectData.status, "completed");
  assert.equal(structureData.status, "operational");
  assert.equal(structureData.activeProject, null);
  assert.equal(metal.amount, 40, "50 - 20 de custo + 5 nos ticks 2 e 3");
  assert.equal(structureReport.production.find((entry) => entry.resourceId === "metal").delta, 10);
  assert.equal(structureReport.commissioned, true);
});
