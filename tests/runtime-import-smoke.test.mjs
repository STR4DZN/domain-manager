import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

class DummyField { constructor(...args) { this.args = args; } }
class DummyDataModel {
  constructor(data = {}) { Object.assign(this, data); }
  static fromSource(data) { return new this(data); }
}
class DummyApplicationV2 { async _prepareContext() { return {}; } render() {} }

globalThis.foundry = {
  abstract: { DataModel: DummyDataModel },
  data: { fields: new Proxy({}, { get: () => DummyField }) },
  utils: {
    randomID: () => "RID",
    deepClone: (value) => value == null ? value : structuredClone(value),
    mergeObject: (a, b) => ({ ...a, ...b }),
    getProperty: (object, property) => property.split(".").reduce((value, key) => value?.[key], object),
    setProperty: (object, property, value) => {
      const keys = property.split(".");
      let cursor = object;
      for (const key of keys.slice(0, -1)) cursor = cursor[key] ??= {};
      cursor[keys.at(-1)] = value;
      return true;
    },
    isNewerVersion: () => false
  },
  applications: {
    api: {
      ApplicationV2: DummyApplicationV2,
      HandlebarsApplicationMixin: (Base) => class extends Base {}
    }
  }
};

globalThis.CONST = {
  DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0, LIMITED: 1, OBSERVER: 2, OWNER: 3 },
  USER_ROLES: { GAMEMASTER: 4 }
};
globalThis.Hooks = { on: () => 1, once: () => 1, off() {}, callAll() {} };
globalThis.game = {
  user: { id: "GM", name: "GM", isGM: true, role: 4 },
  users: { activeGM: { id: "GM", name: "GM", isGM: true }, contents: [], get: () => null, [Symbol.iterator]: function* () {} },
  modules: new Map([["domain-manager", { version: "audit", active: true, socket: true }]]),
  settings: {
    get(_moduleId, key) {
      const value = String(key);
      if (value.includes("resource")) return { version: 1, resources: [] };
      if (value.includes("seconds")) return 86400;
      if (value.includes("sync")) return true;
      if (value.includes("ledger")) return { version: 1, receipts: [] };
      return null;
    },
    async set() {}, register() {}
  },
  journal: [], folders: [], time: { worldTime: 0, async advance() {} }
};
globalThis.ui = { notifications: { info() {}, warn() {}, error() {} }, windows: {} };
globalThis.CONFIG = {};
globalThis.Folder = { async create() { return {}; } };
globalThis.JournalEntry = class { static async create() { return {}; } static async updateDocuments() { return []; } };
globalThis.fromUuid = async () => null;
globalThis.socketlib = { registerModule: () => ({ register() {}, async executeAsGM() { return {}; } }) };
globalThis.SimpleTimekeeping = null;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function listRuntimeScripts(directory) {
  const result = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...listRuntimeScripts(fullPath));
    else if (entry.name.endsWith(".js") && entry.name !== "build-css.js") result.push(fullPath);
  }
  return result;
}

test("todos os módulos runtime importam sob um Foundry mínimo sem ReferenceError de inicialização", async () => {
  const scripts = listRuntimeScripts(path.join(root, "scripts")).sort();
  const failures = [];

  for (const script of scripts) {
    try {
      await import(`${pathToFileURL(script).href}?runtime-smoke=1`);
    } catch (error) {
      failures.push(`${path.relative(root, script)}: ${error?.stack ?? error}`);
    }
  }

  assert.equal(failures.length, 0, failures.join("\n\n"));
  assert.ok(scripts.length >= 90, `cobertura inesperadamente pequena: ${scripts.length} scripts`);
});
