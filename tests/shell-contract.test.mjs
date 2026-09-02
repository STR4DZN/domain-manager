import assert from "node:assert/strict";
import test from "node:test";

class MockApplicationV2 {
  rendered = false;
  element = null;

  async render(options = {}) {
    this.rendered = true;
    this.element = { isConnected: true };
    this.lastRenderOptions = options;
    return this;
  }

  async close() {
    this.rendered = false;
    this.element = null;
    return true;
  }
}

class MockField {}
class MockDataModel {}

globalThis.foundry = {
  abstract: { DataModel: MockDataModel },
  applications: {
    api: {
      ApplicationV2: MockApplicationV2,
      HandlebarsApplicationMixin: (Base) => class extends Base {
        async _prepareContext() {
          return {};
        }
      }
    }
  },
  data: {
    fields: {
      ArrayField: MockField,
      BooleanField: MockField,
      NumberField: MockField,
      SchemaField: MockField,
      StringField: MockField
    }
  }
};

globalThis.CONST = {
  DOCUMENT_OWNERSHIP_LEVELS: {
    NONE: 0,
    OBSERVER: 2
  }
};

globalThis.game = {
  version: "13-test",
  journal: [],
  user: {
    id: "user-1",
    name: "Usuário de teste",
    isGM: true
  }
};

const hookHandlers = new Map();
globalThis.Hooks = {
  on(name, callback) {
    hookHandlers.set(name, callback);
  }
};

const appModule = await import("../scripts/ui/app.js");
const launcherModule = await import("../scripts/ui/launcher.js");

test("shell possui janela redimensionável e template próprio", () => {
  const AppClass = appModule.DomainManagerApp;
  assert.equal(AppClass.DEFAULT_OPTIONS.window.resizable, true);
  assert.equal(AppClass.DEFAULT_OPTIONS.position.width, 1120);
  assert.equal(AppClass.DEFAULT_OPTIONS.position.height, 700);
  assert.match(AppClass.PARTS.main.template, /templates\/app-shell\.hbs$/);
});

test("abertura reutiliza a instância e mantém rotas públicas", async () => {
  const first = await appModule.openDomainManager();
  const second = await appModule.openDomainManager();

  assert.equal(first, second);
  assert.equal(first.rendered, true);
  assert.equal(first.lastRenderOptions.focus, true);

  await appModule.openDashboard();
  assert.equal(first.activeSection, "dashboard");

  await appModule.openDomain("JournalEntry.domain-1");
  assert.equal(first.activeSection, "domains");
  assert.equal(first.selectedDomainUuid, "JournalEntry.domain-1");

  await appModule.openAdvanceRun();
  assert.equal(first.activeSection, "advance");

  await appModule.openSimulationPreview();
  assert.equal(first.activeSection, "simulation");

  await appModule.rollDomainEvent("JournalEntry.domain-1");
  assert.equal(first.activeSection, "events");

  await appModule.openHelp();
  assert.equal(first.activeSection, "help");
});

test("shell fechado pode ser aberto novamente", async () => {
  const first = appModule.getDomainManagerApp();
  await first.close();

  const reopened = await appModule.openDomainManager();
  assert.notEqual(reopened, first);
  assert.equal(reopened.rendered, true);
});

test("launcher registra uma única ferramenta no formato do Foundry v13", () => {
  launcherModule.registerSceneControlHook();
  launcherModule.registerSceneControlHook();

  const callback = hookHandlers.get("getSceneControlButtons");
  assert.equal(typeof callback, "function");

  const controls = { tokens: { tools: {} } };
  callback(controls);
  callback(controls);

  assert.deepEqual(Object.keys(controls.tokens.tools), ["domain-manager"]);
  assert.equal(
    typeof controls.tokens.tools["domain-manager"].onChange,
    "function"
  );
});
