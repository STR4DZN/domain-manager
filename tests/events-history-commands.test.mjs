import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

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
    randomID: (length = 16) => `ID${String(++generatedId).padStart(Math.max(1, length - 2), "0")}`
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
  { id: "fuel", name: "Combustível", unit: "L", precision: 0, allowNegative: false, category: "energia", tags: [] }
] };
let operationLedger;
let modifiedTime;
let domain;
let failNextLedgerWrite;
let chatMessages;
let chatReceiptCounts;

function setPath(target, path, value) {
  const parts = path.split(".");
  let cursor = target;
  for (const part of parts.slice(0, -1)) {
    cursor[part] ??= {};
    cursor = cursor[part];
  }
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
          flows: [],
          resourcePolicies: [],
          sustenanceSettings: { enabled: false, foodPer100: 1, waterPer100: 1, guardUpkeep: 1 }
        },
        population: { total: 0, countMode: "direct", groups: [], notables: [] },
        security: { guardCount: 0 },
        conditions: [],
        relations: [],
        agreements: [],
        intel: [],
        history: [],
        notifications: []
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
globalThis.ChatMessage = {
  async create(message) {
    chatMessages.push(structuredClone(message));
    chatReceiptCounts.push(operationLedger.receipts.length);
    return message;
  }
};
globalThis.fromUuid = async (uuid) => uuid === domain?.uuid ? domain : null;

const { recordIndex } = await import("../scripts/data/record-index.js");
const { dispatchAuthoritativeCommand } = await import("../scripts/commands/execute.js");
const { executeApplyEventOutcome } = await import("../scripts/features/events/actions.js");
const {
  addHistoryEvent,
  clearHistory,
  removeHistoryEvent
} = await import("../scripts/features/history/actions.js");

function reset() {
  generatedId = 0;
  operationLedger = { version: 1, receipts: [] };
  modifiedTime = 100;
  failNextLedgerWrite = false;
  chatMessages = [];
  chatReceiptCounts = [];
  domain = makeDomain();
  game.user = gm;
  game.journal = [domain];
  recordIndex.rebuild();
}

function eventPayload(overrides = {}) {
  return {
    id: "event-1",
    title: "Festa <da Colheita>",
    category: "economy",
    severity: "boon",
    description: "A praça recebe visitantes & mercadores.",
    outcomes: [{
      id: "outcome-1",
      label: "Prosperidade > escassez",
      description: "O estoque cresce.",
      stockBonus: { resourceId: "fuel", amount: 5 },
      condition: { name: "Ânimo elevado", description: "Celebração", durationTicks: 2 },
      chronicleTitle: "A grande colheita"
    }],
    ...overrides
  };
}

function applyCommand(operationId, overrides = {}) {
  return {
    commandType: "domain-event.apply",
    operationId,
    callerUserId: "GM",
    payload: {
      domain: { recordType: "domain", entityId: "domain:D1" },
      expectedModifiedTime: 100,
      event: eventPayload(),
      outcomeIndex: 0,
      postToChat: true,
      ...overrides
    }
  };
}

test("domain-event.apply confirma estado e chat uma única vez mesmo em retry", async () => {
  reset();
  const command = applyCommand("event-apply-1");
  const first = await dispatchAuthoritativeCommand(command);
  const retry = await dispatchAuthoritativeCommand(command);
  const data = domain.getFlag("domain-manager", "data");

  assert.equal(first.duplicate, false);
  assert.equal(retry.duplicate, true);
  assert.equal(data.economy.stocks[0].amount, 15);
  assert.equal(data.conditions.length, 1);
  assert.equal(data.history.length, 1);
  assert.equal(data.history[0].eventType, "domain-event.applied");
  assert.equal(chatMessages.length, 1);
  assert.deepEqual(chatReceiptCounts, [1], "o observer deve rodar somente depois da receipt");
  assert.match(chatMessages[0].content, /Festa &lt;da Colheita&gt;/);
  assert.match(chatMessages[0].content, /visitantes &amp; mercadores/);
  assert.doesNotMatch(chatMessages[0].content, /<da Colheita>/);
});

test("domain-event.apply valida permissão, revisão, capability e recurso", async () => {
  reset();
  await assert.rejects(() => dispatchAuthoritativeCommand({
    ...applyCommand("event-player"),
    callerUserId: "P1"
  }), /Apenas GM/i);

  await assert.rejects(() => dispatchAuthoritativeCommand(applyCommand("event-stale", {
    expectedModifiedTime: 99
  })), /mudou depois da rolagem/i);
  await assert.rejects(() => dispatchAuthoritativeCommand(applyCommand("event-outcome-missing", {
    outcomeIndex: 4
  })), /Resultado de evento inexistente/i);

  domain.getFlag("domain-manager", "data").management.capabilities.economy = false;
  await assert.rejects(() => dispatchAuthoritativeCommand(applyCommand("event-no-economy")), /capability economy/i);
  domain.getFlag("domain-manager", "data").management.capabilities.economy = true;

  const unknownResourceEvent = eventPayload();
  unknownResourceEvent.outcomes[0].stockBonus.resourceId = "unobtainium";
  await assert.rejects(() => dispatchAuthoritativeCommand(applyCommand("event-unknown-resource", {
    event: unknownResourceEvent
  })), /recurso desconhecido/i);
  assert.equal(chatMessages.length, 0);
});

test("falha ao gravar receipt restaura o evento e não publica chat", async () => {
  reset();
  const before = structuredClone(domain.getFlag("domain-manager", "data"));
  failNextLedgerWrite = true;
  await assert.rejects(
    () => dispatchAuthoritativeCommand(applyCommand("event-rollback")),
    /ledger unavailable/
  );
  assert.deepEqual(domain.getFlag("domain-manager", "data"), before);
  assert.equal(chatMessages.length, 0);
});

test("falha do observer de chat não desfaz um evento já commitado", async () => {
  reset();
  const originalCreate = ChatMessage.create;
  ChatMessage.create = async () => { throw new Error("chat unavailable"); };
  try {
    const result = await dispatchAuthoritativeCommand(applyCommand("event-chat-failure"));
    assert.equal(result.duplicate, false);
    assert.equal(domain.getFlag("domain-manager", "data").economy.stocks[0].amount, 15);
    assert.equal(operationLedger.receipts.length, 1);
  } finally {
    ChatMessage.create = originalCreate;
  }
});

test("comandos de histórico adicionam, removem e limpam com idempotência", async () => {
  reset();
  const add = {
    commandType: "history.add",
    operationId: "history-add-1",
    callerUserId: "GM",
    payload: {
      domain: { recordType: "domain", uuid: domain.uuid },
      expectedModifiedTime: 100,
      entry: {
        title: "Fundação",
        category: "story",
        summary: "Início",
        details: "Primeiro registro",
        significance: "major",
        visibility: "all",
        tick: 3
      }
    }
  };
  const first = await dispatchAuthoritativeCommand(add);
  const retry = await dispatchAuthoritativeCommand(add);
  assert.equal(first.duplicate, false);
  assert.equal(retry.duplicate, true);
  assert.equal(domain.getFlag("domain-manager", "data").history.length, 1);
  assert.equal(domain.getFlag("domain-manager", "data").history[0].operationId, "history-add-1");

  const localId = first.entry.localId;
  const removed = await dispatchAuthoritativeCommand({
    commandType: "history.remove",
    operationId: "history-remove-1",
    callerUserId: "GM",
    payload: {
      domain: { recordType: "domain", entityId: "domain:D1" },
      expectedModifiedTime: domain._stats.modifiedTime,
      localId
    }
  });
  assert.equal(removed.removed, true);
  assert.equal(domain.getFlag("domain-manager", "data").history.length, 0);

  await dispatchAuthoritativeCommand({
    ...add,
    operationId: "history-add-2",
    payload: { ...add.payload, expectedModifiedTime: domain._stats.modifiedTime }
  });
  const cleared = await dispatchAuthoritativeCommand({
    commandType: "history.clear",
    operationId: "history-clear-1",
    callerUserId: "GM",
    payload: {
      domain: { recordType: "domain", entityId: "domain:D1" },
      expectedModifiedTime: domain._stats.modifiedTime
    }
  });
  assert.equal(cleared.removedCount, 1);
  assert.equal(domain.getFlag("domain-manager", "data").history.length, 0);
});

test("histórico rejeita não-GM, revisão antiga e referência desaparecida", async () => {
  reset();
  const payload = {
    domain: { recordType: "domain", entityId: "domain:D1" },
    expectedModifiedTime: 100,
    entry: { title: "Registro", category: "custom", significance: "minor", visibility: "all" }
  };
  await assert.rejects(() => dispatchAuthoritativeCommand({
    commandType: "history.add",
    operationId: "history-player",
    callerUserId: "P1",
    payload
  }), /Apenas GM/i);
  await assert.rejects(() => dispatchAuthoritativeCommand({
    commandType: "history.add",
    operationId: "history-stale",
    callerUserId: "GM",
    payload: { ...payload, expectedModifiedTime: 99 }
  }), /histórico estava aberto/i);
  await assert.rejects(() => dispatchAuthoritativeCommand({
    commandType: "history.remove",
    operationId: "history-missing",
    callerUserId: "GM",
    payload: {
      domain: payload.domain,
      expectedModifiedTime: 100,
      localId: "missing"
    }
  }), /não encontrado/i);
});

test("falha de receipt também restaura o histórico anterior", async () => {
  reset();
  const before = structuredClone(domain.getFlag("domain-manager", "data").history);
  failNextLedgerWrite = true;
  await assert.rejects(() => dispatchAuthoritativeCommand({
    commandType: "history.add",
    operationId: "history-rollback",
    callerUserId: "GM",
    payload: {
      domain: { recordType: "domain", entityId: "domain:D1" },
      expectedModifiedTime: 100,
      entry: {
        title: "Não deve persistir",
        category: "custom",
        significance: "minor",
        visibility: "all"
      }
    }
  }), /ledger unavailable/);
  assert.deepEqual(domain.getFlag("domain-manager", "data").history, before);
});

test("wrappers legados usam somente a autoridade transacional", async () => {
  reset();
  await executeApplyEventOutcome({
    domainUuid: domain.uuid,
    event: eventPayload(),
    postToChat: false,
    operationId: "legacy-event"
  });
  await addHistoryEvent({
    domainUuid: domain.uuid,
    title: "Registro legado",
    operationId: "legacy-history-add"
  });
  const localId = domain.getFlag("domain-manager", "data").history.at(-1).localId;
  await removeHistoryEvent({
    domainUuid: domain.uuid,
    localId,
    operationId: "legacy-history-remove"
  });
  await clearHistory({
    domainUuid: domain.uuid,
    operationId: "legacy-history-clear"
  });

  assert.deepEqual(
    operationLedger.receipts.map((receipt) => receipt.operationId),
    ["legacy-event", "legacy-history-add", "legacy-history-remove", "legacy-history-clear"]
  );
  assert.equal(chatMessages.length, 0);

  for (const relativePath of [
    "../scripts/features/events/actions.js",
    "../scripts/features/history/actions.js"
  ]) {
    const source = await readFile(new URL(relativePath, import.meta.url), "utf8");
    assert.match(source, /executeCommandAuthoritatively/);
    assert.doesNotMatch(source, /\bupdateRecord\b/);
    assert.doesNotMatch(source, /dispatchAuthoritativeCommand/);
  }
});
