/**
 * DomainManagerShellApp — Aplicação Principal do Cockpit (ApplicationV2)
 *
 * Implementa interface de 3 níveis:
 * 1. Rail: Dock de navegação rápida e estados
 * 2. Sidebar: Explorador de domínios em árvore hierárquica e tags
 * 3. Workspace: Cockpit com cards, navegação em abas e modais in-page (Criação e Avanço de Tempo)
 */

import { MODULE_ID, MODULE_TITLE, RECORD_TYPES } from "../core/constants.js";
import { recordIndex } from "../data/record-index.js";
import { decodeRecord } from "../models/record-codec.js";
import { buildAncestorChain } from "../features/domains/hierarchy.js";
import { buildDomainLedger } from "../features/economy/ledger.js";
import { formatMinorUnits } from "../core/numbers.js";
import { isAuthorityReady } from "../authority/socket.js";
import { getTimekeepingStatus } from "../integration/timekeeping.js";
import { getResourceCatalogSetting } from "../core/settings.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export const SHELL_SECTIONS = Object.freeze({
  DASHBOARD: "dashboard",
  DOMAINS: "domains",
  ECONOMY: "economy",
  PROJECTS: "projects",
  SIMULATION: "simulation",
  ADVANCE: "advance",
  EVENTS: "events",
  HELP: "help"
});

export const VALID_SECTIONS = new Set(Object.values(SHELL_SECTIONS));

function listVisibleDomainRecords(user) {
  const documents = recordIndex.list(RECORD_TYPES.DOMAIN);
  return documents
    .map(decodeRecord)
    .filter((record) => {
      if (!record?.data) return false;
      if (user.isGM) return true;
      const controllers = record.data.governance?.controllers ?? [];
      const observers = record.data.governance?.observers ?? [];
      return controllers.includes(user.id) || observers.includes(user.id);
    });
}

function getVisibleDomainRecord(uuid, user) {
  const doc = recordIndex.get(RECORD_TYPES.DOMAIN, uuid);
  if (!doc) return null;
  const record = decodeRecord(doc);
  if (!record?.data) return null;
  if (user.isGM) return record;
  const controllers = record.data.governance?.controllers ?? [];
  const observers = record.data.governance?.observers ?? [];
  return (controllers.includes(user.id) || observers.includes(user.id)) ? record : null;
}

/**
 * Constrói nós hierárquicos aninhados calculando nós descendentes totais.
 */
function buildDomainTreeNodes(domains, parentUuid = null, currentSelectedUuid = null) {
  const nodes = [];
  const children = domains.filter((d) => {
    const p = d.data.hierarchy?.locatedInUuid || d.data.hierarchy?.administrativeParentUuid || null;
    return p === parentUuid;
  });

  for (const child of children) {
    const subChildren = buildDomainTreeNodes(domains, child.document.uuid, currentSelectedUuid);
    const totalDescendants = subChildren.reduce((acc, sub) => acc + 1 + (sub.descendantCount || 0), 0);

    nodes.push({
      uuid: child.document.uuid,
      name: child.document.name,
      icon: child.data.identity?.crestMedia?.path || "fa-solid fa-landmark",
      category: child.data.identity?.category || "territory",
      nature: child.data.identity?.nature || "physical",
      state: child.data.identity?.state || "active",
      isSelected: child.document.uuid === currentSelectedUuid,
      children: subChildren,
      hasChildren: subChildren.length > 0,
      childCount: totalDescendants,
      descendantCount: totalDescendants
    });
  }

  return nodes;
}

/**
 * Agrupa domínios por tags
 */
function buildDomainTagGroups(domains, currentSelectedUuid = null) {
  const map = new Map();

  for (const d of domains) {
    const tags = Array.isArray(d.data.identity?.tags) && d.data.identity.tags.length > 0
      ? d.data.identity.tags
      : ["Sem Tag"];

    for (const tag of tags) {
      if (!map.has(tag)) map.set(tag, []);
      map.get(tag).push({
        uuid: d.document.uuid,
        name: d.document.name,
        icon: d.data.identity?.crestMedia?.path || "fa-solid fa-landmark",
        isSelected: d.document.uuid === currentSelectedUuid
      });
    }
  }

  const groups = [];
  for (const [tag, items] of map.entries()) {
    groups.push({
      tag,
      count: items.length,
      items
    });
  }

  return groups.sort((a, b) => b.count - a.count);
}

export class DomainManagerShellApp extends HandlebarsApplicationMixin(ApplicationV2) {
  activeSection = SHELL_SECTIONS.DOMAINS;
  selectedDomainUuid = null;
  sidebarMode = "hierarchy"; // 'hierarchy' | 'tags'
  activeTab = "overview";    // 'overview' | 'economy' | 'projects' | 'people' | 'diplomacy' | 'intel' | 'history'
  searchQuery = "";
  selectedTag = null;
  isCreatingDomain = false;
  isAdvancingTimeModal = false;
  advanceCustomTicks = 1;

  static DEFAULT_OPTIONS = {
    id: "domain-manager-app",
    classes: ["domain-manager-shell-window"],

    position: {
      width: 1120,
      height: 700
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
      openCreateDomain: DomainManagerShellApp.#onOpenCreateDomain,
      cancelCreateDomain: DomainManagerShellApp.#onCancelCreateDomain,
      submitCreateDomain: DomainManagerShellApp.#onSubmitCreateDomain,
      openAdvanceModal: DomainManagerShellApp.#onOpenAdvanceModal,
      cancelAdvanceModal: DomainManagerShellApp.#onCancelAdvanceModal,
      quickAdvanceTicks: DomainManagerShellApp.#onQuickAdvanceTicks,
      submitAdvance: DomainManagerShellApp.#onSubmitAdvance,
      rollEvent: DomainManagerShellApp.#onRollEvent
    }
  };

  static PARTS = {
    main: {
      template: `modules/${MODULE_ID}/templates/app-shell.hbs`,
      scrollable: [".dm-tabs", ".dm-tab-panels", ".dm-sidebar__content"]
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
    if (!section) return;

    if (section === "dashboard") {
      this.activeSection = "dashboard";
      this.activeTab = "overview";
      this.isCreatingDomain = false;
      this.isAdvancingTimeModal = false;
    } else if (section === "domains") {
      this.activeSection = "domains";
      this.isCreatingDomain = false;
      this.isAdvancingTimeModal = false;
    } else if (section === "economy") {
      this.activeSection = "domains";
      this.activeTab = "economy";
      this.isCreatingDomain = false;
      this.isAdvancingTimeModal = false;
    } else if (section === "projects") {
      this.activeSection = "domains";
      this.activeTab = "projects";
      this.isCreatingDomain = false;
      this.isAdvancingTimeModal = false;
    } else if (section === "simulation") {
      DomainManagerShellApp.#onOpenAdvanceModal.call(this);
      return;
    } else if (section === "events") {
      DomainManagerShellApp.#onRollEvent.call(this);
      return;
    }

    this.render();
  }

  static #onSelectDomain(event, target) {
    const uuid = target.dataset.uuid;
    this.selectedDomainUuid = uuid || null;
    this.isCreatingDomain = false;
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

  static #onOpenCreateDomain() {
    if (!game.user.isGM) return;
    this.isCreatingDomain = true;
    this.isAdvancingTimeModal = false;
    this.render();
  }

  static #onCancelCreateDomain() {
    this.isCreatingDomain = false;
    this.render();
  }

  static async #onSubmitCreateDomain() {
    if (!game.user.isGM) return;
    const formElement = this.element?.querySelector(".dm-dialog-card");
    const nameInput = formElement?.querySelector("#dm-new-domain-name");
    const categorySelect = formElement?.querySelector("#dm-new-domain-category");
    const natureSelect = formElement?.querySelector("#dm-new-domain-nature");
    const parentSelect = formElement?.querySelector("#dm-new-domain-parent");

    const name = nameInput?.value?.trim() || "Nova Base";
    const category = categorySelect?.value || "settlement";
    const nature = natureSelect?.value || "physical";
    const parentUuid = parentSelect?.value || null;

    try {
      const { createDomainAction } = await import("../features/domains/actions.js");
      const doc = await createDomainAction({
        name,
        category,
        nature,
        locatedInUuid: parentUuid,
        administrativeParentUuid: parentUuid
      });
      if (doc?.uuid) {
        this.selectedDomainUuid = doc.uuid;
        this.isCreatingDomain = false;
        ui.notifications?.info(`Domínio "${name}" criado com sucesso!`);
        this.render();
      }
    } catch (err) {
      ui.notifications?.error(err.message || "Erro ao criar domínio.");
    }
  }

  static #onOpenAdvanceModal() {
    if (!game.user.isGM) return;
    this.isAdvancingTimeModal = true;
    this.isCreatingDomain = false;
    this.render();
  }

  static #onCancelAdvanceModal() {
    this.isAdvancingTimeModal = false;
    this.render();
  }

  static async #onQuickAdvanceTicks(event, target) {
    const ticks = Number(target.dataset.ticks) || 1;
    this.advanceCustomTicks = ticks;
    await DomainManagerShellApp.#onSubmitAdvance.call(this);
  }

  static async #onSubmitAdvance() {
    if (!game.user.isGM) return;
    const input = this.element?.querySelector("#dm-advance-ticks-input");
    const ticks = Math.max(1, Math.floor(Number(input ? input.value : this.advanceCustomTicks) || 1));
    this.isAdvancingTimeModal = false;

    try {
      const { executeAdvanceRun } = await import("../simulation/advance-run.js");
      await executeAdvanceRun({ deltaTicks: ticks });
      ui.notifications?.info(`Tempo avançado com sucesso: +${ticks} tick(s)!`);
      this.render();
    } catch (err) {
      ui.notifications?.error(err.message || "Erro ao avançar tempo.");
    }
  }

  static async #onRollEvent() {
    if (!game.user.isGM) {
      ui.notifications?.warn("Apenas o Mestre pode rolar eventos.");
      return;
    }
    if (!this.selectedDomainUuid) {
      ui.notifications?.warn("Selecione um domínio primeiro.");
      return;
    }
    try {
      const { executeRollAndApplyEvent } = await import("../features/events/actions.js");
      await executeRollAndApplyEvent({ domainUuid: this.selectedDomainUuid });
      ui.notifications?.info("Evento de domínio rolado e publicado no chat!");
      this.render();
    } catch (err) {
      ui.notifications?.error(err.message || "Erro ao rolar evento.");
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

    // Filtrar domínios pela busca
    let filteredDomains = domainRecords;
    if (this.searchQuery) {
      const query = this.searchQuery.toLowerCase();
      filteredDomains = filteredDomains.filter((d) =>
        d.document.name.toLowerCase().includes(query) ||
        (d.data.identity?.tags ?? []).some((t) => t.toLowerCase().includes(query))
      );
    }

    // 1. Árvore e Tags para a Sidebar
    const domainTree = buildDomainTreeNodes(filteredDomains, null, this.selectedDomainUuid);
    const tagGroups = buildDomainTagGroups(filteredDomains, this.selectedDomainUuid);

    // 2. Domínio Selecionado e Detalhes
    const selectedRecord = domainRecords.find((d) => d.document.uuid === this.selectedDomainUuid) || null;
    let selectedDomain = null;
    let breadcrumbs = [];
    let metrics = {
      treasuryTotal: "0",
      netRate: "+0 /tick",
      runway: "Estável",
      effectiveDefense: 0,
      guardCount: 0,
      populationTotal: 0,
      namedCharacters: 0,
      activeProjectsCount: 0,
      projectsProgressPercent: 0
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

    if (selectedRecord) {
      const data = selectedRecord.data;

      // Breadcrumbs
      const ancestors = buildAncestorChain({
        startUuid: selectedRecord.document.uuid,
        getParentUuid: (u) => {
          const r = getVisibleDomainRecord(u, game.user);
          return r?.data?.hierarchy?.locatedInUuid || r?.data?.hierarchy?.administrativeParentUuid || null;
        }
      });

      breadcrumbs = ancestors.slice(1).reverse().map((u) => {
        const r = getVisibleDomainRecord(u, game.user);
        return { uuid: u, name: r?.document?.name || "Território" };
      });

      // Ledgers e Economia
      const catalog = (typeof getResourceCatalogSetting === "function" ? getResourceCatalogSetting() : null) || { resources: [] };
      const ledger = buildDomainLedger({
        catalog,
        economy: data.economy,
        reservations: []
      });

      domainStocks = ledger.map((item) => {
        const res = catalog.resources?.find((r) => r.id === item.resourceId);
        return {
          ...item,
          name: res?.name || item.resourceId.toUpperCase(),
          amountFormatted: item.availableDisplay || item.stockDisplay || "0",
          availableFormatted: item.availableDisplay || "0",
          reservedFormatted: item.reservedDisplay || "0",
          netFlow: item.netPerTickDisplay || "+0",
          isPositive: item.netDirection !== "negative"
        };
      });

      if (domainStocks.length > 0) {
        const primary = domainStocks[0];
        metrics.primaryStockDisplay = primary.availableDisplay || primary.stockDisplay || "0";
        metrics.treasuryTotal = primary.availableDisplay || primary.stockDisplay || "0";
        metrics.netRateDisplay = primary.netPerTickDisplay || "0";
        metrics.netRate = primary.netPerTickDisplay || "+0 /tick";
        if (primary.runwayTicksFloor != null) {
          metrics.runway = `${primary.runwayTicksFloor} ticks`;
        }
      }

      domainFlows = (data.economy?.flows ?? []).map((f) => ({
        localId: f.localId,
        resourceId: f.resourceId,
        direction: f.direction === "inflow" ? "Entrada" : "Saída",
        isInflow: f.direction === "inflow",
        amountPerTickFormatted: formatMinorUnits((f.amountPerTick || 0) * 100, 2),
        period: f.period || "tick",
        category: f.category || "comércio"
      }));

      // Projetos
      const projectDocs = recordIndex.list(RECORD_TYPES.PROJECT);
      const allProjects = projectDocs.map(decodeRecord);
      const linkedProjects = allProjects.filter((p) => p.data.domainUuid === selectedRecord.document.uuid);
      domainProjects = linkedProjects.map((p) => {
        const req = p.data.work?.required || 100;
        const comp = p.data.work?.completed || 0;
        const pct = Math.min(100, Math.round((comp / req) * 100));
        return {
          uuid: p.document.uuid,
          name: p.document.name,
          category: p.data.category || "infraestrutura",
          status: p.data.status || "active",
          completed: comp,
          required: req,
          progressPercent: pct
        };
      });

      // Pessoal e Notáveis
      notables = (data.people?.notables ?? []).map((n) => ({
        localId: n.localId,
        name: n.name,
        role: n.role || "Conselheiro",
        title: n.title || "",
        avatarMedia: n.avatarMedia?.path || "fa-solid fa-user-tie",
        loyalty: n.loyalty || "Neutra",
        status: n.status || "active"
      }));

      groups = (data.people?.groups ?? []).map((g) => ({
        localId: g.localId,
        name: g.name,
        population: g.population || 0,
        unrestScore: g.unrestScore || 0,
        happiness: g.happiness || "Estável"
      }));

      // Diplomacia e Relações
      relations = (data.relations?.external ?? []).map((rel) => ({
        targetDomainUuid: rel.targetDomainUuid,
        posture: rel.posture || "neutral",
        reputationScore: rel.reputationScore || 0
      }));

      agreements = (data.agreements ?? []).map((agr) => ({
        localId: agr.localId,
        name: agr.name || "Pacto Bilateral",
        type: agr.type || "comercial",
        status: agr.status || "active",
        partnerUuid: agr.partnerUuid
      }));

      // Intel / Segredos
      intelList = (data.intel ?? []).map((it) => ({
        localId: it.localId,
        type: it.type || "rumor",
        title: it.title || "Informação Confidencial",
        summary: it.summary || "",
        credibility: it.credibility || "média",
        visibility: it.visibility || "gmOnly"
      }));

      // Condições e Histórico
      activeConditions = (data.conditions ?? []).filter((c) => c.active !== false).map((c) => ({
        localId: c.localId,
        name: c.name,
        description: c.description || "",
        severity: c.severity || "minor",
        durationTicks: c.durationTicks || "Permanente"
      }));

      fullHistory = (data.history ?? []).slice().reverse().map((h) => ({
        title: h.title,
        summary: h.summary,
        details: h.details,
        category: h.category || "crônica",
        timestamp: h.timestamp ? new Date(h.timestamp).toLocaleDateString("pt-BR") : "Recentemente"
      }));
      recentChronicles = fullHistory.slice(0, 3);

      // Métricas calculadas
      const popTotal = (data.people?.demographics?.totalPopulation) ?? (data.population?.directTotal || data.population?.total) ?? groups.reduce((acc, g) => acc + (g.population || 0), 0);
      const activeProj = domainProjects.filter((p) => p.status === "active");
      const avgProgress = activeProj.length > 0
        ? Math.round(activeProj.reduce((acc, p) => acc + p.progressPercent, 0) / activeProj.length)
        : 0;

      const defenseBase = data.security?.defenseScore || data.security?.defenseRating || 10;
      const guards = data.security?.guardCount || 0;
      const totalDef = defenseBase + Math.floor(guards * 1.5);

      metrics = {
        ...metrics,
        effectiveDefense: totalDef,
        defenseRating: totalDef,
        guardCount: guards,
        populationTotal: popTotal,
        namedCharacters: notables.length,
        activeProjectsCount: activeProj.length,
        projectsProgressPercent: avgProgress
      };

      selectedDomain = {
        uuid: selectedRecord.document.uuid,
        name: selectedRecord.document.name,
        category: data.identity?.category || "territory",
        nature: data.identity?.nature || "physical",
        state: data.identity?.state || "active",
        crest: data.identity?.crestMedia?.path || "fa-solid fa-landmark",
        tags: data.identity?.tags || [],
        description: data.identity?.description || "Sem descrição registrada."
      };
    }

    const availableParentDomains = domainRecords.map((d) => ({
      uuid: d.document.uuid,
      name: d.document.name,
      isSelected: d.document.uuid === this.selectedDomainUuid
    }));

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
      isCreatingDomain: this.isCreatingDomain,
      isAdvancingTimeModal: this.isAdvancingTimeModal,
      advanceCustomTicks: this.advanceCustomTicks,
      availableParentDomains,
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
      timekeeping: getTimekeepingStatus ? getTimekeepingStatus() : { tickDurationLabel: "1 dia / tick" },
      counts: {
        domains: recordIndex.count(RECORD_TYPES.DOMAIN),
        projects: recordIndex.count(RECORD_TYPES.PROJECT),
        missions: recordIndex.count(RECORD_TYPES.MISSION),
        requests: recordIndex.count(RECORD_TYPES.REQUEST)
      }
    };
  }
}
