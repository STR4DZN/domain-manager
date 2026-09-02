import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

// Mocks para simular o ambiente Foundry VTT
class MockApplicationV2 {
  rendered = false;
  element = null;
  async render() {
    this.rendered = true;
    return this;
  }
  async close() {
    this.rendered = false;
    return true;
  }
}

globalThis.foundry = {
  abstract: {
    DataModel: class {
      constructor(data = {}) {
        Object.assign(this, data);
      }
      validate() { return true; }
      toObject() { return structuredClone(this); }
    }
  },
  applications: {
    api: {
      ApplicationV2: MockApplicationV2,
      HandlebarsApplicationMixin: (Base) => class extends Base {
        async _prepareContext() { return {}; }
      }
    }
  },
  utils: {
    deepClone(val) {
      return structuredClone(val);
    }
  },
  data: {
    fields: {
      ArrayField: class {},
      BooleanField: class {},
      NumberField: class {},
      SchemaField: class {},
      StringField: class {}
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
  version: "13.351",
  journal: [],
  user: {
    id: "gm-user-1",
    name: "Mestre Supremo",
    isGM: true
  },
  settings: {
    get(module, key) {
      if (key === "resourceCatalog") {
        return {
          resources: [
            { id: "credits", name: "Créditos Galácticos", precision: 2, allowNegative: false },
            { id: "ore", name: "Minério Raro", precision: 0, allowNegative: false }
          ]
        };
      }
      if (key === "secondsPerTick") return 86400;
      return null;
    }
  }
};

function createMockJournal({ uuid, name, data, recordType = "domain" }) {
  const flags = {
    "domain-manager": {
      schemaVersion: 1,
      recordType,
      data
    }
  };

  return {
    documentName: "JournalEntry",
    uuid,
    name,
    flags,
    getFlag(scope, key) {
      return flags[scope]?.[key];
    },
    testUserPermission: () => true
  };
}

test("todos os templates da interface existem e são válidos", () => {
  const templates = [
    "templates/app-shell.hbs",
    "templates/parts/rail.hbs",
    "templates/parts/sidebar.hbs",
    "templates/parts/workspace-header.hbs",
    "templates/parts/overview-cards.hbs",
    "templates/parts/workspace-content.hbs",
    "templates/parts/footer.hbs"
  ];

  for (const tpl of templates) {
    const fullPath = path.join(ROOT, tpl);
    assert.equal(fs.existsSync(fullPath), true, `Template ausente: ${tpl}`);
    const content = fs.readFileSync(fullPath, "utf8");
    assert.ok(content.length > 20, `Template vazio ou muito curto: ${tpl}`);
  }
});

test("dicionário de idiomas pt-BR possui todas as chaves da nova interface", () => {
  const langPath = path.join(ROOT, "lang/pt-BR.json");
  assert.equal(fs.existsSync(langPath), true);
  const json = JSON.parse(fs.readFileSync(langPath, "utf8"));
  const dm = json.DOMAIN_MANAGER;

  assert.ok(dm.SearchPlaceholder);
  assert.ok(dm.Sidebar.Folders);
  assert.ok(dm.Sidebar.Tags);
  assert.ok(dm.Tabs.Overview);
  assert.ok(dm.Tabs.Economy);
  assert.ok(dm.Tabs.Projects);
  assert.ok(dm.Tabs.People);
  assert.ok(dm.Tabs.Diplomacy);
  assert.ok(dm.Tabs.Intel);
  assert.ok(dm.Tabs.History);
  assert.ok(dm.Metrics.Treasury);
  assert.ok(dm.Metrics.Defense);
  assert.ok(dm.Metrics.Population);
  assert.ok(dm.Metrics.Projects);
  assert.ok(dm.Footer.Authority);
  assert.ok(dm.Footer.SyncStatus);
});

test("teste de escala: 1 galáxia, 6 planetas e 20 bases interligadas na árvore hierárquica", async () => {
  const { recordIndex } = await import("../scripts/data/record-index.js");
  const { RECORD_TYPES } = await import("../scripts/core/constants.js");
  const { DomainManagerShellApp } = await import("../scripts/ui/shell-app.js");

  game.journal = [];
  recordIndex.rebuild();

  // 1. Criar Galáxia (Raiz)
  const galaxyDoc = createMockJournal({
    uuid: "JournalEntry.galaxy-1",
    name: "Via Láctea (Império)",
    data: {
      identity: { category: "territory", nature: "physical", state: "active", tags: ["galáxia", "império"] },
      hierarchy: { locatedInUuid: null, administrativeParentUuid: null },
      economy: { stocks: [{ resourceId: "credits", amount: 100000000 }], flows: [] },
      population: { total: 500000000, groups: [], notables: [] }
    }
  });
  recordIndex.upsert(galaxyDoc);

  // 2. Criar 6 Planetas vinculados à Galáxia
  const planetUuids = [];
  for (let i = 1; i <= 6; i++) {
    const pUuid = `JournalEntry.planet-${i}`;
    planetUuids.push(pUuid);
    const planetDoc = createMockJournal({
      uuid: pUuid,
      name: `Planeta Sector-${i}`,
      data: {
        identity: { category: "planet", nature: "physical", state: "active", tags: ["planeta", `setor-${i}`] },
        hierarchy: { locatedInUuid: "JournalEntry.galaxy-1", administrativeParentUuid: "JournalEntry.galaxy-1" },
        economy: { stocks: [{ resourceId: "credits", amount: 500000 }], flows: [] },
        population: { total: 100000, groups: [], notables: [] }
      }
    });
    recordIndex.upsert(planetDoc);
  }

  // 3. Criar 20 Bases distribuídas entre os planetas
  for (let b = 1; b <= 20; b++) {
    const parentPlanet = planetUuids[(b - 1) % 6];
    const baseDoc = createMockJournal({
      uuid: `JournalEntry.base-${b}`,
      name: `Base Operacional ${b}`,
      data: {
        identity: { category: "base", nature: "organization", state: "active", tags: ["base", b % 2 === 0 ? "mineração" : "militar"] },
        hierarchy: { locatedInUuid: parentPlanet, administrativeParentUuid: parentPlanet },
        economy: {
          stocks: [{ resourceId: "credits", amount: 10000 }],
          flows: [{ localId: "f1", name: "Extração", direction: "inflow", resourceId: "credits", amount: 500, periodTicks: 1, active: true }]
        },
        population: { total: 150, groups: [], notables: [] },
        security: { defenseRating: 25, guardCount: 15 }
      }
    });
    recordIndex.upsert(baseDoc);
  }

  // Total de 27 domínios indexados
  assert.equal(recordIndex.count(RECORD_TYPES.DOMAIN), 27);

  // Instanciar App e preparar contexto
  const app = new DomainManagerShellApp();
  app.setRoute({ domainUuid: "JournalEntry.galaxy-1" });

  const context = await app._prepareContext();

  // Validações Estruturais e de Escala:
  assert.equal(context.counts.domains, 27);
  assert.equal(context.domainTree.length, 1, "Deveria haver exatamente 1 nó raiz (a Galáxia)");

  const rootNode = context.domainTree[0];
  assert.equal(rootNode.name, "Via Láctea (Império)");
  assert.equal(rootNode.children.length, 6, "A Galáxia deve conter 6 planetas filhos");
  assert.equal(rootNode.childCount, 26, "A Galáxia deve possuir 26 descendentes totais (6 planetas + 20 bases)");

  // Validação de um dos planetas
  const firstPlanet = rootNode.children[0];
  assert.equal(firstPlanet.children.length, 4, "Planeta 1 deve possuir 4 bases vinculadas");

  // Validação das Tags agrupadas
  assert.ok(context.tagGroups.length > 0);
  const mineracaoTag = context.tagGroups.find((t) => t.tag === "mineração");
  assert.equal(mineracaoTag?.count, 10, "Exatamente 10 bases pares possuem a tag mineração");

  // Validação do Domínio Selecionado
  assert.equal(context.selectedDomain.name, "Via Láctea (Império)");
  assert.equal(context.metrics.primaryStockDisplay, "1.000.000,00");
  assert.equal(context.metrics.populationTotal, 500000000);

  // Navegação para uma Base individual
  app.setRoute({ domainUuid: "JournalEntry.base-1" });
  const baseContext = await app._prepareContext();
  assert.equal(baseContext.selectedDomain.name, "Base Operacional 1");
  assert.equal(baseContext.breadcrumbs.length, 2, "Breadcrumbs devem rastrear Galáxia > Planeta Sector-1");
  assert.equal(baseContext.breadcrumbs[0].name, "Via Láctea (Império)");
  assert.equal(baseContext.breadcrumbs[1].name, "Planeta Sector-1");

  // Métricas da base
  assert.equal(baseContext.metrics.primaryStockDisplay, "100,00");
  assert.equal(baseContext.metrics.netRateDisplay, "500");
  assert.equal(baseContext.metrics.defenseRating, 47); // 25 + floor(15 * 1.5) = 25 + 22 = 47
});
