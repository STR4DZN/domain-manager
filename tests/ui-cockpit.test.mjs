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
    },
    randomID() {
      return Math.random().toString(36).substring(2, 18);
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

globalThis.fromUuid = async (uuid) => game.journal.find((j) => j.uuid === uuid) || null;

function createMockJournal({ uuid, name, data, recordType = "domain" }) {
  const flags = {
    "domain-manager": {
      schemaVersion: 1,
      recordType,
      data
    }
  };

  const doc = {
    documentName: "JournalEntry",
    uuid,
    name,
    flags,
    getFlag(scope, key) {
      return flags[scope]?.[key];
    },
    testUserPermission: () => true,
    async delete() {
      const idx = game.journal.indexOf(doc);
      if (idx !== -1) game.journal.splice(idx, 1);
      return true;
    },
    async update(updates) {
      if (updates.name) doc.name = updates.name;
      if (updates["flags.domain-manager.data"]) {
        doc.flags["domain-manager"].data = updates["flags.domain-manager.data"];
      }
      return doc;
    }
  };

  game.journal.push(doc);
  return doc;
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

test("teste de hierarquia profunda: 5 níveis de aninhamento são preservados no flatDomainTree", async () => {
  game.journal = [];
  const { recordIndex } = await import("../scripts/data/record-index.js");
  const { DomainManagerShellApp } = await import("../scripts/ui/shell-app.js");

  recordIndex.rebuild();

  // Nível 1: Raiz (Galáxia)
  const l1 = createMockJournal({
    uuid: "JournalEntry.lvl-1",
    name: "Nível 1 - Galáxia Raiz",
    data: { identity: { category: "galaxy", nature: "physical", state: "active" }, hierarchy: {} }
  });
  recordIndex.upsert(l1);

  // Nível 2: Planeta (filho do Nível 1)
  const l2 = createMockJournal({
    uuid: "JournalEntry.lvl-2",
    name: "Nível 2 - Planeta",
    data: { identity: { category: "planet", nature: "physical", state: "active" }, hierarchy: { locatedInUuid: "JournalEntry.lvl-1" } }
  });
  recordIndex.upsert(l2);

  // Nível 3: Setor (filho do Nível 2)
  const l3 = createMockJournal({
    uuid: "JournalEntry.lvl-3",
    name: "Nível 3 - Setor",
    data: { identity: { category: "sector", nature: "physical", state: "active" }, hierarchy: { locatedInUuid: "JournalEntry.lvl-2" } }
  });
  recordIndex.upsert(l3);

  // Nível 4: Base Operacional (filho do Nível 3)
  const l4 = createMockJournal({
    uuid: "JournalEntry.lvl-4",
    name: "Nível 4 - Base Operacional",
    data: { identity: { category: "outpost", nature: "physical", state: "active" }, hierarchy: { locatedInUuid: "JournalEntry.lvl-3" } }
  });
  recordIndex.upsert(l4);

  // Nível 5: Sub-Instalação Interna (filho do Nível 4)
  const l5 = createMockJournal({
    uuid: "JournalEntry.lvl-5",
    name: "Nível 5 - Sub-Instalação",
    data: { identity: { category: "facility", nature: "physical", state: "active" }, hierarchy: { locatedInUuid: "JournalEntry.lvl-4" } }
  });
  recordIndex.upsert(l5);

  const app = new DomainManagerShellApp();
  const context = await app._prepareContext();

  assert.equal(context.flatDomainTree.length, 5, "Todos os 5 níveis hierárquicos devem estar presentes no flatDomainTree");
  assert.equal(context.flatDomainTree[0].name, "Nível 1 - Galáxia Raiz");
  assert.equal(context.flatDomainTree[0].depth, 0);
  assert.equal(context.flatDomainTree[1].name, "Nível 2 - Planeta");
  assert.equal(context.flatDomainTree[1].depth, 1);
  assert.equal(context.flatDomainTree[2].name, "Nível 3 - Setor");
  assert.equal(context.flatDomainTree[2].depth, 2);
  assert.equal(context.flatDomainTree[3].name, "Nível 4 - Base Operacional");
  assert.equal(context.flatDomainTree[3].depth, 3);
  assert.equal(context.flatDomainTree[4].name, "Nível 5 - Sub-Instalação");
  assert.equal(context.flatDomainTree[4].depth, 4);
  assert.equal(context.flatDomainTree[4].indentPx, 64);
});

test("teste de exclusão de domínio e integridade hierárquica: deleteDomainAction desvincula filhos e remove do índice", async () => {
  game.journal = [];
  game.user = { id: "gm-user-1", name: "Gamemaster", isGM: true };

  const { recordIndex } = await import("../scripts/data/record-index.js");
  const { deleteDomainAction } = await import("../scripts/features/domains/actions.js");

  recordIndex.rebuild();

  // Pai
  const parentDoc = createMockJournal({
    uuid: "JournalEntry.parent-base",
    name: "Base Central Primária",
    data: { identity: { category: "base", nature: "physical", state: "active" }, hierarchy: {} }
  });
  recordIndex.upsert(parentDoc);

  // Filho
  const childDoc = createMockJournal({
    uuid: "JournalEntry.child-base",
    name: "Sub-Base de Suporte",
    data: { identity: { category: "outpost", nature: "physical", state: "active" }, hierarchy: { locatedInUuid: "JournalEntry.parent-base" } }
  });
  recordIndex.upsert(childDoc);

  assert.equal(recordIndex.count("domain"), 2);

  // Excluir Pai
  const success = await deleteDomainAction({ domainUuid: "JournalEntry.parent-base" });
  assert.equal(success, true);

  // Verificar que o pai foi removido do índice
  assert.equal(recordIndex.get("domain", "JournalEntry.parent-base"), null);
  assert.equal(recordIndex.count("domain"), 1);

  // Verificar que o filho foi desvinculado (locatedInUuid limpo para null)
  const updatedChild = recordIndex.get("domain", "JournalEntry.child-base");
  assert.ok(updatedChild);
  assert.equal(updatedChild.flags["domain-manager"].data.hierarchy.locatedInUuid, null);
});

test("segurança de permissões: jogadores não podem alterar tópicos sensíveis ou excluir domínios", async () => {
  game.journal = [];
  game.user = { id: "player-user-1", name: "Jogador Comum", isGM: false };

  const { recordIndex } = await import("../scripts/data/record-index.js");
  const { deleteDomainAction } = await import("../scripts/features/domains/actions.js");
  const { updateDomainStocksAction } = await import("../scripts/features/economy/actions.js");
  const { createProjectAction } = await import("../scripts/features/projects/actions.js");
  const { upsertNotableAction } = await import("../scripts/features/people/actions.js");
  const { DomainManagerShellApp } = await import("../scripts/ui/shell-app.js");

  recordIndex.rebuild();

  const domainDoc = createMockJournal({
    uuid: "JournalEntry.secure-domain",
    name: "Base Segura",
    data: { identity: { category: "base", nature: "physical", state: "active" }, hierarchy: {}, governance: { controllers: ["player-user-1"] } }
  });
  recordIndex.upsert(domainDoc);

  // 1. Excluir Domínio deve falhar
  await assert.rejects(
    async () => deleteDomainAction({ domainUuid: "JournalEntry.secure-domain" }),
    /Somente GM/
  );

  // 2. Alterar Estoques deve falhar
  await assert.rejects(
    async () => updateDomainStocksAction({ domainUuid: "JournalEntry.secure-domain", displayAmounts: { credits: "5000" } }),
    /Somente GM/
  );

  // 3. Criar Projeto deve falhar
  await assert.rejects(
    async () => createProjectAction({ domainUuid: "JournalEntry.secure-domain", name: "Projeto Ilegal", workRequired: 100, rateAmount: 10, periodTicks: 1 }),
    /Somente GM/
  );

  // 4. Adicionar Notável deve falhar
  await assert.rejects(
    async () => upsertNotableAction({ domainUuid: "JournalEntry.secure-domain", name: "Invasor" }),
    /Somente GM/
  );

  // 5. No contexto da UI, isGM deve ser false
  const app = new DomainManagerShellApp();
  app.setRoute({ domainUuid: "JournalEntry.secure-domain" });
  const context = await app._prepareContext();
  assert.equal(context.isGM, false);

  // Restaurar usuário GM para os próximos testes
  game.user = { id: "gm-user-1", name: "Mestre Supremo", isGM: true };
});

test("testes das correções v4: custom flow category, intel validation, project description, tags e cálculos de população", async () => {
  const { normalizeFlow } = await import("../scripts/features/economy/rules.js");
  const { validateIntelData } = await import("../scripts/features/intel/rules.js");
  const { DomainManagerShellApp } = await import("../scripts/ui/shell-app.js");

  // 1. Categoria customizada de fluxo não deve lançar erro
  const flow = normalizeFlow({
    name: "Mineração de Esmeraldas",
    resourceId: "credits",
    direction: "inflow",
    amount: 50,
    periodTicks: 1,
    category: "mineração-customizada"
  }, { resources: [{ id: "credits", name: "Créditos", precision: 2, allowNegative: false }] });
  assert.equal(flow.category, "mineração-customizada");

  // 2. Validação de Intel com os enums corretos
  assert.doesNotThrow(() => {
    validateIntelData({
      title: "Plano Confidencial",
      category: "secret",
      credibility: "confirmed",
      visibility: "gm_only"
    });
  });

  // 3. Descrição de projeto e cálculo de população ponderada
  game.journal = [];
  game.user = { id: "gm-1", name: "GM", isGM: true };

  const { recordIndex } = await import("../scripts/data/record-index.js");
  recordIndex.rebuild();

  const domainDoc = createMockJournal({
    uuid: "JournalEntry.domain-test-v4",
    name: "Fortaleza V4",
    data: {
      identity: { category: "base", nature: "physical", state: "active", tags: ["capital", "mineracao"] },
      hierarchy: {},
      security: { defenseScore: 12, guardCount: 10 },
      population: {
        groups: [
          { localId: "g1", name: "Trabalhadores", count: 1000, quality: "Insatisfeito", assignment: "6" },
          { localId: "g2", name: "Cientistas", count: 200, quality: "Muito Alta", assignment: "0" }
        ]
      }
    }
  });
  recordIndex.upsert(domainDoc);

  const projectDoc = createMockJournal({
    uuid: "JournalEntry.project-test-v4",
    name: "Escudo Planetário",
    recordType: "project",
    data: {
      domainUuid: "JournalEntry.domain-test-v4",
      category: "defesa",
      status: "active",
      description: "Escudo defletor de alta potência para defesa orbital.",
      work: { required: 200, completed: 50 }
    }
  });
  recordIndex.upsert(projectDoc);

  const app = new DomainManagerShellApp();
  app.setRoute({ domainUuid: "JournalEntry.domain-test-v4" });
  const context = await app._prepareContext();

  // Verificar descrição do projeto mapeada
  assert.equal(context.domainProjects.length, 1);
  assert.equal(context.domainProjects[0].description, "Escudo defletor de alta potência para defesa orbital.");

  // Verificar cálculo de agitação ponderada
  // (1000*6 + 200*0) / 1200 = 5 de agitação base. Com 10 guardas mitigando (10*0.2 = 2): 5 - 2 = 3 (30%)
  assert.equal(context.groups.length, 2);
  assert.equal(context.groups[0].sharePercent, 83); // 1000 / 1200 = 83%
  assert.equal(context.groups[1].sharePercent, 17); // 200 / 1200 = 17%
  assert.equal(context.metrics.unrestRiskPercent, 30);
  assert.equal(context.metrics.unrestRiskLevel, "moderate");

  // 4. Tags no contexto
  assert.deepEqual(context.selectedDomain.tags, ["capital", "mineracao"]);
});
