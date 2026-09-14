import test from "node:test";
import assert from "node:assert/strict";

class DummyField {}
let nextEntity = 1;
class DummyDataModel {
  constructor(data = {}) {
    this.data = structuredClone(data);
    const typeByClass = { DomainModel: "domain", RequestModel: "request", MissionModel: "mission" };
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
globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0, OBSERVER: 2, OWNER: 3 } };
globalThis.Hooks = { callAll() {} };

const gm = { id: "GM", uuid: "User.GM", name: "GM", isGM: true, active: true };
const p1 = { id: "P1", uuid: "User.P1", name: "Commander One", isGM: false, active: true };
const p2 = { id: "P2", uuid: "User.P2", name: "Commander Two", isGM: false, active: true };
const users = new Map([[gm.id, gm], [p1.id, p1], [p2.id, p2]]);
users.get = Map.prototype.get.bind(users);
users.find = (fn) => [...users.values()].find(fn);
users.activeGM = gm;
users.contents = [...users.values()];

let operationLedger = { version: 1, receipts: [] };
let failNextLedgerWrite = false;
const docs = new Map();
const dataFolder = { id: "F_DATA", type: "JournalEntry", getFlag: () => true };
const folders = { get: (id) => id === "F_DATA" ? dataFolder : null, find: (fn) => fn(dataFolder) ? dataFolder : null };

globalThis.game = {
  user: gm,
  users,
  journal: [],
  folders,
  modules: new Map(),
  settings: {
    get(_moduleId, key) {
      if (key === "dataFolderId") return dataFolder.id;
      if (key === "operationLedger") return structuredClone(operationLedger);
      if (key === "resourceCatalog") return { version: 1, resources: [] };
      return null;
    },
    async set(_moduleId, key, value) {
      if (key === "operationLedger") {
        if (failNextLedgerWrite) { failNextLedgerWrite = false; throw new Error("ledger unavailable"); }
        operationLedger = structuredClone(value);
      }
      return value;
    }
  }
};
globalThis.Folder = { async create() { throw new Error("data folder should exist"); } };
globalThis.fromUuid = async (uuid) => docs.get(uuid) ?? null;

function setPath(target, path, value) {
  const parts = path.split("."); let cursor = target;
  for (const part of parts.slice(0, -1)) { cursor[part] ??= {}; cursor = cursor[part]; }
  cursor[parts.at(-1)] = structuredClone(value);
}

let modifiedClock = 100;
function makeDocument({ id, name, recordType, data, ownership = {} }) {
  const doc = {
    id, uuid: `JournalEntry.${id}`, documentName: "JournalEntry", name,
    ownership: structuredClone(ownership), _stats: { modifiedTime: modifiedClock++ },
    flags: { "domain-manager": { recordType, schemaVersion: 9, data: structuredClone(data) } },
    getFlag(moduleId, key) { return this.flags[moduleId]?.[key]; },
    testUserPermission(actor, level) { return actor?.isGM === true || Number(this.ownership?.[actor?.id] ?? 0) >= level; },
    async update(changes) {
      for (const [key, value] of Object.entries(changes)) {
        if (key === "name") this.name = value;
        else if (key === "ownership") this.ownership = structuredClone(value);
        else setPath(this, key, value);
      }
      this._stats.modifiedTime = modifiedClock++;
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
    const doc = makeDocument({ id: `CREATED${createCounter++}`, name: payload.name, recordType: flags.recordType, data: flags.data, ownership: payload.ownership });
    game.journal.push(doc);
    return doc;
  },
  async updateDocuments(changes) {
    const result = [];
    for (const update of changes) {
      const doc = [...docs.values()].find((entry) => entry.id === update._id);
      const copy = { ...update }; delete copy._id; await doc.update(copy); result.push(doc);
    }
    return result;
  }
};

const { recordIndex } = await import("../scripts/data/record-index.js");
const { dispatchAuthoritativeCommand } = await import("../scripts/commands/execute.js");
const { listVisibleRequestRecords } = await import("../scripts/features/requests/selectors.js");
const { performCreateRequest, resubmitRequestAction, reviewRequestAction } = await import("../scripts/features/requests/actions.js");
const { requestLifecycleResourceKeys, requestMissionResourceKeys, requestResubmitResourceKeys, requestReviewResourceKeys } = await import("../scripts/features/requests/contracts.js");

function makeDomain({ missionsEnabled = true } = {}) {
  return makeDocument({
    id: "D1", name: "Aurelia", recordType: "domain", ownership: { default: 0, P1: 2 },
    data: {
      entityId: "domain:D1", description: "", identity: { tags: [] },
      management: { preset: "base", capabilities: { missions: missionsEnabled } }, governance: { controllers: ["P1"] },
      economy: { stocks: [], flows: [], resourcePolicies: [] }, population: { groups: [], notables: [] },
      security: { defenseRating: 0, guardCount: 0, fortifications: [] },
      conditions: [], relations: [], agreements: [], intel: [], history: [], notifications: []
    }
  });
}

function reset(options = {}) {
  docs.clear(); game.journal = []; operationLedger = { version: 1, receipts: [] }; failNextLedgerWrite = false; modifiedClock = 100;
  const domain = makeDomain(options); game.journal = [domain]; game.user = gm; recordIndex.rebuild(); return domain;
}

function ref(doc, type, entityId) { return { recordType: type, uuid: doc.uuid, entityId }; }
function command(commandType, operationId, payload, callerUserId) {
  return dispatchAuthoritativeCommand({ commandType, operationId, payload }, { callerUserId });
}

async function createOne(domain, operationId = "req-create-1") {
  return command("request.create", operationId, {
    domain: ref(domain, "domain", "domain:D1"), type: "mission", title: "Recon exterior", intent: "Reconhecer o corredor norte.", details: "Evitar contato direto."
  }, "P1");
}

async function requestNeedsChanges(domain, prefix = "req-revise") {
  const created = await createOne(domain, `${prefix}-create`);
  recordIndex.rebuild();
  const requestDoc = docs.get(created.uuid);
  await command("request.review", `${prefix}-review`, {
    request: ref(requestDoc, "request", created.entityId),
    expectedModifiedTime: requestDoc._stats.modifiedTime,
    status: "needs-changes",
    summary: "Detalhe o plano de retirada.",
    handling: "none"
  }, "GM");
  recordIndex.rebuild();
  return requestDoc;
}

test("controller cria Request pelo Command Kernel, recebe OBSERVER e retry é idempotente", async () => {
  const domain = reset();
  const first = await createOne(domain);
  const second = await createOne(domain);
  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  assert.equal(game.journal.filter((doc) => doc.getFlag("domain-manager", "recordType") === "request").length, 1);
  const doc = game.journal.find((entry) => entry.getFlag("domain-manager", "recordType") === "request");
  assert.equal(doc.ownership.P1, 2);
  assert.equal(doc.ownership.P2, undefined);
  assert.equal(doc.getFlag("domain-manager", "data").operationId, "req-create-1");
});

test("Request personalizada persiste o nome humano do tipo", async () => {
  const domain = reset();
  const created = await command("request.create", "req-custom-label", {
    domain: ref(domain, "domain", "domain:D1"),
    type: "custom",
    customTypeLabel: "Evacuação Civil",
    title: "Retirada do distrito",
    intent: "Retirar a população antes da tempestade.",
    details: ""
  }, "P1");
  const requestDoc = docs.get(created.uuid);
  assert.equal(requestDoc.getFlag("domain-manager", "data").customTypeLabel, "Evacuação Civil");
});

test("request.create rejeita usuário que não controla o Domain", async () => {
  const domain = reset();
  await assert.rejects(() => command("request.create", "req-no-control", {
    domain: ref(domain, "domain", "domain:D1"), type: "custom", title: "Pedido", intent: "Tentar alterar outro domínio", details: ""
  }, "P2"), /não controla este Domain/i);
  assert.equal(game.journal.length, 1);
});

test("falha ao persistir receipt reverte Request recém-criada", async () => {
  const domain = reset(); failNextLedgerWrite = true;
  await assert.rejects(() => createOne(domain, "req-ledger-fail"), /ledger unavailable/);
  assert.equal(game.journal.filter((doc) => doc.getFlag("domain-manager", "recordType") === "request").length, 0);
});

test("GM revisa Request, preserva identidade/ownership e stale revision é rejeitada", async () => {
  const domain = reset();
  const created = await createOne(domain, "req-review-seed");
  recordIndex.rebuild();
  const requestDoc = docs.get(created.uuid);
  const expectedModifiedTime = requestDoc._stats.modifiedTime;
  const reviewed = await command("request.review", "req-review-1", {
    request: ref(requestDoc, "request", requestDoc.getFlag("domain-manager", "data").entityId),
    expectedModifiedTime,
    status: "approved",
    summary: "Autorizado para planejamento.",
    handling: "mission"
  }, "GM");
  assert.equal(reviewed.status, "approved");
  assert.equal(reviewed.handling, "mission");
  assert.equal(requestDoc.ownership.P1, 2);
  const data = requestDoc.getFlag("domain-manager", "data");
  assert.equal(data.entityId, created.entityId);
  assert.equal(data.history.at(-1).kind, "approved");
  assert.equal(data.gmDecision.decidedByUserUuid, "User.GM");

  await assert.rejects(() => command("request.review", "req-review-stale", {
    request: { recordType: "request", uuid: requestDoc.uuid, entityId: data.entityId },
    expectedModifiedTime,
    status: "rejected", summary: "stale", handling: "none"
  }, "GM"), /mudou enquanto a revisão estava aberta/i);
});

test("player não pode revisar e visibility selector respeita ownership", async () => {
  const domain = reset();
  const created = await createOne(domain, "req-private");
  recordIndex.rebuild();
  const requestDoc = docs.get(created.uuid);
  await assert.rejects(() => command("request.review", "req-player-review", {
    request: { recordType: "request", uuid: requestDoc.uuid, entityId: created.entityId },
    status: "approved", summary: "", handling: "none"
  }, "P1"), /exclusiva do GM/i);

  game.user = p1;
  assert.equal(listVisibleRequestRecords(p1).length, 1);
  assert.equal(listVisibleRequestRecords(p2).length, 0);
  assert.equal(listVisibleRequestRecords(gm).length, 1);
});


async function approveForMission(domain, seed = "bridge") {
  const created = await createOne(domain, `${seed}-create`);
  recordIndex.rebuild();
  const requestDoc = docs.get(created.uuid);
  await command("request.review", `${seed}-review`, {
    request: ref(requestDoc, "request", requestDoc.getFlag("domain-manager", "data").entityId),
    expectedModifiedTime: requestDoc._stats.modifiedTime,
    status: "approved",
    summary: "Converter em operação.",
    handling: "mission"
  }, "GM");
  recordIndex.rebuild();
  return requestDoc;
}

test("GM materializa Request aprovada em Mission disponível com provenance e audience", async () => {
  const domain = reset();
  const requestDoc = await approveForMission(domain, "bridge-ok");
  const requestData = requestDoc.getFlag("domain-manager", "data");
  const result = await command("request.create-mission", "bridge-mission-1", {
    request: ref(requestDoc, "request", requestData.entityId),
    expectedModifiedTime: requestDoc._stats.modifiedTime
  }, "GM");

  assert.equal(result.status, "available");
  assert.equal(result.reused, false);
  const missions = game.journal.filter((doc) => doc.getFlag("domain-manager", "recordType") === "mission");
  assert.equal(missions.length, 1);
  const missionData = missions[0].getFlag("domain-manager", "data");
  assert.deepEqual(missionData.origin, { kind: "request", uuid: requestDoc.uuid });
  assert.deepEqual(missionData.audienceUserIds, ["P1"]);
  assert.equal(missions[0].ownership.P1, 2);
  assert.equal(requestDoc.getFlag("domain-manager", "data").resultUuid, missions[0].uuid);
  assert.equal(requestDoc.getFlag("domain-manager", "data").status, "approved");
});

test("materialização é semanticamente idempotente mesmo com operationId diferente", async () => {
  const domain = reset();
  const requestDoc = await approveForMission(domain, "bridge-dedupe");
  const requestRef = ref(requestDoc, "request", requestDoc.getFlag("domain-manager", "data").entityId);
  const first = await command("request.create-mission", "bridge-dedupe-1", { request: requestRef }, "GM");
  recordIndex.rebuild();
  const second = await command("request.create-mission", "bridge-dedupe-2", { request: requestRef }, "GM");
  assert.equal(first.reused, false);
  assert.equal(second.reused, true);
  assert.equal(first.uuid, second.uuid);
  assert.equal(game.journal.filter((doc) => doc.getFlag("domain-manager", "recordType") === "mission").length, 1);
});

test("bridge rejeita player, Request não aprovada/roteada e Domain sem Missions", async () => {
  let domain = reset();
  let created = await createOne(domain, "bridge-invalid-state");
  recordIndex.rebuild();
  let requestDoc = docs.get(created.uuid);
  await assert.rejects(() => command("request.create-mission", "bridge-player", { request: ref(requestDoc, "request", created.entityId) }, "P1"), /Somente GM/i);
  await assert.rejects(() => command("request.create-mission", "bridge-not-approved", { request: ref(requestDoc, "request", created.entityId) }, "GM"), /precisa estar aprovada/i);

  domain = reset({ missionsEnabled: false });
  requestDoc = await approveForMission(domain, "bridge-no-cap");
  await assert.rejects(() => command("request.create-mission", "bridge-cap", { request: ref(requestDoc, "request", requestDoc.getFlag("domain-manager", "data").entityId) }, "GM"), /capability missions/i);
});

test("falha de receipt após bridge reverte Request e remove Mission", async () => {
  const domain = reset();
  const requestDoc = await approveForMission(domain, "bridge-ledger");
  const before = structuredClone(requestDoc.getFlag("domain-manager", "data"));
  failNextLedgerWrite = true;
  await assert.rejects(() => command("request.create-mission", "bridge-ledger-fail", {
    request: ref(requestDoc, "request", before.entityId)
  }, "GM"), /ledger unavailable/);
  assert.equal(game.journal.filter((doc) => doc.getFlag("domain-manager", "recordType") === "mission").length, 0);
  assert.equal(requestDoc.getFlag("domain-manager", "data").resultUuid, before.resultUuid);
  assert.equal(requestDoc.getFlag("domain-manager", "data").history.length, before.history.length);
});

async function approveWithHandling(domain, handling, seed = "lifecycle") {
  const created = await createOne(domain, `${seed}-create`);
  recordIndex.rebuild();
  const requestDoc = docs.get(created.uuid);
  await command("request.review", `${seed}-review`, {
    request: ref(requestDoc, "request", requestDoc.getFlag("domain-manager", "data").entityId),
    expectedModifiedTime: requestDoc._stats.modifiedTime,
    status: "approved",
    summary: `Aprovado com handling ${handling}.`,
    handling
  }, "GM");
  recordIndex.rebuild();
  return requestDoc;
}

async function setMissionStatus(missionDoc, status) {
  const data = structuredClone(missionDoc.getFlag("domain-manager", "data"));
  data.status = status;
  if (["resolved", "failed"].includes(status)) {
    data.resolvedAtWorldTime = 123;
    data.outcomeSummary = status === "resolved" ? "Objetivo concluído." : "Operação falhou.";
  }
  await missionDoc.update({ "flags.domain-manager.data": data });
  recordIndex.rebuild();
}

test("solicitante retira Request em revisão pelo Command Kernel e retry é idempotente", async () => {
  const domain = reset();
  const created = await createOne(domain, "withdraw-seed");
  recordIndex.rebuild();
  const requestDoc = docs.get(created.uuid);
  const payload = {
    request: ref(requestDoc, "request", created.entityId),
    expectedModifiedTime: requestDoc._stats.modifiedTime,
    summary: "Prioridade cancelada pelo operador."
  };
  const first = await command("request.withdraw", "withdraw-op", payload, "P1");
  const second = await command("request.withdraw", "withdraw-op", payload, "P1");
  assert.equal(first.status, "withdrawn");
  assert.equal(second.duplicate, true);
  const data = requestDoc.getFlag("domain-manager", "data");
  assert.equal(data.status, "withdrawn");
  assert.equal(data.history.at(-1).kind, "withdrawn");
  assert.equal(data.history.at(-1).userUuid, "User.P1");
  assert.equal(requestDoc.ownership.P1, 2);
});

test("withdraw exige o próprio solicitante e rejeita Request já aprovada", async () => {
  let domain = reset();
  let created = await createOne(domain, "withdraw-owner");
  recordIndex.rebuild();
  let requestDoc = docs.get(created.uuid);
  await assert.rejects(() => command("request.withdraw", "withdraw-p2", {
    request: ref(requestDoc, "request", created.entityId)
  }, "P2"), /próprio solicitante/i);
  await assert.rejects(() => command("request.withdraw", "withdraw-gm", {
    request: ref(requestDoc, "request", created.entityId)
  }, "GM"), /próprio solicitante/i);

  domain = reset();
  requestDoc = await approveWithHandling(domain, "immediate", "withdraw-approved");
  await assert.rejects(() => command("request.withdraw", "withdraw-approved-op", {
    request: ref(requestDoc, "request", requestDoc.getFlag("domain-manager", "data").entityId)
  }, "P1"), /fluxo de revisão/i);
});

test("falha de receipt em withdraw restaura status e histórico", async () => {
  const domain = reset();
  const created = await createOne(domain, "withdraw-ledger-seed");
  recordIndex.rebuild();
  const requestDoc = docs.get(created.uuid);
  const before = structuredClone(requestDoc.getFlag("domain-manager", "data"));
  failNextLedgerWrite = true;
  await assert.rejects(() => command("request.withdraw", "withdraw-ledger", {
    request: ref(requestDoc, "request", created.entityId)
  }, "P1"), /ledger unavailable/);
  const after = requestDoc.getFlag("domain-manager", "data");
  assert.equal(after.status, before.status);
  assert.equal(after.history.length, before.history.length);
});

test("GM encerra Request immediate aprovada como fulfilled", async () => {
  const domain = reset();
  const requestDoc = await approveWithHandling(domain, "immediate", "fulfill-immediate");
  const data = requestDoc.getFlag("domain-manager", "data");
  const result = await command("request.fulfill", "fulfill-immediate-op", {
    request: ref(requestDoc, "request", data.entityId),
    expectedModifiedTime: requestDoc._stats.modifiedTime,
    summary: "Atendimento executado diretamente pelo comando."
  }, "GM");
  assert.equal(result.status, "fulfilled");
  assert.equal(result.fulfillmentEvidence.kind, "immediate");
  assert.equal(requestDoc.getFlag("domain-manager", "data").history.at(-1).kind, "fulfilled");
});

test("fulfill exige GM, Request aprovada e handling suportado", async () => {
  let domain = reset();
  let created = await createOne(domain, "fulfill-invalid-state");
  recordIndex.rebuild();
  let requestDoc = docs.get(created.uuid);
  await assert.rejects(() => command("request.fulfill", "fulfill-not-approved", {
    request: ref(requestDoc, "request", created.entityId)
  }, "GM"), /Somente Request aprovada/i);

  domain = reset();
  requestDoc = await approveWithHandling(domain, "immediate", "fulfill-player");
  await assert.rejects(() => command("request.fulfill", "fulfill-player-op", {
    request: ref(requestDoc, "request", requestDoc.getFlag("domain-manager", "data").entityId)
  }, "P1"), /Somente GM/i);

  domain = reset();
  requestDoc = await approveWithHandling(domain, "project", "fulfill-project");
  await assert.rejects(() => command("request.fulfill", "fulfill-project-op", {
    request: ref(requestDoc, "request", requestDoc.getFlag("domain-manager", "data").entityId)
  }, "GM"), /ainda não possui regra canônica/i);
});

test("Request de Mission só é fulfilled quando Mission canônica está resolved", async () => {
  const domain = reset();
  const requestDoc = await approveForMission(domain, "fulfill-mission");
  const requestRef = ref(requestDoc, "request", requestDoc.getFlag("domain-manager", "data").entityId);
  const createdMission = await command("request.create-mission", "fulfill-mission-materialize", { request: requestRef }, "GM");
  recordIndex.rebuild();
  const missionDoc = docs.get(createdMission.uuid);

  await assert.rejects(() => command("request.fulfill", "fulfill-mission-early", { request: requestRef }, "GM"), /precisa estar resolvida/i);
  await setMissionStatus(missionDoc, "resolved");
  const fulfilled = await command("request.fulfill", "fulfill-mission-ok", {
    request: requestRef,
    expectedModifiedTime: requestDoc._stats.modifiedTime
  }, "GM");
  assert.equal(fulfilled.status, "fulfilled");
  assert.equal(fulfilled.fulfillmentEvidence.kind, "mission");
  assert.equal(fulfilled.fulfillmentEvidence.resultUuid, missionDoc.uuid);
});

test("Mission failed não permite fulfillment da Request", async () => {
  const domain = reset();
  const requestDoc = await approveForMission(domain, "fulfill-failed");
  const requestRef = ref(requestDoc, "request", requestDoc.getFlag("domain-manager", "data").entityId);
  const createdMission = await command("request.create-mission", "fulfill-failed-materialize", { request: requestRef }, "GM");
  recordIndex.rebuild();
  const missionDoc = docs.get(createdMission.uuid);
  await setMissionStatus(missionDoc, "failed");
  await assert.rejects(() => command("request.fulfill", "fulfill-failed-op", { request: requestRef }, "GM"), /Mission falhou/i);
  assert.equal(requestDoc.getFlag("domain-manager", "data").status, "approved");
});

test("falha de receipt em fulfill restaura Request aprovada", async () => {
  const domain = reset();
  const requestDoc = await approveWithHandling(domain, "immediate", "fulfill-ledger");
  const before = structuredClone(requestDoc.getFlag("domain-manager", "data"));
  failNextLedgerWrite = true;
  await assert.rejects(() => command("request.fulfill", "fulfill-ledger-op", {
    request: ref(requestDoc, "request", before.entityId)
  }, "GM"), /ledger unavailable/);
  const after = requestDoc.getFlag("domain-manager", "data");
  assert.equal(after.status, "approved");
  assert.equal(after.history.length, before.history.length);
});

test("solicitante corrige e reenvia Request após pedido de ajustes", async () => {
  const domain = reset();
  const requestDoc = await requestNeedsChanges(domain, "resubmit-ok");
  const before = structuredClone(requestDoc.getFlag("domain-manager", "data"));
  const expectedModifiedTime = requestDoc._stats.modifiedTime;
  const result = await command("request.resubmit", "resubmit-ok-command", {
    request: ref(requestDoc, "request", before.entityId),
    expectedModifiedTime,
    type: "custom",
    customTypeLabel: "Reconhecimento especial",
    title: "Recon exterior revisado",
    intent: "Reconhecer o corredor norte com rota de retirada.",
    details: "Recuar pelo marco oeste em caso de contato."
  }, "P1");

  const after = requestDoc.getFlag("domain-manager", "data");
  assert.equal(result.status, "submitted");
  assert.equal(requestDoc.name, "Recon exterior revisado");
  assert.equal(after.entityId, before.entityId);
  assert.equal(after.operationId, before.operationId);
  assert.equal(after.requesterUserUuid, before.requesterUserUuid);
  assert.equal(after.primaryDomainUuid, before.primaryDomainUuid);
  assert.equal(after.proposal.title, "Recon exterior revisado");
  assert.equal(after.customTypeLabel, "Reconhecimento especial");
  assert.equal(after.gmDecision.summary, "");
  assert.equal(after.gmDecision.handling, "none");
  assert.equal(after.history.at(-1).kind, "resubmitted");
  assert.equal(after.history.at(-1).userUuid, "User.P1");
});

test("resubmit exige solicitante, needs-changes e revisão atual", async () => {
  let domain = reset();
  let requestDoc = await requestNeedsChanges(domain, "resubmit-guards");
  const requestData = requestDoc.getFlag("domain-manager", "data");
  const payload = {
    request: ref(requestDoc, "request", requestData.entityId),
    expectedModifiedTime: requestDoc._stats.modifiedTime,
    type: requestData.type,
    title: requestData.proposal.title,
    intent: requestData.intent,
    details: requestData.proposal.details
  };
  await assert.rejects(() => command("request.resubmit", "resubmit-other", payload, "P2"), /próprio solicitante/i);
  await assert.rejects(() => command("request.resubmit", "resubmit-stale", {
    ...payload,
    expectedModifiedTime: payload.expectedModifiedTime - 1
  }, "P1"), /mudou enquanto a correção/i);

  domain = reset();
  const created = await createOne(domain, "resubmit-wrong-state");
  recordIndex.rebuild();
  requestDoc = docs.get(created.uuid);
  const current = requestDoc.getFlag("domain-manager", "data");
  await assert.rejects(() => command("request.resubmit", "resubmit-before-change", {
    request: ref(requestDoc, "request", current.entityId),
    expectedModifiedTime: requestDoc._stats.modifiedTime,
    type: current.type,
    title: current.proposal.title,
    intent: current.intent,
    details: current.proposal.details
  }, "P1"), /só pode ser corrigida/i);
});

test("needs-changes aguarda reenvio e falha de receipt restaura conteúdo anterior", async () => {
  const domain = reset();
  const requestDoc = await requestNeedsChanges(domain, "resubmit-rollback");
  const before = structuredClone(requestDoc.getFlag("domain-manager", "data"));
  const beforeName = requestDoc.name;

  await assert.rejects(() => command("request.review", "review-without-resubmit", {
    request: ref(requestDoc, "request", before.entityId),
    expectedModifiedTime: requestDoc._stats.modifiedTime,
    status: "approved",
    summary: "Aprovar sem correção.",
    handling: "immediate"
  }, "GM"), /aguarda correção e reenvio/i);

  failNextLedgerWrite = true;
  await assert.rejects(() => command("request.resubmit", "resubmit-ledger-fail", {
    request: ref(requestDoc, "request", before.entityId),
    expectedModifiedTime: requestDoc._stats.modifiedTime,
    type: "custom",
    title: "Título que será revertido",
    intent: "Conteúdo que será revertido.",
    details: "Também revertido."
  }, "P1"), /ledger unavailable/);
  assert.equal(requestDoc.name, beforeName);
  assert.deepEqual(requestDoc.getFlag("domain-manager", "data"), before);
});


test("review, resubmit, mission e lifecycle serializam sobre o mesmo lock da Request", () => {
  const payload = { request: { recordType: "request", entityId: "request:LOCK" } };
  assert.deepEqual(requestReviewResourceKeys(payload), ["request:request:LOCK"]);
  assert.deepEqual(requestResubmitResourceKeys(payload), ["request:request:LOCK"]);
  assert.deepEqual(requestMissionResourceKeys(payload), ["request:request:LOCK"]);
  assert.deepEqual(requestLifecycleResourceKeys(payload), ["request:request:LOCK"]);
});

test("Request encerrada ou com resultado materializado não pode ser reaberta por review", async () => {
  let domain = reset();
  let created = await createOne(domain, "review-terminal-seed");
  recordIndex.rebuild();
  let requestDoc = docs.get(created.uuid);
  await command("request.withdraw", "review-terminal-withdraw", {
    request: ref(requestDoc, "request", created.entityId)
  }, "P1");
  recordIndex.rebuild();
  await assert.rejects(() => command("request.review", "review-terminal-reopen", {
    request: ref(requestDoc, "request", created.entityId),
    status: "under-review", summary: "reopen", handling: "none"
  }, "GM"), /encerrada não pode voltar/i);

  domain = reset();
  requestDoc = await approveForMission(domain, "review-materialized");
  const requestRef = ref(requestDoc, "request", requestDoc.getFlag("domain-manager", "data").entityId);
  await command("request.create-mission", "review-materialized-mission", { request: requestRef }, "GM");
  recordIndex.rebuild();
  await assert.rejects(() => command("request.review", "review-materialized-reopen", {
    request: requestRef, status: "rejected", summary: "reroute", handling: "none"
  }, "GM"), /resultado materializado/i);
});


test("legacy Request actions delegam ao Command Kernel sem mudar contratos externos", async () => {
  let domain = reset();
  const first = await performCreateRequest({
    operationId: "legacy-create-wrapper",
    primaryDomainUuid: domain.uuid,
    type: "custom",
    title: "Compat request",
    intent: "Validar wrapper legado.",
    details: ""
  }, "P1");
  const second = await performCreateRequest({
    operationId: "legacy-create-wrapper",
    primaryDomainUuid: domain.uuid,
    type: "custom",
    title: "Compat request",
    intent: "Validar wrapper legado.",
    details: ""
  }, "P1");
  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  assert.equal(first.uuid, second.uuid);

  recordIndex.rebuild();
  const requestDoc = docs.get(first.uuid);
  const reviewed = await reviewRequestAction({
    requestUuid: requestDoc.uuid,
    expectedModifiedTime: requestDoc._stats.modifiedTime,
    status: "approved",
    summary: "Compatibilidade preservada.",
    handling: "immediate",
    operationId: "legacy-review-wrapper"
  });
  assert.equal(reviewed.recordType, "request");
  assert.equal(reviewed.data.status, "approved");
  assert.equal(reviewed.data.gmDecision.handling, "immediate");

  domain = reset();
  const revisable = await requestNeedsChanges(domain, "legacy-resubmit");
  const revised = await resubmitRequestAction({
    requestUuid: revisable.uuid,
    expectedModifiedTime: revisable._stats.modifiedTime,
    type: "custom",
    title: "Compat request revisada",
    intent: "Validar wrapper de reenvio.",
    details: "",
    operationId: "legacy-resubmit-wrapper"
  }, "P1");
  assert.equal(revised.data.status, "submitted");
  assert.equal(revised.data.proposal.title, "Compat request revisada");
});
