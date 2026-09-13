import test from "node:test";
import assert from "node:assert/strict";

class DummyField {}
let nextEntity = 1;
class DummyDataModel {
  constructor(data = {}) {
    this.data = structuredClone(data);
    const type = this.constructor.name.replace("Model", "").toLowerCase();
    if (!this.data.entityId && ["mission", "squad", "domain"].includes(type)) {
      this.data.entityId = `${type}:TEST${nextEntity++}`;
    }
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
  ["P1", { id: "P1", uuid: "User.P1", name: "Operator One", isGM: false, active: true }],
  ["P2", { id: "P2", uuid: "User.P2", name: "Operator Two", isGM: false, active: true }]
]);
users.get = Map.prototype.get.bind(users);
users.activeGM = users.get("GM");
users.contents = [...users.values()];

let operationLedger = { version: 1, receipts: [] };
const resourceCatalog = {
  version: 1,
  resources: [
    { id: "ammo", name: "Munição", precision: 0 },
    { id: "med", name: "Suprimento Médico", precision: 0 }
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
  time: { worldTime: 4200 },
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
    _stats: { modifiedTime: 100 },
    flags: { "domain-manager": { recordType, schemaVersion: 9, data: structuredClone(data) } },
    getFlag(moduleId, key) { return this.flags[moduleId]?.[key]; },
    async update(changes) {
      for (const [key, value] of Object.entries(changes)) {
        if (key === "name") this.name = value;
        else if (key === "ownership") this.ownership = structuredClone(value);
        else applyPath(this, key, value);
      }
      this._stats.modifiedTime += 1;
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
      assert.ok(doc, `document ${update._id} not found`);
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

function domainDocument() {
  return makeDocument({
    id: "D1",
    name: "Base Aurelia",
    recordType: "domain",
    data: {
      entityId: "domain:D1",
      description: "",
      management: { preset: "base", capabilities: { missions: true, squads: true } },
      governance: { controllers: [] },
      identity: { tags: [] },
      economy: { stocks: [], flows: [] },
      population: { groups: [], notables: [] },
      conditions: [], relations: [], agreements: [], intel: [], history: [], notifications: []
    }
  });
}

function squadDocument({ id = "S1", entityId = "squad:S1", controllers = ["P1"] } = {}) {
  return makeDocument({
    id,
    name: id === "S1" ? "Raven" : "Wolf",
    recordType: "squad",
    ownership: { default: 0, [controllers[0]]: 2 },
    data: {
      entityId,
      description: "Recon",
      parentDomain: { recordType: "domain", uuid: "JournalEntry.D1", entityId: "domain:D1" },
      governance: { controllers },
      status: "ready",
      capacity: 20,
      strength: 20,
      morale: 60,
      condition: 100,
      composition: [],
      resources: [{ resourceId: "ammo", amount: 120 }, { resourceId: "med", amount: 8 }],
      equipment: [], notablePeople: [], currentMission: null, tags: []
    }
  });
}

function missionDocument({ status = "available", assignments = [], audience = ["P1"] } = {}) {
  return makeDocument({
    id: "M1",
    name: "Operação Farol",
    recordType: "mission",
    ownership: { default: 0, P1: 2 },
    data: {
      entityId: "mission:M1",
      primaryDomainUuid: "JournalEntry.D1",
      relatedDomainUuids: [],
      origin: { kind: "manual", uuid: null },
      status,
      briefing: "Reconhecer instalação",
      audienceUserIds: audience,
      objectives: [{ localId: "o1", title: "Localizar alvo", description: "", status: "pending", optional: false }],
      assignments,
      startedAtWorldTime: status === "active" ? 4000 : null,
      resolvedAtWorldTime: null,
      outcomeSummary: ""
    }
  });
}

function resetWorld(...documents) {
  docs.clear();
  for (const document of documents) docs.set(document.uuid, document);
  game.journal = documents;
  game.user = users.get("GM");
  game.time.worldTime = 4200;
  operationLedger = { version: 1, receipts: [] };
  recordIndex.rebuild();
}

function ref(document, recordType, entityId) {
  return { recordType, uuid: document.uuid, entityId };
}

test("GM cria Mission no Domain e audiência recebe ownership OBSERVER", async () => {
  const domain = domainDocument();
  resetWorld(domain);

  const result = await dispatchAuthoritativeCommand({
    commandType: "mission.create",
    operationId: "mission-create-1",
    payload: {
      name: "Operação Eclipse",
      primaryDomain: ref(domain, "domain", "domain:D1"),
      audienceUserIds: ["P1"],
      status: "available",
      briefing: "Identificar sinal",
      objectives: [{ title: "Encontrar transmissor" }]
    }
  }, { callerUserId: "GM" });

  const created = game.journal.find((entry) => entry.uuid === result.uuid);
  assert.ok(created);
  assert.equal(created.ownership.P1, 2);
  assert.equal(created.getFlag("domain-manager", "data").status, "available");
  assert.equal(created.getFlag("domain-manager", "data").assignments.length, 0);
});

test("jogador prepara Squad, lançamento consome recursos uma vez e resolução aplica consequências", async () => {
  const domain = domainDocument();
  const squad = squadDocument();
  const mission = missionDocument();
  resetWorld(domain, squad, mission);

  const prep = await dispatchAuthoritativeCommand({
    commandType: "mission.prepare",
    operationId: "mission-prepare-1",
    payload: {
      mission: ref(mission, "mission", "mission:M1"),
      squad: ref(squad, "squad", "squad:S1"),
      committedStrength: 12,
      resources: [{ resourceId: "ammo", amount: 40 }, { resourceId: "med", amount: 2 }]
    }
  }, { callerUserId: "P1" });

  assert.equal(prep.committedStrength, 12);
  assert.equal(mission.getFlag("domain-manager", "data").assignments.length, 1);
  assert.equal(squad.getFlag("domain-manager", "data").currentMission.entityId, "mission:M1");
  assert.equal(squad.getFlag("domain-manager", "data").resources.find((x) => x.resourceId === "ammo").amount, 120, "preparar reserva, mas não consome");

  const launchCommand = {
    commandType: "mission.launch",
    operationId: "mission-launch-1",
    payload: {
      mission: ref(mission, "mission", "mission:M1"),
      squads: [ref(squad, "squad", "squad:S1")]
    }
  };
  const firstLaunch = await dispatchAuthoritativeCommand(launchCommand, { callerUserId: "GM" });
  const secondLaunch = await dispatchAuthoritativeCommand(launchCommand, { callerUserId: "GM" });

  assert.equal(firstLaunch.duplicate, false);
  assert.equal(secondLaunch.duplicate, true);
  assert.equal(mission.getFlag("domain-manager", "data").status, "active");
  assert.equal(squad.getFlag("domain-manager", "data").status, "deployed");
  assert.equal(squad.getFlag("domain-manager", "data").resources.find((x) => x.resourceId === "ammo").amount, 80);
  assert.equal(squad.getFlag("domain-manager", "data").resources.find((x) => x.resourceId === "med").amount, 6);

  game.time.worldTime = 9000;
  await dispatchAuthoritativeCommand({
    commandType: "mission.resolve",
    operationId: "mission-resolve-1",
    payload: {
      mission: ref(mission, "mission", "mission:M1"),
      status: "resolved",
      outcomeSummary: "Transmissor neutralizado",
      results: [{
        squad: ref(squad, "squad", "squad:S1"),
        casualties: 3,
        moraleDelta: 8,
        conditionDelta: -15,
        notes: "Resistência moderada"
      }],
      objectiveResults: [{ localId: "o1", status: "completed" }]
    }
  }, { callerUserId: "GM" });

  const missionData = mission.getFlag("domain-manager", "data");
  const squadData = squad.getFlag("domain-manager", "data");
  assert.equal(missionData.status, "resolved");
  assert.equal(missionData.resolvedAtWorldTime, 9000);
  assert.equal(missionData.objectives[0].status, "completed");
  assert.equal(missionData.assignments[0].state, "returned");
  assert.equal(missionData.assignments[0].result.casualties, 3);
  assert.equal(squadData.strength, 17);
  assert.equal(squadData.morale, 68);
  assert.equal(squadData.condition, 85);
  assert.equal(squadData.status, "recovering");
  assert.equal(squadData.currentMission, null);
});

test("jogador sem audiência/controle é rejeitado e release desfaz compromisso antes do lançamento", async () => {
  const domain = domainDocument();
  const squad = squadDocument();
  const mission = missionDocument();
  resetWorld(domain, squad, mission);

  await assert.rejects(() => dispatchAuthoritativeCommand({
    commandType: "mission.prepare",
    operationId: "mission-prepare-denied",
    payload: {
      mission: ref(mission, "mission", "mission:M1"),
      squad: ref(squad, "squad", "squad:S1"),
      committedStrength: 5,
      resources: []
    }
  }, { callerUserId: "P2" }), /audiência|controla/i);

  await dispatchAuthoritativeCommand({
    commandType: "mission.prepare",
    operationId: "mission-prepare-ok",
    payload: {
      mission: ref(mission, "mission", "mission:M1"),
      squad: ref(squad, "squad", "squad:S1"),
      committedStrength: 5,
      resources: []
    }
  }, { callerUserId: "P1" });

  await dispatchAuthoritativeCommand({
    commandType: "mission.release",
    operationId: "mission-release-1",
    payload: {
      mission: ref(mission, "mission", "mission:M1"),
      squad: ref(squad, "squad", "squad:S1")
    }
  }, { callerUserId: "P1" });

  assert.equal(mission.getFlag("domain-manager", "data").assignments.length, 0);
  assert.equal(squad.getFlag("domain-manager", "data").currentMission, null);
});

test("Mission rejeita referência UUID/entityId inconsistente", async () => {
  const domain = domainDocument();
  const squad = squadDocument();
  const mission = missionDocument();
  const other = squadDocument({ id: "S2", entityId: "squad:S2", controllers: ["P1"] });
  resetWorld(domain, squad, mission, other);

  await assert.rejects(() => dispatchAuthoritativeCommand({
    commandType: "mission.prepare",
    operationId: "mission-ref-conflict",
    payload: {
      mission: ref(mission, "mission", "mission:M1"),
      squad: { recordType: "squad", uuid: squad.uuid, entityId: "squad:S2" },
      committedStrength: 5,
      resources: []
    }
  }, { callerUserId: "P1" }), /entidades diferentes/i);
});

test("mission.update edita metadados sem permitir transição de lifecycle", async () => {
  const domain = domainDocument();
  const related = makeDocument({
    id: "D2",
    name: "Posto Boreal",
    recordType: "domain",
    data: {
      entityId: "domain:D2",
      description: "",
      management: { preset: "base", capabilities: { missions: true, squads: true } },
      governance: { controllers: [] },
      identity: { tags: [] },
      economy: { stocks: [], flows: [] },
      population: { groups: [], notables: [] },
      conditions: [], relations: [], agreements: [], intel: [], history: [], notifications: []
    }
  });
  const mission = missionDocument({ status: "available", audience: ["P1"] });
  resetWorld(domain, related, mission);

  const result = await dispatchAuthoritativeCommand({
    commandType: "mission.update",
    operationId: "mission-update-1",
    payload: {
      mission: ref(mission, "mission", "mission:M1"),
      expectedStatus: "available",
      name: "Operação Farol Revisada",
      primaryDomain: ref(domain, "domain", "domain:D1"),
      relatedDomains: [ref(related, "domain", "domain:D2")],
      audienceUserIds: ["P1", "P2"],
      briefing: "Novo briefing",
      outcomeSummary: "Pré-planejamento"
    }
  }, { callerUserId: "GM" });

  assert.equal(result.status, "available");
  assert.equal(mission.name, "Operação Farol Revisada");
  assert.deepEqual(mission.getFlag("domain-manager", "data").relatedDomainUuids, [related.uuid]);
  assert.deepEqual(mission.getFlag("domain-manager", "data").audienceUserIds, ["P1", "P2"]);
  assert.equal(mission.ownership.P2, 2);

  await assert.rejects(() => dispatchAuthoritativeCommand({
    commandType: "mission.update",
    operationId: "mission-update-status-bypass",
    payload: {
      mission: ref(mission, "mission", "mission:M1"),
      expectedStatus: "resolved",
      name: mission.name,
      primaryDomain: ref(domain, "domain", "domain:D1"),
      relatedDomains: [ref(related, "domain", "domain:D2")],
      audienceUserIds: ["P1", "P2"],
      briefing: "Tentativa inválida",
      outcomeSummary: ""
    }
  }, { callerUserId: "GM" }), /lifecycle|status/i);

  assert.equal(mission.getFlag("domain-manager", "data").status, "available");
});

test("mission.publish libera planejamento e mission.update substitui objetivos atomicamente", async () => {
  const domain = domainDocument();
  const mission = missionDocument({ status: "planned" });
  resetWorld(domain, mission);

  const updateRevision = mission._stats.modifiedTime;
  await dispatchAuthoritativeCommand({
    commandType: "mission.update",
    operationId: "mission-plan-editor-1",
    payload: {
      mission: ref(mission, "mission", "mission:M1"),
      expectedModifiedTime: updateRevision,
      expectedStatus: "planned",
      name: "Operação Farol II",
      primaryDomain: ref(domain, "domain", "domain:D1"),
      relatedDomains: [],
      audienceUserIds: ["P1"],
      briefing: "Planejamento revisado",
      outcomeSummary: "Nota interna",
      objectives: [{ localId: "o1", title: "Localizar alvo revisado" }, { title: "Extrair equipe" }]
    }
  }, { callerUserId: "GM" });

  const afterEdit = mission.getFlag("domain-manager", "data");
  assert.equal(afterEdit.objectives.length, 2);
  assert.equal(afterEdit.objectives[0].localId, "o1");
  assert.ok(afterEdit.objectives[1].localId);

  await dispatchAuthoritativeCommand({
    commandType: "mission.publish",
    operationId: "mission-publish-1",
    payload: {
      mission: ref(mission, "mission", "mission:M1"),
      expectedModifiedTime: mission._stats.modifiedTime
    }
  }, { callerUserId: "GM" });
  assert.equal(mission.getFlag("domain-manager", "data").status, "available");
});

test("Mission rejeita formulário obsoleto e snapshot incompleto de Squads no lançamento", async () => {
  const domain = domainDocument();
  const squad = squadDocument();
  const assignment = {
    localId: "a1",
    squad: ref(squad, "squad", "squad:S1"),
    committedStrength: 5,
    resources: [],
    state: "prepared",
    result: { casualties: 0, moraleDelta: 0, conditionDelta: 0, notes: "" }
  };
  const mission = missionDocument({ assignments: [assignment] });
  squad.getFlag("domain-manager", "data").currentMission = ref(mission, "mission", "mission:M1");
  resetWorld(domain, squad, mission);

  await assert.rejects(() => dispatchAuthoritativeCommand({
    commandType: "mission.launch",
    operationId: "mission-launch-stale",
    payload: {
      mission: ref(mission, "mission", "mission:M1"),
      expectedModifiedTime: mission._stats.modifiedTime - 1,
      squads: [ref(squad, "squad", "squad:S1")]
    }
  }, { callerUserId: "GM" }), /mudou enquanto/i);

  await assert.rejects(() => dispatchAuthoritativeCommand({
    commandType: "mission.launch",
    operationId: "mission-launch-missing-lock",
    payload: { mission: ref(mission, "mission", "mission:M1"), squads: [] }
  }, { callerUserId: "GM" }), /lista de Squads/i);
});

test("mission.update não muda topologia de Domain enquanto há Squad preparado", async () => {
  const domain = domainDocument();
  const related = makeDocument({
    id: "D2",
    name: "Posto Boreal",
    recordType: "domain",
    data: {
      entityId: "domain:D2",
      description: "",
      management: { preset: "base", capabilities: { missions: true } },
      governance: { controllers: [] }, identity: { tags: [] }, economy: { stocks: [], flows: [] },
      population: { groups: [], notables: [] }, conditions: [], relations: [], agreements: [], intel: [], history: [], notifications: []
    }
  });
  const squad = squadDocument();
  const assignment = {
    localId: "a1",
    squad: ref(squad, "squad", "squad:S1"),
    committedStrength: 5,
    resources: [],
    state: "prepared",
    result: { casualties: 0, moraleDelta: 0, conditionDelta: 0, notes: "" }
  };
  const mission = missionDocument({ assignments: [assignment] });
  resetWorld(domain, related, squad, mission);

  await assert.rejects(() => dispatchAuthoritativeCommand({
    commandType: "mission.update",
    operationId: "mission-update-domains-locked",
    payload: {
      mission: ref(mission, "mission", "mission:M1"),
      expectedStatus: "available",
      name: mission.name,
      primaryDomain: ref(domain, "domain", "domain:D1"),
      relatedDomains: [ref(related, "domain", "domain:D2")],
      audienceUserIds: ["P1"],
      briefing: "",
      outcomeSummary: ""
    }
  }, { callerUserId: "GM" }), /libere os Squads/i);
});

test("objetivos de Mission usam Command Kernel e retry idempotente não duplica", async () => {
  const domain = domainDocument();
  const mission = missionDocument();
  resetWorld(domain, mission);

  const command = {
    commandType: "mission.objective-upsert",
    operationId: "mission-objective-add-1",
    payload: {
      mission: ref(mission, "mission", "mission:M1"),
      title: "Extrair dados",
      description: "Recuperar o núcleo",
      status: "pending",
      optional: true
    }
  };
  const first = await dispatchAuthoritativeCommand(command, { callerUserId: "GM" });
  const second = await dispatchAuthoritativeCommand(command, { callerUserId: "GM" });
  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  const objectives = mission.getFlag("domain-manager", "data").objectives;
  assert.equal(objectives.length, 2);
  const added = objectives.find((entry) => entry.title === "Extrair dados");
  assert.ok(added?.localId);

  await dispatchAuthoritativeCommand({
    commandType: "mission.objective-remove",
    operationId: "mission-objective-remove-1",
    payload: { mission: ref(mission, "mission", "mission:M1"), localId: added.localId }
  }, { callerUserId: "GM" });
  assert.equal(mission.getFlag("domain-manager", "data").objectives.length, 1);
});

test("APIs legadas de Mission delegam ao kernel e bloqueiam origem derivada direta", async () => {
  const domain = domainDocument();
  const mission = missionDocument();
  resetWorld(domain, mission);
  const actions = await import("../scripts/features/missions/actions.js");

  const created = await actions.createMissionAction({
    name: "Operação Wrapper",
    primaryDomainUuid: domain.uuid,
    audienceUserIds: ["P1"],
    status: "available",
    briefing: "Via compatibilidade",
    operationId: "legacy-mission-create"
  });
  assert.equal(created.recordType, "mission");
  assert.equal(created.document.name, "Operação Wrapper");

  await actions.updateMissionAction({
    missionUuid: mission.uuid,
    name: "Operação Farol Compat",
    primaryDomainUuid: domain.uuid,
    relatedDomainUuids: [],
    audienceUserIds: ["P1"],
    status: "available",
    briefing: "Atualizado pelo wrapper",
    outcomeSummary: "",
    operationId: "legacy-mission-update"
  });
  assert.equal(mission.name, "Operação Farol Compat");
  assert.equal(mission.getFlag("domain-manager", "data").briefing, "Atualizado pelo wrapper");

  await assert.rejects(() => actions.createMissionAction({
    name: "Bypass de Request",
    primaryDomainUuid: domain.uuid,
    originKind: "request",
    originUuid: "JournalEntry.R1",
    operationId: "legacy-mission-derived"
  }), /bridge canônico|derivada/i);
});

test("mission.update e objective commands são GM-only", async () => {
  const domain = domainDocument();
  const mission = missionDocument();
  resetWorld(domain, mission);

  await assert.rejects(() => dispatchAuthoritativeCommand({
    commandType: "mission.update",
    operationId: "mission-update-player-denied",
    payload: {
      mission: ref(mission, "mission", "mission:M1"),
      expectedStatus: "available",
      name: mission.name,
      primaryDomain: ref(domain, "domain", "domain:D1"),
      relatedDomains: [],
      audienceUserIds: ["P1"],
      briefing: "Tentativa",
      outcomeSummary: ""
    }
  }, { callerUserId: "P1" }), /Somente GM/i);

  await assert.rejects(() => dispatchAuthoritativeCommand({
    commandType: "mission.objective-upsert",
    operationId: "mission-objective-player-denied",
    payload: {
      mission: ref(mission, "mission", "mission:M1"),
      title: "Objetivo clandestino"
    }
  }, { callerUserId: "P1" }), /Somente GM/i);
});
