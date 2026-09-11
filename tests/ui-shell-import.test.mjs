import test from "node:test";
import assert from "node:assert/strict";

class DummyField { constructor(options = {}, extra = {}) { this.options = options; this.extra = extra; } }
class DummyDataModel {}
class DummyApplicationV2 {}

globalThis.foundry = {
  abstract: { DataModel: DummyDataModel },
  data: { fields: { ArrayField: DummyField, BooleanField: DummyField, NumberField: DummyField, SchemaField: DummyField, StringField: DummyField } },
  utils: {
    randomID: () => "RANDOM",
    deepClone: (value) => structuredClone(value),
    mergeObject: (a, b) => ({ ...a, ...b })
  },
  applications: {
    api: {
      ApplicationV2: DummyApplicationV2,
      HandlebarsApplicationMixin: (Base) => class extends Base {}
    }
  }
};

globalThis.game = {
  user: { id: "USER", isGM: false },
  users: { activeGM: null, get: () => null, contents: [] },
  modules: new Map(),
  settings: { get: () => ({ version: 1, resources: [] }) }
};
globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { OBSERVER: 2 } };
globalThis.Hooks = { callAll() {}, on() {} };

const module = await import("../scripts/ui/shell-app.js");

test("nova shell ApplicationV2 importa sem depender da UI legada", () => {
  assert.equal(typeof module.DomainManagerShellApp, "function");
  assert.equal(module.SHELL_SECTIONS.DASHBOARD, "command");
  assert.equal(module.SHELL_SECTIONS.SYSTEM, "system");
});


test("nova shell prepara o contexto inicial sem TDZ ou estado pré-inicializado", async () => {
  const app = new module.DomainManagerShellApp();
  const context = await app._prepareContext({});

  assert.equal(context.domainCount, 0);
  assert.deepEqual(context.structures, []);
  assert.deepEqual(context.structureStatusOptions.map((entry) => entry.value), [
    "planned", "operational", "damaged", "disabled", "destroyed", "decommissioned"
  ]);
});
