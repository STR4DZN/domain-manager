import { COMMAND_TYPES, MODULE_ID, MODULE_TITLE, RECORD_TYPES, REQUEST_HANDLINGS, REQUEST_REVIEW_STATUSES, REQUEST_TYPES, SCHEMA_VERSION, TERRITORY_CONTROL_STATES } from "../core/constants.js";
import { recordIndex } from "../data/record-index.js";
import { decodeRecord } from "../models/record-codec.js";
import { getResourceCatalogSetting } from "../core/settings.js";
import { formatMinorUnits, parseMinorUnits } from "../core/numbers.js";
import { executeCommandAuthoritatively } from "../authority/execute.js";
import { buildStrategicDomainLedger } from "../features/economy/strategic.js";
import { buildDomainProjectReservations } from "../features/projects/selectors.js";
import { calculateDomainRisks } from "../features/risks/rules.js";
import { createDomainAction } from "../features/domains/actions.js";
import {
  createSquadAction,
  patchSquadAction,
  updateSquadAdministrationAction
} from "../features/squads/actions.js";
import { executeAdvanceRun } from "../simulation/advance-run.js";
import { derivePopulationSummary, moraleBand } from "../features/people/rules.js";
import {
  AGREEMENT_STATUS_LABELS,
  AGREEMENT_TYPE_LABELS,
  DIPLOMATIC_POSTURE_LABELS
} from "../features/relations/rules.js";
import {
  INTEL_CATEGORY_LABELS,
  INTEL_CREDIBILITY_LABELS,
  INTEL_VISIBILITY_LABELS,
  listVisibleIntel
} from "../features/intel/rules.js";
import { isAuthorityReady } from "../authority/socket.js";
import { isPrimaryActiveGM } from "../authority/primary-gm.js";
import { getTimekeepingStatus } from "../integration/timekeeping.js";
import {
  buildDomainNavigation,
  buildGlobalNavigation,
  buildWorkspaceNavigation,
  resolveWorkspaceForView,
  normalizeViewForDomain
} from "./navigation.js";
import {
  buildDomainCard,
  formatPercent,
  meterSegments,
  statusTone,
  summarizeDomainTelemetry
} from "./presentation.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export const SHELL_SECTIONS = Object.freeze({
  DASHBOARD: "command",
  DOMAINS: "domains",
  OPERATIONS: "operations",
  SYSTEM: "system",
  ECONOMY: "economy",
  PROJECTS: "projects",
  SIMULATION: "system",
  ADVANCE: "system",
  EVENTS: "operations",
  HELP: "system"
});

const GLOBAL_VIEW_IDS = new Set(["command", "domains", "operations", "system"]);

function canViewDocument(document, user = game.user) {
  return Boolean(
    user?.isGM
    || document?.testUserPermission?.(user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER)
  );
}

function listVisibleRecords(recordType) {
  return recordIndex.list(recordType)
    .filter((document) => canViewDocument(document))
    .map(decodeRecord)
    .filter(Boolean);
}

function listUsers() {
  const source = game.users?.contents ?? game.users ?? [];
  return Array.from(source).filter(Boolean);
}

function entityReference(record) {
  if (!record) return null;
  return { recordType: record.recordType, uuid: record.uuid, entityId: record.data?.entityId };
}

function titleCase(value) {
  return String(value ?? "")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function stateLabel(value) {
  const labels = {
    active: "Ativo",
    inactive: "Inativo",
    lost: "Perdido",
    destroyed: "Destruído",
    archived: "Arquivado",
    planned: "Planejado",
    paused: "Pausado",
    blocked: "Bloqueado",
    completed: "Concluído",
    cancelled: "Cancelado",
    available: "Disponível",
    resolved: "Resolvida",
    failed: "Falhou",
    ready: "Pronto",
    deployed: "Em campo",
    recovering: "Recuperando",
    forming: "Formação",
    operational: "Operacional",
    damaged: "Danificada",
    disabled: "Desativada",
    decommissioned: "Descomissionada",
    friendly: "Amigável",
    allied: "Aliado",
    neutral: "Neutro",
    tense: "Tenso",
    hostile: "Hostil",
    trade_partner: "Parceiro Comercial",
    rival: "Rival",
    overlord: "Suserano",
    vassal: "Vassalo"
  };
  return labels[value] ?? titleCase(value || "indefinido");
}

function referenceMatchesDomain(reference, domain) {
  if (!reference || !domain) return false;
  return reference.uuid === domain.uuid || reference.entityId === domain.data?.entityId;
}

function resolveDomainByReference(reference, domains = []) {
  if (!reference) return null;
  return domains.find((domain) => referenceMatchesDomain(reference, domain)) ?? null;
}

function diplomaticMetricTone(value, { inverse = false } = {}) {
  const n = Number(value ?? 0);
  if (inverse) {
    if (n >= 70) return "critical";
    if (n >= 40) return "warning";
    return "nominal";
  }
  if (n >= 70) return "nominal";
  if (n >= 40) return "warning";
  return "critical";
}

function territoryControlTone(state, control = 0) {
  if (state === "controlled" && Number(control) >= 70) return "nominal";
  if (state === "contested") return "warning";
  if (state === "unknown") return "neutral";
  if (state === "unclaimed") return "neutral";
  return Number(control) >= 40 ? "warning" : "neutral";
}

function recordSummary(record) {
  return {
    uuid: record.uuid,
    entityId: record.data?.entityId,
    name: record.document?.name ?? "Registro",
    status: record.data?.status ?? record.data?.identity?.state ?? "active",
    statusLabel: stateLabel(record.data?.status ?? record.data?.identity?.state ?? "active"),
    tone: statusTone(record.data?.status ?? record.data?.identity?.state),
    data: record.data
  };
}

function canManageDomainProjects(domain, user = game.user) {
  return Boolean(
    domain
    && domain.data?.management?.capabilities?.projects
    && (user?.isGM || domain.data?.governance?.controllers?.includes(user?.id))
  );
}

function canSubmitDomainRequest(domain, user = game.user) {
  return Boolean(domain && (user?.isGM || domain.data?.governance?.controllers?.includes(user?.id)));
}

const REQUEST_TYPE_LABELS = Object.freeze({
  build: "Construção",
  upgrade: "Upgrade",
  purchase: "Aquisição",
  recruit: "Recrutamento",
  mission: "Missão",
  agreement: "Acordo",
  transfer: "Transferência",
  custom: "Personalizada"
});
const REQUEST_STATUS_LABELS = Object.freeze({
  submitted: "Enviada",
  "under-review": "Em revisão",
  "needs-changes": "Requer ajustes",
  approved: "Aprovada",
  rejected: "Rejeitada",
  withdrawn: "Retirada",
  fulfilled: "Cumprida"
});
const REQUEST_HANDLING_LABELS = Object.freeze({
  none: "Sem encaminhamento",
  immediate: "Ação imediata",
  project: "Project",
  mission: "Mission",
  agreement: "Agreement"
});
function requestTone(status) {
  if (["approved", "fulfilled"].includes(status)) return "nominal";
  if (["rejected", "withdrawn"].includes(status)) return "critical";
  if (["under-review", "needs-changes"].includes(status)) return "warning";
  return "neutral";
}

function buildViewFlags(view) {
  const keys = [
    "command", "domains", "operations", "system", "overview", "economy",
    "population", "people", "structures", "projects", "squads", "missions", "requests",
    "diplomacy", "territory", "intel", "security", "history"
  ];
  return Object.fromEntries(keys.map((key) => [key, key === view]));
}

function buildResourceRows(domain, catalog, structures = []) {
  if (!domain) return [];
  const reservations = buildDomainProjectReservations(domain.uuid);
  const structureData = structures.map((record) => ({
    ...record.data,
    uuid: record.uuid,
    entityId: record.data?.entityId,
    name: record.document?.name ?? "Structure"
  }));
  const ledger = buildStrategicDomainLedger({
    domain: domain.data,
    catalog,
    structures: structureData,
    reservations
  });
  const defs = new Map((catalog?.resources ?? []).map((resource) => [resource.id, resource]));
  return ledger.map((entry) => {
    const definition = defs.get(entry.resourceId) ?? {};
    const pressureTone = entry.overReserved || entry.pressure || entry.critical
      ? "critical"
      : entry.belowReserve || entry.netDirection === "negative"
        ? "warning"
        : entry.netDirection === "positive"
          ? "nominal"
          : "neutral";
    const precision = Number(definition.precision ?? 0);
    const policy = entry.policy ?? { criticalFloor: 0, reserveTarget: 0, storageCapacity: 0 };
    const policyState = entry.overReserved || entry.pressure
      ? "SHORTFALL"
      : entry.critical
        ? "CRITICAL"
        : entry.belowReserve
          ? "BELOW RESERVE"
          : "NOMINAL";
    return {
      ...entry,
      name: definition.name ?? entry.resourceId,
      symbol: definition.symbol ?? "",
      unit: definition.unit ?? "",
      tone: pressureTone,
      policyState,
      runway: entry.runwayTicksFloor == null ? "—" : `${entry.runwayTicksFloor} t`,
      autonomyLabel: entry.runwayTicksFloor == null ? "—" : `${entry.runwayTicksFloor} t`,
      criticalFloorDisplay: formatMinorUnits(policy.criticalFloor ?? 0, precision),
      reserveTargetDisplay: formatMinorUnits(policy.reserveTarget ?? 0, precision),
      storageCapacityDisplay: Number(policy.storageCapacity ?? 0) > 0 ? formatMinorUnits(policy.storageCapacity, precision) : "∞",
      storageUtilizationDisplay: entry.storageUtilizationPercent == null ? "—" : `${Math.min(999, entry.storageUtilizationPercent)}%`,
      contributionCount: entry.contributions?.length ?? 0,
      reserveGapDisplay: formatMinorUnits(entry.reserveGap ?? 0, precision)
    };
  });
}

function parseResourceMatrix(formData, catalog, prefix) {
  const result = [];
  for (const resource of catalog?.resources ?? []) {
    const raw = String(formData.get(`${prefix}:${resource.id}`) ?? "").trim();
    if (!raw) continue;
    const amount = parseMinorUnits(raw, resource.precision ?? 0);
    if (amount > 0) result.push({ resourceId: resource.id, amount });
  }
  return result;
}

function domainRelatedRecords(domain) {
  if (!domain) {
    return { projects: [], missions: [], squads: [], people: [], structures: [], agreements: [], requests: [] };
  }

  const decode = (docs) => docs.map(decodeRecord).filter(Boolean);
  return {
    projects: decode(recordIndex.projectsForDomain(domain.uuid)),
    missions: decode(recordIndex.missionsForDomain(domain.uuid)),
    requests: decode(recordIndex.requestsForDomain(domain.uuid).filter((document) => canViewDocument(document))),
    squads: decode(recordIndex.squadsForDomain(domain.uuid)),
    people: decode(recordIndex.peopleForDomain(domain.uuid)),
    structures: decode(recordIndex.structuresForDomain(domain.uuid)),
    agreements: decode(recordIndex.agreementsForDomain(domain.uuid))
  };
}

function buildLegacyPeople(domain) {
  const notables = domain?.data?.population?.notables ?? [];
  return notables.map((person) => ({
    uuid: `legacy:${person.localId}`,
    entityId: `LEGACY:${person.localId}`,
    legacy: true,
    name: person.name,
    status: person.status,
    statusLabel: stateLabel(person.status),
    tone: statusTone(person.status),
    role: person.role || person.function || "Notável",
    specialization: person.specialization || "",
    portrait: person.portrait || "",
    morale: Number(person.morale ?? 60),
    condition: Number(person.condition ?? 100),
    notes: person.notes ?? "",
    tags: person.tags ?? [],
    squad: null,
    currentLocation: null
  }));
}

export class DomainManagerShellApp extends HandlebarsApplicationMixin(ApplicationV2) {
  activeView = "command";
  selectedDomainUuid = null;
  searchQuery = "";
  isCreateDomainOpen = false;
  isCreateSquadOpen = false;
  editingSquadUuid = null;
  supplySquadUuid = null;
  isSquadBusy = false;
  isCreateMissionOpen = false;
  preparingMissionUuid = null;
  preparingSquadUuid = null;
  resolvingMissionUuid = null;
  isMissionBusy = false;
  isCreateStructureOpen = false;
  structureCreateMode = "construction";
  editingStructureUuid = null;
  isStructureBusy = false;
  selectedProjectUuid = null;
  editingProjectUuid = null;
  editingProjectCostId = null;
  isProjectBusy = false;
  selectedRequestUuid = null;
  isRequestCreateOpen = false;
  reviewingRequestUuid = null;
  isRequestBusy = false;
  selectedPersonUuid = null;
  isPopulationConfigOpen = false;
  editingPopulationGroupId = null;
  isWorkforceOpen = false;
  isPopulationBusy = false;
  isPersonEditorOpen = false;
  editingPersonUuid = null;
  isPeopleBusy = false;
  isAdvanceBusy = false;
  isEconomyConfigOpen = false;
  isEconomyBusy = false;
  isSecurityEditorOpen = false;
  isSecurityBusy = false;
  isTerritoryEditorOpen = false;
  editingRelationId = null;
  isAgreementCreateOpen = false;
  selectedIntelId = null;
  editingIntelId = null;
  isStrategicIntelBusy = false;

  static DEFAULT_OPTIONS = {
    id: "domain-manager-app",
    classes: ["domain-manager-app-window"],
    position: { width: 1480, height: 880 },
    window: {
      title: MODULE_TITLE,
      icon: "fa-solid fa-satellite-dish",
      resizable: true,
      minimizable: true
    },
    actions: {
      navigate: DomainManagerShellApp.onNavigate,
      selectDomain: DomainManagerShellApp.onSelectDomain,
      applySearch: DomainManagerShellApp.onApplySearch,
      clearSearch: DomainManagerShellApp.onClearSearch,
      openCreateDomain: DomainManagerShellApp.onOpenCreateDomain,
      cancelCreateDomain: DomainManagerShellApp.onCancelCreateDomain,
      submitCreateDomain: DomainManagerShellApp.onSubmitCreateDomain,
      openCreateSquad: DomainManagerShellApp.onOpenCreateSquad,
      cancelCreateSquad: DomainManagerShellApp.onCancelCreateSquad,
      submitCreateSquad: DomainManagerShellApp.onSubmitCreateSquad,
      openSquadControl: DomainManagerShellApp.onOpenSquadControl,
      closeSquadControl: DomainManagerShellApp.onCloseSquadControl,
      submitSquadControl: DomainManagerShellApp.onSubmitSquadControl,
      openSquadSupply: DomainManagerShellApp.onOpenSquadSupply,
      closeSquadSupply: DomainManagerShellApp.onCloseSquadSupply,
      submitSquadSupply: DomainManagerShellApp.onSubmitSquadSupply,
      openCreateMission: DomainManagerShellApp.onOpenCreateMission,
      cancelCreateMission: DomainManagerShellApp.onCancelCreateMission,
      submitCreateMission: DomainManagerShellApp.onSubmitCreateMission,
      openMissionPrepare: DomainManagerShellApp.onOpenMissionPrepare,
      closeMissionPrepare: DomainManagerShellApp.onCloseMissionPrepare,
      submitMissionPrepare: DomainManagerShellApp.onSubmitMissionPrepare,
      releaseMissionAssignment: DomainManagerShellApp.onReleaseMissionAssignment,
      launchMission: DomainManagerShellApp.onLaunchMission,
      openMissionResolve: DomainManagerShellApp.onOpenMissionResolve,
      closeMissionResolve: DomainManagerShellApp.onCloseMissionResolve,
      submitMissionResolve: DomainManagerShellApp.onSubmitMissionResolve,
      openCreateStructure: DomainManagerShellApp.onOpenCreateStructure,
      cancelCreateStructure: DomainManagerShellApp.onCancelCreateStructure,
      submitCreateStructure: DomainManagerShellApp.onSubmitCreateStructure,
      openStructureControl: DomainManagerShellApp.onOpenStructureControl,
      closeStructureControl: DomainManagerShellApp.onCloseStructureControl,
      submitStructureControl: DomainManagerShellApp.onSubmitStructureControl,
      selectProject: DomainManagerShellApp.onSelectProject,
      openProjectEditor: DomainManagerShellApp.onOpenProjectEditor,
      closeProjectEditor: DomainManagerShellApp.onCloseProjectEditor,
      submitProjectEditor: DomainManagerShellApp.onSubmitProjectEditor,
      openProjectCostEditor: DomainManagerShellApp.onOpenProjectCostEditor,
      closeProjectCostEditor: DomainManagerShellApp.onCloseProjectCostEditor,
      submitProjectCostEditor: DomainManagerShellApp.onSubmitProjectCostEditor,
      removeProjectCost: DomainManagerShellApp.onRemoveProjectCost,
      selectRequest: DomainManagerShellApp.onSelectRequest,
      openRequestCreate: DomainManagerShellApp.onOpenRequestCreate,
      closeRequestCreate: DomainManagerShellApp.onCloseRequestCreate,
      submitRequestCreate: DomainManagerShellApp.onSubmitRequestCreate,
      openRequestReview: DomainManagerShellApp.onOpenRequestReview,
      closeRequestReview: DomainManagerShellApp.onCloseRequestReview,
      submitRequestReview: DomainManagerShellApp.onSubmitRequestReview,
      createMissionFromRequest: DomainManagerShellApp.onCreateMissionFromRequest,
      withdrawRequest: DomainManagerShellApp.onWithdrawRequest,
      fulfillRequest: DomainManagerShellApp.onFulfillRequest,
      selectPerson: DomainManagerShellApp.onSelectPerson,
      openPopulationConfig: DomainManagerShellApp.onOpenPopulationConfig,
      closePopulationConfig: DomainManagerShellApp.onClosePopulationConfig,
      submitPopulationConfig: DomainManagerShellApp.onSubmitPopulationConfig,
      openPopulationGroup: DomainManagerShellApp.onOpenPopulationGroup,
      closePopulationGroup: DomainManagerShellApp.onClosePopulationGroup,
      submitPopulationGroup: DomainManagerShellApp.onSubmitPopulationGroup,
      removePopulationGroup: DomainManagerShellApp.onRemovePopulationGroup,
      openWorkforce: DomainManagerShellApp.onOpenWorkforce,
      closeWorkforce: DomainManagerShellApp.onCloseWorkforce,
      submitWorkforce: DomainManagerShellApp.onSubmitWorkforce,
      openPersonEditor: DomainManagerShellApp.onOpenPersonEditor,
      closePersonEditor: DomainManagerShellApp.onClosePersonEditor,
      submitPersonEditor: DomainManagerShellApp.onSubmitPersonEditor,
      openEconomyConfig: DomainManagerShellApp.onOpenEconomyConfig,
      closeEconomyConfig: DomainManagerShellApp.onCloseEconomyConfig,
      submitEconomyConfig: DomainManagerShellApp.onSubmitEconomyConfig,
      openSecurityEditor: DomainManagerShellApp.onOpenSecurityEditor,
      closeSecurityEditor: DomainManagerShellApp.onCloseSecurityEditor,
      submitSecurityEditor: DomainManagerShellApp.onSubmitSecurityEditor,
      openTerritoryEditor: DomainManagerShellApp.onOpenTerritoryEditor,
      closeTerritoryEditor: DomainManagerShellApp.onCloseTerritoryEditor,
      submitTerritoryEditor: DomainManagerShellApp.onSubmitTerritoryEditor,
      openRelationEditor: DomainManagerShellApp.onOpenRelationEditor,
      closeRelationEditor: DomainManagerShellApp.onCloseRelationEditor,
      submitRelationEditor: DomainManagerShellApp.onSubmitRelationEditor,
      removeRelation: DomainManagerShellApp.onRemoveRelation,
      openAgreementCreate: DomainManagerShellApp.onOpenAgreementCreate,
      closeAgreementCreate: DomainManagerShellApp.onCloseAgreementCreate,
      submitAgreementCreate: DomainManagerShellApp.onSubmitAgreementCreate,
      setAgreementStatus: DomainManagerShellApp.onSetAgreementStatus,
      selectIntel: DomainManagerShellApp.onSelectIntel,
      openIntelEditor: DomainManagerShellApp.onOpenIntelEditor,
      closeIntelEditor: DomainManagerShellApp.onCloseIntelEditor,
      submitIntelEditor: DomainManagerShellApp.onSubmitIntelEditor,
      removeIntel: DomainManagerShellApp.onRemoveIntel,
      revealIntel: DomainManagerShellApp.onRevealIntel,
      advanceTicks: DomainManagerShellApp.onAdvanceTicks
    }
  };

  static PARTS = {
    main: {
      template: `modules/${MODULE_ID}/templates/app-shell.hbs`,
      scrollable: [".dm-app__workspace-scroll", ".dm-app-nav", ".dm-inspector", ".dm-system-dialog__body"]
    }
  };

  setRoute({ section = null, domainUuid = undefined } = {}) {
    if (section) this.activeView = section;
    if (domainUuid !== undefined) this.selectedDomainUuid = domainUuid || null;
    return this;
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    const search = this.element?.querySelector?.("[data-dm-search]");
    if (search) {
      search.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        this.searchQuery = search.value.trim();
        if (this.searchQuery) this.activeView = "domains";
        this.render({ force: true });
      });
    }
    this.element?.addEventListener?.("keydown", (event) => {
      if (!(event.metaKey || event.ctrlKey) || String(event.key).toLowerCase() !== "k") return;
      event.preventDefault();
      search?.focus?.();
      search?.select?.();
    });
  }

  async _prepareContext(options) {
    const context = await super._prepareContext?.(options) ?? {};
    const domains = listVisibleRecords(RECORD_TYPES.DOMAIN);

    if (this.selectedDomainUuid && !domains.some((domain) => domain.uuid === this.selectedDomainUuid)) {
      this.selectedDomainUuid = null;
    }

    if (!this.selectedDomainUuid && domains.length) {
      const controlled = domains.find((domain) => domain.data.governance?.controllers?.includes(game.user.id));
      this.selectedDomainUuid = controlled?.uuid ?? domains[0].uuid;
    }

    const selectedDomain = domains.find((domain) => domain.uuid === this.selectedDomainUuid) ?? null;
    if (!GLOBAL_VIEW_IDS.has(this.activeView) && selectedDomain) {
      this.activeView = normalizeViewForDomain(selectedDomain.data, this.activeView);
    }
    if (!selectedDomain && !GLOBAL_VIEW_IDS.has(this.activeView)) this.activeView = "command";

    const query = this.searchQuery.toLocaleLowerCase("pt-BR");
    const filteredDomains = domains.filter((domain) => {
      if (!query) return true;
      const haystack = [
        domain.document.name,
        domain.data.description,
        domain.data.identity?.category,
        ...(domain.data.identity?.tags ?? [])
      ].join(" ").toLocaleLowerCase("pt-BR");
      return haystack.includes(query);
    });

    const related = domainRelatedRecords(selectedDomain);
    const catalog = getResourceCatalogSetting();
    const resources = buildResourceRows(selectedDomain, catalog, related.structures);
    const economyPolicyRows = (catalog?.resources ?? []).map((resource) => {
      const stock = selectedDomain?.data.economy?.stocks?.find((entry) => entry.resourceId === resource.id)?.amount ?? 0;
      const policy = selectedDomain?.data.economy?.resourcePolicies?.find((entry) => entry.resourceId === resource.id) ?? {};
      return {
        id: resource.id,
        name: resource.name ?? resource.id,
        unit: resource.unit ?? "",
        precision: resource.precision ?? 0,
        stockValue: formatMinorUnits(stock, resource.precision ?? 0),
        criticalValue: formatMinorUnits(policy.criticalFloor ?? 0, resource.precision ?? 0),
        reserveValue: formatMinorUnits(policy.reserveTarget ?? 0, resource.precision ?? 0),
        capacityValue: formatMinorUnits(policy.storageCapacity ?? 0, resource.precision ?? 0)
      };
    });
    const telemetry = summarizeDomainTelemetry({ domain: selectedDomain, ...related });
    const domainNav = selectedDomain
      ? buildDomainNavigation(selectedDomain.data, { activeView: this.activeView })
      : [];
    const workspaceNav = selectedDomain
      ? buildWorkspaceNavigation(selectedDomain.data, { activeView: this.activeView })
      : [];
    const activeWorkspace = selectedDomain ? resolveWorkspaceForView(this.activeView) : null;
    const subsystemNav = workspaceNav.find((workspace) => workspace.active)?.children ?? [];

    const domainCards = filteredDomains.map((record) => buildDomainCard(record, { selectedUuid: this.selectedDomainUuid }));
    const globalNav = buildGlobalNavigation({ isGM: game.user.isGM, activeView: this.activeView });

    const allMissions = listVisibleRecords(RECORD_TYPES.MISSION).map(recordSummary);
    const allSquads = listVisibleRecords(RECORD_TYPES.SQUAD).map(recordSummary);
    const allProjects = listVisibleRecords(RECORD_TYPES.PROJECT).map(recordSummary);
    const allStructures = listVisibleRecords(RECORD_TYPES.STRUCTURE).map(recordSummary);

    const domainInfo = selectedDomain ? {
      ...buildDomainCard(selectedDomain, { selectedUuid: selectedDomain.uuid }),
      stateLabel: stateLabel(selectedDomain.data.identity?.state),
      stateTone: statusTone(selectedDomain.data.identity?.state),
      natureLabel: titleCase(selectedDomain.data.identity?.nature),
      presetLabel: titleCase(selectedDomain.data.management?.preset),
      entityIdShort: selectedDomain.data.entityId?.slice(-10)?.toUpperCase() ?? "—",
      capabilities: Object.entries(selectedDomain.data.management?.capabilities ?? {})
        .filter(([, enabled]) => enabled)
        .map(([key]) => titleCase(key))
    } : null;

    const canManageProjects = canManageDomainProjects(selectedDomain);
    if (this.selectedProjectUuid && !related.projects.some((record) => record.uuid === this.selectedProjectUuid)) {
      this.selectedProjectUuid = null;
      this.editingProjectUuid = null;
      this.editingProjectCostId = null;
    }
    if (!this.selectedProjectUuid && related.projects.length) this.selectedProjectUuid = related.projects[0].uuid;

    const projects = related.projects.map((record) => {
      const required = Math.max(1, Number(record.data.work?.required ?? 1));
      const completed = Math.max(0, Number(record.data.work?.completed ?? 0));
      const rateAmount = Math.max(0, Number(record.data.work?.rateAmount ?? 0));
      const periodTicks = Math.max(1, Number(record.data.work?.periodTicks ?? 1));
      const carry = Math.max(0, Number(record.data.work?.carry ?? 0));
      const progress = Math.min(100, (completed / required) * 100);
      const terminal = ["completed", "cancelled"].includes(record.data.status);
      const linkedStructures = related.structures
        .filter((structure) => {
          const reference = structure.data.activeProject;
          return reference?.uuid === record.uuid || reference?.entityId === record.data.entityId;
        })
        .map((structure) => ({
          uuid: structure.uuid,
          entityId: structure.data.entityId,
          name: structure.document.name,
          status: structure.data.status,
          statusLabel: stateLabel(structure.data.status),
          tone: statusTone(structure.data.status)
        }));
      const costs = (record.data.costs ?? []).map((cost) => {
        const definition = catalog?.resources?.find((resource) => resource.id === cost.resourceId);
        const precision = Number(definition?.precision ?? 0);
        const amount = Number(cost.amount ?? 0);
        const consumed = Number(cost.consumedAmount ?? 0);
        return {
          ...cost,
          resourceName: definition?.name ?? cost.resourceId,
          unit: definition?.unit ?? "",
          amountDisplay: definition ? formatMinorUnits(amount, precision) : String(amount),
          consumedDisplay: definition ? formatMinorUnits(consumed, precision) : String(consumed),
          remainingDisplay: definition ? formatMinorUnits(Math.max(0, amount - consumed), precision) : String(Math.max(0, amount - consumed)),
          modeLabel: cost.mode === "progressive" ? "PROGRESSIVE" : "RESERVED"
        };
      });
      return {
        ...recordSummary(record),
        selected: record.uuid === this.selectedProjectUuid,
        progress,
        progressDisplay: `${Math.round(progress)}%`,
        segments: meterSegments(progress),
        description: record.data.description ?? "",
        blockedReason: record.data.blockedReason ?? "",
        required,
        completed,
        workDisplay: `${completed} / ${required}`,
        rateAmount,
        periodTicks,
        carry,
        rateDisplay: `${rateAmount} / ${periodTicks}t`,
        costs,
        costCount: costs.length,
        linkedStructures,
        linkedStructureCount: linkedStructures.length,
        hasPlannedStructureLink: linkedStructures.some((structure) => structure.status === "planned"),
        originRequestUuid: record.data.originRequestUuid ?? null,
        terminal,
        canEdit: canManageProjects && !terminal,
        costPlanMutable: canManageProjects && !terminal && completed === 0
      };
    });
    const selectedProject = projects.find((project) => project.selected) ?? null;
    const editingProject = this.editingProjectUuid && this.editingProjectUuid !== "__new__"
      ? projects.find((project) => project.uuid === this.editingProjectUuid) ?? null
      : null;
    if (this.editingProjectUuid && this.editingProjectUuid !== "__new__" && !editingProject) this.editingProjectUuid = null;
    const projectEditorOpen = this.editingProjectUuid !== null;
    const projectStatusValues = this.editingProjectUuid === "__new__"
      ? ["planned", "active"]
      : ["planned", "active", "paused", "blocked", ...(editingProject?.hasPlannedStructureLink ? [] : ["cancelled"])];
    const projectStatusOptions = projectStatusValues.map((value) => ({
      value,
      label: stateLabel(value),
      selected: (editingProject?.status ?? "planned") === value
    }));
    const editingProjectCost = selectedProject && this.editingProjectCostId && this.editingProjectCostId !== "__new__"
      ? selectedProject.costs.find((cost) => cost.localId === this.editingProjectCostId) ?? null
      : null;
    if (this.editingProjectCostId && this.editingProjectCostId !== "__new__" && !editingProjectCost) this.editingProjectCostId = null;
    const projectCostEditorOpen = this.editingProjectCostId !== null;
    const projectResourceOptions = (catalog?.resources ?? []).map((resource) => ({
      id: resource.id,
      name: resource.name ?? resource.id,
      unit: resource.unit ?? "",
      selected: (editingProjectCost?.resourceId ?? "") === resource.id
    }));
    const projectCostModeOptions = ["reserved", "progressive"].map((value) => ({
      value,
      label: value === "reserved" ? "Reserved" : "Progressive",
      selected: (editingProjectCost?.mode ?? "reserved") === value
    }));


    const users = listUsers();
    const canCreateRequest = canSubmitDomainRequest(selectedDomain);
    if (this.selectedRequestUuid && !related.requests.some((record) => record.uuid === this.selectedRequestUuid)) {
      this.selectedRequestUuid = null;
      this.reviewingRequestUuid = null;
    }
    if (!this.selectedRequestUuid && related.requests.length) this.selectedRequestUuid = related.requests[0].uuid;
    const requests = related.requests.map((record) => {
      const requester = users.find((user) => user.uuid === record.data.requesterUserUuid);
      const status = record.data.status ?? "submitted";
      const handling = record.data.gmDecision?.handling ?? "none";
      const linkedMissionDocument = handling === "mission" && record.data.resultUuid
        ? recordIndex.get(RECORD_TYPES.MISSION, record.data.resultUuid)
        : null;
      const linkedMission = linkedMissionDocument ? decodeRecord(linkedMissionDocument) : null;
      const canWithdraw = Boolean(
        game.user.uuid === record.data.requesterUserUuid
        && ["submitted", "under-review", "needs-changes"].includes(status)
        && !record.data.resultUuid
      );
      const canFulfill = Boolean(
        game.user.isGM
        && status === "approved"
        && (
          handling === "immediate"
          || (handling === "mission" && linkedMission?.data.status === "resolved")
        )
      );
      return {
        ...recordSummary(record),
        selected: record.uuid === this.selectedRequestUuid,
        type: record.data.type,
        typeLabel: REQUEST_TYPE_LABELS[record.data.type] ?? titleCase(record.data.type),
        status,
        statusLabel: REQUEST_STATUS_LABELS[status] ?? stateLabel(status),
        tone: requestTone(status),
        requesterName: requester?.name ?? record.data.requesterUserUuid,
        requesterUserUuid: record.data.requesterUserUuid,
        intent: record.data.intent ?? "",
        details: record.data.proposal?.details ?? "",
        decisionSummary: record.data.gmDecision?.summary ?? "",
        handling,
        handlingLabel: REQUEST_HANDLING_LABELS[handling] ?? titleCase(handling),
        resultUuid: record.data.resultUuid ?? null,
        resultStatus: linkedMission?.data.status ?? null,
        resultStatusLabel: linkedMission?.data.status ? stateLabel(linkedMission.data.status) : null,
        canWithdraw,
        canFulfill,
        modifiedTime: record.document?._stats?.modifiedTime ?? null,
        history: [...(record.data.history ?? [])].reverse().map((entry) => ({
          ...entry,
          kindLabel: REQUEST_STATUS_LABELS[entry.kind] ?? titleCase(entry.kind),
          userName: users.find((user) => user.uuid === entry.userUuid)?.name ?? (entry.userUuid || "Sistema")
        })),
        canReview: Boolean(game.user.isGM && REQUEST_REVIEW_STATUSES.includes(status) && !record.data.resultUuid),
        canMaterializeMission: Boolean(
          game.user.isGM
          && status === "approved"
          && handling === "mission"
          && !record.data.resultUuid
          && selectedDomain?.data.management?.capabilities?.missions
        )
      };
    });
    const selectedRequest = requests.find((entry) => entry.selected) ?? null;
    const reviewingRequest = this.reviewingRequestUuid
      ? requests.find((entry) => entry.uuid === this.reviewingRequestUuid) ?? null
      : null;
    if (this.reviewingRequestUuid && !reviewingRequest) this.reviewingRequestUuid = null;
    const requestTypeOptions = REQUEST_TYPES.map((value) => ({ value, label: REQUEST_TYPE_LABELS[value] ?? titleCase(value) }));
    const requestReviewStatusOptions = REQUEST_REVIEW_STATUSES.map((value) => ({
      value,
      label: REQUEST_STATUS_LABELS[value] ?? titleCase(value),
      selected: (reviewingRequest?.status ?? "under-review") === value
    }));
    const requestHandlingOptions = REQUEST_HANDLINGS.map((value) => ({
      value,
      label: REQUEST_HANDLING_LABELS[value] ?? titleCase(value),
      selected: (reviewingRequest?.handling ?? "none") === value
    }));

    const squads = related.squads.map((record) => {
      const controllerIds = record.data.governance?.controllers ?? [];
      const controllerNames = controllerIds.map((id) => game.users.get(id)?.name ?? id);
      const controlledByMe = controllerIds.includes(game.user.id);
      const currentMissionDocument = record.data.currentMission?.entityId
        ? recordIndex.getByEntityId(record.data.currentMission.entityId)
        : record.data.currentMission?.uuid
          ? recordIndex.get(RECORD_TYPES.MISSION, record.data.currentMission.uuid)
          : null;
      return {
        ...recordSummary(record),
        description: record.data.description ?? "",
        entityIdShort: record.data.entityId?.slice(-10)?.toUpperCase() ?? "—",
        strength: record.data.strength,
        capacity: record.data.capacity,
        morale: record.data.morale,
        condition: record.data.condition,
        moraleDisplay: formatPercent(record.data.morale),
        conditionDisplay: formatPercent(record.data.condition),
        moraleSegments: meterSegments(record.data.morale),
        conditionSegments: meterSegments(record.data.condition),
        controllerIds,
        controllerNames,
        controllerLabel: controllerNames.length ? controllerNames.join(" · ") : "Sem operador atribuído",
        controlledByMe,
        canOperate: game.user.isGM || controlledByMe,
        canUseSupply: Boolean((game.user.isGM || controlledByMe) && selectedDomain?.data.management?.capabilities?.economy),
        resourceKinds: record.data.resources?.length ?? 0,
        resources: (record.data.resources ?? []).map((entry) => {
          const definition = catalog?.resources?.find((resource) => resource.id === entry.resourceId);
          return {
            resourceId: entry.resourceId,
            name: definition?.name ?? entry.resourceId,
            unit: definition?.unit ?? "",
            amount: entry.amount,
            amountDisplay: definition ? formatMinorUnits(entry.amount, definition.precision) : String(entry.amount)
          };
        }),
        equipmentKinds: record.data.equipment?.length ?? 0,
        compositionGroups: record.data.composition?.length ?? 0,
        currentMissionName: currentMissionDocument?.name ?? "STANDBY"
      };
    });

    const missionDocumentForReference = (reference) => reference?.entityId
      ? recordIndex.getByEntityId(reference.entityId)
      : reference?.uuid
        ? recordIndex.get(RECORD_TYPES.MISSION, reference.uuid)
        : null;
    const squadDocumentForReference = (reference) => reference?.entityId
      ? recordIndex.getByEntityId(reference.entityId)
      : reference?.uuid
        ? recordIndex.get(RECORD_TYPES.SQUAD, reference.uuid)
        : null;

    const missions = related.missions.map((record) => {
      const assignments = (record.data.assignments ?? []).map((assignment) => {
        const squadDocument = squadDocumentForReference(assignment.squad);
        const squadRecord = squadDocument ? decodeRecord(squadDocument) : null;
        const controllers = squadRecord?.data.governance?.controllers ?? [];
        return {
          ...assignment,
          squadUuid: squadRecord?.uuid ?? assignment.squad?.uuid ?? "",
          squadEntityId: squadRecord?.data.entityId ?? assignment.squad?.entityId ?? "",
          squadName: squadDocument?.name ?? "Unidade indisponível",
          squadStatus: squadRecord?.data.status ?? "unknown",
          squadStatusLabel: stateLabel(squadRecord?.data.status ?? "unknown"),
          stateLabel: stateLabel(assignment.state),
          canRelease: ["planned", "available"].includes(record.data.status)
            && Boolean(game.user.isGM || controllers.includes(game.user.id)),
          resources: (assignment.resources ?? []).map((entry) => {
            const definition = catalog?.resources?.find((resource) => resource.id === entry.resourceId);
            return {
              ...entry,
              name: definition?.name ?? entry.resourceId,
              unit: definition?.unit ?? "",
              amountDisplay: definition ? formatMinorUnits(entry.amount, definition.precision) : String(entry.amount)
            };
          })
        };
      });
      const eligibleSquads = squads.filter((squad) => {
        if (record.data.status !== "available") return false;
        if (!squad.canOperate) return false;
        const squadDocument = recordIndex.get(RECORD_TYPES.SQUAD, squad.uuid);
        const squadRecord = squadDocument ? decodeRecord(squadDocument) : null;
        const currentMissionDocument = missionDocumentForReference(squadRecord?.data.currentMission);
        return !currentMissionDocument || currentMissionDocument.uuid === record.uuid;
      }).map((squad) => ({
        ...squad,
        isPrepared: assignments.some((assignment) => assignment.squadUuid === squad.uuid),
        prepareLabel: assignments.some((assignment) => assignment.squadUuid === squad.uuid) ? "RECONFIGURAR" : "PREPARAR"
      }));
      const completedObjectives = (record.data.objectives ?? []).filter((objective) => objective.status === "completed").length;
      const failedObjectives = (record.data.objectives ?? []).filter((objective) => objective.status === "failed").length;
      return {
        ...recordSummary(record),
        briefing: record.data.briefing ?? "",
        objectives: (record.data.objectives ?? []).map((objective) => ({
          ...objective,
          isPending: objective.status === "pending",
          isCompleted: objective.status === "completed",
          isFailed: objective.status === "failed"
        })),
        objectiveCount: record.data.objectives?.length ?? 0,
        completedObjectives,
        failedObjectives,
        assignments,
        assignmentCount: assignments.length,
        committedStrength: assignments.reduce((sum, assignment) => sum + Number(assignment.committedStrength ?? 0), 0),
        eligibleSquads,
        audienceNames: (record.data.audienceUserIds ?? []).map((id) => game.users.get(id)?.name ?? id),
        audienceLabel: (record.data.audienceUserIds ?? []).length
          ? (record.data.audienceUserIds ?? []).map((id) => game.users.get(id)?.name ?? id).join(" · ")
          : "GM ONLY",
        canLaunch: Boolean(game.user.isGM && record.data.status === "available" && assignments.length),
        canResolve: Boolean(game.user.isGM && record.data.status === "active"),
        isAvailable: record.data.status === "available",
        isActive: record.data.status === "active",
        isTerminal: ["resolved", "failed", "cancelled"].includes(record.data.status),
        startedAtWorldTime: record.data.startedAtWorldTime,
        resolvedAtWorldTime: record.data.resolvedAtWorldTime,
        outcomeSummary: record.data.outcomeSummary ?? ""
      };
    });

    const editingSquadRecord = this.editingSquadUuid
      ? related.squads.find((record) => record.uuid === this.editingSquadUuid) ?? null
      : null;
    if (this.editingSquadUuid && !editingSquadRecord) this.editingSquadUuid = null;
    const editingSquad = editingSquadRecord ? squads.find((entry) => entry.uuid === editingSquadRecord.uuid) ?? null : null;
    const supplySquadRecord = this.supplySquadUuid
      ? related.squads.find((record) => record.uuid === this.supplySquadUuid) ?? null
      : null;
    if (this.supplySquadUuid && !supplySquadRecord) this.supplySquadUuid = null;
    const supplySquad = supplySquadRecord ? squads.find((entry) => entry.uuid === supplySquadRecord.uuid) ?? null : null;
    const supplyResourceOptions = (catalog?.resources ?? []).map((resource) => {
      const squadAmount = supplySquadRecord?.data.resources?.find((entry) => entry.resourceId === resource.id)?.amount ?? 0;
      const domainAmount = selectedDomain?.data.economy?.stocks?.find((entry) => entry.resourceId === resource.id)?.amount ?? 0;
      return {
        id: resource.id, name: resource.name, unit: resource.unit ?? "", precision: resource.precision,
        squadDisplay: formatMinorUnits(squadAmount, resource.precision),
        domainDisplay: formatMinorUnits(domainAmount, resource.precision)
      };
    });
    const controllerOptions = users
      .filter((user) => !user.isGM)
      .map((user) => ({
        id: user.id,
        name: user.name,
        active: Boolean(user.active),
        checked: editingSquadRecord?.data.governance?.controllers?.includes(user.id) ?? false
      }));
    const squadStatusOptions = ["forming", "ready", "deployed", "recovering", "inactive", "disbanded"]
      .map((value) => ({ value, label: stateLabel(value), selected: editingSquadRecord?.data.status === value }));

    const preparingMissionRecord = this.preparingMissionUuid
      ? related.missions.find((record) => record.uuid === this.preparingMissionUuid) ?? null
      : null;
    const preparingSquadRecord = this.preparingSquadUuid
      ? related.squads.find((record) => record.uuid === this.preparingSquadUuid) ?? null
      : null;
    if (this.preparingMissionUuid && !preparingMissionRecord) {
      this.preparingMissionUuid = null;
      this.preparingSquadUuid = null;
    }
    if (this.preparingSquadUuid && !preparingSquadRecord) this.preparingSquadUuid = null;
    const preparingMission = preparingMissionRecord ? missions.find((entry) => entry.uuid === preparingMissionRecord.uuid) ?? null : null;
    const preparingSquad = preparingSquadRecord ? squads.find((entry) => entry.uuid === preparingSquadRecord.uuid) ?? null : null;
    const existingPreparation = preparingMission?.assignments?.find((assignment) => assignment.squadUuid === preparingSquad?.uuid) ?? null;
    const missionPrepareResources = (preparingSquadRecord?.data.resources ?? []).map((entry) => {
      const definition = catalog?.resources?.find((resource) => resource.id === entry.resourceId);
      const committed = existingPreparation?.resources?.find((resource) => resource.resourceId === entry.resourceId)?.amount ?? 0;
      return {
        resourceId: entry.resourceId,
        name: definition?.name ?? entry.resourceId,
        unit: definition?.unit ?? "",
        precision: definition?.precision ?? 0,
        stockDisplay: definition ? formatMinorUnits(entry.amount, definition.precision) : String(entry.amount),
        committedDisplay: definition && committed > 0 ? formatMinorUnits(committed, definition.precision) : committed > 0 ? String(committed) : ""
      };
    });
    const resolvingMissionRecord = this.resolvingMissionUuid
      ? related.missions.find((record) => record.uuid === this.resolvingMissionUuid) ?? null
      : null;
    if (this.resolvingMissionUuid && !resolvingMissionRecord) this.resolvingMissionUuid = null;
    const resolvingMission = resolvingMissionRecord ? missions.find((entry) => entry.uuid === resolvingMissionRecord.uuid) ?? null : null;
    const missionAudienceOptions = users.filter((candidate) => !candidate.isGM).map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      active: Boolean(candidate.active)
    }));

    const resourceDefs = new Map((catalog?.resources ?? []).map((resource) => [resource.id, resource]));
    const domainControllerIds = selectedDomain?.data?.governance?.controllers ?? [];
    const canOperateDomainStructures = Boolean(game.user.isGM || domainControllerIds.includes(game.user.id));
    const structures = related.structures.map((record) => {
      const projectDocument = record.data.activeProject?.entityId
        ? recordIndex.getByEntityId(record.data.activeProject.entityId)
        : record.data.activeProject?.uuid
          ? recordIndex.get(RECORD_TYPES.PROJECT, record.data.activeProject.uuid)
          : null;
      const projectRecord = projectDocument ? decodeRecord(projectDocument) : null;
      const projectRequired = Math.max(1, Number(projectRecord?.data.work?.required ?? 1));
      const projectCompleted = Number(projectRecord?.data.work?.completed ?? 0);
      const projectProgress = projectRecord ? Math.min(100, Math.round((projectCompleted / projectRequired) * 100)) : 0;
      const mapProfile = (entries = []) => entries.map((entry) => {
        const definition = resourceDefs.get(entry.resourceId) ?? { name: entry.resourceId, precision: 0, unit: "" };
        return {
          ...entry,
          name: definition.name ?? entry.resourceId,
          unit: definition.unit ?? "",
          displayAmount: formatMinorUnits(entry.amount, definition.precision ?? 0)
        };
      });
      return {
        ...recordSummary(record),
        category: titleCase(record.data.category),
        rawCategory: record.data.category,
        description: record.data.description ?? "",
        tier: record.data.tier,
        maxTier: record.data.maxTier,
        condition: record.data.condition,
        conditionDisplay: formatPercent(record.data.condition),
        conditionSegments: meterSegments(record.data.condition),
        capacity: record.data.capacity ?? 0,
        workforceRequired: Number(record.data.workforceRequired ?? 0),
        maintenance: mapProfile(record.data.maintenance),
        production: mapProfile(record.data.production),
        tags: record.data.tags ?? [],
        canOperate: canOperateDomainStructures && !["planned", "destroyed", "decommissioned"].includes(record.data.status),
        canAdmin: Boolean(game.user.isGM),
        project: projectRecord ? {
          uuid: projectRecord.uuid,
          entityId: projectRecord.data.entityId,
          name: projectRecord.document.name,
          status: projectRecord.data.status,
          statusLabel: stateLabel(projectRecord.data.status),
          tone: statusTone(projectRecord.data.status),
          progress: projectProgress,
          progressDisplay: `${projectProgress}%`,
          segments: meterSegments(projectProgress)
        } : null
      };
    });

    const editingStructureRecord = this.editingStructureUuid
      ? related.structures.find((record) => record.uuid === this.editingStructureUuid) ?? null
      : null;
    if (this.editingStructureUuid && !editingStructureRecord) this.editingStructureUuid = null;
    const editingStructure = editingStructureRecord
      ? structures.find((entry) => entry.uuid === editingStructureRecord.uuid) ?? null
      : null;
    const structureStatusOptions = ["planned", "operational", "damaged", "disabled", "destroyed", "decommissioned"]
      .map((value) => ({ value, label: stateLabel(value), selected: editingStructure?.status === value }));
    const structureOperatorStatusOptions = ["operational", "disabled"]
      .map((value) => ({ value, label: stateLabel(value), selected: editingStructure?.status === value }));
    const editingMaintenance = new Map((editingStructureRecord?.data.maintenance ?? []).map((entry) => [entry.resourceId, entry.amount]));
    const editingProduction = new Map((editingStructureRecord?.data.production ?? []).map((entry) => [entry.resourceId, entry.amount]));
    const structureResourceOptions = (catalog?.resources ?? []).map((resource) => ({
      id: resource.id,
      name: resource.name,
      unit: resource.unit ?? "",
      precision: resource.precision ?? 0,
      maintenanceValue: editingMaintenance.has(resource.id) ? formatMinorUnits(editingMaintenance.get(resource.id), resource.precision ?? 0) : "",
      productionValue: editingProduction.has(resource.id) ? formatMinorUnits(editingProduction.get(resource.id), resource.precision ?? 0) : ""
    }));
    const structureStats = {
      total: structures.length,
      operational: structures.filter((entry) => entry.status === "operational").length,
      planned: structures.filter((entry) => entry.status === "planned").length,
      damaged: structures.filter((entry) => entry.status === "damaged").length,
      disabled: structures.filter((entry) => entry.status === "disabled").length
    };

    const population = selectedDomain?.data?.population ?? { total: 0, countMode: "direct", morale: 60, groups: [], workforce: { allocations: [] } };
    const populationSummary = selectedDomain ? derivePopulationSummary(population) : {
      total: 0, morale: 60, moraleBand: moraleBand(60), workforceEligible: 0, workforceAssigned: 0, workforceAvailable: 0, workforceOverallocated: 0
    };
    const workforceAllocations = population.workforce?.allocations ?? [];
    const groupAssigned = new Map();
    for (const allocation of workforceAllocations) {
      groupAssigned.set(allocation.groupLocalId, (groupAssigned.get(allocation.groupLocalId) ?? 0) + Number(allocation.count ?? 0));
    }
    const populationGroups = (population.groups ?? []).map((group) => {
      const assigned = groupAssigned.get(group.localId) ?? 0;
      const eligible = Number(group.workforceEligible ?? 0);
      const morale = Number(group.morale ?? 60);
      return {
        ...group,
        function: group.function ?? "",
        assigned,
        available: Math.max(0, eligible - assigned),
        moraleDisplay: `${Math.round(morale)}%`,
        moraleTone: morale >= 70 ? "nominal" : morale >= 40 ? "warning" : "critical",
        statusLabel: stateLabel(group.status),
        tone: statusTone(group.status),
        canEdit: Boolean(selectedDomain && (game.user.isGM || selectedDomain.data.governance?.controllers?.includes(game.user.id)))
      };
    });
    const workforceRows = structures.map((structure) => {
      const matching = workforceAllocations.filter((allocation) => (
        (allocation.target?.entityId && allocation.target.entityId === structure.entityId)
        || (allocation.target?.uuid && allocation.target.uuid === structure.uuid)
      ));
      const assigned = matching.reduce((sum, allocation) => sum + Number(allocation.count ?? 0), 0);
      const required = Number(structure.workforceRequired ?? 0);
      const coverage = required <= 0 ? 100 : Math.min(100, Math.round((assigned / required) * 100));
      return {
        ...structure,
        workforceAssigned: assigned,
        workforceRequired: required,
        workforceGap: Math.max(0, required - assigned),
        workforceCoverage: coverage,
        workforceCoverageDisplay: `${coverage}%`,
        workforceTone: required <= 0 || assigned >= required ? "nominal" : assigned > 0 ? "warning" : "critical"
      };
    });
    const workforceMatrixGroups = populationGroups.filter((group) => group.status === "active").map((group) => ({
      ...group,
      cells: workforceRows.map((structure) => {
        const existing = workforceAllocations.find((allocation) => allocation.groupLocalId === group.localId && (
          (allocation.target?.entityId && allocation.target.entityId === structure.entityId)
          || (allocation.target?.uuid && allocation.target.uuid === structure.uuid)
        ));
        return {
          structureUuid: structure.uuid,
          structureEntityId: structure.entityId,
          structureName: structure.name,
          count: Number(existing?.count ?? 0),
          role: existing?.role ?? ""
        };
      })
    }));
    const isNewPopulationGroup = this.editingPopulationGroupId === "__new__";
    const editingPopulationGroup = isNewPopulationGroup
      ? { localId: "__new__", name: "", count: 0, includedInTotal: true, function: "", quality: "", status: "active", assignment: "", morale: 60, workforceEligible: 0 }
      : this.editingPopulationGroupId
        ? populationGroups.find((group) => group.localId === this.editingPopulationGroupId) ?? null
        : null;
    if (this.editingPopulationGroupId && !isNewPopulationGroup && !editingPopulationGroup) this.editingPopulationGroupId = null;
    const populationGroupStatusOptions = ["active", "inactive", "unavailable", "disbanded"].map((value) => ({
      value,
      label: stateLabel(value),
      selected: editingPopulationGroup?.status === value
    }));
    const populationCountModeOptions = ["direct", "inclusive"].map((value) => ({
      value,
      label: value === "direct" ? "Direct" : "Inclusive",
      selected: population.countMode === value
    }));

    const peopleBase = [
      ...related.people.map((record) => ({
        ...recordSummary(record),
        legacy: false,
        role: record.data.role ?? record.data.function ?? "Pessoa",
        specialization: record.data.specialization ?? "",
        portrait: record.data.portrait ?? "",
        morale: Number(record.data.morale ?? 60),
        condition: Number(record.data.condition ?? 100),
        moraleDisplay: `${Math.round(Number(record.data.morale ?? 60))}%`,
        conditionDisplay: `${Math.round(Number(record.data.condition ?? 100))}%`,
        notes: record.data.notes ?? "",
        tags: record.data.tags ?? [],
        actorUuid: record.data.actorUuid ?? "",
        squad: record.data.squad ?? null,
        currentLocation: record.data.currentLocation ?? null,
        raw: record
      })),
      ...buildLegacyPeople(selectedDomain)
    ];
    if (this.selectedPersonUuid && !peopleBase.some((person) => person.uuid === this.selectedPersonUuid)) this.selectedPersonUuid = null;
    if (!this.selectedPersonUuid && peopleBase.length) this.selectedPersonUuid = peopleBase[0].uuid;
    const people = peopleBase.map((person) => ({
      ...person,
      selected: person.uuid === this.selectedPersonUuid,
      canEdit: !person.legacy && Boolean(selectedDomain && (game.user.isGM || selectedDomain.data.governance?.controllers?.includes(game.user.id)))
    }));
    const selectedPerson = people.find((person) => person.selected) ?? null;
    const editingPersonRecord = this.editingPersonUuid
      ? related.people.find((record) => record.uuid === this.editingPersonUuid) ?? null
      : null;
    if (this.editingPersonUuid && !editingPersonRecord) this.editingPersonUuid = null;
    const editingPerson = editingPersonRecord ? people.find((person) => person.uuid === editingPersonRecord.uuid) ?? null : null;
    const canManagePopulation = Boolean(
      selectedDomain
      && selectedDomain.data.management?.capabilities?.population
      && (game.user.isGM || selectedDomain.data.governance?.controllers?.includes(game.user.id))
    );
    const canManagePeople = Boolean(
      selectedDomain
      && selectedDomain.data.management?.capabilities?.people
      && (game.user.isGM || selectedDomain.data.governance?.controllers?.includes(game.user.id))
    );
    const personSquadOptions = related.squads.map((record) => ({
      uuid: record.uuid,
      entityId: record.data.entityId,
      name: record.document.name,
      selected: Boolean(editingPerson?.squad && (
        editingPerson.squad.entityId === record.data.entityId || editingPerson.squad.uuid === record.uuid
      ))
    }));
    const personStatusOptions = ["active", "away", "injured", "unavailable", "missing", "dead", "retired"].map((value) => ({
      value,
      label: stateLabel(value),
      selected: (editingPerson?.status ?? "active") === value
    }));

    const canManageTerritory = Boolean(game.user.isGM && selectedDomain?.data.management?.capabilities?.territory);
    const canManageDiplomacy = Boolean(game.user.isGM && selectedDomain?.data.management?.capabilities?.diplomacy);
    const canManageIntel = Boolean(game.user.isGM && selectedDomain?.data.management?.capabilities?.intel);

    const territoryData = selectedDomain?.data?.territory ?? {
      controlState: "unknown", controller: null, control: 0, strategicValue: 0, influence: [], notes: ""
    };
    const territoryController = resolveDomainByReference(territoryData.controller, domains);
    const physicalParent = selectedDomain?.data?.hierarchy?.locatedInUuid
      ? domains.find((domain) => domain.uuid === selectedDomain.data.hierarchy.locatedInUuid) ?? null
      : null;
    const administrativeParent = selectedDomain?.data?.hierarchy?.administrativeParentUuid
      ? domains.find((domain) => domain.uuid === selectedDomain.data.hierarchy.administrativeParentUuid) ?? null
      : null;
    const physicalChildren = selectedDomain
      ? domains.filter((domain) => domain.data?.hierarchy?.locatedInUuid === selectedDomain.uuid)
      : [];
    const administrativeChildren = selectedDomain
      ? domains.filter((domain) => domain.data?.hierarchy?.administrativeParentUuid === selectedDomain.uuid)
      : [];
    const territoryInfluence = (territoryData.influence ?? []).map((entry) => {
      const domain = resolveDomainByReference(entry.domain, domains);
      const value = Number(entry.value ?? 0);
      return {
        ...entry,
        domainName: domain?.document?.name ?? "Unknown node",
        domainEntityId: domain?.data?.entityId ?? entry.domain?.entityId ?? "—",
        value,
        valueDisplay: `${value}%`,
        segments: meterSegments(value),
        tone: value >= 70 ? "nominal" : value >= 35 ? "warning" : "neutral"
      };
    }).sort((a, b) => b.value - a.value || a.domainName.localeCompare(b.domainName));
    const territory = selectedDomain ? {
      controlState: territoryData.controlState ?? "unknown",
      controlStateLabel: stateLabel(territoryData.controlState ?? "unknown"),
      tone: territoryControlTone(territoryData.controlState, territoryData.control),
      controllerName: territoryController?.document?.name ?? (territoryData.controller ? "Unresolved controller" : "No controller"),
      controllerEntityId: territoryController?.data?.entityId ?? territoryData.controller?.entityId ?? "—",
      control: Number(territoryData.control ?? 0),
      controlDisplay: `${Number(territoryData.control ?? 0)}%`,
      controlSegments: meterSegments(Number(territoryData.control ?? 0)),
      strategicValue: Number(territoryData.strategicValue ?? 0),
      strategicValueDisplay: `${Number(territoryData.strategicValue ?? 0)}%`,
      strategicSegments: meterSegments(Number(territoryData.strategicValue ?? 0)),
      influence: territoryInfluence,
      notes: territoryData.notes ?? "",
      physicalParentName: physicalParent?.document?.name ?? "ROOT / NONE",
      administrativeParentName: administrativeParent?.document?.name ?? "ROOT / NONE",
      physicalChildren: physicalChildren.map((domain) => ({ name: domain.document.name, uuid: domain.uuid, entityId: domain.data.entityId })),
      administrativeChildren: administrativeChildren.map((domain) => ({ name: domain.document.name, uuid: domain.uuid, entityId: domain.data.entityId }))
    } : null;
    const territoryDomainOptions = domains.map((domain) => ({
      uuid: domain.uuid,
      entityId: domain.data.entityId,
      name: domain.document.name,
      isSelf: domain.uuid === selectedDomain?.uuid,
      controllerSelected: Boolean(territoryData.controller && referenceMatchesDomain(territoryData.controller, domain)),
      influenceValue: territoryInfluence.find((entry) => entry.domainEntityId === domain.data.entityId)?.value ?? 0
    }));
    const territoryControlOptions = TERRITORY_CONTROL_STATES.map((value) => ({
      value, label: stateLabel(value), selected: (territoryData.controlState ?? "unknown") === value
    }));

    const relations = (selectedDomain?.data?.relations ?? []).map((relation) => {
      const target = resolveDomainByReference(relation.target, domains)
        ?? domains.find((domain) => domain.uuid === relation.targetDomainUuid)
        ?? null;
      const score = Number(relation.score ?? 0);
      const trust = Number(relation.trust ?? 50);
      const tension = Number(relation.tension ?? 0);
      return {
        ...relation,
        targetName: target?.document?.name ?? "External entity",
        targetEntityId: target?.data?.entityId ?? relation.target?.entityId ?? relation.targetDomainUuid ?? "—",
        postureLabel: DIPLOMATIC_POSTURE_LABELS[relation.posture] ?? stateLabel(relation.posture),
        tone: statusTone(relation.posture),
        score,
        scoreDisplay: score > 0 ? `+${score}` : String(score),
        trust, trustDisplay: `${trust}%`, trustTone: diplomaticMetricTone(trust), trustSegments: meterSegments(trust),
        tension, tensionDisplay: `${tension}%`, tensionTone: diplomaticMetricTone(tension, { inverse: true }), tensionSegments: meterSegments(tension),
        target
      };
    });
    const editingRelation = this.editingRelationId && this.editingRelationId !== "__new__"
      ? relations.find((relation) => relation.localId === this.editingRelationId) ?? null
      : null;
    if (this.editingRelationId && this.editingRelationId !== "__new__" && !editingRelation) this.editingRelationId = null;
    const relationTargetOptions = domains
      .filter((domain) => domain.uuid !== selectedDomain?.uuid)
      .map((domain) => ({
        uuid: domain.uuid, entityId: domain.data.entityId, name: domain.document.name,
        selected: Boolean(editingRelation?.target && referenceMatchesDomain(editingRelation.target, domain))
          || editingRelation?.targetDomainUuid === domain.uuid
      }));
    const diplomaticPostureOptions = Object.entries(DIPLOMATIC_POSTURE_LABELS).map(([value, label]) => ({
      value, label, selected: (editingRelation?.posture ?? "neutral") === value
    }));

    const agreements = related.agreements.map((record) => {
      const parties = (record.data.parties ?? []).map((party) => {
        const domain = resolveDomainByReference(party, domains);
        return { reference: party, name: domain?.document?.name ?? party.entityId ?? party.uuid ?? "Unknown party", entityId: domain?.data?.entityId ?? party.entityId ?? "—" };
      });
      const transfers = (record.data.transfers ?? []).map((transfer) => {
        const definition = catalog?.resources?.find((resource) => resource.id === transfer.resourceId);
        const from = resolveDomainByReference(transfer.fromDomain, domains);
        const to = resolveDomainByReference(transfer.toDomain, domains);
        return {
          ...transfer,
          resourceName: definition?.name ?? transfer.resourceId,
          amountDisplay: definition ? formatMinorUnits(transfer.amount, definition.precision ?? 0) : String(transfer.amount),
          unit: definition?.unit ?? "",
          fromName: from?.document?.name ?? transfer.fromDomain?.entityId ?? "?",
          toName: to?.document?.name ?? transfer.toDomain?.entityId ?? "?"
        };
      });
      return {
        ...recordSummary(record),
        description: record.data.description ?? "",
        type: record.data.type ?? "custom",
        typeLabel: AGREEMENT_TYPE_LABELS[record.data.type] ?? titleCase(record.data.type ?? "custom"),
        statusLabel: AGREEMENT_STATUS_LABELS[record.data.status] ?? stateLabel(record.data.status),
        parties,
        partyLabel: parties.map((party) => party.name).join(" ↔ "),
        transfers,
        transferCount: transfers.length,
        startTick: record.data.startTick,
        endTick: record.data.endTick,
        timingLabel: record.data.startTick == null && record.data.endTick == null
          ? "OPEN TERM"
          : `${record.data.startTick ?? "NOW"} → ${record.data.endTick ?? "∞"}`,
        entityIdShort: record.data.entityId?.slice(-10)?.toUpperCase() ?? "—"
      };
    });
    const agreementDomainOptions = domains
      .filter((domain) => domain.uuid !== selectedDomain?.uuid)
      .map((domain) => ({ uuid: domain.uuid, entityId: domain.data.entityId, name: domain.document.name }));
    const agreementTypeOptions = Object.entries(AGREEMENT_TYPE_LABELS).map(([value, label]) => ({ value, label }));
    const agreementResourceOptions = (catalog?.resources ?? []).map((resource) => ({
      id: resource.id, name: resource.name ?? resource.id, unit: resource.unit ?? "", precision: resource.precision ?? 0
    }));

    const visibleIntelRaw = selectedDomain
      ? listVisibleIntel(selectedDomain.data.intel ?? [], {
          user: game.user,
          controllerIds: selectedDomain.data.governance?.controllers ?? []
        })
      : [];
    if (this.selectedIntelId && !visibleIntelRaw.some((entry) => entry.localId === this.selectedIntelId)) this.selectedIntelId = null;
    if (!this.selectedIntelId && visibleIntelRaw.length) this.selectedIntelId = visibleIntelRaw[0].localId;
    const intel = visibleIntelRaw.map((entry) => {
      const target = resolveDomainByReference(entry.targetDomain, domains);
      const credibilityTone = entry.credibility === "confirmed" ? "nominal" : entry.credibility === "likely" ? "neutral" : entry.credibility === "doubtful" ? "warning" : "critical";
      return {
        ...entry,
        selected: entry.localId === this.selectedIntelId,
        categoryLabel: INTEL_CATEGORY_LABELS[entry.category] ?? stateLabel(entry.category),
        credibilityLabel: INTEL_CREDIBILITY_LABELS[entry.credibility] ?? stateLabel(entry.credibility),
        visibilityLabel: INTEL_VISIBILITY_LABELS[entry.visibility] ?? stateLabel(entry.visibility),
        targetName: target?.document?.name ?? (entry.targetDomain ? "Unknown target" : "General / no target"),
        targetEntityId: target?.data?.entityId ?? entry.targetDomain?.entityId ?? "—",
        tone: credibilityTone,
        sourceLabel: entry.source || "UNATTRIBUTED",
        tagLabel: (entry.tags ?? []).join(" · ") || "NO TAGS"
      };
    });
    const selectedIntel = intel.find((entry) => entry.selected) ?? null;
    const intelStats = {
      visible: intel.length,
      confirmed: intel.filter((entry) => entry.credibility === "confirmed").length,
      restricted: intel.filter((entry) => entry.visibility === "gm_only").length,
      revealed: intel.filter((entry) => entry.revealed || entry.visibility === "public").length
    };
    const editingIntel = this.editingIntelId && this.editingIntelId !== "__new__"
      ? intel.find((entry) => entry.localId === this.editingIntelId) ?? null
      : null;
    if (this.editingIntelId && this.editingIntelId !== "__new__" && !editingIntel) this.editingIntelId = null;
    const intelCategoryOptions = Object.entries(INTEL_CATEGORY_LABELS).map(([value, label]) => ({ value, label, selected: (editingIntel?.category ?? "fact") === value }));
    const intelCredibilityOptions = Object.entries(INTEL_CREDIBILITY_LABELS).map(([value, label]) => ({ value, label, selected: (editingIntel?.credibility ?? "confirmed") === value }));
    const intelVisibilityOptions = Object.entries(INTEL_VISIBILITY_LABELS).map(([value, label]) => ({ value, label, selected: (editingIntel?.visibility ?? "all_controllers") === value }));
    const intelTargetOptions = domains.map((domain) => ({
      uuid: domain.uuid, entityId: domain.data.entityId, name: domain.document.name,
      selected: Boolean(editingIntel?.targetDomain && referenceMatchesDomain(editingIntel.targetDomain, domain))
    }));

    const history = [...(selectedDomain?.data?.history ?? [])].reverse();
    const conditions = (selectedDomain?.data?.conditions ?? []).map((condition) => ({
      ...condition,
      tone: condition.severity === "severe" ? "critical" : condition.severity === "moderate" ? "warning" : "neutral"
    }));

    const domainRisks = selectedDomain ? calculateDomainRisks(selectedDomain.data, catalog) : null;
    const defense = selectedDomain ? {
      defenseRating: Number(selectedDomain.data.security?.defenseRating ?? 0),
      guardCount: Number(selectedDomain.data.security?.guardCount ?? 0),
      fortifications: [...(selectedDomain.data.security?.fortifications ?? [])],
      effectiveDefense: Number(domainRisks?.security?.effectiveDefense ?? 0),
      defenseLevel: String(domainRisks?.security?.level ?? "low").toUpperCase(),
      scarcityRisk: Number(domainRisks?.scarcityRisk?.percent ?? 0),
      scarcityTone: domainRisks?.scarcityRisk?.level === "critical" ? "critical" : domainRisks?.scarcityRisk?.level === "warning" ? "warning" : "nominal",
      scarcityFactors: domainRisks?.scarcityRisk?.factors ?? [],
      unrestRisk: Number(domainRisks?.unrestRisk?.percent ?? 0),
      unrestTone: domainRisks?.unrestRisk?.level === "critical" ? "critical" : domainRisks?.unrestRisk?.level === "warning" ? "warning" : "nominal",
      unrestFactors: domainRisks?.unrestRisk?.factors ?? []
    } : null;
    const canManageSecurity = Boolean(game.user.isGM && selectedDomain?.data.management?.capabilities?.security);

    const controllers = (selectedDomain?.data?.governance?.controllers ?? []).map((id) => game.users.get(id)?.name ?? id);
    const timekeeping = getTimekeepingStatus?.() ?? {};

    return {
      ...context,
      appVersion: game.modules.get(MODULE_ID)?.version ?? "dev",
      schemaVersion: SCHEMA_VERSION,
      isGM: game.user.isGM,
      isPrimaryGM: isPrimaryActiveGM(),
      authorityReady: isAuthorityReady(),
      activeView: this.activeView,
      view: buildViewFlags(this.activeView),
      globalNav,
      domainNav,
      workspaceNav,
      activeWorkspace,
      subsystemNav,
      domains: domainCards,
      domainCount: domains.length,
      selectedDomain: domainInfo,
      domainData: selectedDomain?.data ?? null,
      hasSelectedDomain: Boolean(selectedDomain),
      searchQuery: this.searchQuery,
      isCreateDomainOpen: this.isCreateDomainOpen,
      isCreateSquadOpen: this.isCreateSquadOpen,
      isCreateMissionOpen: this.isCreateMissionOpen,
      preparingMission,
      preparingSquad,
      existingPreparation,
      missionPrepareResources,
      resolvingMission,
      missionAudienceOptions,
      canCreateMission: Boolean(game.user.isGM && selectedDomain?.data.management?.capabilities?.missions),
      editingSquad,
      supplySquad,
      supplyResourceOptions,
      controllerOptions,
      squadStatusOptions,
      canCreateSquad: Boolean(game.user.isGM && selectedDomain?.data.management?.capabilities?.squads),
      isEconomyConfigOpen: this.isEconomyConfigOpen,
      economyPolicyRows,
      canConfigureEconomy: Boolean(game.user.isGM && selectedDomain?.data.management?.capabilities?.economy),
      defense,
      canManageSecurity,
      isSecurityEditorOpen: this.isSecurityEditorOpen,
      populationSummary,
      populationGroups,
      workforceRows,
      workforceMatrixGroups,
      editingPopulationGroup,
      populationGroupStatusOptions,
      populationCountModeOptions,
      isPopulationConfigOpen: this.isPopulationConfigOpen,
      isPopulationGroupOpen: this.editingPopulationGroupId !== null,
      isWorkforceOpen: this.isWorkforceOpen,
      canManagePopulation,
      editingPerson,
      isPersonEditorOpen: this.isPersonEditorOpen,
      personSquadOptions,
      personStatusOptions,
      canManagePeople,
      isCreateStructureOpen: this.isCreateStructureOpen,
      structureCreateMode: this.structureCreateMode,
      structureCreateIsConstruction: this.structureCreateMode === "construction",
      structureCreateIsDirect: this.structureCreateMode === "direct",
      editingStructure,
      structureResourceOptions,
      structureStats,
      structureStatusOptions,
      structureOperatorStatusOptions,
      canBeginStructureConstruction: Boolean(
        selectedDomain
        && selectedDomain.data.management?.capabilities?.structures
        && selectedDomain.data.management?.capabilities?.projects
        && (game.user.isGM || selectedDomain.data.governance?.controllers?.includes(game.user.id))
      ),
      canRegisterStructure: Boolean(game.user.isGM && selectedDomain?.data.management?.capabilities?.structures),
      telemetry,
      resources,
      catalogEmpty: (catalog?.resources?.length ?? 0) === 0,
      projects,
      selectedProject,
      canManageProjects,
      projectEditorOpen,
      editingProject,
      projectStatusOptions,
      projectCostEditorOpen,
      editingProjectCost,
      projectResourceOptions,
      projectCostModeOptions,
      missions,
      squads,
      structures,
      people,
      selectedPerson,
      territory,
      territoryDomainOptions,
      territoryControlOptions,
      canManageTerritory,
      isTerritoryEditorOpen: this.isTerritoryEditorOpen,
      relations,
      editingRelation,
      relationTargetOptions,
      diplomaticPostureOptions,
      isRelationEditorOpen: this.editingRelationId !== null,
      canManageDiplomacy,
      agreements,
      agreementDomainOptions,
      agreementTypeOptions,
      agreementResourceOptions,
      isAgreementCreateOpen: this.isAgreementCreateOpen,
      requests,
      selectedRequest,
      reviewingRequest,
      canCreateRequest,
      isRequestCreateOpen: this.isRequestCreateOpen,
      isRequestReviewOpen: this.reviewingRequestUuid !== null,
      requestTypeOptions,
      requestReviewStatusOptions,
      requestHandlingOptions,
      intel,
      intelStats,
      selectedIntel,
      editingIntel,
      intelCategoryOptions,
      intelCredibilityOptions,
      intelVisibilityOptions,
      intelTargetOptions,
      isIntelEditorOpen: this.editingIntelId !== null,
      canManageIntel,
      history,
      conditions,
      controllers,
      allMissions,
      allSquads,
      allProjects,
      allStructures,
      globalCounts: {
        domains: domains.length,
        projects: allProjects.length,
        missions: allMissions.length,
        squads: allSquads.length,
        structures: allStructures.length
      },
      system: {
        authority: isAuthorityReady() ? "ONLINE" : "OFFLINE",
        authorityTone: isAuthorityReady() ? "nominal" : "critical",
        primary: isPrimaryActiveGM() ? "PRIMARY" : game.user.isGM ? "SECONDARY" : "CLIENT",
        activeGM: game.users.activeGM?.name ?? "Nenhum",
        timeProvider: timekeeping.providerName ?? timekeeping.provider ?? "Foundry World Time",
        timeConnected: timekeeping.available ?? timekeeping.connected ?? false
      }
    };
  }

  static onNavigate(event, target) {
    const view = target?.dataset?.view;
    if (!view) return;
    this.activeView = view;
    this.render({ force: true });
  }

  static onSelectDomain(event, target) {
    const uuid = target?.dataset?.uuid;
    if (!uuid) return;
    this.selectedDomainUuid = uuid;
    this.selectedProjectUuid = null;
    this.editingProjectUuid = null;
    this.editingProjectCostId = null;
    this.selectedRequestUuid = null;
    this.isRequestCreateOpen = false;
    this.reviewingRequestUuid = null;
    if (GLOBAL_VIEW_IDS.has(this.activeView) && this.activeView !== "domains") this.activeView = "overview";
    this.render({ force: true });
  }

  static onSelectRequest(event, target) {
    const uuid = String(target?.dataset?.requestUuid ?? "");
    if (!uuid) return;
    const document = recordIndex.get(RECORD_TYPES.REQUEST, uuid);
    if (!document || !canViewDocument(document)) return;
    this.selectedRequestUuid = uuid;
    this.reviewingRequestUuid = null;
    this.render({ force: true });
  }

  static onOpenRequestCreate() {
    if (!this.selectedDomainUuid) return;
    const document = recordIndex.get(RECORD_TYPES.DOMAIN, this.selectedDomainUuid);
    const domain = document ? decodeRecord(document) : null;
    if (!canSubmitDomainRequest(domain)) return;
    this.isRequestCreateOpen = true;
    this.reviewingRequestUuid = null;
    this.render({ force: true });
  }

  static onCloseRequestCreate() {
    this.isRequestCreateOpen = false;
    this.render({ force: true });
  }

  static async onSubmitRequestCreate() {
    if (this.isRequestBusy || !this.selectedDomainUuid || !this.isRequestCreateOpen) return;
    const form = this.element?.querySelector?.("#dm-request-create-form");
    const document = recordIndex.get(RECORD_TYPES.DOMAIN, this.selectedDomainUuid);
    const domain = document ? decodeRecord(document) : null;
    if (!form || !canSubmitDomainRequest(domain)) return;
    const data = new FormData(form);
    this.isRequestBusy = true;
    try {
      const result = await executeCommandAuthoritatively({
        commandType: COMMAND_TYPES.REQUEST_CREATE,
        payload: {
          domain: entityReference(domain),
          type: String(data.get("type") ?? "custom"),
          title: String(data.get("title") ?? ""),
          intent: String(data.get("intent") ?? ""),
          details: String(data.get("details") ?? "")
        }
      });
      this.selectedRequestUuid = result.uuid ?? null;
      this.isRequestCreateOpen = false;
      ui.notifications.info("Request enviada ao Command Queue.");
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao criar Request", error);
      ui.notifications.error(error.message ?? "Falha ao criar Request.");
    } finally {
      this.isRequestBusy = false;
    }
  }

  static onOpenRequestReview(event, target) {
    if (!game.user.isGM) return;
    const uuid = String(target?.dataset?.requestUuid ?? this.selectedRequestUuid ?? "");
    if (!uuid) return;
    const document = recordIndex.get(RECORD_TYPES.REQUEST, uuid);
    if (!document || !canViewDocument(document)) return;
    const request = decodeRecord(document);
    if (!REQUEST_REVIEW_STATUSES.includes(request.data.status)) return;
    this.selectedRequestUuid = uuid;
    this.reviewingRequestUuid = uuid;
    this.isRequestCreateOpen = false;
    this.render({ force: true });
  }

  static onCloseRequestReview() {
    this.reviewingRequestUuid = null;
    this.render({ force: true });
  }

  static async onSubmitRequestReview() {
    if (!game.user.isGM || this.isRequestBusy || !this.reviewingRequestUuid) return;
    const form = this.element?.querySelector?.("#dm-request-review-form");
    const document = recordIndex.get(RECORD_TYPES.REQUEST, this.reviewingRequestUuid);
    if (!form || !document || !canViewDocument(document)) return;
    const request = decodeRecord(document);
    const data = new FormData(form);
    this.isRequestBusy = true;
    try {
      await executeCommandAuthoritatively({
        commandType: COMMAND_TYPES.REQUEST_REVIEW,
        payload: {
          request: entityReference(request),
          expectedModifiedTime: request.document?._stats?.modifiedTime ?? null,
          status: String(data.get("status") ?? "under-review"),
          summary: String(data.get("summary") ?? ""),
          handling: String(data.get("handling") ?? "none")
        }
      });
      this.reviewingRequestUuid = null;
      ui.notifications.info("Decisão da Request sincronizada.");
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao revisar Request", error);
      ui.notifications.error(error.message ?? "Falha ao revisar Request.");
    } finally {
      this.isRequestBusy = false;
    }
  }

  static async onCreateMissionFromRequest(event, target) {
    if (!game.user.isGM || this.isRequestBusy) return;
    const uuid = String(target?.dataset?.requestUuid ?? this.selectedRequestUuid ?? "");
    if (!uuid) return;
    const document = recordIndex.get(RECORD_TYPES.REQUEST, uuid);
    if (!document || !canViewDocument(document)) return;
    const request = decodeRecord(document);
    if (request.data.status !== "approved" || request.data.gmDecision?.handling !== "mission" || request.data.resultUuid) return;
    this.isRequestBusy = true;
    try {
      const result = await executeCommandAuthoritatively({
        commandType: COMMAND_TYPES.REQUEST_CREATE_MISSION,
        payload: {
          request: entityReference(request),
          expectedModifiedTime: request.document?._stats?.modifiedTime ?? null
        }
      });
      ui.notifications.info(result.reused ? "Mission já vinculada à Request." : "Mission criada a partir da Request.");
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao materializar Request como Mission", error);
      ui.notifications.error(error.message ?? "Falha ao criar Mission a partir da Request.");
    } finally {
      this.isRequestBusy = false;
    }
  }

  static async onWithdrawRequest(event, target) {
    if (this.isRequestBusy) return;
    const uuid = String(target?.dataset?.requestUuid ?? this.selectedRequestUuid ?? "");
    if (!uuid) return;
    const document = recordIndex.get(RECORD_TYPES.REQUEST, uuid);
    if (!document || !canViewDocument(document)) return;
    const request = decodeRecord(document);
    if (request.data.requesterUserUuid !== game.user.uuid) return;
    if (!["submitted", "under-review", "needs-changes"].includes(request.data.status) || request.data.resultUuid) return;
    this.isRequestBusy = true;
    try {
      await executeCommandAuthoritatively({
        commandType: COMMAND_TYPES.REQUEST_WITHDRAW,
        payload: {
          request: entityReference(request),
          expectedModifiedTime: request.document?._stats?.modifiedTime ?? null
        }
      });
      ui.notifications.info("Request retirada pelo solicitante.");
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao retirar Request", error);
      ui.notifications.error(error.message ?? "Falha ao retirar Request.");
    } finally {
      this.isRequestBusy = false;
    }
  }

  static async onFulfillRequest(event, target) {
    if (!game.user.isGM || this.isRequestBusy) return;
    const uuid = String(target?.dataset?.requestUuid ?? this.selectedRequestUuid ?? "");
    if (!uuid) return;
    const document = recordIndex.get(RECORD_TYPES.REQUEST, uuid);
    if (!document || !canViewDocument(document)) return;
    const request = decodeRecord(document);
    if (request.data.status !== "approved") return;
    this.isRequestBusy = true;
    try {
      await executeCommandAuthoritatively({
        commandType: COMMAND_TYPES.REQUEST_FULFILL,
        payload: {
          request: entityReference(request),
          expectedModifiedTime: request.document?._stats?.modifiedTime ?? null
        }
      });
      ui.notifications.info("Request marcada como cumprida.");
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao concluir lifecycle da Request", error);
      ui.notifications.error(error.message ?? "Falha ao marcar Request como cumprida.");
    } finally {
      this.isRequestBusy = false;
    }
  }

  static onSelectProject(event, target) {
    const uuid = String(target?.dataset?.projectUuid ?? "");
    if (!uuid) return;
    this.selectedProjectUuid = uuid;
    this.editingProjectCostId = null;
    this.render({ force: true });
  }

  static onOpenProjectEditor(event, target) {
    if (!this.selectedDomainUuid) return;
    const domainDocument = recordIndex.get(RECORD_TYPES.DOMAIN, this.selectedDomainUuid);
    const domain = domainDocument ? decodeRecord(domainDocument) : null;
    if (!canManageDomainProjects(domain)) return;
    const uuid = String(target?.dataset?.projectUuid ?? "__new__");
    if (uuid !== "__new__") {
      const document = recordIndex.get(RECORD_TYPES.PROJECT, uuid);
      const project = document ? decodeRecord(document) : null;
      if (!project || project.data.domainUuid !== domain.uuid || ["completed", "cancelled"].includes(project.data.status)) return;
      this.selectedProjectUuid = project.uuid;
    }
    this.editingProjectUuid = uuid;
    this.editingProjectCostId = null;
    this.render({ force: true });
  }

  static onCloseProjectEditor() {
    this.editingProjectUuid = null;
    this.render({ force: true });
  }

  static async onSubmitProjectEditor() {
    if (this.isProjectBusy || !this.selectedDomainUuid || this.editingProjectUuid === null) return;
    const form = this.element?.querySelector?.("#dm-project-form");
    const domainDocument = recordIndex.get(RECORD_TYPES.DOMAIN, this.selectedDomainUuid);
    const domain = domainDocument ? decodeRecord(domainDocument) : null;
    if (!form || !canManageDomainProjects(domain)) return;
    const data = new FormData(form);
    const fields = {
      name: String(data.get("name") ?? ""),
      description: String(data.get("description") ?? ""),
      status: String(data.get("status") ?? "planned"),
      blockedReason: String(data.get("blockedReason") ?? ""),
      workRequired: Number(data.get("workRequired") ?? 100),
      rateAmount: Number(data.get("rateAmount") ?? 10),
      periodTicks: Number(data.get("periodTicks") ?? 1)
    };
    this.isProjectBusy = true;
    try {
      const isCreate = this.editingProjectUuid === "__new__";
      const payload = { domain: entityReference(domain), ...fields };
      if (!isCreate) {
        const projectDocument = recordIndex.get(RECORD_TYPES.PROJECT, this.editingProjectUuid);
        const project = projectDocument ? decodeRecord(projectDocument) : null;
        if (!project || project.data.domainUuid !== domain.uuid) throw new Error("Project não pertence ao Domain selecionado.");
        payload.project = entityReference(project);
      } else {
        delete payload.blockedReason;
        payload.costs = [];
      }
      const result = await executeCommandAuthoritatively({
        commandType: isCreate ? COMMAND_TYPES.PROJECT_CREATE : COMMAND_TYPES.PROJECT_UPDATE,
        payload
      });
      this.selectedProjectUuid = result.uuid ?? this.selectedProjectUuid;
      this.editingProjectUuid = null;
      ui.notifications.info(isCreate ? "Project registrado no pipeline." : "Project sincronizado.");
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao salvar Project", error);
      ui.notifications.error(error.message ?? "Falha ao salvar Project.");
    } finally {
      this.isProjectBusy = false;
    }
  }

  static onOpenProjectCostEditor(event, target) {
    if (!this.selectedDomainUuid || !this.selectedProjectUuid) return;
    const domainDocument = recordIndex.get(RECORD_TYPES.DOMAIN, this.selectedDomainUuid);
    const projectDocument = recordIndex.get(RECORD_TYPES.PROJECT, this.selectedProjectUuid);
    const domain = domainDocument ? decodeRecord(domainDocument) : null;
    const project = projectDocument ? decodeRecord(projectDocument) : null;
    if (!canManageDomainProjects(domain) || !project || project.data.domainUuid !== domain.uuid) return;
    if (["completed", "cancelled"].includes(project.data.status) || Number(project.data.work?.completed ?? 0) > 0) return;
    const localId = String(target?.dataset?.costId ?? "__new__");
    if (localId !== "__new__" && !(project.data.costs ?? []).some((cost) => cost.localId === localId)) return;
    this.editingProjectCostId = localId;
    this.render({ force: true });
  }

  static onCloseProjectCostEditor() {
    this.editingProjectCostId = null;
    this.render({ force: true });
  }

  static async onSubmitProjectCostEditor() {
    if (this.isProjectBusy || !this.selectedDomainUuid || !this.selectedProjectUuid || this.editingProjectCostId === null) return;
    const form = this.element?.querySelector?.("#dm-project-cost-form");
    const domainDocument = recordIndex.get(RECORD_TYPES.DOMAIN, this.selectedDomainUuid);
    const projectDocument = recordIndex.get(RECORD_TYPES.PROJECT, this.selectedProjectUuid);
    const domain = domainDocument ? decodeRecord(domainDocument) : null;
    const project = projectDocument ? decodeRecord(projectDocument) : null;
    if (!form || !canManageDomainProjects(domain) || !project || project.data.domainUuid !== domain.uuid) return;
    const data = new FormData(form);
    const resourceId = String(data.get("resourceId") ?? "");
    const resource = (getResourceCatalogSetting()?.resources ?? []).find((entry) => entry.id === resourceId);
    if (!resource) { ui.notifications.warn("Selecione um recurso válido."); return; }
    let amount;
    try {
      amount = parseMinorUnits(String(data.get("amount") ?? ""), resource.precision ?? 0);
    } catch (error) {
      ui.notifications.warn(error.message ?? "Valor de custo inválido.");
      return;
    }
    this.isProjectBusy = true;
    try {
      await executeCommandAuthoritatively({
        commandType: COMMAND_TYPES.PROJECT_COST_UPSERT,
        payload: {
          domain: entityReference(domain),
          project: entityReference(project),
          cost: {
            localId: this.editingProjectCostId === "__new__" ? null : this.editingProjectCostId,
            resourceId,
            mode: String(data.get("mode") ?? "reserved"),
            amount
          }
        }
      });
      this.editingProjectCostId = null;
      ui.notifications.info("Plano de custos do Project sincronizado.");
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao salvar custo de Project", error);
      ui.notifications.error(error.message ?? "Falha ao salvar custo de Project.");
    } finally {
      this.isProjectBusy = false;
    }
  }

  static async onRemoveProjectCost(event, target) {
    if (this.isProjectBusy || !this.selectedDomainUuid || !this.selectedProjectUuid) return;
    const localId = String(target?.dataset?.costId ?? "");
    const domainDocument = recordIndex.get(RECORD_TYPES.DOMAIN, this.selectedDomainUuid);
    const projectDocument = recordIndex.get(RECORD_TYPES.PROJECT, this.selectedProjectUuid);
    const domain = domainDocument ? decodeRecord(domainDocument) : null;
    const project = projectDocument ? decodeRecord(projectDocument) : null;
    if (!localId || !canManageDomainProjects(domain) || !project || project.data.domainUuid !== domain.uuid) return;
    this.isProjectBusy = true;
    try {
      await executeCommandAuthoritatively({
        commandType: COMMAND_TYPES.PROJECT_COST_REMOVE,
        payload: { domain: entityReference(domain), project: entityReference(project), localId }
      });
      if (this.editingProjectCostId === localId) this.editingProjectCostId = null;
      ui.notifications.info("Custo removido do Project.");
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao remover custo de Project", error);
      ui.notifications.error(error.message ?? "Falha ao remover custo de Project.");
    } finally {
      this.isProjectBusy = false;
    }
  }

  static onOpenSecurityEditor() {
    if (!game.user.isGM || !this.selectedDomainUuid) return;
    const domainDocument = recordIndex.get(RECORD_TYPES.DOMAIN, this.selectedDomainUuid);
    const domain = domainDocument ? decodeRecord(domainDocument) : null;
    if (!domain?.data.management?.capabilities?.security) return;
    this.isSecurityEditorOpen = true;
    this.render({ force: true });
  }

  static onCloseSecurityEditor() {
    this.isSecurityEditorOpen = false;
    this.render({ force: true });
  }

  static async onSubmitSecurityEditor() {
    if (!game.user.isGM || this.isSecurityBusy || !this.selectedDomainUuid) return;
    const form = this.element?.querySelector?.("#dm-security-form");
    const domainDocument = recordIndex.get(RECORD_TYPES.DOMAIN, this.selectedDomainUuid);
    const domain = domainDocument ? decodeRecord(domainDocument) : null;
    if (!form || !domain?.data.management?.capabilities?.security) return;
    const data = new FormData(form);
    const fortifications = String(data.get("fortifications") ?? "")
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter(Boolean);
    this.isSecurityBusy = true;
    try {
      await executeCommandAuthoritatively({
        commandType: COMMAND_TYPES.SECURITY_CONFIGURE,
        payload: {
          domain: entityReference(domain),
          defenseRating: Number(data.get("defenseRating") ?? 0),
          guardCount: Number(data.get("guardCount") ?? 0),
          fortifications
        }
      });
      this.isSecurityEditorOpen = false;
      ui.notifications.info(`Defense Grid de ${domain.document.name} sincronizado.`);
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao configurar Defense", error);
      ui.notifications.error(error.message ?? "Falha ao configurar Defense.");
    } finally {
      this.isSecurityBusy = false;
    }
  }

  static onOpenEconomyConfig() {
    if (!game.user.isGM || !this.selectedDomainUuid) return;
    this.isEconomyConfigOpen = true;
    this.render({ force: true });
  }

  static onCloseEconomyConfig() {
    this.isEconomyConfigOpen = false;
    this.render({ force: true });
  }

  static async onSubmitEconomyConfig() {
    if (!game.user.isGM || this.isEconomyBusy || !this.selectedDomainUuid) return;
    const form = this.element?.querySelector?.("#dm-economy-config-form");
    const domainDocument = recordIndex.get(RECORD_TYPES.DOMAIN, this.selectedDomainUuid);
    if (!form || !domainDocument) return;
    const domain = decodeRecord(domainDocument);
    const catalog = getResourceCatalogSetting();
    const data = new FormData(form);
    const stocks = [];
    const resourcePolicies = [];
    try {
      for (const resource of catalog?.resources ?? []) {
        const stock = parseMinorUnits(String(data.get(`stock:${resource.id}`) ?? "0"), resource.precision ?? 0);
        const criticalFloor = parseMinorUnits(String(data.get(`critical:${resource.id}`) ?? "0"), resource.precision ?? 0);
        const reserveTarget = parseMinorUnits(String(data.get(`reserve:${resource.id}`) ?? "0"), resource.precision ?? 0);
        const storageCapacity = parseMinorUnits(String(data.get(`capacity:${resource.id}`) ?? "0"), resource.precision ?? 0);
        stocks.push({ resourceId: resource.id, amount: stock });
        resourcePolicies.push({ resourceId: resource.id, criticalFloor, reserveTarget, storageCapacity });
      }
    } catch (error) {
      ui.notifications.warn(error.message ?? "Política econômica inválida.");
      return;
    }

    this.isEconomyBusy = true;
    try {
      await executeCommandAuthoritatively({
        commandType: COMMAND_TYPES.ECONOMY_CONFIGURE,
        payload: {
          domain: entityReference(domain),
          stocks,
          resourcePolicies,
          sustenanceSettings: {
            enabled: data.get("sustenanceEnabled") === "on",
            foodPer100: Number(data.get("foodPer100") ?? 1),
            waterPer100: Number(data.get("waterPer100") ?? 1),
            guardUpkeep: Number(data.get("guardUpkeep") ?? 1)
          }
        }
      });
      this.isEconomyConfigOpen = false;
      ui.notifications.info(`Política econômica de ${domain.document.name} sincronizada.`);
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao configurar economia", error);
      ui.notifications.error(error.message ?? "Falha ao configurar economia estratégica.");
    } finally {
      this.isEconomyBusy = false;
    }
  }

  static onSelectPerson(event, target) {
    const uuid = target?.dataset?.uuid;
    if (!uuid) return;
    this.selectedPersonUuid = uuid;
    this.render({ force: true });
  }

  static onOpenPopulationConfig() {
    if (!this.selectedDomainUuid) return;
    this.isPopulationConfigOpen = true;
    this.render({ force: true });
  }

  static onClosePopulationConfig() {
    this.isPopulationConfigOpen = false;
    this.render({ force: true });
  }

  static async onSubmitPopulationConfig() {
    if (this.isPopulationBusy || !this.selectedDomainUuid) return;
    const form = this.element?.querySelector?.("#dm-population-config-form");
    const domainDocument = recordIndex.get(RECORD_TYPES.DOMAIN, this.selectedDomainUuid);
    if (!form || !domainDocument) return;
    const domain = decodeRecord(domainDocument);
    const data = new FormData(form);
    this.isPopulationBusy = true;
    try {
      await executeCommandAuthoritatively({
        commandType: COMMAND_TYPES.POPULATION_CONFIGURE,
        payload: {
          domain: entityReference(domain),
          total: Number(data.get("total") ?? 0),
          countMode: String(data.get("countMode") ?? "direct"),
          morale: Number(data.get("morale") ?? 60)
        }
      });
      this.isPopulationConfigOpen = false;
      ui.notifications.info(`Population policy de ${domain.document.name} sincronizada.`);
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao configurar Population", error);
      ui.notifications.error(error.message ?? "Falha ao configurar Population.");
    } finally {
      this.isPopulationBusy = false;
    }
  }

  static onOpenPopulationGroup(event, target) {
    if (!this.selectedDomainUuid) return;
    this.editingPopulationGroupId = String(target?.dataset?.groupId ?? "__new__");
    this.render({ force: true });
  }

  static onClosePopulationGroup() {
    this.editingPopulationGroupId = null;
    this.render({ force: true });
  }

  static async onSubmitPopulationGroup() {
    if (this.isPopulationBusy || !this.selectedDomainUuid) return;
    const form = this.element?.querySelector?.("#dm-population-group-form");
    const domainDocument = recordIndex.get(RECORD_TYPES.DOMAIN, this.selectedDomainUuid);
    if (!form || !domainDocument) return;
    const domain = decodeRecord(domainDocument);
    const data = new FormData(form);
    const localId = String(data.get("localId") ?? "").trim();
    this.isPopulationBusy = true;
    try {
      await executeCommandAuthoritatively({
        commandType: COMMAND_TYPES.POPULATION_GROUP_UPSERT,
        payload: {
          domain: entityReference(domain),
          localId: localId === "__new__" ? "" : localId,
          name: String(data.get("name") ?? ""),
          count: Number(data.get("count") ?? 0),
          includedInTotal: data.get("includedInTotal") === "on",
          function: String(data.get("function") ?? ""),
          quality: String(data.get("quality") ?? ""),
          status: String(data.get("status") ?? "active"),
          assignment: String(data.get("assignment") ?? ""),
          morale: Number(data.get("morale") ?? 60),
          workforceEligible: Number(data.get("workforceEligible") ?? 0)
        }
      });
      this.editingPopulationGroupId = null;
      ui.notifications.info("Cohort sincronizado com Civil Control.");
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao salvar cohort", error);
      ui.notifications.error(error.message ?? "Falha ao salvar cohort.");
    } finally {
      this.isPopulationBusy = false;
    }
  }

  static async onRemovePopulationGroup(event, target) {
    if (this.isPopulationBusy || !this.selectedDomainUuid) return;
    const localId = String(target?.dataset?.groupId ?? "");
    if (!localId || localId === "__new__") return;
    const domainDocument = recordIndex.get(RECORD_TYPES.DOMAIN, this.selectedDomainUuid);
    if (!domainDocument) return;
    const domain = decodeRecord(domainDocument);
    this.isPopulationBusy = true;
    try {
      await executeCommandAuthoritatively({
        commandType: COMMAND_TYPES.POPULATION_GROUP_REMOVE,
        payload: { domain: entityReference(domain), localId }
      });
      this.editingPopulationGroupId = null;
      ui.notifications.info("Cohort removido do Civil Control.");
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao remover cohort", error);
      ui.notifications.error(error.message ?? "Falha ao remover cohort.");
    } finally {
      this.isPopulationBusy = false;
    }
  }

  static onOpenWorkforce() {
    if (!this.selectedDomainUuid) return;
    this.isWorkforceOpen = true;
    this.render({ force: true });
  }

  static onCloseWorkforce() {
    this.isWorkforceOpen = false;
    this.render({ force: true });
  }

  static async onSubmitWorkforce() {
    if (this.isPopulationBusy || !this.selectedDomainUuid) return;
    const form = this.element?.querySelector?.("#dm-workforce-form");
    const domainDocument = recordIndex.get(RECORD_TYPES.DOMAIN, this.selectedDomainUuid);
    if (!form || !domainDocument) return;
    const domain = decodeRecord(domainDocument);
    const allocations = Array.from(form.querySelectorAll?.("[data-workforce-allocation]") ?? []).map((input) => ({
      groupLocalId: String(input.dataset.groupId ?? ""),
      target: {
        recordType: RECORD_TYPES.STRUCTURE,
        uuid: String(input.dataset.structureUuid ?? ""),
        entityId: String(input.dataset.structureEntityId ?? "")
      },
      count: Number(input.value ?? 0),
      role: String(input.dataset.role ?? "")
    })).filter((entry) => entry.groupLocalId && entry.count > 0);
    this.isPopulationBusy = true;
    try {
      await executeCommandAuthoritatively({
        commandType: COMMAND_TYPES.POPULATION_WORKFORCE_SET,
        payload: { domain: entityReference(domain), allocations }
      });
      this.isWorkforceOpen = false;
      ui.notifications.info("Workforce matrix sincronizada.");
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao alocar workforce", error);
      ui.notifications.error(error.message ?? "Falha ao alocar workforce.");
    } finally {
      this.isPopulationBusy = false;
    }
  }

  static onOpenPersonEditor(event, target) {
    if (!this.selectedDomainUuid) return;
    const uuid = String(target?.dataset?.uuid ?? "");
    if (uuid.startsWith("legacy:")) return;
    this.editingPersonUuid = uuid || null;
    this.isPersonEditorOpen = true;
    this.render({ force: true });
  }

  static onClosePersonEditor() {
    this.isPersonEditorOpen = false;
    this.editingPersonUuid = null;
    this.render({ force: true });
  }

  static async onSubmitPersonEditor() {
    if (this.isPeopleBusy || !this.selectedDomainUuid) return;
    const form = this.element?.querySelector?.("#dm-person-editor-form");
    const domainDocument = recordIndex.get(RECORD_TYPES.DOMAIN, this.selectedDomainUuid);
    if (!form || !domainDocument) return;
    const domain = decodeRecord(domainDocument);
    const data = new FormData(form);
    const squadEntityId = String(data.get("squadEntityId") ?? "").trim();
    const squad = squadEntityId ? recordIndex.getByEntityId(squadEntityId) : null;
    const common = {
      name: String(data.get("name") ?? ""),
      description: String(data.get("description") ?? ""),
      portrait: String(data.get("portrait") ?? ""),
      actorUuid: String(data.get("actorUuid") ?? ""),
      role: String(data.get("role") ?? ""),
      specialization: String(data.get("specialization") ?? ""),
      morale: Number(data.get("morale") ?? 60),
      condition: Number(data.get("condition") ?? 100),
      status: String(data.get("status") ?? "active"),
      tags: String(data.get("tags") ?? "").split(",").map((tag) => tag.trim()).filter(Boolean),
      notes: String(data.get("notes") ?? ""),
      squad: squad ? { recordType: RECORD_TYPES.SQUAD, uuid: squad.uuid, entityId: squadEntityId } : null,
      currentLocation: entityReference(domain)
    };
    this.isPeopleBusy = true;
    try {
      if (this.editingPersonUuid) {
        const personDocument = recordIndex.get(RECORD_TYPES.PERSON, this.editingPersonUuid);
        if (!personDocument) throw new Error("Person selecionada não está mais disponível.");
        const person = decodeRecord(personDocument);
        await executeCommandAuthoritatively({
          commandType: COMMAND_TYPES.PERSON_UPDATE,
          payload: { person: entityReference(person), ...common }
        });
        this.selectedPersonUuid = person.uuid;
      } else {
        const result = await executeCommandAuthoritatively({
          commandType: COMMAND_TYPES.PERSON_CREATE,
          payload: { domain: entityReference(domain), ...common }
        });
        this.selectedPersonUuid = result?.result?.uuid ?? this.selectedPersonUuid;
      }
      this.isPersonEditorOpen = false;
      this.editingPersonUuid = null;
      ui.notifications.info("Personnel dossier sincronizado.");
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao salvar Person", error);
      ui.notifications.error(error.message ?? "Falha ao salvar Person.");
    } finally {
      this.isPeopleBusy = false;
    }
  }

  static onApplySearch() {
    const input = this.element?.querySelector?.("[data-dm-search]");
    this.searchQuery = input?.value?.trim?.() ?? "";
    if (this.searchQuery) this.activeView = "domains";
    this.render({ force: true });
  }

  static onClearSearch() {
    this.searchQuery = "";
    this.render({ force: true });
  }

  static onOpenCreateDomain() {
    if (!game.user.isGM) return;
    this.isCreateDomainOpen = true;
    this.render({ force: true });
  }

  static onCancelCreateDomain() {
    this.isCreateDomainOpen = false;
    this.render({ force: true });
  }

  static async onSubmitCreateDomain() {
    if (!game.user.isGM) return;
    const form = this.element?.querySelector?.("#dm-create-domain-form");
    if (!form) return;
    const data = new FormData(form);
    const name = String(data.get("name") ?? "").trim();
    if (!name) {
      ui.notifications.warn("Informe um nome para o domínio.");
      return;
    }

    try {
      const created = await createDomainAction({
        name,
        description: String(data.get("description") ?? ""),
        category: String(data.get("category") ?? "Base"),
        nature: String(data.get("nature") ?? "physical"),
        managementPreset: String(data.get("preset") ?? "base"),
        controllerIds: []
      });
      this.selectedDomainUuid = created?.uuid ?? created?.document?.uuid ?? null;
      this.activeView = "overview";
      this.isCreateDomainOpen = false;
      ui.notifications.info(`Domínio ${name} criado.`);
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao criar domínio", error);
      ui.notifications.error(error.message ?? "Falha ao criar domínio.");
    }
  }

  static onOpenCreateSquad() {
    if (!game.user.isGM || !this.selectedDomainUuid) return;
    this.isCreateSquadOpen = true;
    this.editingSquadUuid = null;
    this.supplySquadUuid = null;
    this.render({ force: true });
  }

  static onCancelCreateSquad() {
    this.isCreateSquadOpen = false;
    this.render({ force: true });
  }

  static async onSubmitCreateSquad() {
    if (!game.user.isGM || this.isSquadBusy) return;
    const form = this.element?.querySelector?.("#dm-create-squad-form");
    const domainDocument = recordIndex.get(RECORD_TYPES.DOMAIN, this.selectedDomainUuid);
    if (!form || !domainDocument) return;
    const domain = decodeRecord(domainDocument);
    const data = new FormData(form);
    this.isSquadBusy = true;
    try {
      const result = await createSquadAction({
        name: data.get("name"),
        description: data.get("description"),
        parentDomain: entityReference(domain),
        controllerIds: data.getAll("controllerIds"),
        capacity: data.get("capacity"),
        strength: data.get("strength"),
        morale: data.get("morale"),
        condition: data.get("condition"),
        status: data.get("status")
      });
      this.isCreateSquadOpen = false;
      this.editingSquadUuid = result?.uuid ?? null;
      ui.notifications.info(`Squad ${result?.name ?? data.get("name")} criado e indexado.`);
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao criar Squad", error);
      ui.notifications.error(error.message ?? "Falha ao criar Squad.");
    } finally {
      this.isSquadBusy = false;
    }
  }

  static onOpenSquadControl(event, target) {
    const uuid = target?.dataset?.uuid;
    if (!uuid) return;
    const document = recordIndex.get(RECORD_TYPES.SQUAD, uuid);
    if (!document) return;
    const record = decodeRecord(document);
    const controllers = record.data.governance?.controllers ?? [];
    if (!game.user.isGM && !controllers.includes(game.user.id)) {
      ui.notifications.warn("Você não controla este Squad.");
      return;
    }
    this.editingSquadUuid = uuid;
    this.supplySquadUuid = null;
    this.isCreateSquadOpen = false;
    this.render({ force: true });
  }

  static onCloseSquadControl() {
    this.editingSquadUuid = null;
    this.render({ force: true });
  }

  static async onSubmitSquadControl() {
    if (this.isSquadBusy || !this.editingSquadUuid) return;
    const form = this.element?.querySelector?.("#dm-squad-control-form");
    const document = recordIndex.get(RECORD_TYPES.SQUAD, this.editingSquadUuid);
    if (!form || !document) return;
    const squad = decodeRecord(document);
    const data = new FormData(form);
    this.isSquadBusy = true;
    try {
      if (game.user.isGM) {
        await updateSquadAdministrationAction({
          squad: entityReference(squad),
          name: data.get("name"),
          description: data.get("description"),
          controllerIds: data.getAll("controllerIds"),
          capacity: data.get("capacity"),
          strength: data.get("strength"),
          morale: data.get("morale"),
          condition: data.get("condition"),
          status: data.get("status")
        });
      } else {
        await patchSquadAction({
          squad: entityReference(squad),
          patch: {
            description: data.get("description"),
            morale: data.get("morale"),
            condition: data.get("condition"),
            status: data.get("status")
          }
        });
      }
      ui.notifications.info(`Squad ${squad.document.name} sincronizado.`);
      this.editingSquadUuid = null;
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao atualizar Squad", error);
      ui.notifications.error(error.message ?? "Falha ao atualizar Squad.");
    } finally {
      this.isSquadBusy = false;
    }
  }

  static onOpenSquadSupply(event, target) {
    const uuid = target?.dataset?.uuid;
    if (!uuid) return;
    const document = recordIndex.get(RECORD_TYPES.SQUAD, uuid);
    if (!document) return;
    const record = decodeRecord(document);
    const controllers = record.data.governance?.controllers ?? [];
    if (!game.user.isGM && !controllers.includes(game.user.id)) {
      ui.notifications.warn("Você não controla este Squad.");
      return;
    }
    this.supplySquadUuid = uuid;
    this.editingSquadUuid = null;
    this.isCreateSquadOpen = false;
    this.render({ force: true });
  }

  static onCloseSquadSupply() {
    this.supplySquadUuid = null;
    this.render({ force: true });
  }

  static async onSubmitSquadSupply() {
    if (this.isSquadBusy || !this.supplySquadUuid || !this.selectedDomainUuid) return;
    const form = this.element?.querySelector?.("#dm-squad-supply-form");
    const squadDocument = recordIndex.get(RECORD_TYPES.SQUAD, this.supplySquadUuid);
    const domainDocument = recordIndex.get(RECORD_TYPES.DOMAIN, this.selectedDomainUuid);
    if (!form || !squadDocument || !domainDocument) return;
    const squad = decodeRecord(squadDocument);
    const domain = decodeRecord(domainDocument);
    const data = new FormData(form);
    const resourceId = String(data.get("resourceId") ?? "");
    const resource = getResourceCatalogSetting().resources?.find((entry) => entry.id === resourceId);
    if (!resource) {
      ui.notifications.warn("Selecione um recurso válido.");
      return;
    }
    const direction = game.user.isGM ? String(data.get("direction") ?? "domain-to-squad") : "squad-to-domain";
    let amount;
    try {
      amount = parseMinorUnits(data.get("amount"), resource.precision);
      if (amount <= 0) throw new Error("Informe uma quantidade maior que zero.");
    } catch (error) {
      ui.notifications.warn(error.message ?? "Quantidade inválida.");
      return;
    }

    const domainRef = entityReference(domain);
    const squadRef = entityReference(squad);
    const from = direction === "domain-to-squad" ? domainRef : squadRef;
    const to = direction === "domain-to-squad" ? squadRef : domainRef;
    this.isSquadBusy = true;
    try {
      await executeCommandAuthoritatively({
        commandType: COMMAND_TYPES.TRANSFER_RESOURCES,
        payload: { from, to, resourceId, amount }
      });
      ui.notifications.info(`${resource.name}: transferência sincronizada.`);
      this.supplySquadUuid = null;
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha na transferência de suprimentos", error);
      ui.notifications.error(error.message ?? "Falha na transferência de suprimentos.");
    } finally {
      this.isSquadBusy = false;
    }
  }

  static onOpenCreateMission() {
    if (!game.user.isGM || !this.selectedDomainUuid) return;
    this.isCreateMissionOpen = true;
    this.preparingMissionUuid = null;
    this.preparingSquadUuid = null;
    this.resolvingMissionUuid = null;
    this.render({ force: true });
  }

  static onCancelCreateMission() {
    this.isCreateMissionOpen = false;
    this.render({ force: true });
  }

  static async onSubmitCreateMission() {
    if (!game.user.isGM || this.isMissionBusy || !this.selectedDomainUuid) return;
    const form = this.element?.querySelector?.("#dm-create-mission-form");
    const domainDocument = recordIndex.get(RECORD_TYPES.DOMAIN, this.selectedDomainUuid);
    if (!form || !domainDocument) return;
    const domain = decodeRecord(domainDocument);
    const data = new FormData(form);
    const name = String(data.get("name") ?? "").trim();
    if (!name) {
      ui.notifications.warn("Informe uma designação para a Mission.");
      return;
    }
    const objectives = String(data.get("objectives") ?? "")
      .split(/\r?\n/)
      .map((title) => title.trim())
      .filter(Boolean)
      .map((title) => ({ title }));
    this.isMissionBusy = true;
    try {
      await executeCommandAuthoritatively({
        commandType: COMMAND_TYPES.MISSION_CREATE,
        payload: {
          name,
          primaryDomain: entityReference(domain),
          audienceUserIds: data.getAll("audienceUserIds"),
          status: String(data.get("status") ?? "available"),
          briefing: String(data.get("briefing") ?? ""),
          objectives
        }
      });
      this.isCreateMissionOpen = false;
      ui.notifications.info(`Mission ${name} registrada no Mission Control.`);
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao criar Mission", error);
      ui.notifications.error(error.message ?? "Falha ao criar Mission.");
    } finally {
      this.isMissionBusy = false;
    }
  }

  static onOpenMissionPrepare(event, target) {
    const missionUuid = target?.dataset?.missionUuid;
    const squadUuid = target?.dataset?.squadUuid;
    if (!missionUuid || !squadUuid) return;
    const missionDocument = recordIndex.get(RECORD_TYPES.MISSION, missionUuid);
    const squadDocument = recordIndex.get(RECORD_TYPES.SQUAD, squadUuid);
    if (!missionDocument || !squadDocument) return;
    const mission = decodeRecord(missionDocument);
    const squad = decodeRecord(squadDocument);
    const controllers = squad.data.governance?.controllers ?? [];
    if (!game.user.isGM && (!mission.data.audienceUserIds?.includes(game.user.id) || !controllers.includes(game.user.id))) {
      ui.notifications.warn("Você não possui autorização para preparar esta unidade nesta Mission.");
      return;
    }
    this.preparingMissionUuid = missionUuid;
    this.preparingSquadUuid = squadUuid;
    this.isCreateMissionOpen = false;
    this.resolvingMissionUuid = null;
    this.render({ force: true });
  }

  static onCloseMissionPrepare() {
    this.preparingMissionUuid = null;
    this.preparingSquadUuid = null;
    this.render({ force: true });
  }

  static async onSubmitMissionPrepare() {
    if (this.isMissionBusy || !this.preparingMissionUuid || !this.preparingSquadUuid) return;
    const form = this.element?.querySelector?.("#dm-mission-prepare-form");
    const missionDocument = recordIndex.get(RECORD_TYPES.MISSION, this.preparingMissionUuid);
    const squadDocument = recordIndex.get(RECORD_TYPES.SQUAD, this.preparingSquadUuid);
    if (!form || !missionDocument || !squadDocument) return;
    const mission = decodeRecord(missionDocument);
    const squad = decodeRecord(squadDocument);
    const data = new FormData(form);
    const resources = [];
    try {
      for (const resource of getResourceCatalogSetting().resources ?? []) {
        const raw = String(data.get(`resource:${resource.id}`) ?? "").trim();
        if (!raw) continue;
        const amount = parseMinorUnits(raw, resource.precision);
        if (amount > 0) resources.push({ resourceId: resource.id, amount });
      }
    } catch (error) {
      ui.notifications.warn(error.message ?? "Quantidade de recurso inválida.");
      return;
    }
    this.isMissionBusy = true;
    try {
      await executeCommandAuthoritatively({
        commandType: COMMAND_TYPES.MISSION_PREPARE,
        payload: {
          mission: entityReference(mission),
          squad: entityReference(squad),
          committedStrength: Number(data.get("committedStrength")),
          resources
        }
      });
      ui.notifications.info(`${squad.document.name} preparado para ${mission.document.name}.`);
      this.preparingMissionUuid = null;
      this.preparingSquadUuid = null;
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao preparar Mission", error);
      ui.notifications.error(error.message ?? "Falha ao preparar a unidade.");
    } finally {
      this.isMissionBusy = false;
    }
  }

  static async onReleaseMissionAssignment(event, target) {
    if (this.isMissionBusy) return;
    const missionUuid = target?.dataset?.missionUuid;
    const squadUuid = target?.dataset?.squadUuid;
    const missionDocument = missionUuid ? recordIndex.get(RECORD_TYPES.MISSION, missionUuid) : null;
    const squadDocument = squadUuid ? recordIndex.get(RECORD_TYPES.SQUAD, squadUuid) : null;
    if (!missionDocument || !squadDocument) return;
    const mission = decodeRecord(missionDocument);
    const squad = decodeRecord(squadDocument);
    this.isMissionBusy = true;
    try {
      await executeCommandAuthoritatively({
        commandType: COMMAND_TYPES.MISSION_RELEASE,
        payload: { mission: entityReference(mission), squad: entityReference(squad) }
      });
      ui.notifications.info(`${squad.document.name} liberado de ${mission.document.name}.`);
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao liberar unidade", error);
      ui.notifications.error(error.message ?? "Falha ao liberar unidade.");
    } finally {
      this.isMissionBusy = false;
    }
  }

  static async onLaunchMission(event, target) {
    if (!game.user.isGM || this.isMissionBusy) return;
    const missionUuid = target?.dataset?.missionUuid;
    const missionDocument = missionUuid ? recordIndex.get(RECORD_TYPES.MISSION, missionUuid) : null;
    if (!missionDocument) return;
    const mission = decodeRecord(missionDocument);
    this.isMissionBusy = true;
    try {
      await executeCommandAuthoritatively({
        commandType: COMMAND_TYPES.MISSION_LAUNCH,
        payload: { mission: entityReference(mission) }
      });
      ui.notifications.info(`${mission.document.name} lançada. Unidades em campo.`);
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao lançar Mission", error);
      ui.notifications.error(error.message ?? "Falha ao lançar Mission.");
    } finally {
      this.isMissionBusy = false;
    }
  }

  static onOpenMissionResolve(event, target) {
    if (!game.user.isGM) return;
    const missionUuid = target?.dataset?.missionUuid;
    const missionDocument = missionUuid ? recordIndex.get(RECORD_TYPES.MISSION, missionUuid) : null;
    if (!missionDocument) return;
    const mission = decodeRecord(missionDocument);
    if (mission.data.status !== "active") {
      ui.notifications.warn("Somente Mission ativa pode ser resolvida.");
      return;
    }
    this.resolvingMissionUuid = missionUuid;
    this.preparingMissionUuid = null;
    this.preparingSquadUuid = null;
    this.isCreateMissionOpen = false;
    this.render({ force: true });
  }

  static onCloseMissionResolve() {
    this.resolvingMissionUuid = null;
    this.render({ force: true });
  }

  static async onSubmitMissionResolve() {
    if (!game.user.isGM || this.isMissionBusy || !this.resolvingMissionUuid) return;
    const form = this.element?.querySelector?.("#dm-mission-resolve-form");
    const missionDocument = recordIndex.get(RECORD_TYPES.MISSION, this.resolvingMissionUuid);
    if (!form || !missionDocument) return;
    const mission = decodeRecord(missionDocument);
    const data = new FormData(form);
    const results = (mission.data.assignments ?? []).map((assignment) => {
      const key = assignment.localId;
      return {
        squad: assignment.squad,
        casualties: Number(data.get(`casualties:${key}`) ?? 0),
        moraleDelta: Number(data.get(`moraleDelta:${key}`) ?? 0),
        conditionDelta: Number(data.get(`conditionDelta:${key}`) ?? 0),
        notes: String(data.get(`notes:${key}`) ?? "")
      };
    });
    const objectiveResults = (mission.data.objectives ?? []).map((objective) => ({
      localId: objective.localId,
      status: String(data.get(`objective:${objective.localId}`) ?? objective.status ?? "pending")
    }));
    this.isMissionBusy = true;
    try {
      await executeCommandAuthoritatively({
        commandType: COMMAND_TYPES.MISSION_RESOLVE,
        payload: {
          mission: entityReference(mission),
          status: String(data.get("status") ?? "resolved"),
          outcomeSummary: String(data.get("outcomeSummary") ?? ""),
          results,
          objectiveResults
        }
      });
      ui.notifications.info(`${mission.document.name} resolvida e consequências sincronizadas.`);
      this.resolvingMissionUuid = null;
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao resolver Mission", error);
      ui.notifications.error(error.message ?? "Falha ao resolver Mission.");
    } finally {
      this.isMissionBusy = false;
    }
  }

  static onOpenCreateStructure(event, target) {
    if (!this.selectedDomainUuid) return;
    const mode = String(target?.dataset?.mode ?? "construction");
    if (mode === "direct" && !game.user.isGM) return;
    this.structureCreateMode = mode === "direct" ? "direct" : "construction";
    this.isCreateStructureOpen = true;
    this.editingStructureUuid = null;
    this.render({ force: true });
  }

  static onCancelCreateStructure() {
    this.isCreateStructureOpen = false;
    this.render({ force: true });
  }

  static async onSubmitCreateStructure() {
    if (this.isStructureBusy || !this.selectedDomainUuid) return;
    const form = this.element?.querySelector?.("#dm-create-structure-form");
    const domainDocument = recordIndex.get(RECORD_TYPES.DOMAIN, this.selectedDomainUuid);
    if (!form || !domainDocument) return;
    const domain = decodeRecord(domainDocument);
    const data = new FormData(form);
    const catalog = getResourceCatalogSetting();
    const name = String(data.get("name") ?? "").trim();
    if (!name) {
      ui.notifications.warn("Informe uma designação para a Structure.");
      return;
    }

    let maintenance;
    let production;
    let costs = [];
    try {
      maintenance = parseResourceMatrix(data, catalog, "maintenance");
      production = parseResourceMatrix(data, catalog, "production");
      if (this.structureCreateMode === "construction") {
        for (const resource of catalog.resources ?? []) {
          const raw = String(data.get(`cost:${resource.id}`) ?? "").trim();
          if (!raw) continue;
          const amount = parseMinorUnits(raw, resource.precision ?? 0);
          if (amount <= 0) continue;
          costs.push({
            resourceId: resource.id,
            amount,
            mode: String(data.get(`costMode:${resource.id}`) ?? "reserved")
          });
        }
      }
    } catch (error) {
      ui.notifications.warn(error.message ?? "Quantidade de recurso inválida.");
      return;
    }

    const common = {
      name,
      domain: entityReference(domain),
      description: String(data.get("description") ?? ""),
      category: String(data.get("category") ?? "general"),
      tier: Number(data.get("tier") ?? 1),
      maxTier: Number(data.get("maxTier") ?? 1),
      capacity: Number(data.get("capacity") ?? 0),
      workforceRequired: Number(data.get("workforceRequired") ?? 0),
      maintenance,
      production,
      tags: String(data.get("tags") ?? "").split(",").map((tag) => tag.trim()).filter(Boolean)
    };

    this.isStructureBusy = true;
    try {
      if (this.structureCreateMode === "construction") {
        await executeCommandAuthoritatively({
          commandType: COMMAND_TYPES.STRUCTURE_BEGIN_CONSTRUCTION,
          payload: {
            ...common,
            project: {
              name: String(data.get("projectName") ?? ""),
              description: String(data.get("projectDescription") ?? ""),
              workRequired: Number(data.get("workRequired") ?? 100),
              rateAmount: Number(data.get("rateAmount") ?? 10),
              periodTicks: Number(data.get("periodTicks") ?? 1),
              costs
            }
          }
        });
        ui.notifications.info(`Construção de ${name} iniciada como Project.`);
      } else {
        await executeCommandAuthoritatively({
          commandType: COMMAND_TYPES.STRUCTURE_CREATE,
          payload: {
            ...common,
            status: String(data.get("status") ?? "operational"),
            condition: Number(data.get("condition") ?? 100)
          }
        });
        ui.notifications.info(`Structure ${name} registrada.`);
      }
      this.isCreateStructureOpen = false;
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao criar Structure", error);
      ui.notifications.error(error.message ?? "Falha ao criar Structure.");
    } finally {
      this.isStructureBusy = false;
    }
  }

  static onOpenStructureControl(event, target) {
    const uuid = target?.dataset?.structureUuid;
    if (!uuid) return;
    this.editingStructureUuid = uuid;
    this.isCreateStructureOpen = false;
    this.render({ force: true });
  }

  static onCloseStructureControl() {
    this.editingStructureUuid = null;
    this.render({ force: true });
  }

  static async onSubmitStructureControl() {
    if (this.isStructureBusy || !this.editingStructureUuid) return;
    const form = this.element?.querySelector?.("#dm-structure-control-form");
    const structureDocument = recordIndex.get(RECORD_TYPES.STRUCTURE, this.editingStructureUuid);
    if (!form || !structureDocument) return;
    const structure = decodeRecord(structureDocument);
    const data = new FormData(form);
    this.isStructureBusy = true;
    try {
      if (game.user.isGM) {
        const catalog = getResourceCatalogSetting();
        const maintenance = parseResourceMatrix(data, catalog, "maintenance");
        const production = parseResourceMatrix(data, catalog, "production");
        await executeCommandAuthoritatively({
          commandType: COMMAND_TYPES.STRUCTURE_ADMIN_UPDATE,
          payload: {
            structure: entityReference(structure),
            name: String(data.get("name") ?? structure.document.name),
            description: String(data.get("description") ?? ""),
            category: String(data.get("category") ?? "general"),
            tier: Number(data.get("tier") ?? 1),
            maxTier: Number(data.get("maxTier") ?? 1),
            status: String(data.get("status") ?? structure.data.status),
            condition: Number(data.get("condition") ?? structure.data.condition),
            capacity: Number(data.get("capacity") ?? 0),
            workforceRequired: Number(data.get("workforceRequired") ?? 0),
            maintenance,
            production,
            tags: String(data.get("tags") ?? "").split(",").map((tag) => tag.trim()).filter(Boolean)
          }
        });
      } else {
        await executeCommandAuthoritatively({
          commandType: COMMAND_TYPES.STRUCTURE_PATCH,
          payload: {
            structure: entityReference(structure),
            patch: {
              description: String(data.get("description") ?? ""),
              status: String(data.get("status") ?? structure.data.status)
            }
          }
        });
      }
      ui.notifications.info(`${structure.document.name} sincronizada com Infrastructure Control.`);
      this.editingStructureUuid = null;
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao atualizar Structure", error);
      ui.notifications.error(error.message ?? "Falha ao atualizar Structure.");
    } finally {
      this.isStructureBusy = false;
    }
  }

  static onOpenTerritoryEditor() {
    if (!game.user.isGM || !this.selectedDomainUuid) return;
    this.isTerritoryEditorOpen = true;
    this.render({ force: true });
  }

  static onCloseTerritoryEditor() {
    this.isTerritoryEditorOpen = false;
    this.render({ force: true });
  }

  static async onSubmitTerritoryEditor() {
    if (!game.user.isGM || this.isStrategicIntelBusy || !this.selectedDomainUuid) return;
    const form = this.element?.querySelector?.("#dm-territory-form");
    const domainDocument = recordIndex.get(RECORD_TYPES.DOMAIN, this.selectedDomainUuid);
    if (!form || !domainDocument) return;
    const domain = decodeRecord(domainDocument);
    const data = new FormData(form);
    const controllerUuid = String(data.get("controllerUuid") ?? "").trim();
    const controllerDocument = controllerUuid ? recordIndex.get(RECORD_TYPES.DOMAIN, controllerUuid) : null;
    const influence = [];
    for (const document of recordIndex.list(RECORD_TYPES.DOMAIN)) {
      const raw = String(data.get(`influence:${document.uuid}`) ?? "").trim();
      if (!raw) continue;
      const value = Number(raw);
      if (!Number.isFinite(value) || value < 0 || value > 100) {
        ui.notifications.warn("Influência precisa estar entre 0 e 100.");
        return;
      }
      const target = decodeRecord(document);
      influence.push({ domain: entityReference(target), value: Math.round(value), notes: "" });
    }
    this.isStrategicIntelBusy = true;
    try {
      await executeCommandAuthoritatively({
        commandType: COMMAND_TYPES.TERRITORY_CONFIGURE,
        payload: {
          domain: entityReference(domain),
          controlState: String(data.get("controlState") ?? "unknown"),
          controller: controllerDocument ? entityReference(decodeRecord(controllerDocument)) : null,
          control: Number(data.get("control") ?? 0),
          strategicValue: Number(data.get("strategicValue") ?? 0),
          influence,
          notes: String(data.get("notes") ?? "")
        }
      });
      this.isTerritoryEditorOpen = false;
      ui.notifications.info(`Territory state de ${domain.document.name} sincronizado.`);
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao configurar Territory", error);
      ui.notifications.error(error.message ?? "Falha ao configurar Territory.");
    } finally {
      this.isStrategicIntelBusy = false;
    }
  }

  static onOpenRelationEditor(event, target) {
    if (!game.user.isGM || !this.selectedDomainUuid) return;
    this.editingRelationId = String(target?.dataset?.relationId ?? "__new__");
    this.isAgreementCreateOpen = false;
    this.render({ force: true });
  }

  static onCloseRelationEditor() {
    this.editingRelationId = null;
    this.render({ force: true });
  }

  static async onSubmitRelationEditor() {
    if (!game.user.isGM || this.isStrategicIntelBusy || !this.selectedDomainUuid) return;
    const form = this.element?.querySelector?.("#dm-relation-form");
    const domainDocument = recordIndex.get(RECORD_TYPES.DOMAIN, this.selectedDomainUuid);
    if (!form || !domainDocument) return;
    const domain = decodeRecord(domainDocument);
    const data = new FormData(form);
    const targetUuid = String(data.get("targetUuid") ?? "");
    const targetDocument = targetUuid ? recordIndex.get(RECORD_TYPES.DOMAIN, targetUuid) : null;
    if (!targetDocument) {
      ui.notifications.warn("Selecione um Domain alvo para a relação.");
      return;
    }
    this.isStrategicIntelBusy = true;
    try {
      await executeCommandAuthoritatively({
        commandType: COMMAND_TYPES.RELATION_UPSERT,
        payload: {
          domain: entityReference(domain),
          localId: String(data.get("localId") ?? ""),
          target: entityReference(decodeRecord(targetDocument)),
          posture: String(data.get("posture") ?? "neutral"),
          score: Number(data.get("score") ?? 0),
          trust: Number(data.get("trust") ?? 50),
          tension: Number(data.get("tension") ?? 0),
          notes: String(data.get("notes") ?? "")
        }
      });
      this.editingRelationId = null;
      ui.notifications.info("Diplomatic link sincronizado.");
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao salvar relação", error);
      ui.notifications.error(error.message ?? "Falha ao salvar relação diplomática.");
    } finally {
      this.isStrategicIntelBusy = false;
    }
  }

  static async onRemoveRelation(event, target) {
    if (!game.user.isGM || this.isStrategicIntelBusy || !this.selectedDomainUuid) return;
    const localId = String(target?.dataset?.relationId ?? "");
    const domainDocument = recordIndex.get(RECORD_TYPES.DOMAIN, this.selectedDomainUuid);
    if (!localId || !domainDocument) return;
    this.isStrategicIntelBusy = true;
    try {
      await executeCommandAuthoritatively({
        commandType: COMMAND_TYPES.RELATION_REMOVE,
        payload: { domain: entityReference(decodeRecord(domainDocument)), localId }
      });
      this.editingRelationId = null;
      ui.notifications.info("Diplomatic link removido.");
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao remover relação", error);
      ui.notifications.error(error.message ?? "Falha ao remover relação.");
    } finally {
      this.isStrategicIntelBusy = false;
    }
  }

  static onOpenAgreementCreate() {
    if (!game.user.isGM || !this.selectedDomainUuid) return;
    this.isAgreementCreateOpen = true;
    this.editingRelationId = null;
    this.render({ force: true });
  }

  static onCloseAgreementCreate() {
    this.isAgreementCreateOpen = false;
    this.render({ force: true });
  }

  static async onSubmitAgreementCreate() {
    if (!game.user.isGM || this.isStrategicIntelBusy || !this.selectedDomainUuid) return;
    const form = this.element?.querySelector?.("#dm-agreement-form");
    const sourceDocument = recordIndex.get(RECORD_TYPES.DOMAIN, this.selectedDomainUuid);
    if (!form || !sourceDocument) return;
    const source = decodeRecord(sourceDocument);
    const data = new FormData(form);
    const counterpartyUuid = String(data.get("counterpartyUuid") ?? "");
    const counterpartyDocument = counterpartyUuid ? recordIndex.get(RECORD_TYPES.DOMAIN, counterpartyUuid) : null;
    if (!counterpartyDocument) {
      ui.notifications.warn("Selecione a contraparte do Agreement.");
      return;
    }
    const counterparty = decodeRecord(counterpartyDocument);
    const transfers = [];
    const resourceId = String(data.get("resourceId") ?? "").trim();
    const amountRaw = String(data.get("amount") ?? "").trim();
    if (resourceId && amountRaw) {
      const resource = getResourceCatalogSetting().resources?.find((entry) => entry.id === resourceId);
      if (!resource) {
        ui.notifications.warn("Recurso do Agreement não existe no catálogo.");
        return;
      }
      let amount;
      try {
        amount = parseMinorUnits(amountRaw, resource.precision ?? 0);
      } catch (error) {
        ui.notifications.warn(error.message ?? "Quantidade do Agreement inválida.");
        return;
      }
      if (amount > 0) {
        const direction = String(data.get("direction") ?? "outbound");
        transfers.push({
          resourceId,
          fromDomain: direction === "inbound" ? entityReference(counterparty) : entityReference(source),
          toDomain: direction === "inbound" ? entityReference(source) : entityReference(counterparty),
          amount,
          periodTicks: Math.max(1, Number(data.get("periodTicks") ?? 1)),
          carry: 0
        });
      }
    }
    const tickOrNull = (name) => {
      const raw = String(data.get(name) ?? "").trim();
      return raw === "" ? null : Math.max(0, Math.floor(Number(raw)));
    };
    this.isStrategicIntelBusy = true;
    try {
      await executeCommandAuthoritatively({
        commandType: COMMAND_TYPES.AGREEMENT_CREATE,
        payload: {
          name: String(data.get("name") ?? ""),
          description: String(data.get("description") ?? ""),
          parties: [entityReference(source), entityReference(counterparty)],
          type: String(data.get("type") ?? "custom"),
          status: String(data.get("status") ?? "draft"),
          startTick: tickOrNull("startTick"),
          endTick: tickOrNull("endTick"),
          transfers,
          tags: String(data.get("tags") ?? "").split(",").map((tag) => tag.trim()).filter(Boolean)
        }
      });
      this.isAgreementCreateOpen = false;
      ui.notifications.info("Agreement registrado no Relations Matrix.");
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao criar Agreement", error);
      ui.notifications.error(error.message ?? "Falha ao criar Agreement.");
    } finally {
      this.isStrategicIntelBusy = false;
    }
  }

  static async onSetAgreementStatus(event, target) {
    if (!game.user.isGM || this.isStrategicIntelBusy) return;
    const uuid = String(target?.dataset?.agreementUuid ?? "");
    const status = String(target?.dataset?.status ?? "");
    const document = uuid ? recordIndex.get(RECORD_TYPES.AGREEMENT, uuid) : null;
    if (!document || !status) return;
    this.isStrategicIntelBusy = true;
    try {
      await executeCommandAuthoritatively({
        commandType: COMMAND_TYPES.AGREEMENT_STATUS,
        payload: { agreement: entityReference(decodeRecord(document)), status }
      });
      ui.notifications.info(`Agreement alterado para ${stateLabel(status)}.`);
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao alterar Agreement", error);
      ui.notifications.error(error.message ?? "Falha ao alterar Agreement.");
    } finally {
      this.isStrategicIntelBusy = false;
    }
  }

  static onSelectIntel(event, target) {
    const localId = String(target?.dataset?.intelId ?? "");
    if (!localId) return;
    this.selectedIntelId = localId;
    this.render({ force: true });
  }

  static onOpenIntelEditor(event, target) {
    if (!game.user.isGM || !this.selectedDomainUuid) return;
    this.editingIntelId = String(target?.dataset?.intelId ?? "__new__");
    this.render({ force: true });
  }

  static onCloseIntelEditor() {
    this.editingIntelId = null;
    this.render({ force: true });
  }

  static async onSubmitIntelEditor() {
    if (!game.user.isGM || this.isStrategicIntelBusy || !this.selectedDomainUuid) return;
    const form = this.element?.querySelector?.("#dm-intel-form");
    const domainDocument = recordIndex.get(RECORD_TYPES.DOMAIN, this.selectedDomainUuid);
    if (!form || !domainDocument) return;
    const domain = decodeRecord(domainDocument);
    const data = new FormData(form);
    const targetUuid = String(data.get("targetUuid") ?? "");
    const targetDocument = targetUuid ? recordIndex.get(RECORD_TYPES.DOMAIN, targetUuid) : null;
    this.isStrategicIntelBusy = true;
    try {
      const result = await executeCommandAuthoritatively({
        commandType: COMMAND_TYPES.INTEL_UPSERT,
        payload: {
          domain: entityReference(domain),
          localId: String(data.get("localId") ?? ""),
          title: String(data.get("title") ?? ""),
          category: String(data.get("category") ?? "fact"),
          visibility: String(data.get("visibility") ?? "all_controllers"),
          targetDomain: targetDocument ? entityReference(decodeRecord(targetDocument)) : null,
          content: String(data.get("content") ?? ""),
          credibility: String(data.get("credibility") ?? "confirmed"),
          source: String(data.get("source") ?? ""),
          revealed: data.get("revealed") === "on",
          tags: String(data.get("tags") ?? "").split(",").map((tag) => tag.trim()).filter(Boolean)
        }
      });
      this.selectedIntelId = result.intel?.localId ?? this.selectedIntelId;
      this.editingIntelId = null;
      ui.notifications.info("Intel packet sincronizado.");
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao salvar Intel", error);
      ui.notifications.error(error.message ?? "Falha ao salvar Intel.");
    } finally {
      this.isStrategicIntelBusy = false;
    }
  }

  static async onRemoveIntel(event, target) {
    if (!game.user.isGM || this.isStrategicIntelBusy || !this.selectedDomainUuid) return;
    const localId = String(target?.dataset?.intelId ?? "");
    const domainDocument = recordIndex.get(RECORD_TYPES.DOMAIN, this.selectedDomainUuid);
    if (!localId || !domainDocument) return;
    this.isStrategicIntelBusy = true;
    try {
      await executeCommandAuthoritatively({
        commandType: COMMAND_TYPES.INTEL_REMOVE,
        payload: { domain: entityReference(decodeRecord(domainDocument)), localId }
      });
      if (this.selectedIntelId === localId) this.selectedIntelId = null;
      this.editingIntelId = null;
      ui.notifications.info("Intel packet removido.");
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao remover Intel", error);
      ui.notifications.error(error.message ?? "Falha ao remover Intel.");
    } finally {
      this.isStrategicIntelBusy = false;
    }
  }

  static async onRevealIntel(event, target) {
    if (!game.user.isGM || this.isStrategicIntelBusy || !this.selectedDomainUuid) return;
    const localId = String(target?.dataset?.intelId ?? "");
    const domainDocument = recordIndex.get(RECORD_TYPES.DOMAIN, this.selectedDomainUuid);
    if (!localId || !domainDocument) return;
    this.isStrategicIntelBusy = true;
    try {
      await executeCommandAuthoritatively({
        commandType: COMMAND_TYPES.INTEL_REVEAL,
        payload: { domain: entityReference(decodeRecord(domainDocument)), localId }
      });
      ui.notifications.info("Intel packet revelado ao canal público.");
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao revelar Intel", error);
      ui.notifications.error(error.message ?? "Falha ao revelar Intel.");
    } finally {
      this.isStrategicIntelBusy = false;
    }
  }

  static async onAdvanceTicks(event, target) {
    if (!game.user.isGM || this.isAdvanceBusy) return;
    const ticks = Math.max(1, Math.floor(Number(target?.dataset?.ticks ?? 1)));
    this.isAdvanceBusy = true;
    try {
      const result = await executeAdvanceRun({ deltaTicks: ticks });
      ui.notifications.info(`Simulação avançada em ${ticks} tick(s).`);
      console.info("Domain Manager | Advance result", result);
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha no avanço", error);
      ui.notifications.error(error.message ?? "Falha ao avançar a simulação.");
    } finally {
      this.isAdvanceBusy = false;
    }
  }
}
