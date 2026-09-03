
function getActionAttr(target, name) {
  if (!target) return null;
  const camelName = name.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
  if (target.dataset && target.dataset[camelName] != null) return target.dataset[camelName];
  const attr = target.getAttribute?.(`data-${name}`);
  if (attr != null) return attr;
  const closest = target.closest?.(`[data-${name}]`);
  return closest?.getAttribute?.(`data-${name}`) ?? null;
}

function bindLiveImagePreview(element, prefix, previewImgId, previewContainerId, urlInputSelector) {
  const img = element?.querySelector(previewImgId);
  const container = element?.querySelector(previewContainerId);
  if (!img || !container) return;

  const urlInput = urlInputSelector ? element.querySelector(urlInputSelector) : null;

  const update = () => {
    // Atualizar URL na prévia
    if (urlInput) {
      const url = urlInput.value?.trim() || "";
      if (url) {
        img.src = url;
        img.style.display = "block";
      } else {
        img.style.display = "none";
      }
    } else if (img.getAttribute("src")) {
      img.style.display = "block";
    }

    img.onerror = () => {
      img.style.display = "none";
    };
    img.onload = () => {
      img.style.display = "block";
    };

    const fit = element.querySelector(`${prefix}-fit`)?.value || "cover";
    const height = element.querySelector(`${prefix}-height`)?.value || "180";
    const posX = element.querySelector(`${prefix}-pos-x`)?.value ?? "50";
    const posY = element.querySelector(`${prefix}-pos-y`)?.value ?? "50";
    const zoom = element.querySelector(`${prefix}-zoom`)?.value ?? "100";
    const scale = Number(zoom) / 100;

    const valX = element.querySelector(`${prefix}-val-x`);
    const valY = element.querySelector(`${prefix}-val-y`);
    const valZoom = element.querySelector(`${prefix}-val-zoom`);
    if (valX) valX.textContent = `${posX}%`;
    if (valY) valY.textContent = `${posY}%`;
    if (valZoom) valZoom.textContent = `${zoom}%`;

    if (container.classList.contains("dm-image-preview-portrait")) {
      const shape = element.querySelector(`${prefix}-shape`)?.value || "square";
      if (shape === "portrait") {
        container.style.width = "72px";
        container.style.height = "96px";
      } else if (shape === "wide") {
        container.style.width = "96px";
        container.style.height = "96px";
      } else {
        container.style.width = "72px";
        container.style.height = "72px";
      }
    } else {
      container.style.height = `${Math.min(160, Math.round(Number(height) * 0.75))}px`;
    }

    img.style.objectFit = fit;
    img.style.objectPosition = `${posX}% ${posY}%`;
    img.style.transform = `scale(${scale})`;
  };

  const selectors = [`${prefix}-fit`, `${prefix}-height`, `${prefix}-shape`, `${prefix}-pos-x`, `${prefix}-pos-y`, `${prefix}-zoom`];
  for (const sel of selectors) {
    const el = element.querySelector(sel);
    if (el) {
      el.addEventListener("input", update);
      el.addEventListener("change", update);
    }
  }

  if (urlInput) {
    urlInput.addEventListener("input", update);
    urlInput.addEventListener("change", update);
    urlInput.addEventListener("paste", () => setTimeout(update, 10));
  }

  update();
}

import { calculateDomainUpkeep } from "../features/economy/upkeep.js";
/**
 * DomainManagerShellApp — Aplicação Principal do Cockpit (ApplicationV2)
 *
 * Versão v6:
 * 1. 100% em Português: Dicionário completo de categorias, naturezas, status e enums.
 * 2. Donos do Domínio: Seleção de jogadores (controllers) na criação e edição.
 * 3. Imagens / GIFs: Suporte a URLs e FilePicker nativo do Foundry para Notáveis, Brasões e Projetos.
 * 4. Projetos com Tiers e Modificadores: Edição de obras, evolução para próximos tiers e aplicação de bônus na conclusão.
 * 5. Sidebar e Pastas: Linha única com chevrons centralizados e remoção do botão quebrador do header.
 * 6. Tags: Adição de tags exclusivamente na aba de Tags.
 * 7. Rodapé GM Only: Oculta termos técnicos de autoridade/sincronia para jogadores comuns.
 */

import { MODULE_ID, MODULE_TITLE, RECORD_TYPES } from "../core/constants.js";
import { recordIndex } from "../data/record-index.js";
import { decodeRecord } from "../models/record-codec.js";
import { updateRecord } from "../data/journal-store.js";
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

export const LABELS_PTBR = Object.freeze({
  categories: {
    settlement: "Assentamento",
    territory: "Território",
    outpost: "Posto Avançado",
    planet: "Planeta",
    galaxy: "Galáxia",
    system: "Sistema Estelar",
    fleet: "Frota",
    base: "Base Operacional",
    city: "Cidade",
    fortress: "Fortaleza",
    kingdom: "Reino",
    province: "Província",
    station: "Estação Espacial",
    infraestrutura: "Infraestrutura",
    comércio: "Comércio",
    mineração: "Mineração",
    militar: "Militar",
    defesa: "Defesa",
    pesquisa: "Pesquisa & Ciência",
    monumento: "Monumento",
    social: "Social & Cultural"
  },
  natures: {
    physical: "Físico / Territorial",
    organization: "Organização / Guilda",
    hybrid: "Híbrido",
    abstract: "Esfera Abstrata"
  },
  states: {
    active: "Ativo",
    inactive: "Inativo",
    lost: "Perdido",
    destroyed: "Destruído",
    archived: "Arquivado"
  },
  projectStatuses: {
    planned: "Planejado",
    active: "Em Construção",
    paused: "Pausado",
    blocked: "Bloqueado",
    completed: "Concluído",
    cancelled: "Cancelado"
  },
  directions: {
    inflow: "Entrada",
    outflow: "Saída"
  },
  postures: {
    allied: "Aliança",
    friendly: "Amigável",
    neutral: "Neutro",
    tense: "Tenso",
    hostile: "Hostil",
    at_war: "Em Guerra"
  },
  intelCategories: {
    secret: "Segredo Confidencial",
    rumor: "Boato / Rumor",
    fact: "Fato Comprovado",
    clue: "Pista de Investigação",
    lore: "História / Tradição"
  },
  intelCredibility: {
    confirmed: "Confirmada",
    likely: "Provável",
    doubtful: "Duvidosa",
    false: "Falsa / Boato"
  },
  intelVisibility: {
    gm_only: "Apenas o Mestre",
    all_controllers: "Controladores",
    public: "Público"
  },
  peopleStatuses: {
    active: "Ativo",
    away: "Ausente",
    unavailable: "Indisponível",
    missing: "Desaparecido",
    dead: "Falecido",
    retired: "Aposentado"
  }
});

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

function isImageSource(src) {
  if (!src || typeof src !== "string") return false;
  const trimmed = src.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("//")) return true;
  if (trimmed.startsWith("data:image/")) return true;
  if (/\.(png|jpe?g|webp|gif|svg|avif|bmp)(\?.*)?$/i.test(trimmed)) return true;
  if (trimmed.includes("/") || trimmed.includes("\\")) return true;
  return false;
}

function buildDomainTreeNodes(domains, parentUuid = null, currentSelectedUuid = null, visited = new Set()) {
  const nodes = [];
  const children = domains.filter((d) => {
    let p = d.data.hierarchy?.locatedInUuid || d.data.hierarchy?.administrativeParentUuid || null;
    if (p === d.document.uuid) p = null; // Auto-curar ciclo onde a base é seu próprio pai
    return p === parentUuid;
  });

  for (const child of children) {
    if (visited.has(child.document.uuid)) continue;
    visited.add(child.document.uuid);
    const subChildren = buildDomainTreeNodes(domains, child.document.uuid, currentSelectedUuid, new Set(visited));
    const totalDescendants = subChildren.reduce((acc, sub) => acc + 1 + (sub.descendantCount || 0), 0);
    const crestPath = child.data.identity?.crestMedia?.path || child.data.visuals?.crestImg || "fa-solid fa-landmark";

    nodes.push({
      uuid: child.document.uuid,
      name: child.document.name,
      icon: crestPath,
      isImageCrest: isImageSource(crestPath),
      category: child.data.identity?.category || "territory",
      categoryLabel: LABELS_PTBR.categories[child.data.identity?.category] || child.data.identity?.category || "Território",
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

function flattenDomainTree(nodes, depth = 0, collapsedUuids = new Set()) {
  const flat = [];
  for (const node of nodes) {
    const isCollapsed = collapsedUuids.has(node.uuid);
    flat.push({
      ...node,
      depth,
      indentPx: depth * 16,
      isRoot: depth === 0,
      isCollapsed,
      isExpanded: !isCollapsed
    });
    if (node.children && node.children.length > 0 && !isCollapsed) {
      flat.push(...flattenDomainTree(node.children, depth + 1, collapsedUuids));
    }
  }
  return flat;
}

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
  sidebarMode = "hierarchy";
  activeTab = "overview";
  searchQuery = "";
  selectedTag = null;
  isSidebarOpen = true;
  collapsedFolderUuids = new Set();

  // Modais de Criação / Edição / Confirmação
  isCreatingDomain = false;
  isEditingDomain = false;
  isDeletingDomain = false;
  isAdvancingTimeModal = false;
  isEventModalOpen = false;
  advanceCustomTicks = 1;

  // Modais de Tópicos Sensíveis
  isStockModalOpen = false;
  isFlowModalOpen = false;
  isProjectModalOpen = false;
  isEditingProjectModal = false;
  editingProjectUuid = null;

  // Notáveis
  isNotableModalOpen = false;
  isEditingNotableModal = false;
  editingNotableLocalId = null;

  // Grupos Populacionais
  isGroupModalOpen = false;
  isEditingGroupModal = false;
  editingGroupLocalId = null;

  // Relações Diplomáticas
  isRelationModalOpen = false;
  isEditingRelationModal = false;
  editingRelationTargetUuid = null;

  // Segredos / Informações
  isIntelModalOpen = false;
  isEditingIntelModal = false;
  editingIntelLocalId = null;

  // Crônicas / Histórico
  isHistoryModalOpen = false;
  isEditingHistoryModal = false;
  editingHistoryIndex = null;

  // Sustento Populacional e Despesas Gerais
  isUpkeepModalOpen = false;

  // Edição de Estoques e Fluxos
  isEditingStockModal = false;
  editingStockResourceId = null;
  isEditingFlowModal = false;
  editingFlowLocalId = null;

  // Galeria de Imagens da Base
  activeGalleryImage = null;

  isTagModalOpen = false;
  isNotificationModalOpen = false;
  showNotificationsHistory = false;
  activeNotableDossierLocalId = null;
  selectedDossierSkillId = null;
  isEditingNotableStatsModal = false;

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
      toggleSidebar: DomainManagerShellApp.#onToggleSidebar,
      toggleFolder: DomainManagerShellApp.#onToggleFolder,
      toggleAllFolders: DomainManagerShellApp.#onToggleAllFolders,
      setSidebarMode: DomainManagerShellApp.#onSetSidebarMode,
      switchTab: DomainManagerShellApp.#onSwitchTab,
      filterByTag: DomainManagerShellApp.#onFilterByTag,
      search: DomainManagerShellApp.#onSearch,
      openFilePicker: DomainManagerShellApp.#onOpenFilePicker,

      // Tags (Edição e Remoção)
      removeTag: DomainManagerShellApp.#onRemoveTag,
      openAddTagModal: DomainManagerShellApp.#onOpenAddTagModal,
      cancelTagModal: DomainManagerShellApp.#onCancelTagModal,
      submitAddTag: DomainManagerShellApp.#onSubmitAddTag,

      // Domínios (CRUD)
      openCreateDomain: DomainManagerShellApp.#onOpenCreateDomain,
      cancelCreateDomain: DomainManagerShellApp.#onCancelCreateDomain,
      submitCreateDomain: DomainManagerShellApp.#onSubmitCreateDomain,
      openEditDomain: DomainManagerShellApp.#onOpenEditDomain,
      cancelEditDomain: DomainManagerShellApp.#onCancelEditDomain,
      submitEditDomain: DomainManagerShellApp.#onSubmitEditDomain,
      openDeleteDomainModal: DomainManagerShellApp.#onOpenDeleteDomainModal,
      cancelDeleteDomainModal: DomainManagerShellApp.#onCancelDeleteDomainModal,
      confirmDeleteDomain: DomainManagerShellApp.#onConfirmDeleteDomain,

      // Simulação e Eventos (GM Only)
      openAdvanceModal: DomainManagerShellApp.#onOpenAdvanceModal,
      cancelAdvanceModal: DomainManagerShellApp.#onCancelAdvanceModal,
      quickAdvanceTicks: DomainManagerShellApp.#onQuickAdvanceTicks,
      submitAdvance: DomainManagerShellApp.#onSubmitAdvance,
      openEventModal: DomainManagerShellApp.#onOpenEventModal,
      cancelEventModal: DomainManagerShellApp.#onCancelEventModal,
      submitCustomRollEvent: DomainManagerShellApp.#onSubmitCustomRollEvent,
      submitAuthorEvent: DomainManagerShellApp.#onSubmitAuthorEvent,
      rollEvent: DomainManagerShellApp.#onOpenEventModal,

      // Sustento da População & Gastos Gerais (Configuração GM)
      openUpkeepModal: DomainManagerShellApp.#onOpenUpkeepModal,
      cancelUpkeepModal: DomainManagerShellApp.#onCancelUpkeepModal,
      submitUpkeep: DomainManagerShellApp.#onSubmitUpkeep,

      // Estoques (CRUD Completo com Edição)
      openAddStockModal: DomainManagerShellApp.#onOpenAddStockModal,
      cancelStockModal: DomainManagerShellApp.#onCancelStockModal,
      submitStock: DomainManagerShellApp.#onSubmitStock,
      openEditStockModal: DomainManagerShellApp.#onOpenEditStockModal,
      cancelEditStockModal: DomainManagerShellApp.#onCancelEditStockModal,
      submitEditStock: DomainManagerShellApp.#onSubmitEditStock,
      deleteStock: DomainManagerShellApp.#onDeleteStock,

      // Fluxos (CRUD Completo com Edição)
      openAddFlowModal: DomainManagerShellApp.#onOpenAddFlowModal,
      cancelFlowModal: DomainManagerShellApp.#onCancelFlowModal,
      submitFlow: DomainManagerShellApp.#onSubmitFlow,
      openEditFlowModal: DomainManagerShellApp.#onOpenEditFlowModal,
      cancelEditFlowModal: DomainManagerShellApp.#onCancelEditFlowModal,
      submitEditFlow: DomainManagerShellApp.#onSubmitEditFlow,
      deleteFlow: DomainManagerShellApp.#onDeleteFlow,

      // Projetos (CRUD + Edição + Evolução)
      openAddProjectModal: DomainManagerShellApp.#onOpenAddProjectModal,
      cancelProjectModal: DomainManagerShellApp.#onCancelProjectModal,
      submitProject: DomainManagerShellApp.#onSubmitProject,
      openEditProjectModal: DomainManagerShellApp.#onOpenEditProjectModal,
      cancelEditProjectModal: DomainManagerShellApp.#onCancelEditProjectModal,
      submitEditProject: DomainManagerShellApp.#onSubmitEditProject,
      evolveProject: DomainManagerShellApp.#onEvolveProject,
      deleteProject: DomainManagerShellApp.#onDeleteProject,

      // População & Notáveis (CRUD Completo com Edição)
      openAddNotableModal: DomainManagerShellApp.#onOpenAddNotableModal,
      cancelNotableModal: DomainManagerShellApp.#onCancelNotableModal,
      submitNotable: DomainManagerShellApp.#onSubmitNotable,
      openEditNotableModal: DomainManagerShellApp.#onOpenEditNotableModal,
      cancelEditNotableModal: DomainManagerShellApp.#onCancelEditNotableModal,
      submitEditNotable: DomainManagerShellApp.#onSubmitEditNotable,
      deleteNotable: DomainManagerShellApp.#onDeleteNotable,

      openAddGroupModal: DomainManagerShellApp.#onOpenAddGroupModal,
      cancelGroupModal: DomainManagerShellApp.#onCancelGroupModal,
      submitGroup: DomainManagerShellApp.#onSubmitGroup,
      openEditGroupModal: DomainManagerShellApp.#onOpenEditGroupModal,
      cancelEditGroupModal: DomainManagerShellApp.#onCancelEditGroupModal,
      submitEditGroup: DomainManagerShellApp.#onSubmitEditGroup,
      deleteGroup: DomainManagerShellApp.#onDeleteGroup,

      // Diplomacia (CRUD Completo com Edição)
      openAddRelationModal: DomainManagerShellApp.#onOpenAddRelationModal,
      cancelRelationModal: DomainManagerShellApp.#onCancelRelationModal,
      submitRelation: DomainManagerShellApp.#onSubmitRelation,
      openEditRelationModal: DomainManagerShellApp.#onOpenEditRelationModal,
      cancelEditRelationModal: DomainManagerShellApp.#onCancelEditRelationModal,
      submitEditRelation: DomainManagerShellApp.#onSubmitEditRelation,
      deleteRelation: DomainManagerShellApp.#onDeleteRelation,

      // Intel (CRUD Completo com Edição)
      openAddIntelModal: DomainManagerShellApp.#onOpenAddIntelModal,
      cancelIntelModal: DomainManagerShellApp.#onCancelIntelModal,
      submitIntel: DomainManagerShellApp.#onSubmitIntel,
      openEditIntelModal: DomainManagerShellApp.#onOpenEditIntelModal,
      cancelEditIntelModal: DomainManagerShellApp.#onCancelEditIntelModal,
      submitEditIntel: DomainManagerShellApp.#onSubmitEditIntel,
      deleteIntel: DomainManagerShellApp.#onDeleteIntel,

      // Histórico / Crônicas (CRUD Completo com Edição)
      openAddHistoryModal: DomainManagerShellApp.#onOpenAddHistoryModal,
      cancelHistoryModal: DomainManagerShellApp.#onCancelHistoryModal,
      submitHistory: DomainManagerShellApp.#onSubmitHistory,
      openEditHistoryModal: DomainManagerShellApp.#onOpenEditHistoryModal,
      cancelEditHistoryModal: DomainManagerShellApp.#onCancelEditHistoryModal,
      submitEditHistory: DomainManagerShellApp.#onSubmitEditHistory,
      deleteHistory: DomainManagerShellApp.#onDeleteHistory,

      // Galeria e Condições
      addGalleryImage: DomainManagerShellApp.#onAddGalleryImage,
      removeGalleryImage: DomainManagerShellApp.#onRemoveGalleryImage,
      selectGalleryImage: DomainManagerShellApp.#onSelectGalleryImage,
      deleteCondition: DomainManagerShellApp.#onDeleteCondition,

      // Notificações e Avisos Importantes da Visão Geral
      openAddNotificationModal: DomainManagerShellApp.#onOpenAddNotificationModal,
      cancelNotificationModal: DomainManagerShellApp.#onCancelNotificationModal,
      submitNotification: DomainManagerShellApp.#onSubmitNotification,
      dismissNotification: DomainManagerShellApp.#onDismissNotification,
      dismissAllNotifications: DomainManagerShellApp.#onDismissAllNotifications,
      deleteNotification: DomainManagerShellApp.#onDeleteNotification,
      toggleNotificationsHistory: DomainManagerShellApp.#onToggleNotificationsHistory,

      // Dossiê Tático & Bio-Monitor de Notáveis
      openNotableDossier: DomainManagerShellApp.#onOpenNotableDossier,
      closeNotableDossier: DomainManagerShellApp.#onCloseNotableDossier,
      selectDossierSkill: DomainManagerShellApp.#onSelectDossierSkill,
      openEditNotableStatsModal: DomainManagerShellApp.#onOpenEditNotableStatsModal,
      cancelNotableStatsModal: DomainManagerShellApp.#onCancelNotableStatsModal,
      submitNotableStats: DomainManagerShellApp.#onSubmitNotableStats
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

  _onRender(context, options) {
    super._onRender?.(context, options);

    if (!this.element) return;

    // 1. Live preview para o Editor de Imagem da Base (Novo e Edição)
    bindLiveImagePreview(this.element, "#dm-new-domain-image", "#dm-new-image-preview-img", "#dm-new-image-preview-container", "#dm-new-domain-crest");
    bindLiveImagePreview(this.element, "#dm-edit-domain-image", "#dm-edit-image-preview-img", "#dm-edit-image-preview-container", "#dm-edit-domain-crest");

    // 2. Live preview para Obras / Projetos (Novo e Edição)
    bindLiveImagePreview(this.element, "#dm-project-img", "#dm-project-image-preview-img", "#dm-project-image-preview-container", "#dm-project-img");
    bindLiveImagePreview(this.element, "#dm-edit-proj-image", "#dm-edit-proj-image-preview-img", "#dm-edit-proj-image-preview-container", "#dm-edit-proj-img");

    // 3. Live preview para Personagens Notáveis (Novo e Edição)
    bindLiveImagePreview(this.element, "#dm-notable-portrait", "#dm-notable-image-preview-img", "#dm-notable-image-preview-container", "#dm-notable-portrait");
    bindLiveImagePreview(this.element, "#dm-edit-notable-portrait", "#dm-edit-notable-image-preview-img", "#dm-edit-notable-image-preview-container", "#dm-edit-notable-portrait");
  }

  #closeAllModals() {
    this.isCreatingDomain = false;
    this.isEditingDomain = false;
    this.isDeletingDomain = false;
    this.isAdvancingTimeModal = false;
    this.isEventModalOpen = false;
    this.isStockModalOpen = false;
    this.isFlowModalOpen = false;
    this.isProjectModalOpen = false;
    this.isEditingProjectModal = false;
    this.editingProjectUuid = null;
    this.isNotableModalOpen = false;
    this.isEditingNotableModal = false;
    this.editingNotableLocalId = null;
    this.isGroupModalOpen = false;
    this.isEditingGroupModal = false;
    this.editingGroupLocalId = null;
    this.isRelationModalOpen = false;
    this.isEditingRelationModal = false;
    this.editingRelationTargetUuid = null;
    this.isIntelModalOpen = false;
    this.isEditingIntelModal = false;
    this.editingIntelLocalId = null;
    this.isHistoryModalOpen = false;
    this.isEditingHistoryModal = false;
    this.editingHistoryIndex = null;
    this.isUpkeepModalOpen = false;
    this.isEditingStockModal = false;
    this.editingStockResourceId = null;
    this.isEditingFlowModal = false;
    this.editingFlowLocalId = null;
    this.isTagModalOpen = false;
    this.isNotificationModalOpen = false;
    this.isEditingNotableStatsModal = false;
  }

  /* ------------------------------------------------------------------------
     Navegação, Sidebar e FilePicker
     ------------------------------------------------------------------------ */
  static #onToggleSidebar() {
    this.isSidebarOpen = !this.isSidebarOpen;
    this.render();
  }

  static #onToggleFolder(event, target) {
    event?.stopPropagation?.();
    const uuid = getActionAttr(target, "uuid");
    if (!uuid) return;
    if (this.collapsedFolderUuids.has(uuid)) {
      this.collapsedFolderUuids.delete(uuid);
    } else {
      this.collapsedFolderUuids.add(uuid);
    }
    this.render();
  }

  static #onToggleAllFolders() {
    const domainRecords = listVisibleDomainRecords(game.user);
    if (this.collapsedFolderUuids.size > 0) {
      this.collapsedFolderUuids.clear();
    } else {
      for (const d of domainRecords) {
        this.collapsedFolderUuids.add(d.document.uuid);
      }
    }
    this.render();
  }

  static #onNavigate(event, target) {
    const section = target.dataset.section;
    if (!section) return;

    this.#closeAllModals();

    if (section === "domains") {
      if (this.activeSection === "domains") {
        this.isSidebarOpen = !this.isSidebarOpen;
      } else {
        this.activeSection = "domains";
        this.activeTab = "overview";
        this.isSidebarOpen = true;
      }
    } else if (section === "dashboard") {
      this.activeSection = "dashboard";
      this.activeTab = "overview";
    } else if (section === "economy") {
      this.activeSection = "economy";
      this.activeTab = "economy";
    } else if (section === "projects") {
      this.activeSection = "projects";
      this.activeTab = "projects";
    }

    this.render();
  }

  static #onSelectDomain(event, target) {
    const uuid = getActionAttr(target, "uuid");
    this.selectedDomainUuid = uuid || null;
    this.#closeAllModals();
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
      if (tab === "economy") this.activeSection = "economy";
      else if (tab === "projects") this.activeSection = "projects";
      else this.activeSection = "domains";
      this.render();
    }
  }

  static #onFilterByTag(event, target) {
    const tag = target?.dataset?.tag || target?.getAttribute?.("data-tag") || target?.closest?.("[data-tag]")?.getAttribute("data-tag");
    this.selectedTag = this.selectedTag === tag ? null : tag;
    this.render();
  }

  static #onSearch(event, target) {
    this.searchQuery = target.value || "";
    this.render();
  }

  static #onOpenFilePicker(event, target) {
    const selector = target.dataset.target;
    if (!selector) return;
    const input = this.element?.querySelector(selector);
    if (!input) return;

    if (typeof FilePicker !== "undefined") {
      new FilePicker({
        type: "image",
        current: input.value || "",
        callback: (selectedPath) => {
          input.value = selectedPath;
          const container = input.closest(".dm-form-group")?.querySelector(".dm-image-preview-container");
          if (container) {
            const img = container.querySelector("img");
            if (img) {
              img.src = selectedPath;
              container.style.display = "block";
            }
          }
        }
      }).render(true);
    } else {
      ui.notifications?.info("Digite ou cole a URL da imagem ou GIF no campo.");
    }
  }

  /* --- Gestão de Tags --- */
  static async #onRemoveTag(event, target) {
    if (!game.user.isGM || !this.selectedDomainUuid) return;
    const tagToRemove = target.dataset.tag;
    if (!tagToRemove) return;

    try {
      const doc = recordIndex.get(RECORD_TYPES.DOMAIN, this.selectedDomainUuid);
      const record = decodeRecord(doc);
      const data = foundry.utils.deepClone(record.data);
      if (Array.isArray(data.identity?.tags)) {
        data.identity.tags = data.identity.tags.filter((t) => t !== tagToRemove);
        await updateRecord({
          uuid: this.selectedDomainUuid,
          recordType: RECORD_TYPES.DOMAIN,
          data
        });
        ui.notifications?.info(`Tag #${tagToRemove} removida!`);
        this.render();
      }
    } catch (err) {
      ui.notifications?.error(err.message || "Erro ao remover tag.");
    }
  }

  static #onOpenAddTagModal() {
    if (!game.user.isGM || !this.selectedDomainUuid) return;
    this.#closeAllModals();
    this.isTagModalOpen = true;
    this.render();
  }

  static #onCancelTagModal() {
    this.isTagModalOpen = false;
    this.render();
  }

  static async #onSubmitAddTag() {
    if (!game.user.isGM || !this.selectedDomainUuid) return;
    const form = this.element?.querySelector(".dm-dialog-card");
    const newTagsRaw = form?.querySelector("#dm-new-tag-input")?.value || "";
    const newTags = newTagsRaw.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);

    if (newTags.length === 0) {
      ui.notifications?.warn("Digite ao menos uma tag.");
      return;
    }

    this.isTagModalOpen = false;

    try {
      const doc = recordIndex.get(RECORD_TYPES.DOMAIN, this.selectedDomainUuid);
      const record = decodeRecord(doc);
      const data = foundry.utils.deepClone(record.data);
      if (!data.identity) data.identity = {};
      const existing = new Set(data.identity.tags || []);
      for (const t of newTags) existing.add(t);
      data.identity.tags = Array.from(existing);

      await updateRecord({
        uuid: this.selectedDomainUuid,
        recordType: RECORD_TYPES.DOMAIN,
        data
      });

      ui.notifications?.info("Tags adicionadas com sucesso!");
      this.render();
    } catch (err) {
      ui.notifications?.error(err.message || "Erro ao adicionar tags.");
    }
  }

  /* ------------------------------------------------------------------------
     1. Domínios: Criação, Edição (com Donos/Players) e Exclusão
     ------------------------------------------------------------------------ */
  static #onOpenCreateDomain() {
    if (!game.user.isGM) return;
    this.#closeAllModals();
    this.isCreatingDomain = true;
    this.render();
  }

  static #onCancelCreateDomain() {
    this.isCreatingDomain = false;
    this.render();
  }

  static async #onSubmitCreateDomain() {
    if (!game.user.isGM) return;
    const form = this.element?.querySelector(".dm-dialog-card");
    const name = form?.querySelector("#dm-new-domain-name")?.value?.trim() || "Nova Base";
    const category = form?.querySelector("#dm-new-domain-category")?.value?.trim() || "settlement";
    const nature = form?.querySelector("#dm-new-domain-nature")?.value || "physical";
    const tagsRaw = form?.querySelector("#dm-new-domain-tags")?.value || "";
    const crestImg = form?.querySelector("#dm-new-domain-crest")?.value?.trim() || "";
    const description = form?.querySelector("#dm-new-domain-description")?.value || "";
    const parentUuid = form?.querySelector("#dm-new-domain-parent")?.value || null;

    const controllerCheckboxes = form?.querySelectorAll(".dm-create-domain-controller:checked");
    const controllerIds = Array.from(controllerCheckboxes || []).map((cb) => cb.value);

    const tags = tagsRaw.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);

    try {
      const { createDomainAction } = await import("../features/domains/actions.js");
      const doc = await createDomainAction({
        name,
        category,
        nature,
        tags,
        description,
        controllerIds,
        locatedInUuid: parentUuid,
        administrativeParentUuid: parentUuid
      });

      if (doc?.uuid) {
        const imageFit = form?.querySelector("#dm-new-domain-image-fit")?.value || "cover";
        const imageHeight = Number(form?.querySelector("#dm-new-domain-image-height")?.value) || 200;
        const imagePosX = form?.querySelector("#dm-new-domain-image-pos-x")?.value != null ? Number(form.querySelector("#dm-new-domain-image-pos-x").value) : 50;
        const imagePosY = form?.querySelector("#dm-new-domain-image-pos-y")?.value != null ? Number(form.querySelector("#dm-new-domain-image-pos-y").value) : 50;
        const imageZoom = form?.querySelector("#dm-new-domain-image-zoom")?.value != null ? Number(form.querySelector("#dm-new-domain-image-zoom").value) : 100;

        if (crestImg) {
          const createdDoc = recordIndex.get(RECORD_TYPES.DOMAIN, doc.uuid);
          if (createdDoc) {
            const dec = decodeRecord(createdDoc);
            const data = foundry.utils.deepClone(dec.data);
            data.identity.crestMedia = { path: crestImg };
            data.visuals = {
              ...(data.visuals || {}),
              crestImg,
              image: crestImg,
              imageFit,
              imageHeight,
              imagePosX,
              imagePosY,
              imageZoom,
              imagePosition: "center",
              gallery: [crestImg]
            };
            await updateRecord({ uuid: doc.uuid, recordType: RECORD_TYPES.DOMAIN, data });
            this.activeGalleryImage = crestImg;
          }
        }

        this.selectedDomainUuid = doc.uuid;
        this.isCreatingDomain = false;
        ui.notifications?.info(`Domínio "${name}" criado com sucesso!`);
        this.render();
      }
    } catch (err) {
      ui.notifications?.error(err.message || "Erro ao criar domínio.");
    }
  }

  static #onOpenEditDomain() {
    if (!game.user.isGM || !this.selectedDomainUuid) return;
    this.#closeAllModals();
    this.isEditingDomain = true;
    this.render();
  }

  static #onCancelEditDomain() {
    this.isEditingDomain = false;
    this.render();
  }

  static async #onSubmitEditDomain() {
    if (!game.user.isGM || !this.selectedDomainUuid) return;
    const name = this.element?.querySelector("#dm-edit-domain-name")?.value?.trim();
    const category = this.element?.querySelector("#dm-edit-domain-category")?.value?.trim() || "territory";
    const nature = this.element?.querySelector("#dm-edit-domain-nature")?.value || "physical";
    const crestImg = this.element?.querySelector("#dm-edit-domain-crest")?.value?.trim() || "";
    const imageFit = this.element?.querySelector("#dm-edit-domain-image-fit")?.value || "cover";
    const imageHeight = Number(this.element?.querySelector("#dm-edit-domain-image-height")?.value) || 200;
    const imagePosX = this.element?.querySelector("#dm-edit-domain-image-pos-x")?.value != null ? Number(this.element.querySelector("#dm-edit-domain-image-pos-x").value) : 50;
    const imagePosY = this.element?.querySelector("#dm-edit-domain-image-pos-y")?.value != null ? Number(this.element.querySelector("#dm-edit-domain-image-pos-y").value) : 50;
    const imageZoom = this.element?.querySelector("#dm-edit-domain-image-zoom")?.value != null ? Number(this.element.querySelector("#dm-edit-domain-image-zoom").value) : 100;
    const imagePosition = "center";
    const tagsRaw = this.element?.querySelector("#dm-edit-domain-tags")?.value || "";
    const description = this.element?.querySelector("#dm-edit-domain-description")?.value || "";
    const sustenanceEnabled = this.element?.querySelector("#dm-edit-domain-sustenance-enabled")?.value !== "false";
    const foodPer100 = Number(this.element?.querySelector("#dm-edit-domain-food-rate")?.value) || 1.0;
    const waterPer100 = Number(this.element?.querySelector("#dm-edit-domain-water-rate")?.value) || 1.0;
    const guardUpkeep = Number(this.element?.querySelector("#dm-edit-domain-guard-upkeep")?.value) || 1.0;
    let parentUuid = this.element?.querySelector("#dm-edit-domain-parent")?.value || null;
    if (parentUuid === this.selectedDomainUuid) {
      parentUuid = null;
    }
    const defenseScore = Number(this.element?.querySelector("#dm-edit-domain-defense")?.value) || 10;
    const guardCount = Number(this.element?.querySelector("#dm-edit-domain-guards")?.value) || 0;

    const controllerCheckboxes = this.element?.querySelectorAll(".dm-edit-domain-controller:checked");
    const controllers = Array.from(controllerCheckboxes || []).map((cb) => cb.value);

    if (!name) {
      ui.notifications?.warn("O nome do domínio não pode ser vazio.");
      return;
    }

    const tags = tagsRaw.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);

    try {
      const doc = recordIndex.get(RECORD_TYPES.DOMAIN, this.selectedDomainUuid);
      if (!doc) throw new Error("Domínio não encontrado no índice.");
      const record = decodeRecord(doc);
      const data = foundry.utils.deepClone(record.data);

      data.identity = {
        ...data.identity,
        category,
        nature,
        tags,
        description,
        crestMedia: crestImg ? { path: crestImg } : null
      };
      data.visuals = {
        ...(data.visuals || {}),
        crestImg,
        image: crestImg,
        imageFit,
        imageHeight,
        imagePosX,
        imagePosY,
        imageZoom,
        imagePosition
      };
      data.economy = data.economy || {};
      data.economy.sustenanceSettings = {
        enabled: sustenanceEnabled,
        foodPer100,
        waterPer100,
        guardUpkeep
      };
      data.hierarchy = {
        ...data.hierarchy,
        locatedInUuid: parentUuid,
        administrativeParentUuid: parentUuid
      };
      data.security = {
        ...data.security,
        defenseScore,
        defenseRating: defenseScore,
        guardCount
      };
      data.governance = {
        ...data.governance,
        controllers
      };

      await updateRecord({
        uuid: this.selectedDomainUuid,
        recordType: RECORD_TYPES.DOMAIN,
        name,
        data,
        controllerIds: controllers
      });

      this.activeGalleryImage = crestImg;
      this.isEditingDomain = false;
      ui.notifications?.info(`Domínio "${name}" atualizado com sucesso!`);
      this.render();
    } catch (err) {
      ui.notifications?.error(err.message || "Erro ao editar domínio.");
    }
  }

  static #onOpenDeleteDomainModal() {
    if (!game.user.isGM || !this.selectedDomainUuid) return;
    this.#closeAllModals();
    this.isDeletingDomain = true;
    this.render();
  }

  static #onCancelDeleteDomainModal() {
    this.isDeletingDomain = false;
    this.render();
  }

  static async #onConfirmDeleteDomain() {
    if (!game.user.isGM || !this.selectedDomainUuid) return;
    const targetUuid = this.selectedDomainUuid;
    this.isDeletingDomain = false;

    try {
      const { deleteDomainAction } = await import("../features/domains/actions.js");
      await deleteDomainAction({ domainUuid: targetUuid });
      this.selectedDomainUuid = null;
      ui.notifications?.info("Domínio excluído com sucesso!");
      this.render();
    } catch (err) {
      ui.notifications?.error(err.message || "Erro ao excluir domínio.");
    }
  }

  /* ------------------------------------------------------------------------
     2. Simulação Temporal e Eventos (GM Only)
     ------------------------------------------------------------------------ */
  static #onOpenAdvanceModal() {
    if (!game.user.isGM) {
      ui.notifications?.warn("Apenas o Mestre pode avançar o tempo.");
      return;
    }
    this.#closeAllModals();
    this.isAdvancingTimeModal = true;
    this.render();
  }

  static #onCancelAdvanceModal() {
    this.isAdvancingTimeModal = false;
    this.render();
  }

  static async #onQuickAdvanceTicks(event, target) {
    if (!game.user.isGM) return;
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

  static #onOpenEventModal() {
    if (!game.user.isGM) {
      ui.notifications?.warn("Apenas o Mestre pode rolar eventos.");
      return;
    }
    if (!this.selectedDomainUuid) {
      ui.notifications?.warn("Selecione um domínio primeiro.");
      return;
    }
    this.#closeAllModals();
    this.isEventModalOpen = true;
    this.render();
  }

  static #onCancelEventModal() {
    this.isEventModalOpen = false;
    this.render();
  }

  static async #onSubmitCustomRollEvent() {
    if (!game.user.isGM || !this.selectedDomainUuid) return;
    const form = this.element?.querySelector(".dm-dialog-card");
    const category = form?.querySelector("#dm-event-filter-category")?.value || null;
    this.isEventModalOpen = false;

    try {
      const { executeRollAndApplyEvent } = await import("../features/events/actions.js");
      await executeRollAndApplyEvent({
        domainUuid: this.selectedDomainUuid,
        category: category === "all" ? null : category
      });
      ui.notifications?.info("Evento rolado e publicado no chat!");
      this.render();
    } catch (err) {
      ui.notifications?.error(err.message || "Erro ao rolar evento.");
    }
  }

  static async #onSubmitAuthorEvent() {
    if (!game.user.isGM || !this.selectedDomainUuid) return;
    const form = this.element?.querySelector(".dm-dialog-card");
    const title = form?.querySelector("#dm-author-event-title")?.value?.trim() || "Evento do Mestre";
    const description = form?.querySelector("#dm-author-event-desc")?.value?.trim() || "Um evento marcante alterou os rumos do território.";
    const outcomeLabel = form?.querySelector("#dm-author-event-outcome")?.value?.trim() || "Desfecho aplicado pelo Mestre";
    const stockBonusAmount = Number(form?.querySelector("#dm-author-event-stock")?.value) || 0;
    const conditionName = form?.querySelector("#dm-author-event-cond-name")?.value?.trim();
    const conditionTicks = Number(form?.querySelector("#dm-author-event-cond-ticks")?.value) || 3;
    const severity = form?.querySelector("#dm-author-event-severity")?.value || "neutral";

    this.isEventModalOpen = false;

    try {
      const { executeApplyEventOutcome } = await import("../features/events/actions.js");
      const customEvent = {
        id: `custom_${Date.now()}`,
        title,
        description,
        category: "custom",
        severity,
        outcomes: [
          {
            label: outcomeLabel,
            description: outcomeLabel,
            stockBonus: stockBonusAmount !== 0 ? { amount: stockBonusAmount * 100 } : null,
            condition: conditionName ? {
              name: conditionName,
              description: `Condição gerada por evento: ${title}`,
              durationTicks: conditionTicks
            } : null,
            chronicleTitle: title
          }
        ]
      };

      await executeApplyEventOutcome({
        domainUuid: this.selectedDomainUuid,
        event: customEvent,
        outcomeIndex: 0,
        postToChat: true
      });

      ui.notifications?.info(`Evento "${title}" aplicado com sucesso!`);
      this.render();
    } catch (err) {
      ui.notifications?.error(err.message || "Erro ao aplicar evento customizado.");
    }
  }

  /* ------------------------------------------------------------------------
     3. Economia: Exclusão Permanente de Recursos e Fluxos
     ------------------------------------------------------------------------ */
  static #onOpenAddStockModal() {
    if (!game.user.isGM || !this.selectedDomainUuid) return;
    this.#closeAllModals();
    this.isStockModalOpen = true;
    this.render();
  }

  static #onCancelStockModal() {
    this.isStockModalOpen = false;
    this.render();
  }

  static async #onSubmitStock() {
    if (!game.user.isGM || !this.selectedDomainUuid) return;
    const form = this.element?.querySelector(".dm-dialog-card");
    let resourceId = form?.querySelector("#dm-stock-resource-select")?.value;
    const customId = form?.querySelector("#dm-stock-resource-custom")?.value?.trim()?.toLowerCase();
    const customName = form?.querySelector("#dm-stock-resource-name")?.value?.trim();
    if (customId) resourceId = customId;
    const amount = Number(form?.querySelector("#dm-stock-amount")?.value) || 0;

    if (!resourceId) {
      ui.notifications?.warn("Selecione ou digite um recurso válido.");
      return;
    }

    this.isStockModalOpen = false;

    try {
      const { upsertResourceDefinitionAction } = await import("../features/economy/actions.js");
      await upsertResourceDefinitionAction({
        originalId: resourceId,
        name: customName || resourceId.toUpperCase(),
        precision: 2,
        allowNegative: false
      });

      const doc = recordIndex.get(RECORD_TYPES.DOMAIN, this.selectedDomainUuid);
      const record = decodeRecord(doc);
      const data = foundry.utils.deepClone(record.data);
      if (!data.economy) data.economy = {};
      if (!Array.isArray(data.economy.stocks)) data.economy.stocks = [];

      const existingIndex = data.economy.stocks.findIndex((s) => s.resourceId === resourceId);
      const newStock = {
        resourceId,
        amount: Math.round(amount * 100),
        reserved: 0
      };

      if (existingIndex >= 0) {
        data.economy.stocks[existingIndex].amount = newStock.amount;
      } else {
        data.economy.stocks.push(newStock);
      }

      await updateRecord({
        uuid: this.selectedDomainUuid,
        recordType: RECORD_TYPES.DOMAIN,
        data
      });

      ui.notifications?.info(`Recurso ${resourceId.toUpperCase()} salvo com saldo ${amount}!`);
      this.render();
    } catch (err) {
      ui.notifications?.error(err.message || "Erro ao salvar estoque.");
    }
  }

  static async #onDeleteStock(event, target) {
    if (!game.user.isGM || !this.selectedDomainUuid) return;
    const resourceId = getActionAttr(target, "resource-id");
    if (!resourceId) return;

    try {
      const { removeResourceDefinitionAction } = await import("../features/economy/actions.js");
      await removeResourceDefinitionAction(resourceId);

      const allDomains = recordIndex.list(RECORD_TYPES.DOMAIN);
      for (const doc of allDomains) {
        const dec = decodeRecord(doc);
        const data = foundry.utils.deepClone(dec.data);
        let modified = false;
        if (data.economy?.stocks?.some((s) => s.resourceId === resourceId)) {
          data.economy.stocks = data.economy.stocks.filter((s) => s.resourceId !== resourceId);
          modified = true;
        }
        if (data.economy?.flows?.some((f) => f.resourceId === resourceId)) {
          data.economy.flows = data.economy.flows.filter((f) => f.resourceId !== resourceId);
          modified = true;
        }
        if (modified) {
          await updateRecord({
            uuid: doc.uuid,
            recordType: RECORD_TYPES.DOMAIN,
            data
          });
        }
      }

      ui.notifications?.info(`Recurso "${resourceId.toUpperCase()}" excluído permanentemente do sistema!`);
      this.render();
    } catch (err) {
      ui.notifications?.error(err.message || "Erro ao excluir recurso.");
    }
  }

  static #onOpenAddFlowModal() {
    if (!game.user.isGM || !this.selectedDomainUuid) return;
    this.#closeAllModals();
    this.isFlowModalOpen = true;
    this.render();
  }

  static #onCancelFlowModal() {
    this.isFlowModalOpen = false;
    this.render();
  }

  static async #onSubmitFlow() {
    if (!game.user.isGM || !this.selectedDomainUuid) return;
    const form = this.element?.querySelector(".dm-dialog-card");
    const name = form?.querySelector("#dm-flow-name")?.value?.trim() || "Fluxo Geral";
    const resourceId = form?.querySelector("#dm-flow-resource")?.value || "credits";
    const direction = form?.querySelector("#dm-flow-direction")?.value || "inflow";
    const amount = Number(form?.querySelector("#dm-flow-amount")?.value) || 0;
    const category = form?.querySelector("#dm-flow-category")?.value?.trim() || "comércio";

    this.isFlowModalOpen = false;

    try {
      const { upsertDomainFlowAction } = await import("../features/economy/actions.js");
      await upsertDomainFlowAction({
        domainUuid: this.selectedDomainUuid,
        name,
        resourceId,
        direction,
        displayAmount: String(amount),
        periodTicks: 1,
        category,
        source: "Manual GM",
        active: true
      });
      ui.notifications?.info(`Fluxo "${name}" adicionado com sucesso!`);
      this.render();
    } catch (err) {
      ui.notifications?.error(err.message || "Erro ao adicionar fluxo.");
    }
  }

  static async #onDeleteFlow(event, target) {
    if (!game.user.isGM || !this.selectedDomainUuid) return;
    const localId = getActionAttr(target, "local-id");
    if (!localId) return;

    // Se for fluxo de sustento automático da população
    if (localId.startsWith("upkeep-")) {
      try {
        const doc = recordIndex.get(RECORD_TYPES.DOMAIN, this.selectedDomainUuid);
        const record = decodeRecord(doc);
        const data = foundry.utils.deepClone(record.data);
        if (!data.economy) data.economy = {};
        data.economy.sustenanceSettings = data.economy.sustenanceSettings || { enabled: true, foodPer100: 1.0, waterPer100: 1.0, guardUpkeep: 1.0 };

        if (localId === "upkeep-food") {
          data.economy.sustenanceSettings.foodPer100 = 0;
          ui.notifications?.info("Consumo de alimentos da população desativado (taxa zerada)!");
        } else if (localId === "upkeep-water") {
          data.economy.sustenanceSettings.waterPer100 = 0;
          ui.notifications?.info("Consumo de água da população desativado (taxa zerada)!");
        } else if (localId === "upkeep-guards") {
          data.economy.sustenanceSettings.guardUpkeep = 0;
          ui.notifications?.info("Manutenção da guarda desativada (taxa zerada)!");
        }

        await updateRecord({
          uuid: this.selectedDomainUuid,
          recordType: RECORD_TYPES.DOMAIN,
          data
        });
        this.render();
        return;
      } catch (err) {
        ui.notifications?.error(err.message || "Erro ao desativar consumo populacional.");
        return;
      }
    }

    try {
      const { removeDomainFlowAction } = await import("../features/economy/actions.js");
      await removeDomainFlowAction({
        domainUuid: this.selectedDomainUuid,
        localId
      });
      ui.notifications?.info("Fluxo removido com sucesso!");
      this.render();
    } catch (err) {
      ui.notifications?.error(err.message || "Erro ao remover fluxo.");
    }
  }

  /* ------------------------------------------------------------------------
     4. Projetos & Obras: Criação, Edição, Tiers/Evolução e Modificadores
     ------------------------------------------------------------------------ */
  static #onOpenAddProjectModal() {
    if (!game.user.isGM || !this.selectedDomainUuid) return;
    this.#closeAllModals();
    this.isProjectModalOpen = true;
    this.render();
  }

  static #onCancelProjectModal() {
    this.isProjectModalOpen = false;
    this.render();
  }

  static async #onSubmitProject() {
    if (!game.user.isGM || !this.selectedDomainUuid) return;
    const name = this.element?.querySelector("#dm-project-name")?.value?.trim() || "Nova Obra";
    const category = this.element?.querySelector("#dm-project-category")?.value || "infraestrutura";
    const tier = Number(this.element?.querySelector("#dm-project-tier")?.value) || 1;
    const workRequired = Number(this.element?.querySelector("#dm-project-work")?.value) || 100;
    const rateAmount = Number(this.element?.querySelector("#dm-project-rate")?.value) || 10;
    const description = this.element?.querySelector("#dm-project-desc")?.value?.trim() || "";
    const image = this.element?.querySelector("#dm-project-img")?.value?.trim() || "";
    const imageFit = this.element?.querySelector("#dm-project-img-fit")?.value || "cover";
    const imageHeight = Number(this.element?.querySelector("#dm-project-img-height")?.value) || 180;
    const imagePosX = Number(this.element?.querySelector("#dm-project-img-pos-x")?.value) ?? 50;
    const imagePosY = Number(this.element?.querySelector("#dm-project-img-pos-y")?.value) ?? 50;
    const imageZoom = Number(this.element?.querySelector("#dm-project-img-zoom")?.value) ?? 100;

    const defenseBonus = Number(this.element?.querySelector("#dm-project-mod-def")?.value) || 0;
    const incomeBonus = Number(this.element?.querySelector("#dm-project-mod-income")?.value) || 0;
    const unrestReduction = Number(this.element?.querySelector("#dm-project-mod-unrest")?.value) || 0;
    const populationBonus = Number(this.element?.querySelector("#dm-project-mod-pop")?.value) || 0;

    this.isProjectModalOpen = false;

    try {
      const { createProjectAction } = await import("../features/projects/actions.js");
      const doc = await createProjectAction({
        domainUuid: this.selectedDomainUuid,
        name,
        category,
        description,
        workRequired,
        rateAmount,
        periodTicks: 1,
        status: "active"
      });

      if (doc?.uuid) {
        const projectRecord = recordIndex.get(RECORD_TYPES.PROJECT, doc.uuid);
        if (projectRecord) {
          const dec = decodeRecord(projectRecord);
          const data = foundry.utils.deepClone(dec.data);
          data.tier = tier;
          data.image = image;
          data.imageFit = imageFit;
          data.imageHeight = imageHeight;
          data.imagePosX = imagePosX;
          data.imagePosY = imagePosY;
          data.imageZoom = imageZoom;
          data.modifiers = {
            defenseBonus,
            incomeBonus,
            unrestReduction,
            populationBonus
          };
          await updateRecord({ uuid: doc.uuid, recordType: RECORD_TYPES.PROJECT, data });
        }
      }

      ui.notifications?.info(`Projeto "${name}" (Tier ${tier}) iniciado!`);
      this.render();
    } catch (err) {
      ui.notifications?.error(err.message || "Erro ao criar projeto.");
    }
  }

  static #onOpenEditProjectModal(event, target) {
    if (!game.user.isGM) return;
    const uuid = getActionAttr(target, "uuid");
    if (!uuid) return;
    this.#closeAllModals();
    this.editingProjectUuid = uuid;
    this.isEditingProjectModal = true;
    this.render();
  }

  static #onCancelEditProjectModal() {
    this.isEditingProjectModal = false;
    this.editingProjectUuid = null;
    this.render();
  }

  static async #onSubmitEditProject() {
    if (!game.user.isGM || !this.editingProjectUuid) return;
    const name = this.element?.querySelector("#dm-edit-proj-name")?.value?.trim() || "Obra";
    const category = this.element?.querySelector("#dm-edit-proj-category")?.value || "infraestrutura";
    const tier = Number(this.element?.querySelector("#dm-edit-proj-tier")?.value) || 1;
    const status = this.element?.querySelector("#dm-edit-proj-status")?.value || "active";
    const workRequired = Number(this.element?.querySelector("#dm-edit-proj-work")?.value) || 100;
    const workCompleted = Number(this.element?.querySelector("#dm-edit-proj-completed")?.value) || 0;
    const rateAmount = Number(this.element?.querySelector("#dm-edit-proj-rate")?.value) || 10;
    const image = this.element?.querySelector("#dm-edit-proj-img")?.value?.trim() || "";
    const imageFit = this.element?.querySelector("#dm-edit-proj-image-fit")?.value || "cover";
    const imageHeight = Number(this.element?.querySelector("#dm-edit-proj-image-height")?.value) || 180;
    const imagePosX = Number(this.element?.querySelector("#dm-edit-proj-image-pos-x")?.value) ?? 50;
    const imagePosY = Number(this.element?.querySelector("#dm-edit-proj-image-pos-y")?.value) ?? 50;
    const imageZoom = Number(this.element?.querySelector("#dm-edit-proj-image-zoom")?.value) ?? 100;
    const description = this.element?.querySelector("#dm-edit-proj-desc")?.value?.trim() || "";

    const defenseBonus = Number(this.element?.querySelector("#dm-edit-proj-mod-def")?.value) || 0;
    const incomeBonus = Number(this.element?.querySelector("#dm-edit-proj-mod-income")?.value) || 0;
    const unrestReduction = Number(this.element?.querySelector("#dm-edit-proj-mod-unrest")?.value) || 0;
    const populationBonus = Number(this.element?.querySelector("#dm-edit-proj-mod-pop")?.value) || 0;

    const targetUuid = this.editingProjectUuid;
    this.isEditingProjectModal = false;
    this.editingProjectUuid = null;

    try {
      const doc = recordIndex.get(RECORD_TYPES.PROJECT, targetUuid);
      if (!doc) throw new Error("Projeto não encontrado.");
      const dec = decodeRecord(doc);
      const data = foundry.utils.deepClone(dec.data);

      data.category = category;
      data.tier = tier;
      data.status = status;
      data.description = description;
      data.image = image;
      data.imageFit = imageFit;
      data.imageHeight = imageHeight;
      data.imagePosX = imagePosX;
      data.imagePosY = imagePosY;
      data.imageZoom = imageZoom;
      data.work = {
        required: workRequired,
        completed: Math.min(workRequired, workCompleted)
      };
      data.rate = {
        amount: rateAmount
      };
      data.modifiers = {
        defenseBonus,
        incomeBonus,
        unrestReduction,
        populationBonus
      };

      await updateRecord({
        uuid: targetUuid,
        recordType: RECORD_TYPES.PROJECT,
        name,
        data
      });

      ui.notifications?.info(`Projeto "${name}" atualizado!`);
      this.render();
    } catch (err) {
      ui.notifications?.error(err.message || "Erro ao editar projeto.");
    }
  }

  static async #onEvolveProject(event, target) {
    if (!game.user.isGM) return;
    const projectUuid = target.dataset.uuid;
    if (!projectUuid) return;

    try {
      const doc = recordIndex.get(RECORD_TYPES.PROJECT, projectUuid);
      if (!doc) return;
      const dec = decodeRecord(doc);
      const data = foundry.utils.deepClone(dec.data);

      const oldTier = Number(data.tier) || 1;
      const newTier = oldTier + 1;
      const newWorkRequired = Math.round((data.work?.required || 100) * 1.5);

      data.tier = newTier;
      data.status = "active";
      data.work = {
        required: newWorkRequired,
        completed: 0
      };

      if (data.modifiers) {
        data.modifiers.defenseBonus = Math.round((data.modifiers.defenseBonus || 0) * 1.5);
        data.modifiers.incomeBonus = Math.round((data.modifiers.incomeBonus || 0) * 1.5);
        data.modifiers.unrestReduction = Math.round((data.modifiers.unrestReduction || 0) + 1);
        data.modifiers.populationBonus = Math.round((data.modifiers.populationBonus || 0) * 1.5);
      }

      await updateRecord({
        uuid: projectUuid,
        recordType: RECORD_TYPES.PROJECT,
        data
      });

      // Gravar na crônica do domínio
      if (this.selectedDomainUuid) {
        const { addHistoryEvent } = await import("../features/history/actions.js");
        await addHistoryEvent({
          domainUuid: this.selectedDomainUuid,
          title: `Evolução de Obra: ${doc.name} (Tier ${newTier})`,
          category: "project",
          summary: `A obra evoluiu para o Tier ${newTier}, ampliando os modificadores do território.`,
          details: `Construção expandida para o Tier ${newTier} com meta de ${newWorkRequired} de trabalho.`
        });
      }

      ui.notifications?.info(`Obra "${doc.name}" evoluiu para o Tier ${newTier}!`);
      this.render();
    } catch (err) {
      ui.notifications?.error(err.message || "Erro ao evoluir obra.");
    }
  }

  static async #onDeleteProject(event, target) {
    if (!game.user.isGM) return;
    const projectUuid = target.dataset.uuid;
    if (!projectUuid) return;

    try {
      const { deleteProjectAction } = await import("../features/projects/actions.js");
      await deleteProjectAction({ projectUuid });
      ui.notifications?.info("Projeto removido com sucesso!");
      this.render();
    } catch (err) {
      ui.notifications?.error(err.message || "Erro ao remover projeto.");
    }
  }

  /* ------------------------------------------------------------------------
     5. Pessoas: Notáveis (com Imagem/GIF) e Grupos Populacionais
     ------------------------------------------------------------------------ */
  
  static async #onDeleteCondition(event, target) {
    if (!game.user.isGM || !this.selectedDomainUuid) return;
    const localId = getActionAttr(target, "local-id");
    if (!localId) return;

    try {
      const doc = recordIndex.get(RECORD_TYPES.DOMAIN, this.selectedDomainUuid);
      const record = decodeRecord(doc);
      const data = foundry.utils.deepClone(record.data);
      if (Array.isArray(data.conditions)) {
        data.conditions = data.conditions.filter((c) => c.localId !== localId);
        await updateRecord({
          uuid: this.selectedDomainUuid,
          recordType: RECORD_TYPES.DOMAIN,
          data
        });
        ui.notifications?.info("Condição removida!");
        this.render();
      }
    } catch (err) {
      ui.notifications?.error(err.message || "Erro ao remover condição.");
    }
  }

  static #onOpenAddNotableModal() {
    if (!game.user.isGM || !this.selectedDomainUuid) return;
    this.#closeAllModals();
    this.isNotableModalOpen = true;
    this.render();
  }

  static #onCancelNotableModal() {
    this.isNotableModalOpen = false;
    this.render();
  }

  static async #onSubmitNotable() {
    if (!game.user.isGM || !this.selectedDomainUuid) return;
    const name = this.element?.querySelector("#dm-notable-name")?.value?.trim();
    const role = this.element?.querySelector("#dm-notable-role")?.value?.trim() || "Conselheiro";
    const title = this.element?.querySelector("#dm-notable-title")?.value?.trim() || "";
    const portrait = this.element?.querySelector("#dm-notable-portrait")?.value?.trim() || "";
    const imageFit = this.element?.querySelector("#dm-notable-portrait-fit")?.value || "cover";
    const imageShape = this.element?.querySelector("#dm-notable-portrait-shape")?.value || "square";
    const imagePosX = Number(this.element?.querySelector("#dm-notable-portrait-pos-x")?.value) ?? 50;
    const imagePosY = Number(this.element?.querySelector("#dm-notable-portrait-pos-y")?.value) ?? 50;
    const imageZoom = Number(this.element?.querySelector("#dm-notable-portrait-zoom")?.value) ?? 100;
    const loyalty = this.element?.querySelector("#dm-notable-loyalty")?.value || "Alta";
    const status = this.element?.querySelector("#dm-notable-status")?.value || "active";

    if (!name) {
      ui.notifications?.warn("O nome do notável é obrigatório.");
      return;
    }

    this.isNotableModalOpen = false;

    try {
      const { upsertNotableAction } = await import("../features/people/actions.js");
      await upsertNotableAction({
        domainUuid: this.selectedDomainUuid,
        name,
        role,
        title,
        portrait,
        assignment: loyalty,
        status
      });
      // Salvar propriedades estendidas de imagem no registro
      const doc = recordIndex.get(RECORD_TYPES.DOMAIN, this.selectedDomainUuid);
      if (doc) {
        const dec = decodeRecord(doc);
        const data = foundry.utils.deepClone(dec.data);
        const list = data.population?.notables ?? data.people?.notables ?? [];
        const created = list.find((n) => n.name === name);
        if (created) {
          created.imageFit = imageFit;
          created.imageShape = imageShape;
          created.imagePosX = imagePosX;
          created.imagePosY = imagePosY;
          created.imageZoom = imageZoom;
          await updateRecord({ uuid: this.selectedDomainUuid, recordType: RECORD_TYPES.DOMAIN, data });
        }
      }
      ui.notifications?.info(`Notável "${name}" registrado com sucesso!`);
      this.render();
    } catch (err) {
      ui.notifications?.error(err.message || "Erro ao adicionar notável.");
    }
  }

  static async #onDeleteNotable(event, target) {
    if (!game.user.isGM || !this.selectedDomainUuid) return;
    const localId = getActionAttr(target, "local-id");
    if (!localId) return;

    try {
      const { removeNotableAction } = await import("../features/people/actions.js");
      await removeNotableAction({
        domainUuid: this.selectedDomainUuid,
        localId
      });
      ui.notifications?.info("Notável removido!");
      this.render();
    } catch (err) {
      ui.notifications?.error(err.message || "Erro ao remover notável.");
    }
  }

  static #onOpenAddGroupModal() {
    if (!game.user.isGM || !this.selectedDomainUuid) return;
    this.#closeAllModals();
    this.isGroupModalOpen = true;
    this.render();
  }

  static #onCancelGroupModal() {
    this.isGroupModalOpen = false;
    this.render();
  }

  static async #onSubmitGroup() {
    if (!game.user.isGM || !this.selectedDomainUuid) return;
    const form = this.element?.querySelector(".dm-dialog-card");
    const name = form?.querySelector("#dm-group-name")?.value?.trim();
    const count = Number(form?.querySelector("#dm-group-count")?.value) || 100;
    const happiness = form?.querySelector("#dm-group-happiness")?.value || "Estável";
    let unrestScore = Number(form?.querySelector("#dm-group-unrest")?.value);

    if (isNaN(unrestScore)) {
      if (happiness === "Muito Alta") unrestScore = 0;
      else if (happiness === "Estável") unrestScore = 2;
      else if (happiness === "Insatisfeito") unrestScore = 6;
      else if (happiness === "Rebelde") unrestScore = 9;
      else unrestScore = 2;
    }

    if (!name) {
      ui.notifications?.warn("O nome do grupo é obrigatório.");
      return;
    }

    this.isGroupModalOpen = false;

    try {
      const { upsertGroupAction } = await import("../features/people/actions.js");
      await upsertGroupAction({
        domainUuid: this.selectedDomainUuid,
        name,
        count,
        includedInTotal: true,
        quality: happiness,
        status: "active",
        assignment: String(unrestScore)
      });
      ui.notifications?.info(`Grupo "${name}" adicionado com agitação calculada!`);
      this.render();
    } catch (err) {
      ui.notifications?.error(err.message || "Erro ao adicionar grupo.");
    }
  }

  static async #onDeleteGroup(event, target) {
    if (!game.user.isGM || !this.selectedDomainUuid) return;
    const localId = getActionAttr(target, "local-id");
    if (!localId) return;

    try {
      const { removeGroupAction } = await import("../features/people/actions.js");
      await removeGroupAction({
        domainUuid: this.selectedDomainUuid,
        localId
      });
      ui.notifications?.info("Grupo populacional removido!");
      this.render();
    } catch (err) {
      ui.notifications?.error(err.message || "Erro ao remover grupo.");
    }
  }

  /* ------------------------------------------------------------------------
     6. Diplomacia & Relações
     ------------------------------------------------------------------------ */
  static #onOpenAddRelationModal() {
    if (!game.user.isGM || !this.selectedDomainUuid) return;
    this.#closeAllModals();
    this.isRelationModalOpen = true;
    this.render();
  }

  static #onCancelRelationModal() {
    this.isRelationModalOpen = false;
    this.render();
  }

  static async #onSubmitRelation() {
    if (!game.user.isGM || !this.selectedDomainUuid) return;
    const form = this.element?.querySelector(".dm-dialog-card");
    const targetDomainUuid = form?.querySelector("#dm-relation-target")?.value;
    const posture = form?.querySelector("#dm-relation-posture")?.value || "neutral";
    const notes = form?.querySelector("#dm-relation-notes")?.value || "";

    if (!targetDomainUuid) {
      ui.notifications?.warn("Selecione um domínio alvo para a relação diplomática.");
      return;
    }

    this.isRelationModalOpen = false;

    try {
      const { addRelation } = await import("../features/relations/actions.js");
      await addRelation({
        domainUuid: this.selectedDomainUuid,
        targetDomainUuid,
        posture,
        notes
      });
      ui.notifications?.info("Relação diplomática atualizada com sucesso!");
      this.render();
    } catch (err) {
      ui.notifications?.error(err.message || "Erro ao atualizar diplomacia.");
    }
  }

  static async #onDeleteRelation(event, target) {
    if (!game.user.isGM || !this.selectedDomainUuid) return;
    const targetUuid = getActionAttr(target, "target-uuid");
    if (!targetUuid) return;

    try {
      const doc = recordIndex.get(RECORD_TYPES.DOMAIN, this.selectedDomainUuid);
      const record = decodeRecord(doc);
      const data = foundry.utils.deepClone(record.data);
      if (Array.isArray(data.relations)) {
        data.relations = data.relations.filter((r) => r.targetDomainUuid !== targetUuid);
        await updateRecord({
          uuid: this.selectedDomainUuid,
          recordType: RECORD_TYPES.DOMAIN,
          data
        });
        ui.notifications?.info("Relação diplomática removida!");
        this.render();
      }
    } catch (err) {
      ui.notifications?.error(err.message || "Erro ao remover relação.");
    }
  }

  /* ------------------------------------------------------------------------
     7. Segredos e Conhecimento (Intel)
     ------------------------------------------------------------------------ */
  static #onOpenAddIntelModal() {
    if (!game.user.isGM || !this.selectedDomainUuid) return;
    this.#closeAllModals();
    this.isIntelModalOpen = true;
    this.render();
  }

  static #onCancelIntelModal() {
    this.isIntelModalOpen = false;
    this.render();
  }

  static async #onSubmitIntel() {
    if (!game.user.isGM || !this.selectedDomainUuid) return;
    const form = this.element?.querySelector(".dm-dialog-card");
    const title = form?.querySelector("#dm-intel-title")?.value?.trim();
    const content = form?.querySelector("#dm-intel-content")?.value?.trim() || "";
    let category = form?.querySelector("#dm-intel-category")?.value || "secret";
    let credibility = form?.querySelector("#dm-intel-credibility")?.value || "confirmed";
    let visibility = form?.querySelector("#dm-intel-visibility")?.value || "gm_only";

    if (visibility === "gmOnly") visibility = "gm_only";
    if (credibility === "high") credibility = "likely";
    if (credibility === "medium") credibility = "doubtful";
    if (credibility === "low") credibility = "false";
    if (category === "conspiracy") category = "secret";

    if (!title) {
      ui.notifications?.warn("O título da informação é obrigatório.");
      return;
    }

    this.isIntelModalOpen = false;

    try {
      const { addIntel } = await import("../features/intel/actions.js");
      await addIntel({
        domainUuid: this.selectedDomainUuid,
        title,
        content,
        category,
        credibility,
        visibility
      });
      ui.notifications?.info(`Informe "${title}" registrado com sucesso!`);
      this.render();
    } catch (err) {
      ui.notifications?.error(err.message || "Erro ao adicionar intel.");
    }
  }

  static async #onDeleteIntel(event, target) {
    if (!game.user.isGM || !this.selectedDomainUuid) return;
    const localId = getActionAttr(target, "local-id");
    if (!localId) return;

    try {
      const { removeIntel } = await import("../features/intel/actions.js");
      await removeIntel({
        domainUuid: this.selectedDomainUuid,
        localId
      });
      ui.notifications?.info("Registro de intel removido!");
      this.render();
    } catch (err) {
      ui.notifications?.error(err.message || "Erro ao remover intel.");
    }
  }

  /* ------------------------------------------------------------------------
     8. Crônicas e Histórico
     ------------------------------------------------------------------------ */
  static #onOpenAddHistoryModal() {
    if (!game.user.isGM || !this.selectedDomainUuid) return;
    this.#closeAllModals();
    this.isHistoryModalOpen = true;
    this.render();
  }

  static #onCancelHistoryModal() {
    this.isHistoryModalOpen = false;
    this.render();
  }

  static async #onSubmitHistory() {
    if (!game.user.isGM || !this.selectedDomainUuid) return;
    const form = this.element?.querySelector(".dm-dialog-card");
    const title = form?.querySelector("#dm-history-title")?.value?.trim();
    const category = form?.querySelector("#dm-history-category")?.value || "story";
    const summary = form?.querySelector("#dm-history-summary")?.value?.trim() || "";
    const details = form?.querySelector("#dm-history-details")?.value?.trim() || "";

    if (!title) {
      ui.notifications?.warn("O título da crônica é obrigatório.");
      return;
    }

    this.isHistoryModalOpen = false;

    try {
      const { addHistoryEvent } = await import("../features/history/actions.js");
      await addHistoryEvent({
        domainUuid: this.selectedDomainUuid,
        title,
        category,
        summary,
        details
      });
      ui.notifications?.info(`Crônica "${title}" adicionada ao histórico!`);
      this.render();
    } catch (err) {
      ui.notifications?.error(err.message || "Erro ao adicionar crônica.");
    }
  }

  static async #onDeleteHistory(event, target) {
    if (!game.user.isGM || !this.selectedDomainUuid) return;
    const rawIdx = getActionAttr(target, "index"); const index = rawIdx != null ? Number(rawIdx) : null; if (index == null || isNaN(index)) return;

    try {
      const doc = recordIndex.get(RECORD_TYPES.DOMAIN, this.selectedDomainUuid);
      const record = decodeRecord(doc);
      const data = foundry.utils.deepClone(record.data);
      if (Array.isArray(data.history)) {
        const realIndex = data.history.length - 1 - index;
        if (realIndex >= 0 && realIndex < data.history.length) {
          data.history.splice(realIndex, 1);
          await updateRecord({
            uuid: this.selectedDomainUuid,
            recordType: RECORD_TYPES.DOMAIN,
            data
          });
          ui.notifications?.info("Crônica removida do histórico!");
          this.render();
        }
      }
    } catch (err) {
      ui.notifications?.error(err.message || "Erro ao remover crônica.");
    }
  }

  /* ------------------------------------------------------------------------
     Context Preparation
     ------------------------------------------------------------------------ */

  /* --- Galeria de Imagens da Base --- */
  static #onSelectGalleryImage(event, target) {
    const src = target?.dataset?.src || target?.getAttribute?.("data-src") || target?.closest?.("[data-src]")?.getAttribute("data-src");
    if (src) {
      this.activeGalleryImage = src;
      this.render();
    }
  }

  static async #onAddGalleryImage(event, target) {
    if (!game.user.isGM || !this.selectedDomainUuid) return;
    const input = this.element?.querySelector("#dm-new-gallery-img");
    const src = input?.value?.trim();
    if (!src) {
      ui.notifications?.warn("Digite ou selecione uma imagem para adicionar.");
      return;
    }

    try {
      const doc = recordIndex.get(RECORD_TYPES.DOMAIN, this.selectedDomainUuid);
      const record = decodeRecord(doc);
      const data = foundry.utils.deepClone(record.data);
      data.visuals = data.visuals || {};
      data.visuals.gallery = Array.isArray(data.visuals.gallery) ? data.visuals.gallery : [];
      if (!data.visuals.gallery.includes(src)) {
        data.visuals.gallery.push(src);
        await updateRecord({
          uuid: this.selectedDomainUuid,
          recordType: RECORD_TYPES.DOMAIN,
          data
        });
        if (input) input.value = "";
        this.activeGalleryImage = src;
        ui.notifications?.info("Imagem adicionada à galeria da base!");
        this.render();
      }
    } catch (err) {
      ui.notifications?.error(err.message || "Erro ao adicionar à galeria.");
    }
  }

  static async #onRemoveGalleryImage(event, target) {
    if (!game.user.isGM || !this.selectedDomainUuid) return;
    const src = target?.dataset?.src || target?.getAttribute?.("data-src") || target?.closest?.("[data-src]")?.getAttribute("data-src");
    if (!src) return;

    try {
      const doc = recordIndex.get(RECORD_TYPES.DOMAIN, this.selectedDomainUuid);
      const record = decodeRecord(doc);
      const data = foundry.utils.deepClone(record.data);
      if (Array.isArray(data.visuals?.gallery)) {
        data.visuals.gallery = data.visuals.gallery.filter((img) => img !== src);
        await updateRecord({
          uuid: this.selectedDomainUuid,
          recordType: RECORD_TYPES.DOMAIN,
          data
        });
        if (this.activeGalleryImage === src) {
          this.activeGalleryImage = null;
        }
        ui.notifications?.info("Imagem removida da galeria.");
        this.render();
      }
    } catch (err) {
      ui.notifications?.error(err.message || "Erro ao remover imagem da galeria.");
    }
  }

  /* --- Edição de Notáveis --- */
  static #onOpenEditNotableModal(event, target) {
    if (!game.user.isGM || !this.selectedDomainUuid) return;
    const localId = getActionAttr(target, "local-id");
    if (!localId) return;
    this.#closeAllModals();
    this.isEditingNotableModal = true;
    this.editingNotableLocalId = localId;
    this.render();
  }

  static #onCancelEditNotableModal() {
    this.isEditingNotableModal = false;
    this.editingNotableLocalId = null;
    this.render();
  }

  static async #onSubmitEditNotable() {
    if (!game.user.isGM || !this.selectedDomainUuid || !this.editingNotableLocalId) return;
    const name = this.element?.querySelector("#dm-edit-notable-name")?.value?.trim();
    const role = this.element?.querySelector("#dm-edit-notable-role")?.value?.trim() || "Conselheiro";
    const title = this.element?.querySelector("#dm-edit-notable-title")?.value?.trim() || "";
    const portrait = this.element?.querySelector("#dm-edit-notable-portrait")?.value?.trim() || "";
    const imageFit = this.element?.querySelector("#dm-edit-notable-portrait-fit")?.value || "cover";
    const imageShape = this.element?.querySelector("#dm-edit-notable-portrait-shape")?.value || "square";
    const imagePosX = Number(this.element?.querySelector("#dm-edit-notable-portrait-pos-x")?.value) ?? 50;
    const imagePosY = Number(this.element?.querySelector("#dm-edit-notable-portrait-pos-y")?.value) ?? 50;
    const imageZoom = Number(this.element?.querySelector("#dm-edit-notable-portrait-zoom")?.value) ?? 100;
    const loyalty = this.element?.querySelector("#dm-edit-notable-loyalty")?.value || "Alta";
    const status = this.element?.querySelector("#dm-edit-notable-status")?.value || "active";

    if (!name) {
      ui.notifications?.warn("O nome do notável é obrigatório.");
      return;
    }

    const localId = this.editingNotableLocalId;
    this.isEditingNotableModal = false;
    this.editingNotableLocalId = null;

    try {
      const { upsertNotableAction } = await import("../features/people/actions.js");
      await upsertNotableAction({
        domainUuid: this.selectedDomainUuid,
        localId,
        name,
        role,
        title,
        portrait,
        assignment: loyalty,
        status
      });
      const doc = recordIndex.get(RECORD_TYPES.DOMAIN, this.selectedDomainUuid);
      if (doc) {
        const dec = decodeRecord(doc);
        const data = foundry.utils.deepClone(dec.data);
        const list = data.population?.notables ?? data.people?.notables ?? [];
        const targetNotable = list.find((n) => n.localId === localId);
        if (targetNotable) {
          targetNotable.imageFit = imageFit;
          targetNotable.imageShape = imageShape;
          targetNotable.imagePosX = imagePosX;
          targetNotable.imagePosY = imagePosY;
          targetNotable.imageZoom = imageZoom;
          await updateRecord({ uuid: this.selectedDomainUuid, recordType: RECORD_TYPES.DOMAIN, data });
        }
      }
      ui.notifications?.info(`Notável "${name}" atualizado com sucesso!`);
      this.render();
    } catch (err) {
      ui.notifications?.error(err.message || "Erro ao atualizar notável.");
    }
  }

  /* --- Edição de Grupos Populacionais --- */
  static #onOpenEditGroupModal(event, target) {
    if (!game.user.isGM || !this.selectedDomainUuid) return;
    const localId = getActionAttr(target, "local-id");
    if (!localId) return;
    this.#closeAllModals();
    this.isEditingGroupModal = true;
    this.editingGroupLocalId = localId;
    this.render();
  }

  static #onCancelEditGroupModal() {
    this.isEditingGroupModal = false;
    this.editingGroupLocalId = null;
    this.render();
  }

  static async #onSubmitEditGroup() {
    if (!game.user.isGM || !this.selectedDomainUuid || !this.editingGroupLocalId) return;
    const form = this.element?.querySelector(".dm-dialog-card");
    const name = form?.querySelector("#dm-edit-group-name")?.value?.trim();
    const count = Number(form?.querySelector("#dm-edit-group-count")?.value) || 100;
    const happiness = form?.querySelector("#dm-edit-group-happiness")?.value || "Estável";
    let unrestScore = Number(form?.querySelector("#dm-edit-group-unrest")?.value);

    if (isNaN(unrestScore)) {
      if (happiness === "Muito Alta") unrestScore = 0;
      else if (happiness === "Estável") unrestScore = 2;
      else if (happiness === "Insatisfeito") unrestScore = 6;
      else if (happiness === "Rebelde") unrestScore = 9;
      else unrestScore = 2;
    }

    if (!name) {
      ui.notifications?.warn("O nome do grupo é obrigatório.");
      return;
    }

    const localId = this.editingGroupLocalId;
    this.isEditingGroupModal = false;
    this.editingGroupLocalId = null;

    try {
      const { upsertGroupAction } = await import("../features/people/actions.js");
      await upsertGroupAction({
        domainUuid: this.selectedDomainUuid,
        localId,
        name,
        count,
        quality: happiness,
        assignment: String(unrestScore)
      });
      ui.notifications?.info(`Grupo "${name}" atualizado!`);
      this.render();
    } catch (err) {
      ui.notifications?.error(err.message || "Erro ao editar grupo.");
    }
  }

  /* --- Edição de Relações Diplomáticas --- */
  static #onOpenEditRelationModal(event, target) {
    if (!game.user.isGM || !this.selectedDomainUuid) return;
    const targetUuid = getActionAttr(target, "target-uuid");
    if (!targetUuid) return;
    this.#closeAllModals();
    this.isEditingRelationModal = true;
    this.editingRelationTargetUuid = targetUuid;
    this.render();
  }

  static #onCancelEditRelationModal() {
    this.isEditingRelationModal = false;
    this.editingRelationTargetUuid = null;
    this.render();
  }

  static async #onSubmitEditRelation() {
    if (!game.user.isGM || !this.selectedDomainUuid || !this.editingRelationTargetUuid) return;
    const form = this.element?.querySelector(".dm-dialog-card");
    const posture = form?.querySelector("#dm-edit-relation-posture")?.value || "neutral";
    const notes = form?.querySelector("#dm-edit-relation-notes")?.value || "";

    const targetDomainUuid = this.editingRelationTargetUuid;
    this.isEditingRelationModal = false;
    this.editingRelationTargetUuid = null;

    try {
      const doc = recordIndex.get(RECORD_TYPES.DOMAIN, this.selectedDomainUuid);
      const record = decodeRecord(doc);
      const data = foundry.utils.deepClone(record.data);
      if (Array.isArray(data.relations)) {
        const rel = data.relations.find((r) => r.targetDomainUuid === targetDomainUuid);
        if (rel) {
          rel.posture = posture;
          rel.notes = notes;
        } else {
          data.relations.push({ targetDomainUuid, posture, notes });
        }
        await updateRecord({
          uuid: this.selectedDomainUuid,
          recordType: RECORD_TYPES.DOMAIN,
          data
        });
        ui.notifications?.info("Relação diplomática atualizada com sucesso!");
        this.render();
      }
    } catch (err) {
      ui.notifications?.error(err.message || "Erro ao atualizar diplomacia.");
    }
  }

  /* --- Edição de Segredos & Intel --- */
  static #onOpenEditIntelModal(event, target) {
    if (!game.user.isGM || !this.selectedDomainUuid) return;
    const localId = getActionAttr(target, "local-id");
    if (!localId) return;
    this.#closeAllModals();
    this.isEditingIntelModal = true;
    this.editingIntelLocalId = localId;
    this.render();
  }

  static #onCancelEditIntelModal() {
    this.isEditingIntelModal = false;
    this.editingIntelLocalId = null;
    this.render();
  }

  static async #onSubmitEditIntel() {
    if (!game.user.isGM || !this.selectedDomainUuid || !this.editingIntelLocalId) return;
    const form = this.element?.querySelector(".dm-dialog-card");
    const title = form?.querySelector("#dm-edit-intel-title")?.value?.trim();
    const type = form?.querySelector("#dm-edit-intel-category")?.value || "secret";
    const credibility = form?.querySelector("#dm-edit-intel-credibility")?.value || "confirmed";
    const visibility = form?.querySelector("#dm-edit-intel-visibility")?.value || "gm_only";
    const content = form?.querySelector("#dm-edit-intel-content")?.value?.trim() || "";

    if (!title) {
      ui.notifications?.warn("O título do informe é obrigatório.");
      return;
    }

    const localId = this.editingIntelLocalId;
    this.isEditingIntelModal = false;
    this.editingIntelLocalId = null;

    try {
      const doc = recordIndex.get(RECORD_TYPES.DOMAIN, this.selectedDomainUuid);
      const record = decodeRecord(doc);
      const data = foundry.utils.deepClone(record.data);
      const intelList = data.intel?.records || data.intel || [];
      const target = intelList.find((i) => i.localId === localId);
      if (target) {
        target.title = title;
        target.type = type;
        target.credibility = credibility;
        target.visibility = visibility;
        target.content = content;
        await updateRecord({
          uuid: this.selectedDomainUuid,
          recordType: RECORD_TYPES.DOMAIN,
          data
        });
        ui.notifications?.info(`Informe "${title}" atualizado com sucesso!`);
        this.render();
      }
    } catch (err) {
      ui.notifications?.error(err.message || "Erro ao atualizar informe.");
    }
  }

  /* --- Edição de Crônicas & Histórico --- */
  static #onOpenEditHistoryModal(event, target) {
    if (!game.user.isGM || !this.selectedDomainUuid) return;
    const rawIdx = getActionAttr(target, "index"); const index = rawIdx != null ? Number(rawIdx) : null; if (index == null || isNaN(index)) return;
    this.#closeAllModals();
    this.isEditingHistoryModal = true;
    this.editingHistoryIndex = index;
    this.render();
  }

  static #onCancelEditHistoryModal() {
    this.isEditingHistoryModal = false;
    this.editingHistoryIndex = null;
    this.render();
  }

  static async #onSubmitEditHistory() {
    if (!game.user.isGM || !this.selectedDomainUuid || this.editingHistoryIndex == null) return;
    const form = this.element?.querySelector(".dm-dialog-card");
    const title = form?.querySelector("#dm-edit-history-title")?.value?.trim();
    const category = form?.querySelector("#dm-edit-history-category")?.value || "story";
    const summary = form?.querySelector("#dm-edit-history-summary")?.value?.trim() || "";
    const details = form?.querySelector("#dm-edit-history-details")?.value?.trim() || "";

    if (!title) {
      ui.notifications?.warn("O título da crônica é obrigatório.");
      return;
    }

    const index = this.editingHistoryIndex;
    this.isEditingHistoryModal = false;
    this.editingHistoryIndex = null;

    try {
      const doc = recordIndex.get(RECORD_TYPES.DOMAIN, this.selectedDomainUuid);
      const record = decodeRecord(doc);
      const data = foundry.utils.deepClone(record.data);
      if (Array.isArray(data.history)) {
        const realIndex = data.history.length - 1 - index;
        if (realIndex >= 0 && realIndex < data.history.length) {
          data.history[realIndex].title = title;
          data.history[realIndex].category = category;
          data.history[realIndex].summary = summary;
          data.history[realIndex].details = details;
          await updateRecord({
            uuid: this.selectedDomainUuid,
            recordType: RECORD_TYPES.DOMAIN,
            data
          });
          ui.notifications?.info(`Crônica "${title}" atualizada!`);
          this.render();
        }
      }
    } catch (err) {
      ui.notifications?.error(err.message || "Erro ao atualizar crônica.");
    }
  }


  /* --- Sustento da População & Gastos Gerais --- */
  static #onOpenUpkeepModal() {
    if (!game.user.isGM || !this.selectedDomainUuid) return;
    this.#closeAllModals();
    this.isUpkeepModalOpen = true;
    this.render();
  }

  static #onCancelUpkeepModal() {
    this.isUpkeepModalOpen = false;
    this.render();
  }

  static async #onSubmitUpkeep() {
    if (!game.user.isGM || !this.selectedDomainUuid) return;
    const form = this.element?.querySelector(".dm-dialog-card");
    const enabled = form?.querySelector("#dm-upkeep-enabled")?.value !== "false";
    const foodPer100 = Number(form?.querySelector("#dm-upkeep-food-rate")?.value) || 1.0;
    const waterPer100 = Number(form?.querySelector("#dm-upkeep-water-rate")?.value) || 1.0;
    const guardUpkeep = Number(form?.querySelector("#dm-upkeep-guard-rate")?.value) || 1.0;

    this.isUpkeepModalOpen = false;

    try {
      const doc = recordIndex.get(RECORD_TYPES.DOMAIN, this.selectedDomainUuid);
      const record = decodeRecord(doc);
      const data = foundry.utils.deepClone(record.data);
      if (!data.economy) data.economy = {};
      data.economy.sustenanceSettings = {
        enabled,
        foodPer100,
        waterPer100,
        guardUpkeep
      };
      await updateRecord({
        uuid: this.selectedDomainUuid,
        recordType: RECORD_TYPES.DOMAIN,
        data
      });
      ui.notifications?.info("Configurações de sustento populacional salvas!");
      this.render();
    } catch (err) {
      ui.notifications?.error(err.message || "Erro ao salvar configurações de sustento.");
    }
  }

  /* --- Edição de Estoque Existente --- */
  static #onOpenEditStockModal(event, target) {
    if (!game.user.isGM || !this.selectedDomainUuid) return;
    const resId = getActionAttr(target, "resource-id");
    if (!resId) return;
    this.#closeAllModals();
    this.isEditingStockModal = true;
    this.editingStockResourceId = resId;
    this.render();
  }

  static #onCancelEditStockModal() {
    this.isEditingStockModal = false;
    this.editingStockResourceId = null;
    this.render();
  }

  static async #onSubmitEditStock() {
    if (!game.user.isGM || !this.selectedDomainUuid || !this.editingStockResourceId) return;
    const form = this.element?.querySelector(".dm-dialog-card");
    const amount = Number(form?.querySelector("#dm-edit-stock-amount")?.value) || 0;
    const reserved = Number(form?.querySelector("#dm-edit-stock-reserved")?.value) || 0;
    const resourceId = this.editingStockResourceId;

    this.isEditingStockModal = false;
    this.editingStockResourceId = null;

    try {
      const doc = recordIndex.get(RECORD_TYPES.DOMAIN, this.selectedDomainUuid);
      const record = decodeRecord(doc);
      const data = foundry.utils.deepClone(record.data);
      if (!data.economy) data.economy = {};
      if (!Array.isArray(data.economy.stocks)) data.economy.stocks = [];

      const catalog = (typeof getResourceCatalogSetting === "function" ? getResourceCatalogSetting() : null) || { resources: [] };
      const resDef = catalog.resources?.find((r) => r.id === resourceId) || { precision: 0 };
      const scale = 10 ** (resDef.precision || 0);

      const targetStock = data.economy.stocks.find((s) => s.resourceId === resourceId);
      if (targetStock) {
        targetStock.amount = Math.round(amount * scale);
        targetStock.reserved = Math.round(reserved * scale);
      } else {
        data.economy.stocks.push({
          resourceId,
          amount: Math.round(amount * scale),
          reserved: Math.round(reserved * scale)
        });
      }

      await updateRecord({
        uuid: this.selectedDomainUuid,
        recordType: RECORD_TYPES.DOMAIN,
        data
      });
      ui.notifications?.info(`Estoque de ${resourceId.toUpperCase()} atualizado!`);
      this.render();
    } catch (err) {
      ui.notifications?.error(err.message || "Erro ao editar estoque.");
    }
  }

  /* --- Edição de Fluxo Existente --- */
  static #onOpenEditFlowModal(event, target) {
    if (!game.user.isGM || !this.selectedDomainUuid) return;
    const localId = getActionAttr(target, "local-id");
    if (!localId) return;
    this.#closeAllModals();
    this.isEditingFlowModal = true;
    this.editingFlowLocalId = localId;
    this.render();
  }

  static #onCancelEditFlowModal() {
    this.isEditingFlowModal = false;
    this.editingFlowLocalId = null;
    this.render();
  }

  static async #onSubmitEditFlow() {
    if (!game.user.isGM || !this.selectedDomainUuid || !this.editingFlowLocalId) return;
    const name = this.element?.querySelector("#dm-edit-flow-name")?.value?.trim() || "Fluxo Econômico";
    const direction = this.element?.querySelector("#dm-edit-flow-direction")?.value || "inflow";
    const resourceId = this.element?.querySelector("#dm-edit-flow-resource")?.value || "credits";
    const amount = Number(this.element?.querySelector("#dm-edit-flow-amount")?.value) || 0;
    const periodTicks = Number(this.element?.querySelector("#dm-edit-flow-period")?.value) || 1;
    const category = this.element?.querySelector("#dm-edit-flow-category")?.value?.trim() || "geral";
    const active = this.element?.querySelector("#dm-edit-flow-active")?.value !== "false";

    const localId = this.editingFlowLocalId;
    this.isEditingFlowModal = false;
    this.editingFlowLocalId = null;

    // Caso seja fluxo de sustento da população
    if (localId.startsWith("upkeep-")) {
      try {
        const doc = recordIndex.get(RECORD_TYPES.DOMAIN, this.selectedDomainUuid);
        const record = decodeRecord(doc);
        const data = foundry.utils.deepClone(record.data);
        if (!data.economy) data.economy = {};
        data.economy.sustenanceSettings = data.economy.sustenanceSettings || { enabled: true, foodPer100: 1.0, waterPer100: 1.0, guardUpkeep: 1.0 };

        const groups = data.population?.groups ?? data.people?.groups ?? [];
        const totalPop = groups.reduce((acc, g) => acc + (Number(g.count || g.population) || 0), 0) || 100;

        if (localId === "upkeep-food") {
          data.economy.sustenanceSettings.foodPer100 = active ? Math.max(0, (amount / totalPop) * 100) : 0;
          ui.notifications?.info(`Consumo de comida atualizado para ${data.economy.sustenanceSettings.foodPer100.toFixed(2)} por 100 hab/tick!`);
        } else if (localId === "upkeep-water") {
          data.economy.sustenanceSettings.waterPer100 = active ? Math.max(0, (amount / totalPop) * 100) : 0;
          ui.notifications?.info(`Consumo de água atualizado para ${data.economy.sustenanceSettings.waterPer100.toFixed(2)} por 100 hab/tick!`);
        } else if (localId === "upkeep-guards") {
          const guards = data.security?.guardCount || 1;
          data.economy.sustenanceSettings.guardUpkeep = active ? Math.max(0, amount / guards) : 0;
          ui.notifications?.info(`Manutenção da guarda atualizada para ${data.economy.sustenanceSettings.guardUpkeep.toFixed(2)}/guarda!`);
        }

        await updateRecord({
          uuid: this.selectedDomainUuid,
          recordType: RECORD_TYPES.DOMAIN,
          data
        });
        this.render();
        return;
      } catch (err) {
        ui.notifications?.error(err.message || "Erro ao salvar taxa de sustento.");
        return;
      }
    }

    try {
      const { upsertDomainFlowAction } = await import("../features/economy/actions.js");
      await upsertDomainFlowAction({
        domainUuid: this.selectedDomainUuid,
        localId,
        name,
        resourceId,
        direction,
        displayAmount: String(amount),
        periodTicks: Math.max(1, periodTicks),
        category,
        active
      });
      ui.notifications?.info(`Fluxo "${name}" atualizado com sucesso!`);
      this.render();
    } catch (err) {
      ui.notifications?.error(err.message || "Erro ao editar fluxo.");
    }
  }


  /* ------------------------------------------------------------------------
     Notificações e Avisos da Visão Geral
     ------------------------------------------------------------------------ */
  static #onOpenAddNotificationModal() {
    if (!game.user.isGM) return;
    this.#closeAllModals();
    this.isNotificationModalOpen = true;
    this.render();
  }

  static #onCancelNotificationModal() {
    this.isNotificationModalOpen = false;
    this.render();
  }

  static async #onSubmitNotification() {
    if (!game.user.isGM || !this.selectedDomainUuid) return;
    const title = this.element?.querySelector("#dm-notif-title")?.value?.trim();
    const message = this.element?.querySelector("#dm-notif-message")?.value?.trim() || "";
    const severity = this.element?.querySelector("#dm-notif-severity")?.value || "info";
    const targetTab = this.element?.querySelector("#dm-notif-target-tab")?.value || "overview";

    if (!title) {
      ui.notifications?.warn("Informe o título da notificação.");
      return;
    }

    try {
      const doc = recordIndex.get(RECORD_TYPES.DOMAIN, this.selectedDomainUuid);
      const record = decodeRecord(doc);
      const data = foundry.utils.deepClone(record.data);
      if (!Array.isArray(data.notifications)) data.notifications = [];

      data.notifications.unshift({
        localId: `notif_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        title,
        message,
        category: "gm",
        severity,
        targetTab,
        timestamp: Date.now(),
        dismissed: false,
        readByUserIds: []
      });

      await updateRecord({
        uuid: this.selectedDomainUuid,
        recordType: RECORD_TYPES.DOMAIN,
        data
      });

      this.isNotificationModalOpen = false;
      ui.notifications?.info("Notificação publicada com sucesso!");
      this.render();
    } catch (err) {
      ui.notifications?.error(err.message || "Erro ao publicar notificação.");
    }
  }

  static async #onDismissNotification(event, target) {
    if (!this.selectedDomainUuid) return;
    const localId = getActionAttr(target, "local-id");
    if (!localId) return;

    try {
      const doc = recordIndex.get(RECORD_TYPES.DOMAIN, this.selectedDomainUuid);
      const record = decodeRecord(doc);
      const data = foundry.utils.deepClone(record.data);
      if (!Array.isArray(data.notifications)) return;

      const notif = data.notifications.find((n) => n.localId === localId);
      if (!notif) return;

      if (!Array.isArray(notif.readByUserIds)) notif.readByUserIds = [];
      const userId = game.user?.id || "unknown";
      if (!notif.readByUserIds.includes(userId)) {
        notif.readByUserIds.push(userId);
      }

      await updateRecord({
        uuid: this.selectedDomainUuid,
        recordType: RECORD_TYPES.DOMAIN,
        data
      });

      ui.notifications?.info("Notificação marcada como vista.");
      this.render();
    } catch (err) {
      ui.notifications?.error(err.message || "Erro ao dispensar notificação.");
    }
  }

  static async #onDismissAllNotifications() {
    if (!this.selectedDomainUuid) return;
    try {
      const doc = recordIndex.get(RECORD_TYPES.DOMAIN, this.selectedDomainUuid);
      const record = decodeRecord(doc);
      const data = foundry.utils.deepClone(record.data);
      if (!Array.isArray(data.notifications) || !data.notifications.length) return;

      const userId = game.user?.id || "unknown";
      let count = 0;
      for (const n of data.notifications) {
        if (!Array.isArray(n.readByUserIds)) n.readByUserIds = [];
        if (!n.readByUserIds.includes(userId)) {
          n.readByUserIds.push(userId);
          count++;
        }
      }

      if (count > 0) {
        await updateRecord({
          uuid: this.selectedDomainUuid,
          recordType: RECORD_TYPES.DOMAIN,
          data
        });
        ui.notifications?.info(`${count} notificação(ões) marcada(s) como lida(s).`);
        this.render();
      }
    } catch (err) {
      ui.notifications?.error(err.message || "Erro ao dispensar notificações.");
    }
  }

  static async #onDeleteNotification(event, target) {
    if (!game.user.isGM || !this.selectedDomainUuid) return;
    const localId = getActionAttr(target, "local-id");
    if (!localId) return;

    try {
      const doc = recordIndex.get(RECORD_TYPES.DOMAIN, this.selectedDomainUuid);
      const record = decodeRecord(doc);
      const data = foundry.utils.deepClone(record.data);
      if (!Array.isArray(data.notifications)) return;

      data.notifications = data.notifications.filter((n) => n.localId !== localId);
      await updateRecord({
        uuid: this.selectedDomainUuid,
        recordType: RECORD_TYPES.DOMAIN,
        data
      });

      ui.notifications?.info("Notificação excluída.");
      this.render();
    } catch (err) {
      ui.notifications?.error(err.message || "Erro ao excluir notificação.");
    }
  }

  static #onToggleNotificationsHistory() {
    this.showNotificationsHistory = !this.showNotificationsHistory;
    this.render();
  }


  /* ------------------------------------------------------------------------
     Dossiê Tático & Bio-Monitor do Notável (Inspirado em Cyberpunk HUD)
     ------------------------------------------------------------------------ */
  static #onOpenNotableDossier(event, target) {
    const localId = getActionAttr(target, "local-id");
    if (!localId) return;
    this.activeNotableDossierLocalId = localId;
    this.selectedDossierSkillId = null;
    this.render();
  }

  static #onCloseNotableDossier() {
    this.activeNotableDossierLocalId = null;
    this.selectedDossierSkillId = null;
    this.render();
  }

  static #onSelectDossierSkill(event, target) {
    const skillId = getActionAttr(target, "skill-id");
    if (skillId) {
      this.selectedDossierSkillId = skillId;
      this.render();
    }
  }

  static #onOpenEditNotableStatsModal() {
    if (!game.user.isGM) return;
    this.#closeAllModals();
    this.isEditingNotableStatsModal = true;
    this.render();
  }

  static #onCancelNotableStatsModal() {
    this.isEditingNotableStatsModal = false;
    this.render();
  }

  static async #onSubmitNotableStats() {
    if (!game.user.isGM || !this.selectedDomainUuid || !this.activeNotableDossierLocalId) return;

    const combat = Math.max(0, Math.min(20, Number(this.element?.querySelector("#dm-stat-combat")?.value) || 10));
    const stealth = Math.max(0, Math.min(20, Number(this.element?.querySelector("#dm-stat-stealth")?.value) || 10));
    const cunning = Math.max(0, Math.min(20, Number(this.element?.querySelector("#dm-stat-cunning")?.value) || 10));
    const diplomacy = Math.max(0, Math.min(20, Number(this.element?.querySelector("#dm-stat-diplomacy")?.value) || 10));
    const technique = Math.max(0, Math.min(20, Number(this.element?.querySelector("#dm-stat-technique")?.value) || 10));
    const survival = Math.max(0, Math.min(20, Number(this.element?.querySelector("#dm-stat-survival")?.value) || 10));
    const loyalty = this.element?.querySelector("#dm-stat-loyalty")?.value?.trim() || "Alta";
    const missions = Math.max(0, Number(this.element?.querySelector("#dm-stat-missions")?.value) || 0);

    try {
      const doc = recordIndex.get(RECORD_TYPES.DOMAIN, this.selectedDomainUuid);
      const record = decodeRecord(doc);
      const data = foundry.utils.deepClone(record.data);
      const notables = data.population?.notables;
      if (!Array.isArray(notables)) return;

      const not = notables.find(n => n.localId === this.activeNotableDossierLocalId);
      if (!not) return;

      not.attributes = { combat, stealth, cunning, diplomacy, technique, survival };
      not.loyalty = loyalty;
      not.missionsCompletedCount = missions;

      await updateRecord({
        uuid: this.selectedDomainUuid,
        recordType: RECORD_TYPES.DOMAIN,
        data
      });

      this.isEditingNotableStatsModal = false;
      ui.notifications?.info("Atributos táticos do notável atualizados!");
      this.render();
    } catch (err) {
      ui.notifications?.error(err.message || "Erro ao atualizar atributos do notável.");
    }
  }

  async _prepareContext(options) {
    const context = typeof super._prepareContext === "function"
      ? await super._prepareContext(options)
      : {};

    const domainRecords = listVisibleDomainRecords(game.user);

    if (!this.selectedDomainUuid && domainRecords.length > 0) {
      this.selectedDomainUuid = domainRecords[0].document.uuid;
    }

    let filteredDomains = domainRecords;
    if (this.searchQuery) {
      const query = this.searchQuery.toLowerCase();
      filteredDomains = filteredDomains.filter((d) =>
        d.document.name.toLowerCase().includes(query) ||
        (d.data.identity?.tags ?? []).some((t) => t.toLowerCase().includes(query))
      );
    }

    const domainTree = buildDomainTreeNodes(filteredDomains, null, this.selectedDomainUuid);
    const flatDomainTree = flattenDomainTree(domainTree, 0, this.collapsedFolderUuids);
    const tagGroups = buildDomainTagGroups(filteredDomains, this.selectedDomainUuid);

    const selectedRecord = domainRecords.find((d) => d.document.uuid === this.selectedDomainUuid) || null;
    let selectedDomain = null;
    let editingProject = null;
    let breadcrumbs = [];
    let metrics = {
      treasuryTotal: "0",
      netRate: "+0 /tick",
      runway: "Estável",
      effectiveDefense: 0,
      guardCount: 0,
      populationTotal: 0,
      groupCount: 0,
      notableCount: 0,
      activeProjectsCount: 0,
      completedProjectsCount: 0,
      projectsProgressPercent: 0,
      unrestRiskPercent: 0,
      unrestRiskLevel: "low"
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

    const catalog = (typeof getResourceCatalogSetting === "function" ? getResourceCatalogSetting() : null) || { resources: [] };

    if (selectedRecord) {
      const data = selectedRecord.data;

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

      const upkeepInfo = calculateDomainUpkeep({ domainData: data, catalog });
      const combinedFlows = [...(data.economy?.flows ?? []), ...upkeepInfo.syntheticFlows];

      const ledger = buildDomainLedger({
        catalog,
        economy: {
          ...data.economy,
          flows: combinedFlows
        },
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

      domainFlows = combinedFlows.map((f) => ({
        localId: f.localId,
        resourceId: f.resourceId,
        name: f.name || f.resourceId.toUpperCase(),
        direction: LABELS_PTBR.directions[f.direction] || (f.direction === "inflow" ? "Entrada" : "Saída"),
        isInflow: f.direction === "inflow",
        amountPerTickFormatted: formatMinorUnits((f.amount || f.amountPerTick || 0), 2),
        displayAmount: formatMinorUnits((f.amount || f.amountPerTick || 0), 2),
        periodTicks: f.periodTicks || 1,
        category: LABELS_PTBR.categories[f.category] || f.category || "Comércio",
        active: f.active !== false,
        isAutomaticUpkeep: Boolean(f.isSynthetic || f.localId?.startsWith("upkeep-"))
      }));

      // Projetos com Suporte a Tiers, Modificadores, Imagem e Conclusão
      const projectDocs = recordIndex.list(RECORD_TYPES.PROJECT);
      const allProjects = projectDocs.map(decodeRecord);
      const linkedProjects = allProjects.filter((p) => p.data.domainUuid === selectedRecord.document.uuid);

      let totalProjectDefense = 0;
      let totalProjectIncome = 0;
      let totalProjectUnrestReduction = 0;
      let totalProjectPopBonus = 0;

      domainProjects = linkedProjects.map((p) => {
        const req = p.data.work?.required || 100;
        const comp = p.data.work?.completed || 0;
        const pct = Math.min(100, Math.round((comp / req) * 100));
        const tier = Number(p.data.tier) || 1;
        const isCompleted = p.data.status === "completed" || pct >= 100;
        const status = isCompleted ? "completed" : (p.data.status || "active");
        const mods = p.data.modifiers || {};

        if (isCompleted) {
          totalProjectDefense += (mods.defenseBonus || 0);
          totalProjectIncome += (mods.incomeBonus || 0);
          totalProjectUnrestReduction += (mods.unrestReduction || 0);
          totalProjectPopBonus += (mods.populationBonus || 0);
        }

        const imageFit = p.data.imageFit || "cover";
        const imageHeight = Number(p.data.imageHeight) || 180;
        const imagePosX = p.data.imagePosX != null ? Number(p.data.imagePosX) : 50;
        const imagePosY = p.data.imagePosY != null ? Number(p.data.imagePosY) : 50;
        const imageZoom = p.data.imageZoom != null ? Number(p.data.imageZoom) : 100;
        const imageScale = imageZoom / 100;

        const projectObj = {
          uuid: p.document.uuid,
          name: p.document.name,
          category: p.data.category || "infraestrutura",
          categoryLabel: LABELS_PTBR.categories[p.data.category] || p.data.category || "Infraestrutura",
          tier,
          nextTier: tier + 1,
          status,
          statusLabel: LABELS_PTBR.projectStatuses[status] || status,
          isCompleted,
          completed: comp,
          required: req,
          rateAmount: p.data.rate?.amount || 10,
          progressPercent: pct,
          image: p.data.image || "",
          hasImage: Boolean(p.data.image),
          imageFit,
          imageHeight,
          imagePosX,
          imagePosY,
          imageZoom,
          imageScale,
          imageCustomStyle: `height: ${imageHeight}px; object-fit: ${imageFit}; object-position: ${imagePosX}% ${imagePosY}%; transform: scale(${imageScale});`,
          description: p.data.description || p.document.pages?.contents?.[0]?.text?.content || "",
          modifiers: mods,
          hasModifiers: Boolean(mods.defenseBonus || mods.incomeBonus || mods.unrestReduction || mods.populationBonus)
        };

        if (this.editingProjectUuid === p.document.uuid) {
          editingProject = projectObj;
        }

        return projectObj;
      });

      // Notáveis com Imagem/GIF e Localização
      notables = (data.population?.notables ?? data.people?.notables ?? []).map((n) => {
        const portrait = n.portrait || n.avatarMedia?.path || "";
        const imageFit = n.imageFit || "cover";
        const imageShape = n.imageShape || "square";
        const imagePosX = n.imagePosX != null ? Number(n.imagePosX) : 50;
        const imagePosY = n.imagePosY != null ? Number(n.imagePosY) : 50;
        const imageZoom = n.imageZoom != null ? Number(n.imageZoom) : 100;
        const imageScale = imageZoom / 100;

        return {
          localId: n.localId,
          name: n.name,
          role: n.role || "Conselheiro",
          title: n.title || "",
          portrait,
          hasPortrait: Boolean(portrait),
          imageFit,
          imageShape,
          imagePosX,
          imagePosY,
          imageZoom,
          imageScale,
          portraitCustomStyle: `object-fit: ${imageFit}; object-position: ${imagePosX}% ${imagePosY}%; transform: scale(${imageScale});`,
          loyalty: n.assignment || n.loyalty || "Neutra",
          status: n.status || "active",
          statusLabel: LABELS_PTBR.peopleStatuses[n.status] || n.status
        };
      });

      // População e Cálculos de Agitação Ponderada com Modificadores de Obras
      const rawGroups = (data.population?.groups ?? data.people?.groups ?? []);
      const totalPopCalculated = rawGroups.reduce((acc, g) => acc + (Number(g.count || g.population) || 0), 0);
      const popTotal = ((data.population?.directTotal || data.population?.total) ?? totalPopCalculated) + totalProjectPopBonus;

      const defenseBase = data.security?.defenseScore || data.security?.defenseRating || 10;
      const guards = data.security?.guardCount || 0;
      const totalDef = defenseBase + Math.floor(guards * 1.5) + totalProjectDefense;

      let weightedUnrestTotal = 0;

      groups = rawGroups.map((g) => {
        const count = Number(g.count || g.population) || 0;
        const happiness = g.quality || g.happiness || "Estável";

        let groupUnrest = Number(g.assignment);
        if (isNaN(groupUnrest)) {
          if (happiness === "Muito Alta") groupUnrest = 0;
          else if (happiness === "Estável") groupUnrest = 2;
          else if (happiness === "Insatisfeito") groupUnrest = 6;
          else if (happiness === "Rebelde") groupUnrest = 9;
          else groupUnrest = 2;
        }

        weightedUnrestTotal += (count * groupUnrest);

        const share = popTotal > 0 ? Math.round((count / popTotal) * 100) : 0;
        const unrestLabel = groupUnrest <= 2 ? "Baixa" : (groupUnrest <= 5 ? "Moderada" : "Alta");

        return {
          localId: g.localId,
          name: g.name,
          population: count,
          happiness,
          unrestScore: groupUnrest,
          unrestLabel,
          sharePercent: share
        };
      });

      const rawUnrestAvg = popTotal > 0 ? (weightedUnrestTotal / popTotal) : 0;
      const guardMitigation = Math.floor(guards * 0.2);
      const effectiveUnrest = Math.max(0, Math.min(10, Math.round(rawUnrestAvg - guardMitigation - totalProjectUnrestReduction)));
      const unrestPercent = Math.round((effectiveUnrest / 10) * 100);
      const unrestLevel = unrestPercent <= 20 ? "low" : (unrestPercent <= 50 ? "moderate" : (unrestPercent <= 80 ? "high" : "critical"));

      relations = (data.relations ?? []).map((rel) => {
        const partner = domainRecords.find((d) => d.document.uuid === rel.targetDomainUuid);
        return {
          localId: rel.localId,
          targetDomainUuid: rel.targetDomainUuid,
          targetDomainName: partner?.document?.name || "Domínio Desconhecido",
          posture: rel.posture || "neutral",
          postureLabel: LABELS_PTBR.postures[rel.posture] || rel.posture || "Neutro",
          notes: rel.notes || ""
        };
      });

      agreements = (data.agreements ?? []).map((agr) => ({
        localId: agr.localId,
        name: agr.name || "Pacto Bilateral",
        type: agr.type || "comercial",
        status: agr.status || "active",
        partnerUuid: agr.partnerUuid
      }));

      intelList = (data.intel ?? []).map((it) => ({
        localId: it.localId,
        type: it.category || it.type || "secret",
        typeLabel: LABELS_PTBR.intelCategories[it.category] || "Segredo Confidencial",
        title: it.title || "Informação Confidencial",
        content: it.content || it.summary || "",
        credibility: it.credibility || "confirmed",
        credibilityLabel: LABELS_PTBR.intelCredibility[it.credibility] || "Confirmada",
        visibility: it.visibility === "gm_only" ? "Apenas o Mestre" : (it.visibility === "public" ? "Público" : "Controladores")
      }));

      activeConditions = (data.conditions ?? []).filter((c) => c.active !== false).map((c) => ({
        localId: c.localId,
        name: c.name,
        description: c.description || "",
        severity: c.severity || "minor",
        durationTicks: c.durationTicks || "Permanente"
      }));

      fullHistory = (data.history ?? []).slice().reverse().map((h) => ({
        localId: h.localId,
        title: h.title,
        summary: h.summary,
        details: h.details,
        category: h.category || "crônica",
        timestamp: h.timestamp ? new Date(h.timestamp).toLocaleDateString("pt-BR") : "Recentemente"
      }));
      recentChronicles = fullHistory.slice(0, 3);

      const activeProj = domainProjects.filter((p) => p.status === "active");
      const completedProj = domainProjects.filter((p) => p.status === "completed");
      const avgProgress = activeProj.length > 0
        ? Math.round(activeProj.reduce((acc, p) => acc + p.progressPercent, 0) / activeProj.length)
        : 0;

      metrics = {
        ...metrics,
        effectiveDefense: totalDef,
        defenseRating: totalDef,
        guardCount: guards,
        projectDefenseBonus: totalProjectDefense,
        populationTotal: popTotal,
        groupCount: groups.length,
        notableCount: notables.length,
        activeProjectsCount: activeProj.length,
        completedProjectsCount: completedProj.length,
        projectsProgressPercent: avgProgress,
        unrestRiskPercent: unrestPercent,
        unrestRiskLevel: unrestLevel
      };

      const imageRaw = data.visuals?.image || data.identity?.crestMedia?.path || data.visuals?.crestImg || "";
      const hasImage = Boolean(imageRaw && isImageSource(imageRaw));
      const crestRaw = imageRaw || "fa-solid fa-mountain-sun";
      const gallery = Array.isArray(data.visuals?.gallery) ? data.visuals.gallery : [];
      const imageFit = data.visuals?.imageFit || "cover";
      const imageHeight = Number(data.visuals?.imageHeight) || 200;
      const imagePosX = data.visuals?.imagePosX != null ? Number(data.visuals.imagePosX) : 50;
      const imagePosY = data.visuals?.imagePosY != null ? Number(data.visuals.imagePosY) : 50;
      const imageZoom = data.visuals?.imageZoom != null ? Number(data.visuals.imageZoom) : 100;
      const imageScale = imageZoom / 100;
      const imagePosition = `${imagePosX}% ${imagePosY}%`;

      const allImages = [imageRaw, ...gallery].filter(Boolean);
      const activeImage = (this.activeGalleryImage && allImages.includes(this.activeGalleryImage))
        ? this.activeGalleryImage
        : (imageRaw || gallery[0] || "");

      const sustenanceSettings = data.economy?.sustenanceSettings || {
        enabled: true,
        foodPer100: 1.0,
        waterPer100: 1.0,
        guardUpkeep: 1.0
      };

      selectedDomain = {
        sustenanceEnabled: sustenanceSettings.enabled !== false,
        foodPer100: sustenanceSettings.foodPer100 != null ? sustenanceSettings.foodPer100 : 1.0,
        waterPer100: sustenanceSettings.waterPer100 != null ? sustenanceSettings.waterPer100 : 1.0,
        guardUpkeepRate: sustenanceSettings.guardUpkeep != null ? sustenanceSettings.guardUpkeep : 1.0,
        uuid: selectedRecord.document.uuid,
        name: selectedRecord.document.name,
        category: data.identity?.category || "territory",
        categoryLabel: LABELS_PTBR.categories[data.identity?.category] || data.identity?.category || "Território",
        nature: data.identity?.nature || "physical",
        natureLabel: LABELS_PTBR.natures[data.identity?.nature] || data.identity?.nature || "Físico / Territorial",
        state: data.identity?.state || "active",
        stateLabel: LABELS_PTBR.states[data.identity?.state] || data.identity?.state || "Ativo",
        image: imageRaw,
        hasImage,
        imageFit,
        imageHeight,
        imagePosX,
        imagePosY,
        imageZoom,
        imageScale,
        imagePosition,
        isContainFit: imageFit === "contain",
        gallery,
        allImages,
        activeImage,
        hasMultipleImages: allImages.length > 1,
        crest: crestRaw,
        isImageCrest: hasImage,
        tags: data.identity?.tags || [],
        description: data.identity?.description || "Sem descrição registrada.",
        defenseScore: defenseBase,
        guardCount: guards,
        parentUuid: data.hierarchy?.locatedInUuid || data.hierarchy?.administrativeParentUuid || "",
        controllers: data.governance?.controllers || []
      };
    }

    const availableParentDomains = domainRecords
      .filter((d) => d.document.uuid !== this.selectedDomainUuid)
      .map((d) => ({
        uuid: d.document.uuid,
        name: d.document.name,
        isSelected: Boolean(selectedDomain?.parentUuid && d.document.uuid === selectedDomain.parentUuid)
      }));

    // Lista de Jogadores do Mundo para Seleção de Donos / Controladores
    const worldUsers = game.users
      ? (game.users.contents || Array.from(game.users.values?.() || []))
      : [];

    const selectedDomainControllers = selectedDomain?.controllers || [];
    const worldPlayers = worldUsers
      .filter((u) => !u.isGM)
      .map((u) => ({
        id: u.id,
        name: u.name,
        isSelected: selectedDomainControllers.includes(u.id)
      }));

    // 1. Notável em edição
    let editingNotable = null;
    if (this.editingNotableLocalId) {
      editingNotable = notables.find((n) => n.localId === this.editingNotableLocalId) || null;
    }

    // 2. Grupo em edição
    let editingGroup = null;
    if (this.editingGroupLocalId) {
      editingGroup = groups.find((g) => g.localId === this.editingGroupLocalId) || null;
    }

    // 3. Relação em edição
    let editingRelation = null;
    if (this.editingRelationTargetUuid) {
      editingRelation = relations.find((r) => r.targetDomainUuid === this.editingRelationTargetUuid) || null;
    }

    // 4. Intel em edição
    let editingIntel = null;
    if (this.editingIntelLocalId) {
      editingIntel = intelList.find((it) => it.localId === this.editingIntelLocalId) || null;
    }

    // 5. Histórico em edição
    let editingHistory = null;
    if (this.editingHistoryIndex != null) {
      editingHistory = fullHistory[this.editingHistoryIndex] || null;
    }

    // 6. Estoque em edição
    let editingStock = null;
    if (this.editingStockResourceId && selectedRecord) {
      const st = (selectedRecord.data?.economy?.stocks || []).find((s) => s.resourceId === this.editingStockResourceId);
      const resDef = catalog.resources?.find((r) => r.id === this.editingStockResourceId) || { id: this.editingStockResourceId, name: this.editingStockResourceId.toUpperCase(), precision: 0 };
      const scale = 10 ** (resDef.precision || 0);
      editingStock = {
        resourceId: this.editingStockResourceId,
        name: resDef.name,
        precision: resDef.precision,
        stockAmountMajor: (st?.amount || 0) / scale,
        reservedAmountMajor: (st?.reserved || 0) / scale
      };
    }

    // 7. Fluxo em edição (Manual ou Sustento)
    let editingFlow = null;
    if (this.editingFlowLocalId && selectedRecord) {
      if (this.editingFlowLocalId.startsWith("upkeep-")) {
        const upkeepFlow = upkeepInfo.syntheticFlows.find((f) => f.localId === this.editingFlowLocalId);
        if (upkeepFlow) {
          const resDef = catalog.resources?.find((r) => r.id === upkeepFlow.resourceId) || { precision: 2 };
          const scale = 10 ** (resDef.precision || 0);
          editingFlow = {
            localId: upkeepFlow.localId,
            name: upkeepFlow.name,
            resourceId: upkeepFlow.resourceId,
            direction: upkeepFlow.direction,
            displayAmount: (upkeepFlow.amount || 0) / scale,
            periodTicks: upkeepFlow.periodTicks || 1,
            category: upkeepFlow.category || "sustento",
            active: true,
            isUpkeep: true
          };
        }
      } else {
        const fl = (selectedRecord.data?.economy?.flows || []).find((f) => f.localId === this.editingFlowLocalId);
        if (fl) {
          const resDef = catalog.resources?.find((r) => r.id === fl.resourceId) || { precision: 2 };
          const scale = 10 ** (resDef.precision || 0);
          editingFlow = {
            localId: fl.localId,
            name: fl.name,
            resourceId: fl.resourceId,
            direction: fl.direction,
            displayAmount: (fl.amount || 0) / scale,
            periodTicks: fl.periodTicks || 1,
            category: fl.category || "geral",
            active: fl.active !== false,
            isUpkeep: false
          };
        }
      }
    }

    const availableResources = (catalog.resources || []).map((r) => ({
      id: r.id,
      name: r.name,
      precision: r.precision
    }));

    const sustenanceSettings = selectedRecord?.data?.economy?.sustenanceSettings || {
      enabled: true,
      foodPer100: 1.0,
      waterPer100: 1.0,
      guardUpkeep: 1.0
    };

    // --- NAVIGATION HUB DATA (Inspirado no 01. NAVIGATION HUB da Referência) ---
    const totalPop = (typeof popTotal === 'number' ? popTotal : (groups || []).reduce((acc, g) => acc + (Number(g.population || g.count) || 0), 0));
    const activeProjectsCount = (domainProjects || []).filter((p) => !p.isCompleted).length;

    // Processamento de Notificações do Domínio
    const rawNotifications = Array.isArray(selectedDomain?.notifications) ? selectedDomain.notifications : [];
    const currentUserId = game.user?.id || "";

    const notificationsWithMeta = rawNotifications.map((n) => {
      const isRead = (n.readByUserIds || []).includes(currentUserId) || n.dismissed;
      let icon = "fa-solid fa-circle-info";
      if (n.severity === "critical") icon = "fa-solid fa-triangle-exclamation";
      else if (n.severity === "warning") icon = "fa-solid fa-bell";
      else if (n.severity === "success") icon = "fa-solid fa-circle-check";

      let targetTabLabel = "Visão Geral";
      if (n.targetTab === "economy") targetTabLabel = "Economia";
      else if (n.targetTab === "projects") targetTabLabel = "Obras";
      else if (n.targetTab === "people") targetTabLabel = "População";
      else if (n.targetTab === "diplomacy") targetTabLabel = "Diplomacia";
      else if (n.targetTab === "intel") targetTabLabel = "Intel";
      else if (n.targetTab === "history") targetTabLabel = "Histórico";

      let timeFormatted = "";
      if (n.timestamp) {
        const d = new Date(n.timestamp);
        timeFormatted = d.toLocaleDateString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      }

      return {
        ...n,
        isRead,
        icon,
        targetTabLabel,
        timeFormatted
      };
    });

    const unreadNotifications = notificationsWithMeta.filter((n) => !n.isRead);
    const unreadNotificationsCount = unreadNotifications.length;

    const navigationHubItems = [
      {
        index: "01",
        tab: "overview",
        title: "VISÃO GERAL & IDENTIDADE",
        shortTitle: "Visão Geral",
        icon: "fa-solid fa-landmark",
        badge: unreadNotificationsCount > 0 ? unreadNotificationsCount : null,
        status: (selectedDomain?.stateLabel || "Operacional").toUpperCase(),
        statusClass: "active",
        detail: `${selectedDomain?.natureLabel || 'Territorial'} · ${selectedDomain?.categoryLabel || 'Base'}`
      },
      {
        index: "02",
        tab: "economy",
        title: "FINANÇAS & TESOURO",
        shortTitle: "Economia",
        icon: "fa-solid fa-coins",
        status: (domainStocks?.length || domainFlows?.length) ? `${domainStocks?.length || 0} ESTOQUES · ${domainFlows?.length || 0} FLUXOS` : "SEM MOVIMENTAÇÃO",
        statusClass: (domainStocks?.length || domainFlows?.length) ? "active" : "neutral",
        detail: "Gestão de Recursos, Sustento e Balanço"
      },
      {
        index: "03",
        tab: "projects",
        title: "OBRAS & PROJETOS",
        shortTitle: "Obras",
        icon: "fa-solid fa-trowel-bricks",
        status: activeProjectsCount > 0 ? `${activeProjectsCount} EM ANDAMENTO` : "NENHUMA ATIVA",
        statusClass: activeProjectsCount > 0 ? "active" : "neutral",
        detail: `${domainProjects?.length || 0} Obras Cadastradas`
      },
      {
        index: "04",
        tab: "people",
        title: "POPULAÇÃO & NOTÁVEIS",
        shortTitle: "População",
        icon: "fa-solid fa-users",
        status: totalPop > 0 ? `${totalPop.toLocaleString('pt-BR')} HABITANTES` : "SEM POPULAÇÃO",
        statusClass: totalPop > 0 ? "active" : "neutral",
        detail: `${groups?.length || 0} Grupos · ${notables?.length || 0} Notáveis`
      },
      {
        index: "05",
        tab: "diplomacy",
        title: "DIPLOMACIA & ACORDOS",
        shortTitle: "Diplomacia",
        icon: "fa-solid fa-handshake",
        status: (relations?.length || 0) > 0 ? `${relations?.length} RELAÇÕES` : "ISOLADO",
        statusClass: (relations?.length || 0) > 0 ? "active" : "neutral",
        detail: "Tratados, Pactos e Relações Externas"
      },
      {
        index: "06",
        tab: "intel",
        title: "INTEL & SEGREDOS",
        shortTitle: "Intel",
        icon: "fa-solid fa-user-secret",
        status: (intelList?.length || 0) > 0 ? `${intelList?.length} RELATÓRIOS` : "SEM SEGREDOS",
        statusClass: (intelList?.length || 0) > 0 ? "active" : "neutral",
        detail: "Informações Confidenciais e Espionagem"
      },
      {
        index: "07",
        tab: "history",
        title: "CRÔNICAS & HISTÓRICO",
        shortTitle: "Histórico",
        icon: "fa-solid fa-feather-pointed",
        status: (fullHistory?.length || 0) > 0 ? `${fullHistory?.length} REGISTROS` : "SEM REGISTROS",
        statusClass: (fullHistory?.length || 0) > 0 ? "active" : "neutral",
        detail: "Linha do Tempo e Memória do Domínio"
      }
    ];

    const activeTabMeta = navigationHubItems.find((item) => item.tab === this.activeTab) || navigationHubItems[0];


    // Dossiê Tático do Notável Ativo
    let activeNotableDossier = null;
    const rawNotablesList = (selectedRecord?.data?.population?.notables ?? selectedRecord?.data?.people?.notables ?? []);
    if (this.activeNotableDossierLocalId && rawNotablesList.length) {
      const targetNot = rawNotablesList.find((n) => n.localId === this.activeNotableDossierLocalId);
      if (targetNot) {
        const rawAttr = targetNot.attributes || {};
        const attrList = [
          { key: "combat", label: "Combate", icon: "fa-solid fa-hand-fist", value: rawAttr.combat ?? 10, detail: "Poder em combate armado, duelos e assaltos" },
          { key: "stealth", label: "Furtividade", icon: "fa-solid fa-mask", value: rawAttr.stealth ?? 10, detail: "Infiltração silenciosa, roubo e operações ocultas" },
          { key: "cunning", label: "Astúcia", icon: "fa-solid fa-brain", value: rawAttr.cunning ?? 10, detail: "Estratégia, decifração e contra-inteligência" },
          { key: "diplomacy", label: "Diplomacia", icon: "fa-solid fa-handshake", value: rawAttr.diplomacy ?? 10, detail: "Persuasão, acordos e alianças" },
          { key: "technique", label: "Técnica", icon: "fa-solid fa-screwdriver-wrench", value: rawAttr.technique ?? 10, detail: "Engenharia de campo, arrombamento e armadilhas" },
          { key: "survival", label: "Sobrevivência", icon: "fa-solid fa-shield-heart", value: rawAttr.survival ?? 10, detail: "Resistência a dano, venenos e ambientes hostis" }
        ];

        // Perícias (constelação de nós)
        let skillsList = Array.isArray(targetNot.skills) && targetNot.skills.length ? targetNot.skills : [
          { localId: "sk_1", name: "Infiltração", level: 4, maxLevel: 5, category: "stealth", desc: "Movimentação em território hostil sem detecção." },
          { localId: "sk_2", name: "Duelo & Lâminas", level: 3, maxLevel: 5, category: "combat", desc: "Perícia em combate corpo-a-corpo e eliminação rápida." },
          { localId: "sk_3", name: "Interrogatório", level: 2, maxLevel: 5, category: "cunning", desc: "Extração de segredos e informações confidenciais." },
          { localId: "sk_4", name: "Sabotagem", level: 3, maxLevel: 5, category: "technique", desc: "Comprometimento de estruturas e mecanismos inimigos." },
          { localId: "sk_5", name: "Rastreio & Guia", level: 4, maxLevel: 5, category: "survival", desc: "Localização de trilhas e navegação em terrenos ermos." },
          { localId: "sk_6", name: "Negociação Fria", level: 2, maxLevel: 5, category: "diplomacy", desc: "Firmeza em conversas difíceis sem ceder pressão." }
        ];

        skillsList = skillsList.map(sk => ({
          ...sk,
          isSelected: (this.selectedDossierSkillId === sk.localId) || (!this.selectedDossierSkillId && sk.localId === skillsList[0].localId)
        }));

        const selectedSkill = skillsList.find(s => s.isSelected) || skillsList[0];

        activeNotableDossier = {
          ...targetNot,
          attributesList: attrList,
          skillsList,
          selectedSkill,
          statusLabel: targetNot.status === "active" ? "DISPONÍVEL NA BASE" : targetNot.status === "away" ? "EM MISSÃO DE CAMPO" : "INDISPONÍVEL",
          statusColor: targetNot.status === "active" ? "emerald" : targetNot.status === "away" ? "amber" : "crimson",
          missionsCount: targetNot.missionsCompletedCount || 0
        };
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
      isSidebarOpen: this.isSidebarOpen,
      allFoldersCollapsed: this.collapsedFolderUuids.size > 0,

      // Navigation Hub e Metadados de Aba Ativa
      navigationHubItems,
      activeTabMeta,
      unreadNotifications,
      allNotifications: notificationsWithMeta,
      unreadNotificationsCount,
      isNotificationModalOpen: this.isNotificationModalOpen,
      showNotificationsHistory: this.showNotificationsHistory,
      activeNotableDossier,
      isEditingNotableStatsModal: this.isEditingNotableStatsModal,

      // Estados de Modais
      isCreatingDomain: this.isCreatingDomain,
      isEditingDomain: this.isEditingDomain,
      isDeletingDomain: this.isDeletingDomain,
      isAdvancingTimeModal: this.isAdvancingTimeModal,
      isEventModalOpen: this.isEventModalOpen,
      isStockModalOpen: this.isStockModalOpen,
      isFlowModalOpen: this.isFlowModalOpen,
      isProjectModalOpen: this.isProjectModalOpen,
      isEditingProjectModal: this.isEditingProjectModal,
      editingProject,
      isNotableModalOpen: this.isNotableModalOpen,
      isEditingNotableModal: this.isEditingNotableModal,
      editingNotable,
      isGroupModalOpen: this.isGroupModalOpen,
      isEditingGroupModal: this.isEditingGroupModal,
      editingGroup,
      isRelationModalOpen: this.isRelationModalOpen,
      isEditingRelationModal: this.isEditingRelationModal,
      editingRelation,
      isIntelModalOpen: this.isIntelModalOpen,
      isEditingIntelModal: this.isEditingIntelModal,
      editingIntel,
      isHistoryModalOpen: this.isHistoryModalOpen,
      isEditingHistoryModal: this.isEditingHistoryModal,
      editingHistory,
      isUpkeepModalOpen: this.isUpkeepModalOpen,
      sustenanceSettings,
      isEditingStockModal: this.isEditingStockModal,
      editingStock,
      isEditingFlowModal: this.isEditingFlowModal,
      editingFlow,
      availableResources,
      isTagModalOpen: this.isTagModalOpen,
      advanceCustomTicks: this.advanceCustomTicks,

      // Dados de Contexto
      catalogResources: catalog.resources || [],
      availableParentDomains,
      worldPlayers,
      domainTree,
      flatDomainTree,
      tagGroups,
      selectedDomain,
      selectedDomainTagsFormatted: (selectedDomain?.tags || []).join(", "),
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
