import {
  MODULE_ID,
  MODULE_TITLE,
  RECORD_TYPES
} from "../core/constants.js";
import { isAuthorityReady } from "../authority/socket.js";
import { recordIndex } from "../data/record-index.js";
import {
  listVisibleDomainRecords,
  getVisibleDomainRecord
} from "../features/domains/selectors.js";
import { buildAncestorChain } from "../features/domains/hierarchy.js";
import { buildDomainLedger } from "../features/economy/ledger.js";
import { getResourceCatalogSetting } from "../core/settings.js";

const { ApplicationV2, HandlebarsApplicationMixin } =
  foundry.applications.api;

export const SHELL_SECTIONS = Object.freeze({
  HOME: "home",
  DASHBOARD: "dashboard",
  DOMAINS: "domains",
  ECONOMY: "economy",
  REQUESTS: "requests",
  PROJECTS: "projects",
  MISSIONS: "missions",
  SIMULATION: "simulation",
  ADVANCE: "advance",
  EVENTS: "events",
  HELP: "help"
});

const VALID_SECTIONS = new Set(Object.values(SHELL_SECTIONS));

/**
 * Constrói a árvore de domínios hierárquica (Macro -> Micro).
 */
function buildDomainTreeNodes(domainRecords, selectedUuid, searchQuery = "") {
  const query = String(searchQuery || "").trim().toLowerCase();
  const domainMap = new Map();
  const childMap = new Map();

  for (const record of domainRecords) {
    const doc = record.document;
    const data = record.data;
    const uuid = doc.uuid;

    const parentUuid = data.hierarchy?.locatedInUuid
      || data.hierarchy?.administrativeParentUuid
      || null;

    domainMap.set(uuid, {
      uuid,
      name: doc.name,
      parentUuid,
      nature: data.identity?.nature || "physical",
      state: data.identity?.state || "active",
      tags: data.identity?.tags || [],
      icon: getDomainIcon(data.identity?.nature),
      isSelected: uuid === selectedUuid,
      childCount: 0,
      children: []
    });

    if (!childMap.has(parentUuid)) {
      childMap.set(parentUuid, []);
    }
    childMap.get(parentUuid).push(uuid);
  }

  // Anexa filhos
  for (const [parentUuid, childUuids] of childMap.entries()) {
    if (parentUuid && domainMap.has(parentUuid)) {
      const parentNode = domainMap.get(parentUuid);
      for (const childUuid of childUuids) {
        if (domainMap.has(childUuid)) {
          parentNode.children.push(domainMap.get(childUuid));
        }
      }
    }
  }

  // Calcula contagem recursiva de filhos
  function countDescendants(node) {
    let count = node.children.length;
    for (const child of node.children) {
      count += countDescendants(child);
    }
    node.childCount = count;
    return count;
  }

  // Raízes: nós cujo parentUuid é nulo ou não pertence ao conjunto de domínios
  const roots = [];
  for (const node of domainMap.values()) {
    if (!node.parentUuid || !domainMap.has(node.parentUuid)) {
      countDescendants(node);
      roots.push(node);
    }
  }

  // Se houver busca, filtra mantendo ancestrais dos nós coincidentes
  if (query) {
    function filterNode(node) {
      const matches = node.name.toLowerCase().includes(query)
        || node.tags.some((t) => t.toLowerCase().includes(query));

      const filteredChildren = [];
      for (const child of node.children) {
        const matchingChild = filterNode(child);
        if (matchingChild) filteredChildren.push(matchingChild);
      }

      if (matches || filteredChildren.length > 0) {
        return {
          ...node,
          children: filteredChildren
        };
      }
      return null;
    }

    return roots.map(filterNode).filter(Boolean);
  }

  return roots;
}

function getDomainIcon(nature) {
  switch (nature) {
    case "organization":
      return "fa-solid fa-users-gear";
    case "hybrid":
      return "fa-solid fa-monument";
    case "abstract":
      return "fa-solid fa-circle-nodes";
    case "physical":
    default:
      return "fa-solid fa-landmark";
  }
}

/**
 * Shell Cockpit da Interface do Domain Manager.
 * Organizado em 3 níveis: Rail + Sidebar Explorer + Canvas Central.
 */
export class DomainManagerShellApp extends
  HandlebarsApplicationMixin(ApplicationV2) {

  activeSection = SHELL_SECTIONS.DOMAINS;
  selectedDomainUuid = null;
  sidebarMode = "hierarchy"; // 'hierarchy' | 'tags'
  activeTab = "overview";    // 'overview' | 'economy' | 'projects' | 'people' | 'diplomacy' | 'intel' | 'history'
  searchQuery = "";
  selectedTag = null;

  static DEFAULT_OPTIONS = {
    id: "domain-manager-app",
    classes: ["domain-manager-shell-window"],

    position: {
      width: 720,
      height: 520
    },

    window: {
      title: MODULE_TITLE,
      icon: "fa-solid fa-sitemap",
      resizable: true
    },

    actions: {
      navigate: DomainManagerShellApp.#onNavigate,
      selectDomain: DomainManagerShellApp.#onSelectDomain,
      setSidebarMode: DomainManagerShellApp.#onSetSidebarMode,
      switchTab: DomainManagerShellApp.#onSwitchTab,
      filterByTag: DomainManagerShellApp.#onFilterByTag,
      search: DomainManagerShellApp.#onSearch,
      createDomain: DomainManagerShellApp.#onCreateDomain,
      advanceTime: DomainManagerShellApp.#onAdvanceTime,
      rollEvent: DomainManagerShellApp.#onRollEvent
    }
  };

  static PARTS = {
    main: {
      template: `modules/${MODULE_ID}/templates/app-shell.hbs`,
      templates: [
        `modules/${MODULE_ID}/templates/parts/rail.hbs`,
        `modules/${MODULE_ID}/templates/parts/sidebar.hbs`,
        `modules/${MODULE_ID}/templates/parts/workspace-header.hbs`,
        `modules/${MODULE_ID}/templates/parts/overview-cards.hbs`,
        `modules/${MODULE_ID}/templates/parts/workspace-content.hbs`,
        `modules/${MODULE_ID}/templates/parts/footer.hbs`
      ]
    }
  };

  setRoute({ section = null, domainUuid = undefined } = {}) {
    if (section && VALID_SECTIONS.has(section)) {
      this.activeSection = section;
    }

    if (domainUuid !== undefined) {
      this.selectedDomainUuid = domainUuid || null;
    }

    return this;
  }

  /* ------------------------------------------------------------------------
     Actions Handlers (Click and UI interactions)
     ------------------------------------------------------------------------ */
  static #onNavigate(event, target) {
    const section = target.dataset.section;
    if (section && VALID_SECTIONS.has(section)) {
      this.activeSection = section;
      this.render();
    }
  }

  static #onSelectDomain(event, target) {
    const uuid = target.dataset.uuid;
    this.selectedDomainUuid = uuid || null;
    this.render();
  }

  static #onSetSidebarMode(event, target) {
    const mode = target.dataset.mode;
    if (mode === "hierarchy" || mode === "tags") {
      this.sidebarMode = mode;
      this.render();
    }
  }

  static #onSwitchTab(event, target) {
    const tab = target.dataset.tab;
    if (tab) {
      this.activeTab = tab;
      this.render();
    }
  }

  static #onFilterByTag(event, target) {
    const tag = target.dataset.tag;
    this.selectedTag = this.selectedTag === tag ? null : tag;
    this.render();
  }

  static #onSearch(event, target) {
    this.searchQuery = target.value || "";
    this.render();
  }

  static async #onCreateDomain() {
    if (!game.user.isGM) return;
    try {
      const { createDomainAction } = await import("../features/domains/actions.js");
      const doc = await createDomainAction({ name: "Nova Base Territorial" });
      if (doc?.uuid) {
        this.selectedDomainUuid = doc.uuid;
        this.render();
      }
    } catch (err) {
      ui.notifications?.error(err.message);
    }
  }

  static async #onAdvanceTime() {
    if (!game.user.isGM) return;
    try {
      const { executeAdvanceRun } = await import("../simulation/advance-run.js");
      await executeAdvanceRun({ deltaTicks: 1 });
      this.render();
    } catch (err) {
      ui.notifications?.error(err.message);
    }
  }

  static async #onRollEvent() {
    if (!this.selectedDomainUuid) return;
    try {
      const { executeRollAndApplyEvent } = await import("../features/events/actions.js");
      await executeRollAndApplyEvent({ domainUuid: this.selectedDomainUuid });
      this.render();
    } catch (err) {
      ui.notifications?.error(err.message);
    }
  }

  /* ------------------------------------------------------------------------
     Context Preparation
     ------------------------------------------------------------------------ */
  async _prepareContext(options) {
    const context = typeof super._prepareContext === "function"
      ? await super._prepareContext(options)
      : {};

    const domainRecords = listVisibleDomainRecords(game.user);

    // Auto-seleção do primeiro domínio se nenhum estiver selecionado
    if (!this.selectedDomainUuid && domainRecords.length > 0) {
      this.selectedDomainUuid = domainRecords[0].document.uuid;
    }

    const domainTree = buildDomainTreeNodes(
      domainRecords,
      this.selectedDomainUuid,
      this.searchQuery
    );

    // Agrupamento de tags
    const tagMap = new Map();
    for (const record of domainRecords) {
      for (const tag of record.data.identity?.tags || []) {
        tagMap.set(tag, (tagMap.get(tag) || 0) + 1);
      }
    }
    const tagGroups = Array.from(tagMap.entries()).map(([tag, count]) => ({
      tag,
      count,
      isSelected: this.selectedTag === tag
    }));

    // Domínio selecionado
    let selectedDomain = null;
    let breadcrumbs = [];
    let metrics = {
      primaryStockDisplay: "0",
      netRateDisplay: "0",
      netDirection: "zero",
      runwayDisplay: "",
      defenseRating: 0,
      guardCount: 0,
      unrestRiskPercent: 0,
      unrestRiskLevel: "low",
      populationTotal: 0,
      groupCount: 0,
      notableCount: 0,
      activeProjectsCount: 0,
      averageProjectProgress: 0
    };

    let domainStocks = [];
    let domainFlows = [];
    let domainProjects = [];
    let notables = [];
    let groups = [];
    let relations = [];
    let agreements = [];
    let intelList = [];
    let activeConditions = [];
    let recentChronicles = [];
    let fullHistory = [];

    if (this.selectedDomainUuid) {
      const selectedRecord = getVisibleDomainRecord(this.selectedDomainUuid, game.user);
      if (selectedRecord) {
        const doc = selectedRecord.document;
        const data = selectedRecord.data;

        selectedDomain = {
          uuid: doc.uuid,
          name: doc.name,
          description: doc.pages?.contents?.[0]?.text?.content || "",
          visuals: data.visuals || {},
          identity: data.identity || {},
          governance: data.governance || {}
        };

        // Breadcrumbs
        const ancestors = buildAncestorChain({
          startUuid: this.selectedDomainUuid,
          getParentUuid: (u) => {
            const r = getVisibleDomainRecord(u, game.user);
            return r?.data?.hierarchy?.locatedInUuid || r?.data?.hierarchy?.administrativeParentUuid || null;
          }
        });

        breadcrumbs = ancestors.slice(1).reverse().map((u) => {
          const r = getVisibleDomainRecord(u, game.user);
          return { uuid: u, name: r?.document?.name || "Território" };
        });

        // Economia & Livro-Razão
        const catalog = getResourceCatalogSetting() || { resources: [] };
        const ledger = buildDomainLedger({
          catalog,
          economy: data.economy,
          reservations: []
        });

        domainStocks = ledger.map((item) => {
          const res = catalog.resources?.find((r) => r.id === item.resourceId);
          return {
            ...item,
            name: res?.name || item.resourceId
          };
        });

        domainFlows = (data.economy?.flows || []).map((flow) => {
          const res = catalog.resources?.find((r) => r.id === flow.resourceId);
          return {
            ...flow,
            resourceName: res?.name || flow.resourceId,
            displayAmount: flow.amount
          };
        });

        if (domainStocks.length > 0) {
          const primary = domainStocks[0];
          metrics.primaryStockDisplay = primary.availableDisplay || primary.stockDisplay || "0";
          metrics.netRateDisplay = primary.netPerTickDisplay || "0";
          metrics.netDirection = primary.netDirection || "zero";
          if (primary.runwayTicksFloor != null) {
            metrics.runwayDisplay = `${primary.runwayTicksFloor} ticks`;
          }
        }

        // Segurança & População
        const def = data.security?.defenseRating || 10;
        const guards = data.security?.guardCount || 0;
        metrics.defenseRating = def + Math.floor(guards * 1.5);
        metrics.guardCount = guards;
        metrics.populationTotal = data.population?.directTotal || data.population?.total || 0;
        metrics.groupCount = (data.population?.groups || []).length;
        metrics.notableCount = (data.population?.notables || []).length;

        // Obras e Projetos associados
        const projectDocs = recordIndex.list(RECORD_TYPES.PROJECT)
          .filter((p) => p.flags?.["domain-manager"]?.data?.domainUuid === doc.uuid);

        domainProjects = projectDocs.map((p) => {
          const pData = p.flags["domain-manager"].data;
          const req = pData.work?.required || 100;
          const comp = pData.work?.completed || 0;
          const pct = Math.min(100, Math.floor((comp / req) * 100));
          return {
            uuid: p.uuid,
            name: p.name,
            status: pData.status || "active",
            description: pData.description || "",
            work: { completed: comp, required: req },
            progressPercent: pct,
            costs: pData.costs || []
          };
        });

        metrics.activeProjectsCount = domainProjects.filter((p) => p.status === "active").length;
        if (domainProjects.length > 0) {
          const totalPct = domainProjects.reduce((acc, p) => acc + p.progressPercent, 0);
          metrics.averageProjectProgress = Math.floor(totalPct / domainProjects.length);
        }

        // População, Diplomacia, Segredos, Crônicas
        notables = data.population?.notables || [];
        groups = data.population?.groups || [];
        relations = (data.relations || []).map((rel) => {
          const targetDoc = recordIndex.get(RECORD_TYPES.DOMAIN, rel.targetDomainUuid);
          return {
            ...rel,
            targetDomainName: targetDoc?.name || "Domínio Externo",
            postureLabel: rel.posture
          };
        });
        agreements = (data.agreements || []).map((agr) => {
          const targetDoc = recordIndex.get(RECORD_TYPES.DOMAIN, agr.targetDomainUuid);
          return {
            ...agr,
            targetDomainName: targetDoc?.name || "Domínio Externo"
          };
        });
        intelList = data.intel || [];
        activeConditions = (data.conditions || []).filter((c) => c.active !== false);

        fullHistory = (data.history || []).slice().reverse();
        recentChronicles = fullHistory.slice(0, 5);
      }
    }

    return {
      ...context,
      moduleTitle: MODULE_TITLE,
      foundryVersion: game.version,
      userName: game.user.name,
      isGM: game.user.isGM,
      authorityReady: isAuthorityReady(),
      activeSection: this.activeSection,
      selectedDomainUuid: this.selectedDomainUuid,
      sidebarMode: this.sidebarMode,
      activeTab: this.activeTab,
      searchQuery: this.searchQuery,
      selectedTag: this.selectedTag,
      domainTree,
      tagGroups,
      selectedDomain,
      breadcrumbs,
      metrics,
      domainStocks,
      domainFlows,
      domainProjects,
      notables,
      groups,
      relations,
      agreements,
      intelList,
      activeConditions,
      recentChronicles,
      fullHistory,
      timekeeping: {
        tickDurationLabel: "1 dia / tick"
      },
      counts: {
        domains: recordIndex.count(RECORD_TYPES.DOMAIN),
        projects: recordIndex.count(RECORD_TYPES.PROJECT),
        missions: recordIndex.count(RECORD_TYPES.MISSION),
        requests: recordIndex.count(RECORD_TYPES.REQUEST)
      }
    };
  }
}
