import { CAPABILITY_KEYS, COMMAND_TYPES, DOMAIN_NATURES, DOMAIN_STATES, FLOW_CATEGORIES, MANAGEMENT_PRESETS, MODULE_ID, MODULE_TITLE, RECORD_TYPES, REQUEST_HANDLINGS, REQUEST_REVIEW_STATUSES, REQUEST_TYPES, SCHEMA_VERSION, TERRITORY_CONTROL_STATES } from "../core/constants.js";
import { recordIndex } from "../data/record-index.js";
import { decodeRecord } from "../models/record-codec.js";
import { getResourceCatalogSetting } from "../core/settings.js";
import { formatMinorUnits, parseMinorUnits } from "../core/numbers.js";
import { executeCommandAuthoritatively } from "../authority/execute.js";
import { buildStrategicDomainLedger } from "../features/economy/strategic.js";
import { buildResourceDependencyReport } from "../features/economy/catalog-dependencies.js";
import { buildDomainProjectReservations } from "../features/projects/selectors.js";
import { calculateDomainRisks } from "../features/risks/rules.js";
import { capabilityDefaultsForPreset } from "../core/management-contracts.js";
import { buildDomainDependencyReport } from "../features/domains/dependencies.js";
import { executeApplyEventOutcome, rollEventForDomain } from "../features/events/actions.js";
import { EVENT_CATEGORY_LABELS, EVENT_SEVERITY_LABELS } from "../features/events/constants.js";
import { addHistoryEvent, clearHistory, removeHistoryEvent } from "../features/history/actions.js";
import {
  HISTORY_CATEGORY_ICONS,
  HISTORY_CATEGORY_LABELS,
  HISTORY_SIGNIFICANCE_LABELS,
  listVisibleHistoryEvents
} from "../features/history/rules.js";
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
import { isModuleManager } from "../core/permissions.js";
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
import { applyShellMotion, presentPlayerIntro } from "./motion.js";

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
    isModuleManager(user)
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
    away: "Ausente",
    injured: "Ferido",
    unavailable: "Indisponível",
    missing: "Desaparecido",
    dead: "Morto",
    retired: "Aposentado",
    disbanded: "Dissolvido",
    unknown: "Desconhecido",
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

function formatHistoryTimestamp(value) {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "SEM DATA";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(timestamp));
}

const DOMAIN_NATURE_LABELS = Object.freeze({
  physical: "Físico",
  organization: "Organização",
  hybrid: "Híbrido",
  abstract: "Abstrato"
});

const MANAGEMENT_PRESET_LABELS = Object.freeze({
  squad: "Unidade",
  outpost: "Posto avançado",
  base: "Base",
  "strategic-organization": "Organização estratégica",
  custom: "Personalizado"
});

const CAPABILITY_LABELS = Object.freeze({
  economy: "Recursos",
  population: "População",
  structures: "Infraestrutura",
  projects: "Projetos",
  squads: "Forças",
  missions: "Missões",
  security: "Defesa",
  people: "Pessoas",
  intel: "Inteligência",
  diplomacy: "Relações",
  territory: "Território",
  logistics: "Logística"
});

function domainNatureLabel(value) {
  return DOMAIN_NATURE_LABELS[value] ?? titleCase(value || "indefinido");
}

function managementPresetLabel(value) {
  return MANAGEMENT_PRESET_LABELS[value] ?? titleCase(value || "personalizado");
}

function capabilityLabel(value) {
  return CAPABILITY_LABELS[value] ?? titleCase(value);
}

function requestTypeLabel(requestData = {}) {
  if (requestData.type === "custom") {
    return String(requestData.customTypeLabel ?? "").trim() || REQUEST_TYPE_LABELS.custom;
  }
  return REQUEST_TYPE_LABELS[requestData.type] ?? titleCase(requestData.type);
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
    expectedModifiedTime: record.document?._stats?.modifiedTime ?? null,
    data: record.data
  };
}

function canManageDomainProjects(domain, user = game.user) {
  return Boolean(
    domain
    && domain.data?.management?.capabilities?.projects
    && isModuleManager(user)
  );
}

function canSubmitDomainRequest(domain, user = game.user) {
  return Boolean(domain && isModuleManager(user));
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
  resubmitted: "Reenviada",
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
  project: "Projeto",
  mission: "Missão",
  agreement: "Acordo"
});
const CONDITION_CATEGORY_LABELS = Object.freeze({
  environmental: "Ambiental",
  economic: "Econômica",
  social: "Social",
  political: "Política",
  logistical: "Logística",
  military: "Militar",
  other: "Outra"
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
    "population", "people", "structures", "projects", "squads", "missions", "requests", "conditions",
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
    name: record.document?.name ?? "Estrutura"
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
      ? "INSUFICIENTE"
      : entry.critical
        ? "CRÍTICO"
        : entry.belowReserve
          ? "ABAIXO DA RESERVA"
          : "NORMAL";
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
      contributionLabel: `${entry.contributions?.length ?? 0} ${(entry.contributions?.length ?? 0) === 1 ? "vetor" : "vetores"}`,
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
  editingDomainUuid = null;
  isDomainBusy = false;
  isDomainDeleteOpen = false;
  isDomainMediaOpen = false;
  isCreateSquadOpen = false;
  editingSquadUuid = null;
  supplySquadUuid = null;
  isSquadBusy = false;
  isCreateMissionOpen = false;
  editingMissionUuid = null;
  preparingMissionUuid = null;
  preparingSquadUuid = null;
  pendingMissionRelease = null;
  pendingMissionLaunch = null;
  pendingMissionCancel = null;
  resolvingMissionUuid = null;
  isMissionBusy = false;
  isCreateStructureOpen = false;
  structureCreateMode = "construction";
  editingStructureUuid = null;
  isStructureBusy = false;
  selectedProjectUuid = null;
  editingProjectUuid = null;
  editingProjectCostId = null;
  pendingProjectCostRemoval = null;
  isProjectBusy = false;
  selectedRequestUuid = null;
  isRequestCreateOpen = false;
  reviewingRequestUuid = null;
  revisingRequestUuid = null;
  isRequestBusy = false;
  editingConditionId = null;
  pendingConditionRemoval = null;
  isConditionBusy = false;
  isHistoryEntryOpen = false;
  pendingHistoryRemoval = null;
  pendingHistoryClear = null;
  pendingDomainEvent = null;
  isHistoryBusy = false;
  selectedPersonUuid = null;
  isPopulationConfigOpen = false;
  editingPopulationGroupId = null;
  pendingPopulationGroupRemoval = null;
  isWorkforceOpen = false;
  isPopulationBusy = false;
  isPersonEditorOpen = false;
  editingPersonUuid = null;
  isPeopleBusy = false;
  pendingTerminalTransition = null;
  isTerminalTransitionBusy = false;
  isAdvanceBusy = false;
  isEconomyConfigOpen = false;
  editingEconomyFlowId = null;
  pendingEconomyFlowRemoval = null;
  isResourceCatalogOpen = false;
  editingResourceId = null;
  pendingResourceRemoval = null;
  isEconomyBusy = false;
  isSecurityEditorOpen = false;
  isSecurityBusy = false;
  isTerritoryEditorOpen = false;
  editingRelationId = null;
  pendingRelationRemoval = null;
  isAgreementCreateOpen = false;
  pendingAgreementStatus = null;
  selectedIntelId = null;
  editingIntelId = null;
  pendingIntelAction = null;
  isStrategicIntelBusy = false;
  responsiveObserver = null;
  isInspectorOpen = false;
  lastMotionView = null;

  static DEFAULT_OPTIONS = {
    id: "domain-manager-app",
    classes: ["domain-manager-app-window"],
    position: { width: 1280, height: 760 },
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
      toggleInspector: DomainManagerShellApp.onToggleInspector,
      openCreateDomain: DomainManagerShellApp.onOpenCreateDomain,
      openEditDomain: DomainManagerShellApp.onOpenEditDomain,
      cancelCreateDomain: DomainManagerShellApp.onCancelCreateDomain,
      submitCreateDomain: DomainManagerShellApp.onSubmitCreateDomain,
      openDeleteDomain: DomainManagerShellApp.onOpenDeleteDomain,
      cancelDeleteDomain: DomainManagerShellApp.onCancelDeleteDomain,
      submitDeleteDomain: DomainManagerShellApp.onSubmitDeleteDomain,
      openDomainMedia: DomainManagerShellApp.onOpenDomainMedia,
      closeDomainMedia: DomainManagerShellApp.onCloseDomainMedia,
      browseImageField: DomainManagerShellApp.onBrowseImageField,
      submitDomainMedia: DomainManagerShellApp.onSubmitDomainMedia,
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
      openEditMission: DomainManagerShellApp.onOpenEditMission,
      cancelCreateMission: DomainManagerShellApp.onCancelCreateMission,
      submitCreateMission: DomainManagerShellApp.onSubmitCreateMission,
      publishMission: DomainManagerShellApp.onPublishMission,
      openMissionPrepare: DomainManagerShellApp.onOpenMissionPrepare,
      closeMissionPrepare: DomainManagerShellApp.onCloseMissionPrepare,
      submitMissionPrepare: DomainManagerShellApp.onSubmitMissionPrepare,
      releaseMissionAssignment: DomainManagerShellApp.onReleaseMissionAssignment,
      cancelReleaseMissionAssignment: DomainManagerShellApp.onCancelReleaseMissionAssignment,
      confirmReleaseMissionAssignment: DomainManagerShellApp.onConfirmReleaseMissionAssignment,
      launchMission: DomainManagerShellApp.onLaunchMission,
      cancelLaunchMission: DomainManagerShellApp.onCancelLaunchMission,
      confirmLaunchMission: DomainManagerShellApp.onConfirmLaunchMission,
      openMissionCancel: DomainManagerShellApp.onOpenMissionCancel,
      closeMissionCancel: DomainManagerShellApp.onCloseMissionCancel,
      confirmMissionCancel: DomainManagerShellApp.onConfirmMissionCancel,
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
      deleteProject: DomainManagerShellApp.onDeleteProject,
      openProjectCostEditor: DomainManagerShellApp.onOpenProjectCostEditor,
      closeProjectCostEditor: DomainManagerShellApp.onCloseProjectCostEditor,
      submitProjectCostEditor: DomainManagerShellApp.onSubmitProjectCostEditor,
      removeProjectCost: DomainManagerShellApp.onRemoveProjectCost,
      cancelRemoveProjectCost: DomainManagerShellApp.onCancelRemoveProjectCost,
      confirmRemoveProjectCost: DomainManagerShellApp.onConfirmRemoveProjectCost,
      selectRequest: DomainManagerShellApp.onSelectRequest,
      openRequestCreate: DomainManagerShellApp.onOpenRequestCreate,
      closeRequestCreate: DomainManagerShellApp.onCloseRequestCreate,
      submitRequestCreate: DomainManagerShellApp.onSubmitRequestCreate,
      openRequestReview: DomainManagerShellApp.onOpenRequestReview,
      closeRequestReview: DomainManagerShellApp.onCloseRequestReview,
      submitRequestReview: DomainManagerShellApp.onSubmitRequestReview,
      openRequestRevision: DomainManagerShellApp.onOpenRequestRevision,
      closeRequestRevision: DomainManagerShellApp.onCloseRequestRevision,
      submitRequestRevision: DomainManagerShellApp.onSubmitRequestRevision,
      createMissionFromRequest: DomainManagerShellApp.onCreateMissionFromRequest,
      withdrawRequest: DomainManagerShellApp.onWithdrawRequest,
      fulfillRequest: DomainManagerShellApp.onFulfillRequest,
      openConditionEditor: DomainManagerShellApp.onOpenConditionEditor,
      closeConditionEditor: DomainManagerShellApp.onCloseConditionEditor,
      submitConditionEditor: DomainManagerShellApp.onSubmitConditionEditor,
      toggleCondition: DomainManagerShellApp.onToggleCondition,
      removeCondition: DomainManagerShellApp.onRemoveCondition,
      cancelRemoveCondition: DomainManagerShellApp.onCancelRemoveCondition,
      confirmRemoveCondition: DomainManagerShellApp.onConfirmRemoveCondition,
      openHistoryEntry: DomainManagerShellApp.onOpenHistoryEntry,
      closeHistoryEntry: DomainManagerShellApp.onCloseHistoryEntry,
      submitHistoryEntry: DomainManagerShellApp.onSubmitHistoryEntry,
      removeHistoryEntry: DomainManagerShellApp.onRemoveHistoryEntry,
      cancelRemoveHistoryEntry: DomainManagerShellApp.onCancelRemoveHistoryEntry,
      confirmRemoveHistoryEntry: DomainManagerShellApp.onConfirmRemoveHistoryEntry,
      openHistoryClear: DomainManagerShellApp.onOpenHistoryClear,
      cancelHistoryClear: DomainManagerShellApp.onCancelHistoryClear,
      confirmHistoryClear: DomainManagerShellApp.onConfirmHistoryClear,
      rollDomainEvent: DomainManagerShellApp.onRollDomainEvent,
      closeDomainEvent: DomainManagerShellApp.onCloseDomainEvent,
      confirmDomainEvent: DomainManagerShellApp.onConfirmDomainEvent,
      selectPerson: DomainManagerShellApp.onSelectPerson,
      openPopulationConfig: DomainManagerShellApp.onOpenPopulationConfig,
      closePopulationConfig: DomainManagerShellApp.onClosePopulationConfig,
      submitPopulationConfig: DomainManagerShellApp.onSubmitPopulationConfig,
      openPopulationGroup: DomainManagerShellApp.onOpenPopulationGroup,
      closePopulationGroup: DomainManagerShellApp.onClosePopulationGroup,
      submitPopulationGroup: DomainManagerShellApp.onSubmitPopulationGroup,
      removePopulationGroup: DomainManagerShellApp.onRemovePopulationGroup,
      cancelRemovePopulationGroup: DomainManagerShellApp.onCancelRemovePopulationGroup,
      confirmRemovePopulationGroup: DomainManagerShellApp.onConfirmRemovePopulationGroup,
      openWorkforce: DomainManagerShellApp.onOpenWorkforce,
      closeWorkforce: DomainManagerShellApp.onCloseWorkforce,
      submitWorkforce: DomainManagerShellApp.onSubmitWorkforce,
      openPersonEditor: DomainManagerShellApp.onOpenPersonEditor,
      closePersonEditor: DomainManagerShellApp.onClosePersonEditor,
      submitPersonEditor: DomainManagerShellApp.onSubmitPersonEditor,
      deletePerson: DomainManagerShellApp.onDeletePerson,
      closeTerminalTransition: DomainManagerShellApp.onCloseTerminalTransition,
      confirmTerminalTransition: DomainManagerShellApp.onConfirmTerminalTransition,
      openEconomyConfig: DomainManagerShellApp.onOpenEconomyConfig,
      closeEconomyConfig: DomainManagerShellApp.onCloseEconomyConfig,
      submitEconomyConfig: DomainManagerShellApp.onSubmitEconomyConfig,
      openEconomyFlowEditor: DomainManagerShellApp.onOpenEconomyFlowEditor,
      closeEconomyFlowEditor: DomainManagerShellApp.onCloseEconomyFlowEditor,
      submitEconomyFlowEditor: DomainManagerShellApp.onSubmitEconomyFlowEditor,
      removeEconomyFlow: DomainManagerShellApp.onRemoveEconomyFlow,
      cancelRemoveEconomyFlow: DomainManagerShellApp.onCancelRemoveEconomyFlow,
      confirmRemoveEconomyFlow: DomainManagerShellApp.onConfirmRemoveEconomyFlow,
      openResourceCatalog: DomainManagerShellApp.onOpenResourceCatalog,
      closeResourceCatalog: DomainManagerShellApp.onCloseResourceCatalog,
      newResourceDefinition: DomainManagerShellApp.onNewResourceDefinition,
      editResourceDefinition: DomainManagerShellApp.onEditResourceDefinition,
      submitResourceDefinition: DomainManagerShellApp.onSubmitResourceDefinition,
      removeResourceDefinition: DomainManagerShellApp.onRemoveResourceDefinition,
      cancelRemoveResourceDefinition: DomainManagerShellApp.onCancelRemoveResourceDefinition,
      confirmRemoveResourceDefinition: DomainManagerShellApp.onConfirmRemoveResourceDefinition,
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
      cancelRemoveRelation: DomainManagerShellApp.onCancelRemoveRelation,
      confirmRemoveRelation: DomainManagerShellApp.onConfirmRemoveRelation,
      openAgreementCreate: DomainManagerShellApp.onOpenAgreementCreate,
      closeAgreementCreate: DomainManagerShellApp.onCloseAgreementCreate,
      submitAgreementCreate: DomainManagerShellApp.onSubmitAgreementCreate,
      setAgreementStatus: DomainManagerShellApp.onSetAgreementStatus,
      cancelAgreementStatus: DomainManagerShellApp.onCancelAgreementStatus,
      confirmAgreementStatus: DomainManagerShellApp.onConfirmAgreementStatus,
      selectIntel: DomainManagerShellApp.onSelectIntel,
      openIntelEditor: DomainManagerShellApp.onOpenIntelEditor,
      closeIntelEditor: DomainManagerShellApp.onCloseIntelEditor,
      submitIntelEditor: DomainManagerShellApp.onSubmitIntelEditor,
      removeIntel: DomainManagerShellApp.onRemoveIntel,
      revealIntel: DomainManagerShellApp.onRevealIntel,
      cancelIntelAction: DomainManagerShellApp.onCancelIntelAction,
      confirmIntelAction: DomainManagerShellApp.onConfirmIntelAction,
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
    if (domainUuid !== undefined) {
      const nextDomainUuid = domainUuid || null;
      if (nextDomainUuid !== this.selectedDomainUuid) this.resetDomainScopedState();
      this.selectedDomainUuid = nextDomainUuid;
    }
    return this;
  }

  resetDomainScopedState() {
    this.isCreateDomainOpen = false;
    this.editingDomainUuid = null;
    this.isDomainDeleteOpen = false;
    this.isDomainMediaOpen = false;
    this.isCreateSquadOpen = false;
    this.editingSquadUuid = null;
    this.supplySquadUuid = null;
    this.isCreateMissionOpen = false;
    this.editingMissionUuid = null;
    this.preparingMissionUuid = null;
    this.preparingSquadUuid = null;
    this.pendingMissionRelease = null;
    this.pendingMissionLaunch = null;
    this.pendingMissionCancel = null;
    this.resolvingMissionUuid = null;
    this.isCreateStructureOpen = false;
    this.structureCreateMode = "construction";
    this.editingStructureUuid = null;
    this.selectedProjectUuid = null;
    this.editingProjectUuid = null;
    this.editingProjectCostId = null;
    this.pendingProjectCostRemoval = null;
    this.selectedRequestUuid = null;
    this.isRequestCreateOpen = false;
    this.reviewingRequestUuid = null;
    this.revisingRequestUuid = null;
    this.editingConditionId = null;
    this.pendingConditionRemoval = null;
    this.isHistoryEntryOpen = false;
    this.pendingHistoryRemoval = null;
    this.pendingHistoryClear = null;
    this.pendingDomainEvent = null;
    this.selectedPersonUuid = null;
    this.isPopulationConfigOpen = false;
    this.editingPopulationGroupId = null;
    this.pendingPopulationGroupRemoval = null;
    this.isWorkforceOpen = false;
    this.isPersonEditorOpen = false;
    this.editingPersonUuid = null;
    this.pendingTerminalTransition = null;
    this.isEconomyConfigOpen = false;
    this.editingEconomyFlowId = null;
    this.pendingEconomyFlowRemoval = null;
    this.isResourceCatalogOpen = false;
    this.editingResourceId = null;
    this.pendingResourceRemoval = null;
    this.isSecurityEditorOpen = false;
    this.isTerritoryEditorOpen = false;
    this.editingRelationId = null;
    this.pendingRelationRemoval = null;
    this.isAgreementCreateOpen = false;
    this.pendingAgreementStatus = null;
    this.selectedIntelId = null;
    this.editingIntelId = null;
    this.pendingIntelAction = null;
    this.isInspectorOpen = false;
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    const root = this.element?.querySelector?.(".dm-os");
    applyShellMotion(root, { previousView: this.lastMotionView, nextView: this.activeView });
    presentPlayerIntro({ root, user: game.user, world: game.world, domain: context.selectedDomain });
    this.lastMotionView = this.activeView;
    this.#syncResponsiveState();
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
    const domainPreset = this.element?.querySelector?.("[data-domain-preset]");
    const capabilityInputs = Array.from(this.element?.querySelectorAll?.('[name="capabilities"]') ?? []);
    if (domainPreset && capabilityInputs.length) {
      domainPreset.addEventListener("change", () => {
        if (domainPreset.value === "custom") return;
        const defaults = capabilityDefaultsForPreset(domainPreset.value);
        for (const input of capabilityInputs) input.checked = defaults[input.value] === true;
      });
      for (const input of capabilityInputs) {
        input.addEventListener("change", () => {
          const defaults = capabilityDefaultsForPreset(domainPreset.value);
          const isPresetDefault = capabilityInputs.every((candidate) => candidate.checked === (defaults[candidate.value] === true));
          if (!isPresetDefault) domainPreset.value = "custom";
        });
      }
    }
    for (const typeSelect of this.element?.querySelectorAll?.("[data-request-type]") ?? []) {
      const customField = typeSelect.closest("form")?.querySelector?.("[data-custom-request-type]");
      if (!customField) continue;
      const customInput = customField.querySelector("input");
      const syncCustomType = () => {
        const active = typeSelect.value === "custom";
        customField.hidden = !active;
        if (customInput) customInput.required = active;
      };
      typeSelect.addEventListener("change", syncCustomType);
      syncCustomType();
    }
    const deleteConfirmation = this.element?.querySelector?.("[data-domain-delete-confirmation]");
    const deleteSubmit = this.element?.querySelector?.("[data-domain-delete-submit]");
    if (deleteConfirmation && deleteSubmit) {
      const syncDeleteConfirmation = () => {
        deleteSubmit.disabled = String(deleteConfirmation.value ?? "").trim() !== deleteConfirmation.dataset.confirmation;
      };
      deleteConfirmation.addEventListener("input", syncDeleteConfirmation);
      syncDeleteConfirmation();
    }
    const workspaceSelect = this.element?.querySelector?.("[data-workspace-select]");
    workspaceSelect?.addEventListener?.("change", () => {
      if (!workspaceSelect.value) return;
      this.activeView = workspaceSelect.value;
      this.isInspectorOpen = false;
      this.render({ force: true });
    });
    this.element?.addEventListener?.("keydown", (event) => {
      if (event.key === "Escape" && this.isInspectorOpen) {
        event.preventDefault();
        this.isInspectorOpen = false;
        this.render({ force: true });
        return;
      }
      if (!(event.metaKey || event.ctrlKey) || String(event.key).toLowerCase() !== "k") return;
      event.preventDefault();
      search?.focus?.();
      search?.select?.();
    });
  }


  #syncResponsiveState() {
    const root = this.element?.querySelector?.(".dm-os");
    if (!root) return;

    const apply = () => {
      const width = Math.round(root.clientWidth || root.getBoundingClientRect?.().width || 0);
      const height = Math.round(root.clientHeight || root.getBoundingClientRect?.().height || 0);
      root.dataset.dmWidth = width <= 520 ? "micro" : width <= 720 ? "narrow" : width <= 900 ? "compact" : width <= 1120 ? "medium" : "wide";
      root.dataset.dmHeight = height <= 540 ? "short" : height <= 680 ? "compact" : "normal";
    };

    this.responsiveObserver?.disconnect?.();
    if (typeof globalThis.ResizeObserver === "function") {
      this.responsiveObserver = new globalThis.ResizeObserver(apply);
      this.responsiveObserver.observe(root);
    }
    apply();
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
    const resourceCatalogRows = (catalog?.resources ?? []).map((resource) => {
      const dependencies = buildResourceDependencyReport(resource.id);
      return {
        ...resource,
        tagsLabel: (resource.tags ?? []).join(", ") || "Sem marcadores",
        categoryLabel: titleCase(resource.category || "general"),
        precisionLabel: `${resource.precision ?? 0} casa(s) decimal(is)`,
        usageCount: dependencies.total,
        usageLabel: dependencies.total ? `${dependencies.total} registro(s)` : "Não utilizado",
        selected: resource.id === this.editingResourceId
      };
    });
    const editingResource = this.editingResourceId
      ? resourceCatalogRows.find((resource) => resource.id === this.editingResourceId) ?? null
      : null;
    if (this.editingResourceId && !editingResource) this.editingResourceId = null;
    const resourceCatalogEditor = editingResource ? {
      ...editingResource,
      isEdit: true,
      allowNegative: editingResource.allowNegative === true,
      tagsValue: (editingResource.tags ?? []).join(", ")
    } : {
      id: "",
      name: "",
      unit: "",
      precision: 0,
      allowNegative: false,
      category: "general",
      tagsValue: "",
      isEdit: false,
      usageCount: 0
    };
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
    const resourceDefinitions = new Map((catalog?.resources ?? []).map((resource) => [resource.id, resource]));
    const economyFlows = (selectedDomain?.data.economy?.flows ?? []).map((flow) => {
      const resource = resourceDefinitions.get(flow.resourceId) ?? {};
      const precision = Number(resource.precision ?? 0);
      const periodTicks = Math.max(1, Number(flow.periodTicks ?? 1));
      return {
        ...flow,
        resourceName: resource.name ?? flow.resourceId,
        unit: resource.unit ?? "",
        amountDisplay: formatMinorUnits(flow.amount ?? 0, precision),
        cadenceLabel: periodTicks === 1 ? "A cada ciclo" : `A cada ${periodTicks} ciclos`,
        directionLabel: flow.direction === "outflow" ? "Saída" : "Entrada",
        isOutflow: flow.direction === "outflow",
        categoryLabel: titleCase(flow.category || "manual"),
        sourceLabel: String(flow.source ?? "").trim() || "Origem não informada",
        activeLabel: flow.active === false ? "Pausado" : "Ativo",
        tone: flow.active === false ? "neutral" : flow.direction === "outflow" ? "warning" : "nominal"
      };
    });
    let editingEconomyFlow = null;
    if (this.editingEconomyFlowId !== null) {
      const existing = this.editingEconomyFlowId === "__new__"
        ? null
        : economyFlows.find((flow) => flow.localId === this.editingEconomyFlowId) ?? null;
      if (this.editingEconomyFlowId !== "__new__" && !existing) {
        this.editingEconomyFlowId = null;
      } else {
        const resourceId = existing?.resourceId ?? catalog?.resources?.[0]?.id ?? "";
        const resource = resourceDefinitions.get(resourceId) ?? {};
        editingEconomyFlow = {
          localId: existing?.localId ?? "",
          isEdit: Boolean(existing),
          name: existing?.name ?? "",
          resourceId,
          resourceUnit: resource.unit ?? "",
          amountValue: existing ? formatMinorUnits(existing.amount ?? 0, resource.precision ?? 0) : "",
          periodTicks: existing?.periodTicks ?? 1,
          category: existing?.category ?? "manual",
          source: existing?.source ?? "",
          active: existing?.active !== false,
          direction: existing?.direction ?? "inflow"
        };
      }
    }
    const economyFlowResourceOptions = (catalog?.resources ?? []).map((resource) => ({
      value: resource.id,
      label: `${resource.name ?? resource.id}${resource.unit ? ` (${resource.unit})` : ""}`,
      selected: resource.id === editingEconomyFlow?.resourceId
    }));
    const economyFlowDirectionOptions = [
      { value: "inflow", label: "Entrada — adiciona ao estoque" },
      { value: "outflow", label: "Saída — consome do estoque" }
    ].map((option) => ({ ...option, selected: option.value === editingEconomyFlow?.direction }));
    const economyFlowCategoryOptions = FLOW_CATEGORIES.map((value) => ({
      value,
      label: titleCase(value),
      selected: value === editingEconomyFlow?.category
    }));
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
    const globalNav = buildGlobalNavigation({ isGM: isModuleManager(game.user), activeView: this.activeView });

    const allMissions = listVisibleRecords(RECORD_TYPES.MISSION).map(recordSummary);
    const allSquads = listVisibleRecords(RECORD_TYPES.SQUAD).map(recordSummary);
    const allProjects = listVisibleRecords(RECORD_TYPES.PROJECT).map(recordSummary);
    const allStructures = listVisibleRecords(RECORD_TYPES.STRUCTURE).map(recordSummary);

    const domainInfo = selectedDomain ? {
      ...buildDomainCard(selectedDomain, { selectedUuid: selectedDomain.uuid }),
      stateLabel: stateLabel(selectedDomain.data.identity?.state),
      stateTone: statusTone(selectedDomain.data.identity?.state),
      natureLabel: domainNatureLabel(selectedDomain.data.identity?.nature),
      presetLabel: managementPresetLabel(selectedDomain.data.management?.preset),
      entityIdShort: selectedDomain.data.entityId?.slice(-10)?.toUpperCase() ?? "—",
      expectedModifiedTime: selectedDomain.document?._stats?.modifiedTime ?? null,
      visuals: {
        bannerImg: "",
        crestImg: "",
        image: "",
        imageFit: "cover",
        imagePosition: "center",
        imageHeight: 260,
        imagePosX: 50,
        imagePosY: 50,
        imageZoom: 100,
        themeColorHex: "",
        ...selectedDomain.data.visuals
      },
      capabilities: Object.entries(selectedDomain.data.management?.capabilities ?? {})
        .filter(([, enabled]) => enabled)
        .map(([key]) => capabilityLabel(key))
    } : null;
    if (this.isDomainDeleteOpen && !selectedDomain) this.isDomainDeleteOpen = false;
    const domainDeleteReport = this.isDomainDeleteOpen && selectedDomain
      ? buildDomainDependencyReport(selectedDomain)
      : null;
    const domainImageFitOptions = ["cover", "contain"].map((value) => ({
      value,
      label: value === "contain" ? "Conter" : "Preencher",
      selected: (selectedDomain?.data?.visuals?.imageFit ?? "cover") === value
    }));

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
          modeLabel: cost.mode === "progressive" ? "PROGRESSIVO" : "RESERVADO"
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
        expectedModifiedTime: record.document?._stats?.modifiedTime ?? null,
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
      : [
          ...(editingProject?.completed > 0 ? [] : ["planned"]),
          "active", "paused", "blocked",
          ...(editingProject?.hasPlannedStructureLink ? [] : ["cancelled"])
        ];
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
    const pendingProjectCostRemoval = selectedProject && this.pendingProjectCostRemoval
      ? selectedProject.costs.find((cost) => cost.localId === this.pendingProjectCostRemoval.localId) ?? null
      : null;
    if (this.pendingProjectCostRemoval && !pendingProjectCostRemoval) this.pendingProjectCostRemoval = null;
    const projectResourceOptions = (catalog?.resources ?? []).map((resource) => ({
      id: resource.id,
      name: resource.name ?? resource.id,
      unit: resource.unit ?? "",
      selected: (editingProjectCost?.resourceId ?? "") === resource.id
    }));
    const projectCostModeOptions = ["reserved", "progressive"].map((value) => ({
      value,
      label: value === "reserved" ? "Reservado" : "Progressivo",
      selected: (editingProjectCost?.mode ?? "reserved") === value
    }));


    const users = listUsers();
    if (this.editingDomainUuid && !domains.some((domain) => domain.uuid === this.editingDomainUuid)) {
      this.editingDomainUuid = null;
      this.isCreateDomainOpen = false;
    }
    const editingDomainRecord = this.editingDomainUuid
      ? domains.find((domain) => domain.uuid === this.editingDomainUuid) ?? null
      : null;
    const domainEditorData = editingDomainRecord?.data ?? null;
    const domainEditorPreset = domainEditorData?.management?.preset ?? "base";
    const domainEditorCapabilities = domainEditorData?.management?.capabilities
      ?? capabilityDefaultsForPreset(domainEditorPreset);
    const domainEditor = this.isCreateDomainOpen ? {
      isEdit: Boolean(editingDomainRecord),
      name: editingDomainRecord?.document.name ?? "",
      description: domainEditorData?.description ?? "",
      category: domainEditorData?.identity?.category ?? "Base",
      tagsValue: (domainEditorData?.identity?.tags ?? []).join(", "),
      expectedModifiedTime: editingDomainRecord?.document?._stats?.modifiedTime ?? "",
      natureOptions: DOMAIN_NATURES.map((value) => ({
        value,
        label: domainNatureLabel(value),
        selected: (domainEditorData?.identity?.nature ?? "physical") === value
      })),
      stateOptions: DOMAIN_STATES.map((value) => ({
        value,
        label: stateLabel(value),
        selected: (domainEditorData?.identity?.state ?? "active") === value
      })),
      presetOptions: MANAGEMENT_PRESETS.map((value) => ({
        value,
        label: managementPresetLabel(value),
        selected: domainEditorPreset === value
      })),
      capabilityOptions: CAPABILITY_KEYS.map((value) => ({
        value,
        label: capabilityLabel(value),
        checked: domainEditorCapabilities[value] === true
      })),
      controllerOptions: users
        .filter((user) => !user.isGM)
        .map((user) => ({
          id: user.id,
          name: user.name,
          active: Boolean(user.active),
          selected: domainEditorData?.governance?.controllers?.includes(user.id) ?? false
        })),
      locatedInOptions: domains
        .filter((domain) => domain.uuid !== editingDomainRecord?.uuid)
        .map((domain) => ({
          uuid: domain.uuid,
          name: domain.document.name,
          selected: domainEditorData?.hierarchy?.locatedInUuid === domain.uuid
        })),
      administrativeParentOptions: domains
        .filter((domain) => domain.uuid !== editingDomainRecord?.uuid)
        .map((domain) => ({
          uuid: domain.uuid,
          name: domain.document.name,
          selected: domainEditorData?.hierarchy?.administrativeParentUuid === domain.uuid
        }))
    } : null;
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
      const canRevise = Boolean(
        game.user.uuid === record.data.requesterUserUuid
        && status === "needs-changes"
        && !record.data.resultUuid
      );
      const canFulfill = Boolean(
        isModuleManager(game.user)
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
        typeLabel: requestTypeLabel(record.data),
        customTypeLabel: record.data.customTypeLabel ?? "",
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
        canRevise,
        canFulfill,
        modifiedTime: record.document?._stats?.modifiedTime ?? null,
        history: [...(record.data.history ?? [])].reverse().map((entry) => ({
          ...entry,
          kindLabel: REQUEST_STATUS_LABELS[entry.kind] ?? titleCase(entry.kind),
          userName: users.find((user) => user.uuid === entry.userUuid)?.name ?? (entry.userUuid || "Sistema")
        })),
        canReview: Boolean(isModuleManager(game.user) && status !== "needs-changes" && REQUEST_REVIEW_STATUSES.includes(status) && !record.data.resultUuid),
        canMaterializeMission: Boolean(
          isModuleManager(game.user)
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
    const revisingRequest = this.revisingRequestUuid
      ? requests.find((entry) => entry.uuid === this.revisingRequestUuid && entry.canRevise) ?? null
      : null;
    if (this.revisingRequestUuid && !revisingRequest) this.revisingRequestUuid = null;
    const requestTypeOptions = REQUEST_TYPES.map((value) => ({
      value,
      label: value === "custom" ? "Personalizada — definir tipo" : (REQUEST_TYPE_LABELS[value] ?? titleCase(value))
    }));
    const requestRevisionTypeOptions = REQUEST_TYPES.map((value) => ({
      value,
      label: value === "custom" ? "Personalizada — definir tipo" : (REQUEST_TYPE_LABELS[value] ?? titleCase(value)),
      selected: revisingRequest?.type === value
    }));
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
        expectedModifiedTime: record.document?._stats?.modifiedTime ?? null,
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
        canOperate: isModuleManager(game.user) || controlledByMe,
        canUseSupply: Boolean((isModuleManager(game.user) || controlledByMe) && selectedDomain?.data.management?.capabilities?.economy),
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
        currentMissionName: currentMissionDocument?.name ?? "SEM MISSÃO"
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
            && Boolean(isModuleManager(game.user) || controllers.includes(game.user.id)),
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
        if (squad.status === "disbanded") return false;
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
        description: record.data.briefing || "Sem resumo operacional.",
        expectedModifiedTime: record.document?._stats?.modifiedTime ?? null,
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
        canLaunch: Boolean(isModuleManager(game.user) && record.data.status === "available" && assignments.length),
        canResolve: Boolean(isModuleManager(game.user) && record.data.status === "active"),
        canCancel: Boolean(isModuleManager(game.user) && ["planned", "available", "active"].includes(record.data.status)),
        canEdit: Boolean(isModuleManager(game.user) && ["planned", "available"].includes(record.data.status)),
        canPublish: Boolean(isModuleManager(game.user) && record.data.status === "planned"),
        isAvailable: record.data.status === "available",
        isActive: record.data.status === "active",
        isTerminal: ["resolved", "failed", "cancelled"].includes(record.data.status),
        startedAtWorldTime: record.data.startedAtWorldTime,
        resolvedAtWorldTime: record.data.resolvedAtWorldTime,
        outcomeSummary: record.data.outcomeSummary ?? ""
      };
    });

    const editingMissionRecord = this.editingMissionUuid
      ? related.missions.find((record) => record.uuid === this.editingMissionUuid) ?? null
      : null;
    if (this.editingMissionUuid && !editingMissionRecord) {
      this.editingMissionUuid = null;
      this.isCreateMissionOpen = false;
    }
    const editingMission = editingMissionRecord ? {
      ...missions.find((entry) => entry.uuid === editingMissionRecord.uuid),
      objectiveLines: (editingMissionRecord.data.objectives ?? []).map((objective) => objective.title).join("\n"),
      outcomeSummary: editingMissionRecord.data.outcomeSummary ?? ""
    } : null;

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
      .filter((value) => isModuleManager(game.user) || value !== "disbanded")
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
      active: Boolean(candidate.active),
      checked: Boolean(editingMissionRecord?.data.audienceUserIds?.includes(candidate.id))
    }));

    const resourceDefs = new Map((catalog?.resources ?? []).map((resource) => [resource.id, resource]));
    const domainControllerIds = selectedDomain?.data?.governance?.controllers ?? [];
    const canOperateDomainStructures = Boolean(isModuleManager(game.user) || domainControllerIds.includes(game.user.id));
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
        maintenancePriority: Number(record.data.maintenancePriority ?? 50),
        expectedModifiedTime: record.document?._stats?.modifiedTime ?? null,
        maintenance: mapProfile(record.data.maintenance),
        production: mapProfile(record.data.production),
        tags: record.data.tags ?? [],
        canOperate: canOperateDomainStructures && !["planned", "destroyed", "decommissioned"].includes(record.data.status),
        canAdmin: Boolean(isModuleManager(game.user)),
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
        canEdit: Boolean(selectedDomain && (isModuleManager(game.user) || selectedDomain.data.governance?.controllers?.includes(game.user.id)))
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
      label: value === "direct" ? "Direta" : "Inclusiva",
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
      canEdit: !person.legacy && Boolean(selectedDomain && (isModuleManager(game.user) || selectedDomain.data.governance?.controllers?.includes(game.user.id)))
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
      && (isModuleManager(game.user) || selectedDomain.data.governance?.controllers?.includes(game.user.id))
    );
    const canManagePeople = Boolean(
      selectedDomain
      && selectedDomain.data.management?.capabilities?.people
      && (isModuleManager(game.user) || selectedDomain.data.governance?.controllers?.includes(game.user.id))
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

    const canManageTerritory = Boolean(isModuleManager(game.user) && selectedDomain?.data.management?.capabilities?.territory);
    const canManageDiplomacy = Boolean(isModuleManager(game.user) && selectedDomain?.data.management?.capabilities?.diplomacy);
    const canManageIntel = Boolean(isModuleManager(game.user) && selectedDomain?.data.management?.capabilities?.intel);

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
        domainName: domain?.document?.name ?? "Domínio desconhecido",
        domainEntityId: domain?.data?.entityId ?? entry.domain?.entityId ?? "—",
        contextLabel: selectedDomain && domain?.uuid === selectedDomain.uuid ? "Domínio atual" : "Influência externa",
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
        return { reference: party, name: domain?.document?.name ?? party.entityId ?? party.uuid ?? "Contraparte desconhecida", entityId: domain?.data?.entityId ?? party.entityId ?? "—" };
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
        isTerminated: record.data.status === "terminated",
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
        targetName: target?.document?.name ?? (entry.targetDomain ? "Alvo desconhecido" : "Geral / sem alvo"),
        targetEntityId: target?.data?.entityId ?? entry.targetDomain?.entityId ?? "—",
        tone: credibilityTone,
        sourceLabel: entry.source || "SEM FONTE",
        tagLabel: (entry.tags ?? []).join(" · ") || "SEM MARCADORES"
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

    const history = listVisibleHistoryEvents(selectedDomain?.data?.history ?? [], game.user).map((entry) => ({
      ...entry,
      categoryLabel: HISTORY_CATEGORY_LABELS[entry.category] ?? titleCase(entry.category || "custom"),
      categoryIcon: HISTORY_CATEGORY_ICONS[entry.category] ?? HISTORY_CATEGORY_ICONS.custom,
      significanceLabel: HISTORY_SIGNIFICANCE_LABELS[entry.significance] ?? titleCase(entry.significance || "minor"),
      tone: entry.significance === "critical" ? "critical" : entry.significance === "major" ? "warning" : "neutral",
      timestampLabel: formatHistoryTimestamp(entry.timestamp),
      tickLabel: entry.tick == null ? null : `TICK ${entry.tick}`,
      summaryText: entry.summary || entry.details || "Registro sem resumo adicional.",
      hasAdditionalDetails: Boolean(entry.summary && entry.details && entry.details !== entry.summary),
      isRestricted: entry.visibility === "gm_only"
    }));
    const historyCategoryOptions = Object.entries(HISTORY_CATEGORY_LABELS)
      .map(([value, label]) => ({ value, label, selected: value === "story" }));
    const historySignificanceOptions = Object.entries(HISTORY_SIGNIFICANCE_LABELS)
      .map(([value, label]) => ({ value, label, selected: value === "minor" }));
    const historyVisibilityOptions = [
      { value: "all", label: "Todos com acesso ao domínio", selected: true },
      { value: "gm_only", label: "Somente GM", selected: false }
    ];
    const domainEventCategoryOptions = [
      { value: "", label: "Todas as categorias" },
      ...Object.entries(EVENT_CATEGORY_LABELS).map(([value, label]) => ({ value, label }))
    ];
    const conditions = (selectedDomain?.data?.conditions ?? []).map((condition) => ({
      ...condition,
      label: condition.name,
      severityLabel: condition.severity === "severe" ? "Grave" : condition.severity === "moderate" ? "Moderada" : "Leve",
      categoryLabel: CONDITION_CATEGORY_LABELS[condition.category] ?? titleCase(condition.category || "ambiental"),
      durationLabel: condition.durationTicks == null ? "Indefinida" : `${condition.durationTicks} tick(s)`,
      stateLabel: condition.active === false ? "Inativa" : "Ativa",
      tone: condition.severity === "severe" ? "critical" : condition.severity === "moderate" ? "warning" : "neutral"
    }));
    const activeConditions = conditions.filter((condition) => condition.active !== false);
    const editingCondition = this.editingConditionId && this.editingConditionId !== "__new__"
      ? conditions.find((condition) => condition.localId === this.editingConditionId) ?? null
      : null;
    if (this.editingConditionId && this.editingConditionId !== "__new__" && !editingCondition) this.editingConditionId = null;
    const conditionSeverityOptions = [
      { value: "minor", label: "Leve" },
      { value: "moderate", label: "Moderada" },
      { value: "severe", label: "Grave" }
    ].map((option) => ({ ...option, selected: (editingCondition?.severity ?? "minor") === option.value }));
    const conditionCategoryOptions = ["environmental", "economic", "social", "political", "logistical", "military", "other"]
      .map((value) => ({ value, label: CONDITION_CATEGORY_LABELS[value] ?? titleCase(value), selected: (editingCondition?.category ?? "environmental") === value }));
    const conditionStats = {
      total: conditions.length,
      active: activeConditions.length,
      severe: activeConditions.filter((condition) => condition.severity === "severe").length,
      finite: activeConditions.filter((condition) => condition.durationTicks != null).length,
      indefinite: activeConditions.filter((condition) => condition.durationTicks == null).length
    };

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
    const canManageSecurity = Boolean(isModuleManager(game.user) && selectedDomain?.data.management?.capabilities?.security);

    const controllers = (selectedDomain?.data?.governance?.controllers ?? []).map((id) => game.users.get(id)?.name ?? id);
    const timekeeping = getTimekeepingStatus?.() ?? {};

    return {
      ...context,
      appVersion: game.modules.get(MODULE_ID)?.version ?? "dev",
      schemaVersion: SCHEMA_VERSION,
      isGM: isModuleManager(game.user),
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
      domainImageFitOptions,
      domainData: selectedDomain?.data ?? null,
      hasSelectedDomain: Boolean(selectedDomain),
      searchQuery: this.searchQuery,
      inspectorOpen: this.isInspectorOpen,
      isCreateDomainOpen: this.isCreateDomainOpen,
      domainEditor,
      isDomainDeleteOpen: this.isDomainDeleteOpen,
      domainDeleteReport,
      isDomainBusy: this.isDomainBusy,
      isDomainMediaOpen: this.isDomainMediaOpen,
      isCreateSquadOpen: this.isCreateSquadOpen,
      isCreateMissionOpen: this.isCreateMissionOpen,
      editingMission,
      preparingMission,
      preparingSquad,
      existingPreparation,
      missionPrepareResources,
      resolvingMission,
      pendingMissionRelease: this.pendingMissionRelease,
      pendingMissionLaunch: this.pendingMissionLaunch,
      pendingMissionCancel: this.pendingMissionCancel,
      missionAudienceOptions,
      canCreateMission: Boolean(isModuleManager(game.user) && selectedDomain?.data.management?.capabilities?.missions),
      editingSquad,
      supplySquad,
      supplyDomainExpectedModifiedTime: selectedDomain?.document?._stats?.modifiedTime ?? null,
      supplyResourceOptions,
      controllerOptions,
      squadStatusOptions,
      canCreateSquad: Boolean(isModuleManager(game.user) && selectedDomain?.data.management?.capabilities?.squads),
      isEconomyConfigOpen: this.isEconomyConfigOpen,
      isEconomyFlowEditorOpen: this.editingEconomyFlowId !== null,
      editingEconomyFlow,
      economyFlows,
      economyFlowResourceOptions,
      economyFlowDirectionOptions,
      economyFlowCategoryOptions,
      pendingEconomyFlowRemoval: this.pendingEconomyFlowRemoval,
      isResourceCatalogOpen: this.isResourceCatalogOpen,
      resourceCatalogVersion: Math.max(1, Number(catalog?.version ?? 1)),
      resourceCatalogRows,
      resourceCatalogEditor,
      pendingResourceRemoval: this.pendingResourceRemoval,
      economyPolicyRows,
      canConfigureEconomy: Boolean(isModuleManager(game.user) && selectedDomain?.data.management?.capabilities?.economy),
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
      pendingPopulationGroupRemoval: this.pendingPopulationGroupRemoval,
      isWorkforceOpen: this.isWorkforceOpen,
      canManagePopulation,
      editingPerson,
      isPersonEditorOpen: this.isPersonEditorOpen,
      personSquadOptions,
      personStatusOptions,
      canManagePeople,
      pendingTerminalTransition: this.pendingTerminalTransition,
      isTerminalTransitionBusy: this.isTerminalTransitionBusy,
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
        && (isModuleManager(game.user) || selectedDomain.data.governance?.controllers?.includes(game.user.id))
      ),
      canRegisterStructure: Boolean(isModuleManager(game.user) && selectedDomain?.data.management?.capabilities?.structures),
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
      pendingProjectCostRemoval,
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
      pendingRelationRemoval: this.pendingRelationRemoval,
      canManageDiplomacy,
      agreements,
      agreementDomainOptions,
      agreementTypeOptions,
      agreementResourceOptions,
      isAgreementCreateOpen: this.isAgreementCreateOpen,
      pendingAgreementStatus: this.pendingAgreementStatus,
      requests,
      selectedRequest,
      reviewingRequest,
      revisingRequest,
      canCreateRequest,
      isRequestCreateOpen: this.isRequestCreateOpen,
      isRequestReviewOpen: this.reviewingRequestUuid !== null,
      isRequestRevisionOpen: this.revisingRequestUuid !== null,
      requestTypeOptions,
      requestRevisionTypeOptions,
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
      pendingIntelAction: this.pendingIntelAction,
      canManageIntel,
      history,
      historyCategoryOptions,
      historySignificanceOptions,
      historyVisibilityOptions,
      domainEventCategoryOptions,
      canManageHistory: Boolean(isModuleManager(game.user) && selectedDomain),
      isHistoryEntryOpen: this.isHistoryEntryOpen,
      pendingHistoryRemoval: this.pendingHistoryRemoval,
      pendingHistoryClear: this.pendingHistoryClear,
      pendingDomainEvent: this.pendingDomainEvent,
      isHistoryBusy: this.isHistoryBusy,
      conditions,
      activeConditions,
      conditionStats,
      editingCondition,
      conditionSeverityOptions,
      conditionCategoryOptions,
      canManageConditions: Boolean(isModuleManager(game.user) && selectedDomain),
      isConditionEditorOpen: this.editingConditionId !== null,
      pendingConditionRemoval: this.pendingConditionRemoval,
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
        primary: isPrimaryActiveGM() ? "PRINCIPAL" : isModuleManager(game.user) ? "SECUNDÁRIO" : "JOGADOR",
        activeGM: game.users.activeGM?.name ?? "Nenhum",
        timeProvider: timekeeping.providerName ?? timekeeping.provider ?? "Tempo do Mundo do Foundry",
        timeConnected: timekeeping.available ?? timekeeping.connected ?? false
      }
    };
  }

  static onToggleInspector() {
    this.isInspectorOpen = !this.isInspectorOpen;
    this.render({ force: true });
  }

  static onNavigate(event, target) {
    const view = target?.dataset?.view;
    if (!view) return;
    this.activeView = view;
    this.isInspectorOpen = false;
    this.render({ force: true });
  }

  static onSelectDomain(event, target) {
    const uuid = target?.dataset?.uuid;
    if (!uuid) return;
    if (uuid !== this.selectedDomainUuid) this.resetDomainScopedState();
    this.selectedDomainUuid = uuid;
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
    this.revisingRequestUuid = null;
    this.render({ force: true });
  }

  static onOpenRequestCreate() {
    if (!this.selectedDomainUuid) return;
    const document = recordIndex.get(RECORD_TYPES.DOMAIN, this.selectedDomainUuid);
    const domain = document ? decodeRecord(document) : null;
    if (!canSubmitDomainRequest(domain)) return;
    this.isRequestCreateOpen = true;
    this.reviewingRequestUuid = null;
    this.revisingRequestUuid = null;
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
          customTypeLabel: String(data.get("customTypeLabel") ?? ""),
          title: String(data.get("title") ?? ""),
          intent: String(data.get("intent") ?? ""),
          details: String(data.get("details") ?? "")
        }
      });
      this.selectedRequestUuid = result.uuid ?? null;
      this.isRequestCreateOpen = false;
      ui.notifications.info("Solicitação enviada para análise.");
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao criar Request", error);
      ui.notifications.error(error.message ?? "Falha ao criar solicitação.");
    } finally {
      this.isRequestBusy = false;
    }
  }

  static onOpenRequestReview(event, target) {
    if (!isModuleManager(game.user)) return;
    const uuid = String(target?.dataset?.requestUuid ?? this.selectedRequestUuid ?? "");
    if (!uuid) return;
    const document = recordIndex.get(RECORD_TYPES.REQUEST, uuid);
    if (!document || !canViewDocument(document)) return;
    const request = decodeRecord(document);
    if (!REQUEST_REVIEW_STATUSES.includes(request.data.status) || request.data.status === "needs-changes") return;
    this.selectedRequestUuid = uuid;
    this.reviewingRequestUuid = uuid;
    this.revisingRequestUuid = null;
    this.isRequestCreateOpen = false;
    this.render({ force: true });
  }

  static onCloseRequestReview() {
    this.reviewingRequestUuid = null;
    this.render({ force: true });
  }

  static async onSubmitRequestReview() {
    if (!isModuleManager(game.user) || this.isRequestBusy || !this.reviewingRequestUuid) return;
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
          expectedModifiedTime: data.get("expectedModifiedTime"),
          status: String(data.get("status") ?? "under-review"),
          summary: String(data.get("summary") ?? ""),
          handling: String(data.get("handling") ?? "none")
        }
      });
      this.reviewingRequestUuid = null;
      ui.notifications.info("Decisão da solicitação atualizada.");
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao revisar Request", error);
      ui.notifications.error(error.message ?? "Falha ao revisar solicitação.");
    } finally {
      this.isRequestBusy = false;
    }
  }

  static onOpenRequestRevision(event, target) {
    const uuid = String(target?.dataset?.requestUuid ?? this.selectedRequestUuid ?? "");
    if (!uuid) return;
    const document = recordIndex.get(RECORD_TYPES.REQUEST, uuid);
    if (!document || !canViewDocument(document)) return;
    const request = decodeRecord(document);
    if (request.data.requesterUserUuid !== game.user.uuid || request.data.status !== "needs-changes" || request.data.resultUuid) return;
    this.selectedRequestUuid = uuid;
    this.revisingRequestUuid = uuid;
    this.reviewingRequestUuid = null;
    this.isRequestCreateOpen = false;
    this.render({ force: true });
  }

  static onCloseRequestRevision() {
    this.revisingRequestUuid = null;
    this.render({ force: true });
  }

  static async onSubmitRequestRevision() {
    if (this.isRequestBusy || !this.revisingRequestUuid) return;
    const form = this.element?.querySelector?.("#dm-request-revision-form");
    const document = recordIndex.get(RECORD_TYPES.REQUEST, this.revisingRequestUuid);
    if (!form || !document || !canViewDocument(document)) return;
    const request = decodeRecord(document);
    const data = new FormData(form);
    this.isRequestBusy = true;
    try {
      await executeCommandAuthoritatively({
        commandType: COMMAND_TYPES.REQUEST_RESUBMIT,
        payload: {
          request: entityReference(request),
          expectedModifiedTime: data.get("expectedModifiedTime"),
          type: String(data.get("type") ?? "custom"),
          customTypeLabel: String(data.get("customTypeLabel") ?? ""),
          title: String(data.get("title") ?? ""),
          intent: String(data.get("intent") ?? ""),
          details: String(data.get("details") ?? "")
        }
      });
      this.revisingRequestUuid = null;
      ui.notifications.info("Solicitação corrigida e reenviada para análise.");
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao reenviar Request", error);
      ui.notifications.error(error.message ?? "Falha ao reenviar solicitação.");
    } finally {
      this.isRequestBusy = false;
    }
  }

  static async onCreateMissionFromRequest(event, target) {
    if (!isModuleManager(game.user) || this.isRequestBusy) return;
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
      ui.notifications.info(result.reused ? "Missão já vinculada à solicitação." : "Missão criada a partir da solicitação.");
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao materializar Request como Mission", error);
      ui.notifications.error(error.message ?? "Falha ao criar missão a partir da solicitação.");
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
      ui.notifications.info("Solicitação retirada pelo solicitante.");
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao retirar Request", error);
      ui.notifications.error(error.message ?? "Falha ao retirar solicitação.");
    } finally {
      this.isRequestBusy = false;
    }
  }

  static async onFulfillRequest(event, target) {
    if (!isModuleManager(game.user) || this.isRequestBusy) return;
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
      ui.notifications.info("Solicitação marcada como cumprida.");
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao concluir lifecycle da Request", error);
      ui.notifications.error(error.message ?? "Falha ao marcar solicitação como cumprida.");
    } finally {
      this.isRequestBusy = false;
    }
  }

  static onOpenConditionEditor(event, target) {
    if (!isModuleManager(game.user) || !this.selectedDomainUuid) return;
    const localId = String(target?.dataset?.conditionId ?? "__new__");
    const document = recordIndex.get(RECORD_TYPES.DOMAIN, this.selectedDomainUuid);
    const domain = document ? decodeRecord(document) : null;
    if (!domain) return;
    if (localId !== "__new__" && !(domain.data.conditions ?? []).some((condition) => condition.localId === localId)) return;
    this.editingConditionId = localId;
    this.pendingConditionRemoval = null;
    this.render({ force: true });
  }

  static onCloseConditionEditor() {
    this.editingConditionId = null;
    this.render({ force: true });
  }

  static async onSubmitConditionEditor() {
    if (!isModuleManager(game.user) || this.isConditionBusy || !this.selectedDomainUuid || this.editingConditionId === null) return;
    const form = this.element?.querySelector?.("#dm-condition-form");
    const document = recordIndex.get(RECORD_TYPES.DOMAIN, this.selectedDomainUuid);
    const domain = document ? decodeRecord(document) : null;
    if (!form || !domain) return;
    const data = new FormData(form);
    const editing = this.editingConditionId !== "__new__";
    const condition = {
      name: String(data.get("name") ?? ""),
      description: String(data.get("description") ?? ""),
      durationTicks: String(data.get("durationTicks") ?? "").trim() || null,
      severity: String(data.get("severity") ?? "minor"),
      category: String(data.get("category") ?? "environmental"),
      active: data.has("active")
    };
    this.isConditionBusy = true;
    try {
      await executeCommandAuthoritatively({
        commandType: editing ? COMMAND_TYPES.CONDITION_UPDATE : COMMAND_TYPES.CONDITION_CREATE,
        payload: {
          domain: entityReference(domain),
          expectedModifiedTime: data.get("expectedModifiedTime"),
          ...(editing ? { localId: this.editingConditionId, patch: condition } : { condition })
        }
      });
      this.editingConditionId = null;
      ui.notifications.info(editing ? "Condição atualizada." : "Condição criada.");
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao salvar Condition", error);
      ui.notifications.error(error.message ?? "Falha ao salvar condição.");
    } finally {
      this.isConditionBusy = false;
    }
  }

  static async onToggleCondition(event, target) {
    if (!isModuleManager(game.user) || this.isConditionBusy || !this.selectedDomainUuid) return;
    const localId = String(target?.dataset?.conditionId ?? "");
    const document = recordIndex.get(RECORD_TYPES.DOMAIN, this.selectedDomainUuid);
    const domain = document ? decodeRecord(document) : null;
    if (!domain || !(domain.data.conditions ?? []).some((condition) => condition.localId === localId)) return;
    this.isConditionBusy = true;
    try {
      await executeCommandAuthoritatively({
        commandType: COMMAND_TYPES.CONDITION_TOGGLE,
        payload: { domain: entityReference(domain), expectedModifiedTime: domain.document?._stats?.modifiedTime ?? null, localId }
      });
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao alternar Condition", error);
      ui.notifications.error(error.message ?? "Falha ao alterar condição.");
    } finally {
      this.isConditionBusy = false;
    }
  }

  static onRemoveCondition(event, target) {
    if (!isModuleManager(game.user) || !this.selectedDomainUuid) return;
    const localId = String(target?.dataset?.conditionId ?? this.editingConditionId ?? "");
    const document = recordIndex.get(RECORD_TYPES.DOMAIN, this.selectedDomainUuid);
    const domain = document ? decodeRecord(document) : null;
    const condition = domain?.data.conditions?.find((entry) => entry.localId === localId);
    if (!domain || !condition) return;
    this.editingConditionId = null;
    this.pendingConditionRemoval = {
      ...condition,
      expectedModifiedTime: domain.document?._stats?.modifiedTime ?? null
    };
    this.render({ force: true });
  }

  static onCancelRemoveCondition() {
    this.pendingConditionRemoval = null;
    this.render({ force: true });
  }

  static async onConfirmRemoveCondition() {
    if (!isModuleManager(game.user) || this.isConditionBusy || !this.selectedDomainUuid || !this.pendingConditionRemoval) return;
    const pending = this.pendingConditionRemoval;
    const document = recordIndex.get(RECORD_TYPES.DOMAIN, this.selectedDomainUuid);
    const domain = document ? decodeRecord(document) : null;
    if (!domain) return;
    this.isConditionBusy = true;
    try {
      await executeCommandAuthoritatively({
        commandType: COMMAND_TYPES.CONDITION_REMOVE,
        payload: { domain: entityReference(domain), expectedModifiedTime: pending.expectedModifiedTime, localId: pending.localId }
      });
      this.pendingConditionRemoval = null;
      ui.notifications.info("Condição removida.");
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao remover Condition", error);
      ui.notifications.error(error.message ?? "Falha ao remover condição.");
    } finally {
      this.isConditionBusy = false;
    }
  }

  static onOpenHistoryEntry() {
    if (!isModuleManager(game.user) || !this.selectedDomainUuid || this.isHistoryBusy) return;
    const document = recordIndex.get(RECORD_TYPES.DOMAIN, this.selectedDomainUuid);
    if (!document) return;
    this.isHistoryEntryOpen = true;
    this.pendingHistoryRemoval = null;
    this.pendingHistoryClear = null;
    this.pendingDomainEvent = null;
    this.render({ force: true });
  }

  static onCloseHistoryEntry() {
    if (this.isHistoryBusy) return;
    this.isHistoryEntryOpen = false;
    this.render({ force: true });
  }

  static async onSubmitHistoryEntry() {
    if (!isModuleManager(game.user) || this.isHistoryBusy || !this.selectedDomainUuid || !this.isHistoryEntryOpen) return;
    const form = this.element?.querySelector?.("#dm-history-entry-form");
    if (!form) return;
    const data = new FormData(form);
    this.isHistoryBusy = true;
    try {
      await addHistoryEvent({
        domainUuid: this.selectedDomainUuid,
        title: String(data.get("title") ?? ""),
        category: String(data.get("category") ?? "story"),
        summary: String(data.get("summary") ?? ""),
        details: String(data.get("details") ?? ""),
        significance: String(data.get("significance") ?? "minor"),
        tick: String(data.get("tick") ?? "").trim() || null,
        visibility: String(data.get("visibility") ?? "all"),
        expectedModifiedTime: data.get("expectedModifiedTime")
      });
      this.isHistoryEntryOpen = false;
      ui.notifications.info("Registro adicionado ao histórico.");
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao adicionar registro histórico", error);
      ui.notifications.error(error.message ?? "Falha ao adicionar registro histórico.");
    } finally {
      this.isHistoryBusy = false;
    }
  }

  static onRemoveHistoryEntry(event, target) {
    if (!isModuleManager(game.user) || !this.selectedDomainUuid || this.isHistoryBusy) return;
    const localId = String(target?.dataset?.historyId ?? "");
    const document = recordIndex.get(RECORD_TYPES.DOMAIN, this.selectedDomainUuid);
    const domain = document ? decodeRecord(document) : null;
    const entry = domain?.data?.history?.find((candidate) => candidate.localId === localId);
    if (!domain || !entry) return;
    this.isHistoryEntryOpen = false;
    this.pendingHistoryClear = null;
    this.pendingDomainEvent = null;
    this.pendingHistoryRemoval = {
      ...entry,
      timestampLabel: formatHistoryTimestamp(entry.timestamp),
      expectedModifiedTime: domain.document?._stats?.modifiedTime ?? null
    };
    this.render({ force: true });
  }

  static onCancelRemoveHistoryEntry() {
    if (this.isHistoryBusy) return;
    this.pendingHistoryRemoval = null;
    this.render({ force: true });
  }

  static async onConfirmRemoveHistoryEntry() {
    if (!isModuleManager(game.user) || this.isHistoryBusy || !this.selectedDomainUuid || !this.pendingHistoryRemoval) return;
    const pending = this.pendingHistoryRemoval;
    this.isHistoryBusy = true;
    try {
      await removeHistoryEvent({
        domainUuid: this.selectedDomainUuid,
        localId: pending.localId,
        expectedModifiedTime: pending.expectedModifiedTime
      });
      this.pendingHistoryRemoval = null;
      ui.notifications.info("Registro removido do histórico.");
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao remover registro histórico", error);
      ui.notifications.error(error.message ?? "Falha ao remover registro histórico.");
    } finally {
      this.isHistoryBusy = false;
    }
  }

  static onOpenHistoryClear() {
    if (!isModuleManager(game.user) || !this.selectedDomainUuid || this.isHistoryBusy) return;
    const document = recordIndex.get(RECORD_TYPES.DOMAIN, this.selectedDomainUuid);
    const domain = document ? decodeRecord(document) : null;
    const count = domain?.data?.history?.length ?? 0;
    if (!domain || count === 0) return;
    this.isHistoryEntryOpen = false;
    this.pendingHistoryRemoval = null;
    this.pendingDomainEvent = null;
    this.pendingHistoryClear = {
      count,
      expectedModifiedTime: domain.document?._stats?.modifiedTime ?? null
    };
    this.render({ force: true });
  }

  static onCancelHistoryClear() {
    if (this.isHistoryBusy) return;
    this.pendingHistoryClear = null;
    this.render({ force: true });
  }

  static async onConfirmHistoryClear() {
    if (!isModuleManager(game.user) || this.isHistoryBusy || !this.selectedDomainUuid || !this.pendingHistoryClear) return;
    const pending = this.pendingHistoryClear;
    this.isHistoryBusy = true;
    try {
      await clearHistory({
        domainUuid: this.selectedDomainUuid,
        expectedModifiedTime: pending.expectedModifiedTime
      });
      this.pendingHistoryClear = null;
      ui.notifications.info(`${pending.count} registro(s) removido(s) do histórico.`);
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao limpar histórico", error);
      ui.notifications.error(error.message ?? "Falha ao limpar histórico.");
    } finally {
      this.isHistoryBusy = false;
    }
  }

  static onRollDomainEvent() {
    if (!isModuleManager(game.user) || !this.selectedDomainUuid || this.isHistoryBusy) return;
    const categoryField = this.element?.querySelector?.("[data-domain-event-category]");
    const category = String(categoryField?.value ?? "").trim() || null;
    try {
      const { domain, event } = rollEventForDomain({ domainUuid: this.selectedDomainUuid, category });
      this.isHistoryEntryOpen = false;
      this.pendingHistoryRemoval = null;
      this.pendingHistoryClear = null;
      this.pendingDomainEvent = {
        event: foundry.utils.deepClone(event),
        title: event.title,
        description: event.description,
        categoryLabel: EVENT_CATEGORY_LABELS[event.category] ?? titleCase(event.category),
        severityLabel: EVENT_SEVERITY_LABELS[event.severity] ?? titleCase(event.severity),
        tone: event.severity === "crisis" ? "critical" : event.severity === "boon" ? "nominal" : "neutral",
        expectedModifiedTime: domain.document?._stats?.modifiedTime ?? null,
        outcomes: (event.outcomes ?? []).map((outcome, index) => ({
          ...outcome,
          index,
          selected: index === 0,
          impactLabel: [
            outcome.stockBonus ? "ESTOQUE" : null,
            outcome.condition ? "CONDIÇÃO" : null
          ].filter(Boolean).join(" + ") || "CRÔNICA"
        }))
      };
      this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao sortear evento", error);
      ui.notifications.error(error.message ?? "Falha ao sortear evento de domínio.");
    }
  }

  static onCloseDomainEvent() {
    if (this.isHistoryBusy) return;
    this.pendingDomainEvent = null;
    this.render({ force: true });
  }

  static async onConfirmDomainEvent() {
    if (!isModuleManager(game.user) || this.isHistoryBusy || !this.selectedDomainUuid || !this.pendingDomainEvent) return;
    const form = this.element?.querySelector?.("#dm-domain-event-form");
    if (!form) return;
    const pending = this.pendingDomainEvent;
    const data = new FormData(form);
    this.isHistoryBusy = true;
    try {
      await executeApplyEventOutcome({
        domainUuid: this.selectedDomainUuid,
        event: pending.event,
        outcomeIndex: Number(data.get("outcomeIndex") ?? 0),
        postToChat: data.has("postToChat"),
        expectedModifiedTime: pending.expectedModifiedTime
      });
      this.pendingDomainEvent = null;
      ui.notifications.info("Evento aplicado e registrado no histórico.");
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao aplicar evento", error);
      ui.notifications.error(error.message ?? "Falha ao aplicar evento de domínio.");
    } finally {
      this.isHistoryBusy = false;
    }
  }

  static onSelectProject(event, target) {
    const uuid = String(target?.dataset?.projectUuid ?? "");
    if (!uuid) return;
      this.selectedProjectUuid = uuid;
      this.editingProjectCostId = null;
      this.pendingProjectCostRemoval = null;
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
    this.pendingProjectCostRemoval = null;
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
        if (!project || project.data.domainUuid !== domain.uuid) throw new Error("O projeto não pertence ao domínio selecionado.");
        payload.project = entityReference(project);
        payload.expectedModifiedTime = Number(data.get("expectedModifiedTime")) || null;
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
      ui.notifications.info(isCreate ? "Projeto registrado." : "Projeto atualizado.");
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao salvar Project", error);
      ui.notifications.error(error.message ?? "Falha ao salvar projeto.");
    } finally {
      this.isProjectBusy = false;
    }
  }

  static async onDeleteProject() {
    if (this.isProjectBusy || !this.selectedDomainUuid || !this.selectedProjectUuid) return;
    const domainDocument = recordIndex.get(RECORD_TYPES.DOMAIN, this.selectedDomainUuid);
    const projectDocument = recordIndex.get(RECORD_TYPES.PROJECT, this.selectedProjectUuid);
    const domain = domainDocument ? decodeRecord(domainDocument) : null;
    const project = projectDocument ? decodeRecord(projectDocument) : null;
    if (!canManageDomainProjects(domain) || !project || project.data.domainUuid !== domain.uuid) return;
    if (!globalThis.confirm(`Excluir permanentemente o projeto “${project.document.name}”?`)) return;
    this.isProjectBusy = true;
    try {
      await executeCommandAuthoritatively({
        commandType: COMMAND_TYPES.PROJECT_DELETE,
        payload: {
          domain: entityReference(domain),
          project: entityReference(project),
          expectedModifiedTime: project.document?._stats?.modifiedTime ?? null
        }
      });
      this.selectedProjectUuid = null;
      this.editingProjectUuid = null;
      ui.notifications.info("Projeto excluído.");
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao excluir Project", error);
      ui.notifications.error(error.message ?? "Falha ao excluir projeto.");
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
    this.pendingProjectCostRemoval = null;
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
          expectedModifiedTime: Number(data.get("expectedModifiedTime")) || null,
          cost: {
            localId: this.editingProjectCostId === "__new__" ? null : this.editingProjectCostId,
            resourceId,
            mode: String(data.get("mode") ?? "reserved"),
            amount
          }
        }
      });
      this.editingProjectCostId = null;
      ui.notifications.info("Plano de custos do projeto atualizado.");
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao salvar custo de Project", error);
      ui.notifications.error(error.message ?? "Falha ao salvar custo do projeto.");
    } finally {
      this.isProjectBusy = false;
    }
  }

  static onRemoveProjectCost(event, target) {
    if (this.isProjectBusy || !this.selectedDomainUuid || !this.selectedProjectUuid) return;
    const localId = String(target?.dataset?.costId ?? "");
    const domainDocument = recordIndex.get(RECORD_TYPES.DOMAIN, this.selectedDomainUuid);
    const projectDocument = recordIndex.get(RECORD_TYPES.PROJECT, this.selectedProjectUuid);
    const domain = domainDocument ? decodeRecord(domainDocument) : null;
    const project = projectDocument ? decodeRecord(projectDocument) : null;
    if (!localId || !canManageDomainProjects(domain) || !project || project.data.domainUuid !== domain.uuid) return;
    if (!(project.data.costs ?? []).some((cost) => cost.localId === localId)) return;
    this.pendingProjectCostRemoval = {
      localId,
      expectedModifiedTime: project.document?._stats?.modifiedTime ?? null
    };
    this.editingProjectCostId = null;
    this.render({ force: true });
  }

  static onCancelRemoveProjectCost() {
    this.pendingProjectCostRemoval = null;
    this.render({ force: true });
  }

  static async onConfirmRemoveProjectCost() {
    if (this.isProjectBusy || !this.selectedDomainUuid || !this.selectedProjectUuid || !this.pendingProjectCostRemoval) return;
    const { localId, expectedModifiedTime } = this.pendingProjectCostRemoval;
    const domainDocument = recordIndex.get(RECORD_TYPES.DOMAIN, this.selectedDomainUuid);
    const projectDocument = recordIndex.get(RECORD_TYPES.PROJECT, this.selectedProjectUuid);
    const domain = domainDocument ? decodeRecord(domainDocument) : null;
    const project = projectDocument ? decodeRecord(projectDocument) : null;
    if (!canManageDomainProjects(domain) || !project || project.data.domainUuid !== domain.uuid) return;
    this.isProjectBusy = true;
    try {
      await executeCommandAuthoritatively({
        commandType: COMMAND_TYPES.PROJECT_COST_REMOVE,
        payload: { domain: entityReference(domain), project: entityReference(project), expectedModifiedTime, localId }
      });
      if (this.editingProjectCostId === localId) this.editingProjectCostId = null;
      this.pendingProjectCostRemoval = null;
      ui.notifications.info("Custo removido do projeto.");
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao remover custo de projeto", error);
      ui.notifications.error(error.message ?? "Falha ao remover custo do projeto.");
    } finally {
      this.isProjectBusy = false;
    }
  }

  static onOpenSecurityEditor() {
    if (!isModuleManager(game.user) || !this.selectedDomainUuid) return;
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
    if (!isModuleManager(game.user) || this.isSecurityBusy || !this.selectedDomainUuid) return;
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
      ui.notifications.info(`Defesa de ${domain.document.name} atualizada.`);
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao configurar Defense", error);
      ui.notifications.error(error.message ?? "Falha ao configurar defesa.");
    } finally {
      this.isSecurityBusy = false;
    }
  }

  static onOpenEconomyConfig() {
    if (!isModuleManager(game.user) || !this.selectedDomainUuid) return;
    this.isEconomyConfigOpen = true;
    this.render({ force: true });
  }

  static onCloseEconomyConfig() {
    this.isEconomyConfigOpen = false;
    this.render({ force: true });
  }

  static async onSubmitEconomyConfig() {
    if (!isModuleManager(game.user) || this.isEconomyBusy || !this.selectedDomainUuid) return;
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
          expectedModifiedTime: data.get("expectedModifiedTime"),
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

  static onOpenEconomyFlowEditor(event, target) {
    if (!isModuleManager(game.user) || !this.selectedDomainUuid) return;
    const document = recordIndex.get(RECORD_TYPES.DOMAIN, this.selectedDomainUuid);
    const domain = document ? decodeRecord(document) : null;
    if (!domain?.data.management?.capabilities?.economy) return;
    if (!(getResourceCatalogSetting()?.resources?.length ?? 0)) {
      ui.notifications.warn("Cadastre pelo menos um recurso antes de criar um fluxo.");
      return;
    }
    const localId = String(target?.dataset?.flowId ?? "__new__").trim() || "__new__";
    if (localId !== "__new__" && !(domain.data.economy?.flows ?? []).some((flow) => flow.localId === localId)) {
      ui.notifications.warn("O fluxo selecionado não existe mais.");
      return;
    }
    this.editingEconomyFlowId = localId;
    this.pendingEconomyFlowRemoval = null;
    this.render({ force: true });
  }

  static onCloseEconomyFlowEditor() {
    this.editingEconomyFlowId = null;
    this.render({ force: true });
  }

  static async onSubmitEconomyFlowEditor() {
    if (!isModuleManager(game.user) || this.isEconomyBusy || !this.selectedDomainUuid) return;
    const form = this.element?.querySelector?.("#dm-economy-flow-form");
    const domainDocument = recordIndex.get(RECORD_TYPES.DOMAIN, this.selectedDomainUuid);
    if (!form || !domainDocument) return;
    const domain = decodeRecord(domainDocument);
    if (!domain.data.management?.capabilities?.economy) return;
    const data = new FormData(form);
    const name = String(data.get("name") ?? "").trim();
    const resourceId = String(data.get("resourceId") ?? "").trim();
    const resource = (getResourceCatalogSetting()?.resources ?? []).find((entry) => entry.id === resourceId);
    if (!name || !resource) {
      ui.notifications.warn(!name ? "Informe o nome do fluxo." : "Selecione um recurso válido.");
      return;
    }
    let amount;
    try {
      amount = parseMinorUnits(String(data.get("amount") ?? ""), resource.precision ?? 0);
    } catch (error) {
      ui.notifications.warn(`${resource.name ?? resourceId}: ${error.message}`);
      return;
    }

    this.isEconomyBusy = true;
    try {
      const result = await executeCommandAuthoritatively({
        commandType: COMMAND_TYPES.ECONOMY_FLOW_UPSERT,
        payload: {
          domain: entityReference(domain),
          expectedModifiedTime: data.get("expectedModifiedTime"),
          localId: String(data.get("localId") ?? "").trim() || null,
          name,
          resourceId,
          direction: String(data.get("direction") ?? "inflow"),
          amount,
          periodTicks: Number(data.get("periodTicks") ?? 1),
          category: String(data.get("category") ?? "manual"),
          source: String(data.get("source") ?? ""),
          active: data.get("active") === "on"
        }
      });
      this.editingEconomyFlowId = null;
      ui.notifications.info(`${result.flow?.name ?? name} salvo nos fluxos do domínio.`);
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao salvar fluxo econômico", error);
      ui.notifications.error(error.message ?? "Falha ao salvar fluxo econômico.");
    } finally {
      this.isEconomyBusy = false;
    }
  }

  static onRemoveEconomyFlow(event, target) {
    if (!isModuleManager(game.user) || !this.selectedDomainUuid) return;
    const domainDocument = recordIndex.get(RECORD_TYPES.DOMAIN, this.selectedDomainUuid);
    const domain = domainDocument ? decodeRecord(domainDocument) : null;
    const localId = String(target?.dataset?.flowId ?? "").trim();
    const flow = (domain?.data.economy?.flows ?? []).find((entry) => entry.localId === localId);
    if (!domain || !flow) return;
    const resource = (getResourceCatalogSetting()?.resources ?? []).find((entry) => entry.id === flow.resourceId);
    this.pendingEconomyFlowRemoval = {
      localId,
      name: flow.name,
      resourceName: resource?.name ?? flow.resourceId,
      expectedModifiedTime: domain.document?._stats?.modifiedTime ?? null
    };
    this.render({ force: true });
  }

  static onCancelRemoveEconomyFlow() {
    this.pendingEconomyFlowRemoval = null;
    this.render({ force: true });
  }

  static async onConfirmRemoveEconomyFlow() {
    const pending = this.pendingEconomyFlowRemoval;
    if (!isModuleManager(game.user) || this.isEconomyBusy || !pending || !this.selectedDomainUuid) return;
    const domainDocument = recordIndex.get(RECORD_TYPES.DOMAIN, this.selectedDomainUuid);
    if (!domainDocument) return;
    const domain = decodeRecord(domainDocument);
    this.isEconomyBusy = true;
    try {
      await executeCommandAuthoritatively({
        commandType: COMMAND_TYPES.ECONOMY_FLOW_REMOVE,
        payload: {
          domain: entityReference(domain),
          expectedModifiedTime: pending.expectedModifiedTime,
          localId: pending.localId
        }
      });
      this.pendingEconomyFlowRemoval = null;
      if (this.editingEconomyFlowId === pending.localId) this.editingEconomyFlowId = null;
      ui.notifications.info(`${pending.name} removido dos fluxos do domínio.`);
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao remover fluxo econômico", error);
      ui.notifications.error(error.message ?? "Falha ao remover fluxo econômico.");
    } finally {
      this.isEconomyBusy = false;
    }
  }

  static onOpenResourceCatalog() {
    if (!isModuleManager(game.user)) return;
    this.isResourceCatalogOpen = true;
    this.editingResourceId = null;
    this.pendingResourceRemoval = null;
    this.render({ force: true });
  }

  static onCloseResourceCatalog() {
    this.isResourceCatalogOpen = false;
    this.editingResourceId = null;
    this.pendingResourceRemoval = null;
    this.render({ force: true });
  }

  static onNewResourceDefinition() {
    if (!isModuleManager(game.user) || !this.isResourceCatalogOpen) return;
    this.editingResourceId = null;
    this.pendingResourceRemoval = null;
    this.render({ force: true });
  }

  static onEditResourceDefinition(event, target) {
    if (!isModuleManager(game.user) || !this.isResourceCatalogOpen) return;
    const resourceId = String(target?.dataset?.resourceId ?? "");
    if (!(getResourceCatalogSetting().resources ?? []).some((resource) => resource.id === resourceId)) return;
    this.editingResourceId = resourceId;
    this.pendingResourceRemoval = null;
    this.render({ force: true });
  }

  static async onSubmitResourceDefinition() {
    if (!isModuleManager(game.user) || this.isEconomyBusy || !this.isResourceCatalogOpen) return;
    const form = this.element?.querySelector?.("#dm-resource-catalog-form");
    if (!form) return;
    const data = new FormData(form);
    const name = String(data.get("name") ?? "").trim();
    if (!name) {
      ui.notifications.warn("Informe o nome do recurso.");
      return;
    }
    this.isEconomyBusy = true;
    try {
      const result = await executeCommandAuthoritatively({
        commandType: COMMAND_TYPES.RESOURCE_CATALOG_UPSERT,
        payload: {
          originalId: String(data.get("originalId") ?? "").trim() || null,
          expectedCatalogVersion: data.get("expectedCatalogVersion"),
          id: String(data.get("id") ?? ""),
          name,
          unit: String(data.get("unit") ?? ""),
          precision: Number(data.get("precision") ?? 0),
          allowNegative: data.get("allowNegative") === "on",
          category: String(data.get("category") ?? "general"),
          tags: String(data.get("tags") ?? "").split(",").map((tag) => tag.trim()).filter(Boolean)
        }
      });
      this.editingResourceId = result.resource?.id ?? null;
      ui.notifications.info(`${result.resource?.name ?? name} salvo no catálogo.`);
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao salvar Resource", error);
      ui.notifications.error(error.message ?? "Falha ao salvar recurso.");
    } finally {
      this.isEconomyBusy = false;
    }
  }

  static onRemoveResourceDefinition() {
    if (!isModuleManager(game.user) || !this.editingResourceId) return;
    const catalog = getResourceCatalogSetting();
    const resource = (catalog.resources ?? []).find((entry) => entry.id === this.editingResourceId);
    if (!resource) return;
    const dependencies = buildResourceDependencyReport(resource.id);
    this.pendingResourceRemoval = {
      ...resource,
      expectedCatalogVersion: Math.max(1, Number(catalog.version ?? 1)),
      blocked: dependencies.total > 0,
      dependencyCount: dependencies.total,
      dependencies: dependencies.entries
    };
    this.render({ force: true });
  }

  static onCancelRemoveResourceDefinition() {
    this.pendingResourceRemoval = null;
    this.render({ force: true });
  }

  static async onConfirmRemoveResourceDefinition() {
    const pending = this.pendingResourceRemoval;
    if (!isModuleManager(game.user) || this.isEconomyBusy || !pending || pending.blocked) return;
    this.isEconomyBusy = true;
    try {
      await executeCommandAuthoritatively({
        commandType: COMMAND_TYPES.RESOURCE_CATALOG_REMOVE,
        payload: {
          resourceId: pending.id,
          expectedCatalogVersion: pending.expectedCatalogVersion
        }
      });
      this.pendingResourceRemoval = null;
      this.editingResourceId = null;
      ui.notifications.info(`${pending.name} removido do catálogo.`);
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao remover Resource", error);
      ui.notifications.error(error.message ?? "Falha ao remover recurso.");
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
          expectedModifiedTime: Number(data.get("expectedModifiedTime")) || null,
          total: Number(data.get("total") ?? 0),
          countMode: String(data.get("countMode") ?? "direct"),
          morale: Number(data.get("morale") ?? 60)
        }
      });
      this.isPopulationConfigOpen = false;
      ui.notifications.info(`Política de população de ${domain.document.name} atualizada.`);
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao configurar Population", error);
      ui.notifications.error(error.message ?? "Falha ao configurar população.");
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
          expectedModifiedTime: Number(data.get("expectedModifiedTime")) || null,
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
      ui.notifications.info("Grupo populacional atualizado.");
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao salvar cohort", error);
      ui.notifications.error(error.message ?? "Falha ao salvar grupo populacional.");
    } finally {
      this.isPopulationBusy = false;
    }
  }

  static onRemovePopulationGroup(event, target) {
    if (this.isPopulationBusy || !this.selectedDomainUuid) return;
    const localId = String(target?.dataset?.groupId ?? "");
    if (!localId || localId === "__new__") return;
    const domainDocument = recordIndex.get(RECORD_TYPES.DOMAIN, this.selectedDomainUuid);
    if (!domainDocument) return;
    const domain = decodeRecord(domainDocument);
    const group = (domain.data.population?.groups ?? []).find((entry) => entry.localId === localId);
    if (!group) return;
    const assigned = (domain.data.population?.workforce?.allocations ?? [])
      .filter((entry) => entry.groupLocalId === localId)
      .reduce((sum, entry) => sum + Number(entry.count ?? 0), 0);
    if (assigned > 0) {
      ui.notifications.warn(`Remova primeiro as alocações de ${assigned} trabalhador(es) deste grupo.`);
      return;
    }
    this.pendingPopulationGroupRemoval = {
      localId,
      name: group.name,
      count: Number(group.count ?? 0),
      workforceEligible: Number(group.workforceEligible ?? 0),
      expectedModifiedTime: domain.document?._stats?.modifiedTime ?? null
    };
    this.render({ force: true });
  }

  static onCancelRemovePopulationGroup() {
    this.pendingPopulationGroupRemoval = null;
    this.render({ force: true });
  }

  static async onConfirmRemovePopulationGroup() {
    if (this.isPopulationBusy || !this.selectedDomainUuid || !this.pendingPopulationGroupRemoval) return;
    const pending = this.pendingPopulationGroupRemoval;
    const domainDocument = recordIndex.get(RECORD_TYPES.DOMAIN, this.selectedDomainUuid);
    if (!domainDocument) return;
    const domain = decodeRecord(domainDocument);
    this.isPopulationBusy = true;
    try {
      await executeCommandAuthoritatively({
        commandType: COMMAND_TYPES.POPULATION_GROUP_REMOVE,
        payload: { domain: entityReference(domain), expectedModifiedTime: pending.expectedModifiedTime, localId: pending.localId }
      });
      this.editingPopulationGroupId = null;
      this.pendingPopulationGroupRemoval = null;
      ui.notifications.info("Grupo populacional removido.");
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao remover grupo populacional", error);
      ui.notifications.error(error.message ?? "Falha ao remover grupo populacional.");
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
        payload: {
          domain: entityReference(domain),
          expectedModifiedTime: Number(new FormData(form).get("expectedModifiedTime")) || null,
          allocations
        }
      });
      this.isWorkforceOpen = false;
      ui.notifications.info("Distribuição da força de trabalho sincronizada.");
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao alocar workforce", error);
      ui.notifications.error(error.message ?? "Falha ao distribuir força de trabalho.");
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
    const personDocument = this.editingPersonUuid
      ? recordIndex.get(RECORD_TYPES.PERSON, this.editingPersonUuid)
      : null;
    if (this.editingPersonUuid && !personDocument) {
      ui.notifications.warn("A pessoa selecionada não está mais disponível.");
      return;
    }
    const person = personDocument ? decodeRecord(personDocument) : null;
    const updatePayload = person ? {
      person: entityReference(person),
      expectedModifiedTime: Number(data.get("expectedModifiedTime")) || null,
      ...common
    } : null;
    if (person && ["dead", "retired"].includes(common.status) && common.status !== person.data.status) {
      const isDeath = common.status === "dead";
      this.pendingTerminalTransition = {
        kind: "person",
        entityTypeLabel: "PESSOA",
        commandType: COMMAND_TYPES.PERSON_UPDATE,
        payload: updatePayload,
        entityUuid: person.uuid,
        entityName: common.name || person.document.name,
        fromLabel: stateLabel(person.data.status),
        toLabel: stateLabel(common.status),
        title: isDeath
          ? `Registrar o falecimento de ${common.name || person.document.name}?`
          : `Aposentar ${common.name || person.document.name}?`,
        description: "O cadastro e o histórico serão preservados, mas esta pessoa deixará de ocupar uma função operacional.",
        confirmLabel: isDeath ? "CONFIRMAR FALECIMENTO" : "CONFIRMAR APOSENTADORIA",
        successMessage: `${common.name || person.document.name} passou ao estado ${stateLabel(common.status).toLowerCase()}.`,
        effects: [
          { title: "Vínculo com a unidade encerrado", detail: "A pessoa será removida da unidade atual para não permanecer em escalas ou designações ativas." },
          { title: "Registro preservado", detail: "Identidade, notas, retrato, localização e histórico continuam disponíveis para consulta." }
        ]
      };
      await this.render({ force: true });
      return;
    }
    this.isPeopleBusy = true;
    try {
      if (person) {
        await executeCommandAuthoritatively({
          commandType: COMMAND_TYPES.PERSON_UPDATE,
          payload: updatePayload
        });
        this.selectedPersonUuid = person.uuid;
      } else {
        const result = await executeCommandAuthoritatively({
          commandType: COMMAND_TYPES.PERSON_CREATE,
          payload: { domain: entityReference(domain), ...common }
        });
        this.selectedPersonUuid = result?.uuid ?? this.selectedPersonUuid;
      }
      this.isPersonEditorOpen = false;
      this.editingPersonUuid = null;
      ui.notifications.info("Cadastro da pessoa atualizado.");
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao salvar Person", error);
      ui.notifications.error(error.message ?? "Falha ao salvar pessoa.");
    } finally {
      this.isPeopleBusy = false;
    }
  }

  static async onDeletePerson() {
    if (this.isPeopleBusy || !this.selectedDomainUuid || !this.selectedPersonUuid) return;
    if (this.selectedPersonUuid.startsWith("legacy:")) {
      ui.notifications.warn("Esta pessoa legada precisa ser migrada antes de ser excluída.");
      return;
    }
    const personDocument = recordIndex.get(RECORD_TYPES.PERSON, this.selectedPersonUuid);
    const person = personDocument ? decodeRecord(personDocument) : null;
    if (!person || !globalThis.confirm(`Excluir permanentemente “${person.document.name}”?`)) return;
    this.isPeopleBusy = true;
    try {
      await executeCommandAuthoritatively({
        commandType: COMMAND_TYPES.PERSON_DELETE,
        payload: {
          person: entityReference(person),
          expectedModifiedTime: person.document?._stats?.modifiedTime ?? null
        }
      });
      this.selectedPersonUuid = null;
      this.editingPersonUuid = null;
      ui.notifications.info("Pessoa excluída.");
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao excluir Person", error);
      ui.notifications.error(error.message ?? "Falha ao excluir pessoa.");
    } finally {
      this.isPeopleBusy = false;
    }
  }

  static onCloseTerminalTransition() {
    if (this.isTerminalTransitionBusy) return;
    this.pendingTerminalTransition = null;
    this.render({ force: true });
  }

  static async onConfirmTerminalTransition() {
    if (this.isTerminalTransitionBusy || !this.pendingTerminalTransition) return;
    const pending = this.pendingTerminalTransition;
    this.isTerminalTransitionBusy = true;
    try {
      await executeCommandAuthoritatively({
        commandType: pending.commandType,
        payload: { ...pending.payload, confirmTerminalTransition: true }
      });
      if (pending.kind === "person") {
        this.selectedPersonUuid = pending.entityUuid;
        this.isPersonEditorOpen = false;
        this.editingPersonUuid = null;
      } else if (pending.kind === "squad") {
        this.editingSquadUuid = null;
      } else if (pending.kind === "structure") {
        this.editingStructureUuid = null;
      }
      this.pendingTerminalTransition = null;
      ui.notifications.info(pending.successMessage ?? `${pending.entityName} atualizado.`);
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao confirmar transição terminal", error);
      ui.notifications.error(error.message ?? "Falha ao confirmar a alteração de estado.");
    } finally {
      this.isTerminalTransitionBusy = false;
      if (this.pendingTerminalTransition) await this.render({ force: true });
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

  static onOpenDomainMedia() {
    if (this.isDomainBusy || !isModuleManager(game.user) || !this.selectedDomainUuid) return;
    this.isDomainMediaOpen = true;
    this.render({ force: true });
  }

  static onCloseDomainMedia() {
    this.isDomainMediaOpen = false;
    this.render({ force: true });
  }

  static async onBrowseImageField(event, target) {
    const fieldName = String(target?.dataset?.field ?? "").trim();
    if (!fieldName) return;
    const input = this.element?.querySelector?.(`[name="${fieldName}"]`);
    if (!input) return;
    const Picker = globalThis.foundry?.applications?.apps?.FilePicker ?? globalThis.FilePicker;
    if (!Picker) {
      ui.notifications.warn("O seletor de arquivos do Foundry não está disponível.");
      return;
    }
    const callback = (path) => {
      const nextPath = String(path ?? "");
      input.value = nextPath;
      const EventCtor = input.ownerDocument?.defaultView?.Event ?? globalThis.Event;
      if (EventCtor) input.dispatchEvent?.(new EventCtor("input", { bubbles: true }));
      let preview = this.element?.querySelector?.(`[data-preview-for="${fieldName}"]`);
      const container = this.element?.querySelector?.(`[data-preview-container-for="${fieldName}"]`);
      if (!preview && container && nextPath) {
        preview = input.ownerDocument.createElement("img");
        preview.dataset.previewFor = fieldName;
        preview.alt = "Pré-visualização";
        container.replaceChildren(preview);
      }
      if (preview) {
        preview.src = nextPath;
        preview.hidden = !nextPath;
      }
    };
    try {
      const picker = new Picker({ type: "image", current: input.value || "", callback });
      let result;
      try {
        result = picker.render?.({ force: true });
      } catch {
        result = picker.render?.(true);
      }
      if (result && typeof result.then === "function") await result;
    } catch (error) {
      console.error("Domain Manager | Falha ao abrir FilePicker", error);
      ui.notifications.error("Não foi possível abrir o seletor de imagens.");
    }
  }

  static async onSubmitDomainMedia() {
    if (this.isDomainBusy || !isModuleManager(game.user) || !this.selectedDomainUuid) return;
    const form = this.element?.querySelector?.("#dm-domain-media-form");
    if (!form) return;
    const data = new FormData(form);
    const fields = [
      ["visuals.bannerImg", "bannerImg"],
      ["visuals.crestImg", "crestImg"],
      ["visuals.image", "image"],
      ["visuals.imageFit", "imageFit"],
      ["visuals.imagePosition", "imagePosition"],
      ["visuals.imageHeight", "imageHeight"],
      ["visuals.imagePosX", "imagePosX"],
      ["visuals.imagePosY", "imagePosY"],
      ["visuals.imageZoom", "imageZoom"],
      ["visuals.themeColorHex", "themeColorHex"]
    ];
    this.isDomainBusy = true;
    try {
      const updates = fields
        .filter(([, formName]) => data.has(formName))
        .map(([fieldPath, formName]) => [fieldPath, data.get(formName)]);
      const domainDocument = recordIndex.get(RECORD_TYPES.DOMAIN, this.selectedDomainUuid);
      if (!domainDocument) throw new Error("Domínio selecionado não está mais disponível.");
      const domain = decodeRecord(domainDocument);
      await executeCommandAuthoritatively({
        commandType: COMMAND_TYPES.DOMAIN_MEDIA_UPDATE,
        payload: { domain: entityReference(domain), fields: updates }
      });
      this.isDomainMediaOpen = false;
      ui.notifications.info("Aparência do domínio atualizada.");
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao atualizar aparência do domínio", error);
      ui.notifications.error(error.message ?? "Falha ao atualizar aparência do domínio.");
    } finally {
      this.isDomainBusy = false;
    }
  }

  static onOpenCreateDomain() {
    if (this.isDomainBusy || !isModuleManager(game.user)) return;
    this.editingDomainUuid = null;
    this.isCreateDomainOpen = true;
    this.render({ force: true });
  }

  static onOpenEditDomain(event, target) {
    if (this.isDomainBusy || !isModuleManager(game.user)) return;
    const uuid = String(target?.dataset?.uuid ?? this.selectedDomainUuid ?? "").trim();
    if (!uuid || !recordIndex.get(RECORD_TYPES.DOMAIN, uuid)) return;
    this.editingDomainUuid = uuid;
    this.isCreateDomainOpen = true;
    this.render({ force: true });
  }

  static onCancelCreateDomain() {
    this.isCreateDomainOpen = false;
    this.editingDomainUuid = null;
    this.render({ force: true });
  }

  static async onSubmitCreateDomain() {
    if (this.isDomainBusy || !isModuleManager(game.user)) return;
    const form = this.element?.querySelector?.("#dm-create-domain-form");
    if (!form) return;
    const data = new FormData(form);
    const name = String(data.get("name") ?? "").trim();
    if (!name) {
      ui.notifications.warn("Informe um nome para o domínio.");
      return;
    }

    const checkedCapabilities = new Set(data.getAll("capabilities").map(String));
    const common = {
      name,
      description: String(data.get("description") ?? ""),
      category: String(data.get("category") ?? "Base"),
      nature: String(data.get("nature") ?? "physical"),
      state: String(data.get("state") ?? "active"),
      tags: String(data.get("tags") ?? "").split(",").map((tag) => tag.trim()).filter(Boolean),
      controllerIds: data.getAll("controllerIds").map(String),
      locatedInUuid: String(data.get("locatedInUuid") ?? "").trim() || null,
      administrativeParentUuid: String(data.get("administrativeParentUuid") ?? "").trim() || null,
      managementPreset: String(data.get("preset") ?? "base"),
      capabilities: Object.fromEntries(CAPABILITY_KEYS.map((key) => [key, checkedCapabilities.has(key)]))
    };

    this.isDomainBusy = true;
    try {
      const editingDocument = this.editingDomainUuid
        ? recordIndex.get(RECORD_TYPES.DOMAIN, this.editingDomainUuid)
        : null;
      const result = await executeCommandAuthoritatively({
        commandType: editingDocument ? COMMAND_TYPES.DOMAIN_UPDATE : COMMAND_TYPES.DOMAIN_CREATE,
        payload: editingDocument ? {
          domain: entityReference(decodeRecord(editingDocument)),
          expectedModifiedTime: Number(data.get("expectedModifiedTime")) || null,
          ...common
        } : common
      });
      if (!editingDocument) {
        this.resetDomainScopedState();
        this.selectedDomainUuid = result?.uuid ?? null;
        this.activeView = "overview";
      }
      this.isCreateDomainOpen = false;
      this.editingDomainUuid = null;
      ui.notifications.info(editingDocument ? `Domínio ${name} atualizado.` : `Domínio ${name} criado.`);
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao salvar domínio", error);
      ui.notifications.error(error.message ?? "Falha ao salvar domínio.");
    } finally {
      this.isDomainBusy = false;
    }
  }

  static onOpenDeleteDomain(event, target) {
    if (this.isDomainBusy || !isModuleManager(game.user)) return;
    const uuid = String(target?.dataset?.uuid ?? this.selectedDomainUuid ?? "").trim();
    if (!uuid || !recordIndex.get(RECORD_TYPES.DOMAIN, uuid)) return;
    if (uuid !== this.selectedDomainUuid) {
      this.resetDomainScopedState();
      this.selectedDomainUuid = uuid;
    }
    this.isDomainDeleteOpen = true;
    this.render({ force: true });
  }

  static onCancelDeleteDomain() {
    if (this.isDomainBusy) return;
    this.isDomainDeleteOpen = false;
    this.render({ force: true });
  }

  static async onSubmitDeleteDomain() {
    if (this.isDomainBusy || !isModuleManager(game.user) || !this.isDomainDeleteOpen || !this.selectedDomainUuid) return;
    const form = this.element?.querySelector?.("#dm-domain-delete-form");
    const domainDocument = recordIndex.get(RECORD_TYPES.DOMAIN, this.selectedDomainUuid);
    if (!form || !domainDocument) return;
    const domain = decodeRecord(domainDocument);
    const data = new FormData(form);
    const confirmation = String(data.get("confirmation") ?? "").trim();
    if (confirmation !== domain.data.entityId) {
      ui.notifications.warn(`Digite ${domain.data.entityId} exatamente para confirmar.`);
      return;
    }

    this.isDomainBusy = true;
    try {
      const result = await executeCommandAuthoritatively({
        commandType: COMMAND_TYPES.DOMAIN_DELETE,
        payload: {
          domain: entityReference(domain),
          expectedModifiedTime: Number(data.get("expectedModifiedTime")) || null,
          confirmation,
          cascade: true
        }
      });
      this.resetDomainScopedState();
      const nextDomain = listVisibleRecords(RECORD_TYPES.DOMAIN)[0] ?? null;
      this.selectedDomainUuid = nextDomain?.uuid ?? null;
      this.activeView = "domains";
      ui.notifications.info(`Domínio ${result.name} excluído permanentemente.`);
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao excluir domínio", error);
      ui.notifications.error(error.message ?? "Falha ao excluir domínio.");
    } finally {
      this.isDomainBusy = false;
    }
  }

  static onOpenCreateSquad() {
    if (!isModuleManager(game.user) || !this.selectedDomainUuid) return;
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
    if (!isModuleManager(game.user) || this.isSquadBusy) return;
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
      ui.notifications.info(`Unidade ${result?.name ?? data.get("name")} criada.`);
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao criar Squad", error);
      ui.notifications.error(error.message ?? "Falha ao criar unidade.");
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
    if (!isModuleManager(game.user) && !controllers.includes(game.user.id)) {
      ui.notifications.warn("Você não controla esta unidade.");
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
    const administrationPayload = {
      squad: entityReference(squad),
      expectedModifiedTime: Number(data.get("expectedModifiedTime")) || null,
      name: data.get("name"),
      description: data.get("description"),
      controllerIds: data.getAll("controllerIds"),
      capacity: data.get("capacity"),
      strength: data.get("strength"),
      morale: data.get("morale"),
      condition: data.get("condition"),
      status: data.get("status")
    };
    const operationalPayload = {
      squad: entityReference(squad),
      expectedModifiedTime: Number(data.get("expectedModifiedTime")) || null,
      patch: {
        description: data.get("description"),
        morale: data.get("morale"),
        condition: data.get("condition"),
        status: data.get("status")
      }
    };
    const isDisbanding = isModuleManager(game.user)
      && administrationPayload.status === "disbanded"
      && squad.data.status !== "disbanded";
    if (isDisbanding && squad.data.currentMission) {
      ui.notifications.warn("Libere a unidade da missão atual antes de dissolvê-la.");
      return;
    }
    if (isDisbanding) {
      this.pendingTerminalTransition = {
        kind: "squad",
        entityTypeLabel: "UNIDADE",
        commandType: COMMAND_TYPES.SQUAD_ADMIN_UPDATE,
        payload: administrationPayload,
        entityUuid: squad.uuid,
        entityName: squad.document.name,
        fromLabel: stateLabel(squad.data.status),
        toLabel: stateLabel("disbanded"),
        title: `Dissolver ${squad.document.name}?`,
        description: "A unidade deixará o serviço ativo e não poderá ser preparada para novas missões.",
        confirmLabel: "CONFIRMAR DISSOLUÇÃO",
        successMessage: `Unidade ${squad.document.name} dissolvida.`,
        effects: [
          { title: "Operação encerrada", detail: "A unidade deixa de ser elegível para preparação, lançamento e emprego operacional." },
          { title: "Dados preservados", detail: "Composição, pessoas vinculadas, controladores e inventário permanecem registrados para consulta ou redistribuição." }
        ]
      };
      await this.render({ force: true });
      return;
    }
    this.isSquadBusy = true;
    try {
      if (isModuleManager(game.user)) {
        await updateSquadAdministrationAction(administrationPayload);
      } else {
        await patchSquadAction(operationalPayload);
      }
      ui.notifications.info(`Unidade ${squad.document.name} atualizada.`);
      this.editingSquadUuid = null;
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao atualizar Squad", error);
      ui.notifications.error(error.message ?? "Falha ao atualizar unidade.");
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
    if (!isModuleManager(game.user) && !controllers.includes(game.user.id)) {
      ui.notifications.warn("Você não controla esta unidade.");
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
    const direction = isModuleManager(game.user) ? String(data.get("direction") ?? "domain-to-squad") : "squad-to-domain";
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
    const squadRevision = Number(data.get("expectedSquadModifiedTime")) || null;
    const domainRevision = Number(data.get("expectedDomainModifiedTime")) || null;
    this.isSquadBusy = true;
    try {
      await executeCommandAuthoritatively({
        commandType: COMMAND_TYPES.TRANSFER_RESOURCES,
        payload: {
          from,
          to,
          resourceId,
          amount,
          expectedFromModifiedTime: direction === "domain-to-squad" ? domainRevision : squadRevision,
          expectedToModifiedTime: direction === "domain-to-squad" ? squadRevision : domainRevision
        }
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
    if (!isModuleManager(game.user) || !this.selectedDomainUuid) return;
    this.isCreateMissionOpen = true;
    this.editingMissionUuid = null;
    this.preparingMissionUuid = null;
    this.preparingSquadUuid = null;
    this.pendingMissionRelease = null;
    this.pendingMissionLaunch = null;
    this.pendingMissionCancel = null;
    this.resolvingMissionUuid = null;
    this.render({ force: true });
  }

  static onOpenEditMission(event, target) {
    if (!isModuleManager(game.user)) return;
    const missionUuid = target?.dataset?.missionUuid;
    const document = missionUuid ? recordIndex.get(RECORD_TYPES.MISSION, missionUuid) : null;
    if (!document) return;
    const mission = decodeRecord(document);
    if (!["planned", "available"].includes(mission.data.status)) {
      ui.notifications.warn("Somente missões planejadas ou disponíveis podem ter o planejamento editado.");
      return;
    }
    this.isCreateMissionOpen = true;
    this.editingMissionUuid = missionUuid;
    this.preparingMissionUuid = null;
    this.preparingSquadUuid = null;
    this.pendingMissionRelease = null;
    this.pendingMissionLaunch = null;
    this.pendingMissionCancel = null;
    this.resolvingMissionUuid = null;
    this.render({ force: true });
  }

  static onCancelCreateMission() {
    this.isCreateMissionOpen = false;
    this.editingMissionUuid = null;
    this.render({ force: true });
  }

  static async onSubmitCreateMission() {
    if (!isModuleManager(game.user) || this.isMissionBusy || !this.selectedDomainUuid) return;
    const form = this.element?.querySelector?.("#dm-create-mission-form");
    const domainDocument = recordIndex.get(RECORD_TYPES.DOMAIN, this.selectedDomainUuid);
    if (!form || !domainDocument) return;
    const domain = decodeRecord(domainDocument);
    const missionDocument = this.editingMissionUuid
      ? recordIndex.get(RECORD_TYPES.MISSION, this.editingMissionUuid)
      : null;
    const mission = missionDocument ? decodeRecord(missionDocument) : null;
    const data = new FormData(form);
    const name = String(data.get("name") ?? "").trim();
    if (!name) {
      ui.notifications.warn("Informe um nome para a missão.");
      return;
    }
    const objectiveTitles = String(data.get("objectives") ?? "")
      .split(/\r?\n/)
      .map((title) => title.trim())
      .filter(Boolean);
    const objectives = objectiveTitles.map((title, index) => ({
      ...mission?.data.objectives?.[index],
      title,
      status: mission?.data.objectives?.[index]?.status ?? "pending"
    }));
    this.isMissionBusy = true;
    try {
      if (mission) {
        const primaryDocument = recordIndex.get(RECORD_TYPES.DOMAIN, mission.data.primaryDomainUuid);
        const relatedDocuments = (mission.data.relatedDomainUuids ?? [])
          .map((uuid) => recordIndex.get(RECORD_TYPES.DOMAIN, uuid))
          .filter(Boolean);
        if (!primaryDocument) throw new Error("O domínio principal da missão não está disponível.");
        await executeCommandAuthoritatively({
          commandType: COMMAND_TYPES.MISSION_UPDATE,
          payload: {
            mission: entityReference(mission),
            expectedModifiedTime: Number(data.get("expectedModifiedTime")) || null,
            expectedStatus: mission.data.status,
            name,
            primaryDomain: entityReference(decodeRecord(primaryDocument)),
            relatedDomains: relatedDocuments.map((document) => entityReference(decodeRecord(document))),
            audienceUserIds: data.getAll("audienceUserIds"),
            briefing: String(data.get("briefing") ?? ""),
            outcomeSummary: String(data.get("outcomeSummary") ?? ""),
            objectives
          }
        });
      } else {
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
      }
      this.isCreateMissionOpen = false;
      this.editingMissionUuid = null;
      ui.notifications.info(`Missão ${name} ${mission ? "atualizada" : "registrada"}.`);
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao criar Mission", error);
      ui.notifications.error(error.message ?? "Falha ao criar missão.");
    } finally {
      this.isMissionBusy = false;
    }
  }

  static async onPublishMission(event, target) {
    if (!isModuleManager(game.user) || this.isMissionBusy) return;
    const missionUuid = target?.dataset?.missionUuid;
    const document = missionUuid ? recordIndex.get(RECORD_TYPES.MISSION, missionUuid) : null;
    if (!document) return;
    const mission = decodeRecord(document);
    this.isMissionBusy = true;
    try {
      await executeCommandAuthoritatively({
        commandType: COMMAND_TYPES.MISSION_PUBLISH,
        payload: {
          mission: entityReference(mission),
          expectedModifiedTime: mission.document?._stats?.modifiedTime ?? null
        }
      });
      ui.notifications.info(`${mission.document.name} publicada e disponível para preparação.`);
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao publicar Mission", error);
      ui.notifications.error(error.message ?? "Falha ao publicar missão.");
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
    if (!isModuleManager(game.user) && (!mission.data.audienceUserIds?.includes(game.user.id) || !controllers.includes(game.user.id))) {
      ui.notifications.warn("Você não possui autorização para preparar esta unidade nesta missão.");
      return;
    }
    this.preparingMissionUuid = missionUuid;
    this.preparingSquadUuid = squadUuid;
    this.isCreateMissionOpen = false;
    this.editingMissionUuid = null;
    this.pendingMissionRelease = null;
    this.pendingMissionLaunch = null;
    this.pendingMissionCancel = null;
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
          expectedMissionModifiedTime: Number(data.get("expectedMissionModifiedTime")) || null,
          expectedSquadModifiedTime: Number(data.get("expectedSquadModifiedTime")) || null,
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

  static onReleaseMissionAssignment(event, target) {
    if (this.isMissionBusy) return;
    const missionUuid = target?.dataset?.missionUuid;
    const squadUuid = target?.dataset?.squadUuid;
    const missionDocument = missionUuid ? recordIndex.get(RECORD_TYPES.MISSION, missionUuid) : null;
    const squadDocument = squadUuid ? recordIndex.get(RECORD_TYPES.SQUAD, squadUuid) : null;
    if (!missionDocument || !squadDocument) return;
    const mission = decodeRecord(missionDocument);
    const squad = decodeRecord(squadDocument);
    const assignment = (mission.data.assignments ?? []).find((entry) => entry.squad?.uuid === squad.uuid || entry.squad?.entityId === squad.data.entityId);
    if (!assignment) return;
    this.pendingMissionRelease = {
      missionUuid,
      squadUuid,
      missionName: mission.document.name,
      squadName: squad.document.name,
      committedStrength: assignment.committedStrength,
      expectedMissionModifiedTime: mission.document?._stats?.modifiedTime ?? null,
      expectedSquadModifiedTime: squad.document?._stats?.modifiedTime ?? null
    };
    this.render({ force: true });
  }

  static onCancelReleaseMissionAssignment() {
    this.pendingMissionRelease = null;
    this.render({ force: true });
  }

  static async onConfirmReleaseMissionAssignment() {
    if (this.isMissionBusy || !this.pendingMissionRelease) return;
    const pending = this.pendingMissionRelease;
    const missionDocument = recordIndex.get(RECORD_TYPES.MISSION, pending.missionUuid);
    const squadDocument = recordIndex.get(RECORD_TYPES.SQUAD, pending.squadUuid);
    if (!missionDocument || !squadDocument) return;
    const mission = decodeRecord(missionDocument);
    const squad = decodeRecord(squadDocument);
    this.isMissionBusy = true;
    try {
      await executeCommandAuthoritatively({
        commandType: COMMAND_TYPES.MISSION_RELEASE,
        payload: {
          mission: entityReference(mission),
          squad: entityReference(squad),
          expectedMissionModifiedTime: pending.expectedMissionModifiedTime,
          expectedSquadModifiedTime: pending.expectedSquadModifiedTime
        }
      });
      this.pendingMissionRelease = null;
      ui.notifications.info(`${squad.document.name} liberado de ${mission.document.name}.`);
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao liberar unidade", error);
      ui.notifications.error(error.message ?? "Falha ao liberar unidade.");
    } finally {
      this.isMissionBusy = false;
    }
  }

  static onLaunchMission(event, target) {
    if (!isModuleManager(game.user) || this.isMissionBusy) return;
    const missionUuid = target?.dataset?.missionUuid;
    const missionDocument = missionUuid ? recordIndex.get(RECORD_TYPES.MISSION, missionUuid) : null;
    if (!missionDocument) return;
    const mission = decodeRecord(missionDocument);
    const resources = new Map();
    for (const assignment of mission.data.assignments ?? []) {
      for (const entry of assignment.resources ?? []) resources.set(entry.resourceId, (resources.get(entry.resourceId) ?? 0) + entry.amount);
    }
    const catalog = getResourceCatalogSetting();
    this.pendingMissionLaunch = {
      missionUuid,
      missionName: mission.document.name,
      expectedModifiedTime: mission.document?._stats?.modifiedTime ?? null,
      assignmentCount: mission.data.assignments?.length ?? 0,
      committedStrength: (mission.data.assignments ?? []).reduce((sum, entry) => sum + Number(entry.committedStrength ?? 0), 0),
      squads: (mission.data.assignments ?? []).map((entry) => entry.squad),
      resources: [...resources].map(([resourceId, amount]) => {
        const definition = catalog.resources?.find((entry) => entry.id === resourceId);
        return {
          resourceId,
          amount,
          amountDisplay: definition ? formatMinorUnits(amount, definition.precision) : String(amount),
          name: definition?.name ?? resourceId,
          unit: definition?.unit ?? ""
        };
      })
    };
    this.render({ force: true });
  }

  static onCancelLaunchMission() {
    this.pendingMissionLaunch = null;
    this.render({ force: true });
  }

  static async onConfirmLaunchMission() {
    if (!isModuleManager(game.user) || this.isMissionBusy || !this.pendingMissionLaunch) return;
    const pending = this.pendingMissionLaunch;
    const missionDocument = recordIndex.get(RECORD_TYPES.MISSION, pending.missionUuid);
    if (!missionDocument) return;
    const mission = decodeRecord(missionDocument);
    this.isMissionBusy = true;
    try {
      await executeCommandAuthoritatively({
        commandType: COMMAND_TYPES.MISSION_LAUNCH,
        payload: {
          mission: entityReference(mission),
          expectedModifiedTime: pending.expectedModifiedTime,
          squads: pending.squads
        }
      });
      this.pendingMissionLaunch = null;
      ui.notifications.info(`${mission.document.name} lançada. Unidades em campo.`);
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao lançar Mission", error);
      ui.notifications.error(error.message ?? "Falha ao iniciar missão.");
    } finally {
      this.isMissionBusy = false;
    }
  }

  static onOpenMissionCancel(event, target) {
    if (!isModuleManager(game.user) || this.isMissionBusy) return;
    const missionUuid = target?.dataset?.missionUuid;
    const missionDocument = missionUuid ? recordIndex.get(RECORD_TYPES.MISSION, missionUuid) : null;
    if (!missionDocument) return;
    const mission = decodeRecord(missionDocument);
    if (!["planned", "available", "active"].includes(mission.data.status)) {
      ui.notifications.warn("Esta missão já está encerrada e não pode ser cancelada.");
      return;
    }

    const squads = (mission.data.assignments ?? []).map((assignment) => {
      const squadDocument = assignment.squad?.entityId
        ? recordIndex.getByEntityId(assignment.squad.entityId)
        : assignment.squad?.uuid
          ? recordIndex.get(RECORD_TYPES.SQUAD, assignment.squad.uuid)
          : null;
      const squad = squadDocument ? decodeRecord(squadDocument) : null;
      return {
        squad: assignment.squad,
        expectedModifiedTime: squadDocument?._stats?.modifiedTime ?? null,
        name: squadDocument?.name ?? assignment.squad?.entityId ?? "Unidade indisponível",
        statusLabel: stateLabel(squad?.data.status ?? "unknown"),
        assignmentStateLabel: stateLabel(assignment.state)
      };
    });

    this.pendingMissionCancel = {
      missionUuid,
      missionName: mission.document.name,
      statusLabel: stateLabel(mission.data.status),
      expectedModifiedTime: mission.document?._stats?.modifiedTime ?? null,
      assignmentCount: squads.length,
      isActive: mission.data.status === "active",
      squads
    };
    this.isCreateMissionOpen = false;
    this.editingMissionUuid = null;
    this.preparingMissionUuid = null;
    this.preparingSquadUuid = null;
    this.pendingMissionRelease = null;
    this.pendingMissionLaunch = null;
    this.resolvingMissionUuid = null;
    this.render({ force: true });
  }

  static onCloseMissionCancel() {
    this.pendingMissionCancel = null;
    this.render({ force: true });
  }

  static async onConfirmMissionCancel() {
    if (!isModuleManager(game.user) || this.isMissionBusy || !this.pendingMissionCancel) return;
    const form = this.element?.querySelector?.("#dm-mission-cancel-form");
    if (!form) return;
    const reason = String(new FormData(form).get("reason") ?? "").trim();
    if (!reason) {
      ui.notifications.warn("Informe o motivo do cancelamento.");
      form.querySelector?.('[name="reason"]')?.focus?.();
      return;
    }

    const pending = this.pendingMissionCancel;
    const missionDocument = recordIndex.get(RECORD_TYPES.MISSION, pending.missionUuid);
    if (!missionDocument) return;
    const mission = decodeRecord(missionDocument);
    this.isMissionBusy = true;
    try {
      await executeCommandAuthoritatively({
        commandType: COMMAND_TYPES.MISSION_CANCEL,
        payload: {
          mission: entityReference(mission),
          expectedModifiedTime: pending.expectedModifiedTime,
          reason,
          squads: pending.squads.map((entry) => ({
            squad: entry.squad,
            expectedModifiedTime: entry.expectedModifiedTime
          }))
        }
      });
      this.pendingMissionCancel = null;
      ui.notifications.info(`${mission.document.name} cancelada; unidades vinculadas foram liberadas.`);
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao cancelar Mission", error);
      ui.notifications.error(error.message ?? "Falha ao cancelar missão.");
    } finally {
      this.isMissionBusy = false;
    }
  }

  static onOpenMissionResolve(event, target) {
    if (!isModuleManager(game.user)) return;
    const missionUuid = target?.dataset?.missionUuid;
    const missionDocument = missionUuid ? recordIndex.get(RECORD_TYPES.MISSION, missionUuid) : null;
    if (!missionDocument) return;
    const mission = decodeRecord(missionDocument);
    if (mission.data.status !== "active") {
      ui.notifications.warn("Somente uma missão ativa pode ser resolvida.");
      return;
    }
    this.resolvingMissionUuid = missionUuid;
    this.preparingMissionUuid = null;
    this.preparingSquadUuid = null;
    this.isCreateMissionOpen = false;
    this.editingMissionUuid = null;
    this.pendingMissionRelease = null;
    this.pendingMissionLaunch = null;
    this.pendingMissionCancel = null;
    this.render({ force: true });
  }

  static onCloseMissionResolve() {
    this.resolvingMissionUuid = null;
    this.render({ force: true });
  }

  static async onSubmitMissionResolve() {
    if (!isModuleManager(game.user) || this.isMissionBusy || !this.resolvingMissionUuid) return;
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
          expectedModifiedTime: Number(data.get("expectedModifiedTime")) || null,
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
      ui.notifications.error(error.message ?? "Falha ao resolver missão.");
    } finally {
      this.isMissionBusy = false;
    }
  }

  static onOpenCreateStructure(event, target) {
    if (!this.selectedDomainUuid) return;
    const mode = String(target?.dataset?.mode ?? "construction");
    if (mode === "direct" && !isModuleManager(game.user)) return;
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
      ui.notifications.warn("Informe um nome para a estrutura.");
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
      maintenancePriority: Number(data.get("maintenancePriority") ?? 50),
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
        ui.notifications.info(`Construção de ${name} iniciada como projeto.`);
      } else {
        await executeCommandAuthoritatively({
          commandType: COMMAND_TYPES.STRUCTURE_CREATE,
          payload: {
            ...common,
            status: String(data.get("status") ?? "operational"),
            condition: Number(data.get("condition") ?? 100)
          }
        });
        ui.notifications.info(`Estrutura ${name} registrada.`);
      }
      this.isCreateStructureOpen = false;
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao criar Structure", error);
      ui.notifications.error(error.message ?? "Falha ao criar estrutura.");
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
    let commandType;
    let payload;
    try {
      if (isModuleManager(game.user)) {
        const catalog = getResourceCatalogSetting();
        commandType = COMMAND_TYPES.STRUCTURE_ADMIN_UPDATE;
        payload = {
          structure: entityReference(structure),
          expectedModifiedTime: Number(data.get("expectedModifiedTime")) || null,
          name: String(data.get("name") ?? structure.document.name),
          description: String(data.get("description") ?? ""),
          category: String(data.get("category") ?? "general"),
          tier: Number(data.get("tier") ?? 1),
          maxTier: Number(data.get("maxTier") ?? 1),
          status: String(data.get("status") ?? structure.data.status),
          condition: Number(data.get("condition") ?? structure.data.condition),
          capacity: Number(data.get("capacity") ?? 0),
          maintenancePriority: Number(data.get("maintenancePriority") ?? 50),
          workforceRequired: Number(data.get("workforceRequired") ?? 0),
          maintenance: parseResourceMatrix(data, catalog, "maintenance"),
          production: parseResourceMatrix(data, catalog, "production"),
          tags: String(data.get("tags") ?? "").split(",").map((tag) => tag.trim()).filter(Boolean)
        };
      } else {
        commandType = COMMAND_TYPES.STRUCTURE_PATCH;
        payload = {
          structure: entityReference(structure),
          expectedModifiedTime: Number(data.get("expectedModifiedTime")) || null,
          patch: {
            description: String(data.get("description") ?? ""),
            status: String(data.get("status") ?? structure.data.status)
          }
        };
      }
    } catch (error) {
      ui.notifications.error(error.message ?? "Revise os campos da estrutura antes de salvar.");
      return;
    }
    const isTerminalTransition = isModuleManager(game.user)
      && ["destroyed", "decommissioned"].includes(payload.status)
      && payload.status !== structure.data.status;
    if (isTerminalTransition && structure.data.activeProject) {
      ui.notifications.warn("Conclua ou cancele o projeto vinculado antes de retirar esta estrutura de serviço.");
      return;
    }
    if (isTerminalTransition) {
      const isDestroyed = payload.status === "destroyed";
      this.pendingTerminalTransition = {
        kind: "structure",
        entityTypeLabel: "ESTRUTURA",
        commandType,
        payload,
        entityUuid: structure.uuid,
        entityName: structure.document.name,
        fromLabel: stateLabel(structure.data.status),
        toLabel: stateLabel(payload.status),
        title: isDestroyed
          ? `Registrar a destruição de ${structure.document.name}?`
          : `Descomissionar ${structure.document.name}?`,
        description: "A estrutura permanecerá no cadastro, mas deixará de participar da operação econômica do domínio.",
        confirmLabel: isDestroyed ? "CONFIRMAR DESTRUIÇÃO" : "CONFIRMAR DESCOMISSIONAMENTO",
        successMessage: `${structure.document.name} passou ao estado ${stateLabel(payload.status).toLowerCase()}.`,
        effects: [
          { title: "Produção interrompida", detail: "Produção, capacidade operacional e rotinas de manutenção deixam de ser aplicadas enquanto o estado terminal permanecer." },
          { title: "Alocações preservadas", detail: "O cadastro técnico e as alocações de trabalho continuam visíveis para que possam ser revisadas ou redistribuídas conscientemente." }
        ]
      };
      await this.render({ force: true });
      return;
    }
    this.isStructureBusy = true;
    try {
      await executeCommandAuthoritatively({ commandType, payload });
      ui.notifications.info(`${structure.document.name} sincronizada com a gestão de infraestrutura.`);
      this.editingStructureUuid = null;
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao atualizar Structure", error);
      ui.notifications.error(error.message ?? "Falha ao atualizar estrutura.");
    } finally {
      this.isStructureBusy = false;
    }
  }

  static onOpenTerritoryEditor() {
    if (!isModuleManager(game.user) || !this.selectedDomainUuid) return;
    this.isTerritoryEditorOpen = true;
    this.render({ force: true });
  }

  static onCloseTerritoryEditor() {
    this.isTerritoryEditorOpen = false;
    this.render({ force: true });
  }

  static async onSubmitTerritoryEditor() {
    if (!isModuleManager(game.user) || this.isStrategicIntelBusy || !this.selectedDomainUuid) return;
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
      ui.notifications.info(`Território de ${domain.document.name} atualizado.`);
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao configurar Territory", error);
      ui.notifications.error(error.message ?? "Falha ao configurar território.");
    } finally {
      this.isStrategicIntelBusy = false;
    }
  }

  static onOpenRelationEditor(event, target) {
    if (!isModuleManager(game.user) || !this.selectedDomainUuid) return;
    this.editingRelationId = String(target?.dataset?.relationId ?? "__new__");
    this.isAgreementCreateOpen = false;
    this.render({ force: true });
  }

  static onCloseRelationEditor() {
    this.editingRelationId = null;
    this.render({ force: true });
  }

  static async onSubmitRelationEditor() {
    if (!isModuleManager(game.user) || this.isStrategicIntelBusy || !this.selectedDomainUuid) return;
    const form = this.element?.querySelector?.("#dm-relation-form");
    const domainDocument = recordIndex.get(RECORD_TYPES.DOMAIN, this.selectedDomainUuid);
    if (!form || !domainDocument) return;
    const domain = decodeRecord(domainDocument);
    const data = new FormData(form);
    const targetUuid = String(data.get("targetUuid") ?? "");
    const targetDocument = targetUuid ? recordIndex.get(RECORD_TYPES.DOMAIN, targetUuid) : null;
    if (!targetDocument) {
      ui.notifications.warn("Selecione um domínio alvo para a relação.");
      return;
    }
    this.isStrategicIntelBusy = true;
    try {
      await executeCommandAuthoritatively({
        commandType: COMMAND_TYPES.RELATION_UPSERT,
        payload: {
          domain: entityReference(domain),
          expectedModifiedTime: Number(data.get("expectedModifiedTime")) || null,
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
      ui.notifications.info("Relação diplomática sincronizada.");
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao salvar relação", error);
      ui.notifications.error(error.message ?? "Falha ao salvar relação diplomática.");
    } finally {
      this.isStrategicIntelBusy = false;
    }
  }

  static onRemoveRelation(event, target) {
    if (!isModuleManager(game.user) || this.isStrategicIntelBusy || !this.selectedDomainUuid) return;
    const localId = String(target?.dataset?.relationId ?? "");
    const domainDocument = recordIndex.get(RECORD_TYPES.DOMAIN, this.selectedDomainUuid);
    if (!localId || !domainDocument) return;
    const domain = decodeRecord(domainDocument);
    const relation = (domain.data.relations ?? []).find((entry) => entry.localId === localId);
    if (!relation) return;
    const targetDocument = relation.target?.entityId
      ? recordIndex.getByEntityId(relation.target.entityId)
      : relation.target?.uuid || relation.targetDomainUuid
        ? recordIndex.get(RECORD_TYPES.DOMAIN, relation.target?.uuid ?? relation.targetDomainUuid)
        : null;
    this.pendingRelationRemoval = {
      localId,
      targetName: targetDocument?.name ?? relation.target?.entityId ?? relation.targetDomainUuid ?? "Contraparte desconhecida",
      postureLabel: DIPLOMATIC_POSTURE_LABELS[relation.posture] ?? stateLabel(relation.posture),
      expectedModifiedTime: domain.document?._stats?.modifiedTime ?? null
    };
    this.render({ force: true });
  }

  static onCancelRemoveRelation() {
    this.pendingRelationRemoval = null;
    this.render({ force: true });
  }

  static async onConfirmRemoveRelation() {
    if (!isModuleManager(game.user) || this.isStrategicIntelBusy || !this.selectedDomainUuid || !this.pendingRelationRemoval) return;
    const pending = this.pendingRelationRemoval;
    const domainDocument = recordIndex.get(RECORD_TYPES.DOMAIN, this.selectedDomainUuid);
    if (!domainDocument) return;
    this.isStrategicIntelBusy = true;
    try {
      await executeCommandAuthoritatively({
        commandType: COMMAND_TYPES.RELATION_REMOVE,
        payload: {
          domain: entityReference(decodeRecord(domainDocument)),
          expectedModifiedTime: pending.expectedModifiedTime,
          localId: pending.localId
        }
      });
      this.editingRelationId = null;
      this.pendingRelationRemoval = null;
      ui.notifications.info("Relação diplomática removida.");
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao remover relação", error);
      ui.notifications.error(error.message ?? "Falha ao remover relação.");
    } finally {
      this.isStrategicIntelBusy = false;
    }
  }

  static onOpenAgreementCreate() {
    if (!isModuleManager(game.user) || !this.selectedDomainUuid) return;
    this.isAgreementCreateOpen = true;
    this.editingRelationId = null;
    this.render({ force: true });
  }

  static onCloseAgreementCreate() {
    this.isAgreementCreateOpen = false;
    this.render({ force: true });
  }

  static async onSubmitAgreementCreate() {
    if (!isModuleManager(game.user) || this.isStrategicIntelBusy || !this.selectedDomainUuid) return;
    const form = this.element?.querySelector?.("#dm-agreement-form");
    const sourceDocument = recordIndex.get(RECORD_TYPES.DOMAIN, this.selectedDomainUuid);
    if (!form || !sourceDocument) return;
    const source = decodeRecord(sourceDocument);
    const data = new FormData(form);
    const counterpartyUuid = String(data.get("counterpartyUuid") ?? "");
    const counterpartyDocument = counterpartyUuid ? recordIndex.get(RECORD_TYPES.DOMAIN, counterpartyUuid) : null;
    if (!counterpartyDocument) {
      ui.notifications.warn("Selecione a contraparte do acordo.");
      return;
    }
    const counterparty = decodeRecord(counterpartyDocument);
    const transfers = [];
    const resourceId = String(data.get("resourceId") ?? "").trim();
    const amountRaw = String(data.get("amount") ?? "").trim();
    if (resourceId && amountRaw) {
      const resource = getResourceCatalogSetting().resources?.find((entry) => entry.id === resourceId);
      if (!resource) {
        ui.notifications.warn("O recurso do acordo não existe no catálogo.");
        return;
      }
      let amount;
      try {
        amount = parseMinorUnits(amountRaw, resource.precision ?? 0);
      } catch (error) {
        ui.notifications.warn(error.message ?? "Quantidade do acordo inválida.");
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
      ui.notifications.info("Acordo registrado.");
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao criar Agreement", error);
      ui.notifications.error(error.message ?? "Falha ao criar acordo.");
    } finally {
      this.isStrategicIntelBusy = false;
    }
  }

  static async onSetAgreementStatus(event, target) {
    if (!isModuleManager(game.user) || this.isStrategicIntelBusy) return;
    const uuid = String(target?.dataset?.agreementUuid ?? "");
    const status = String(target?.dataset?.status ?? "");
    const document = uuid ? recordIndex.get(RECORD_TYPES.AGREEMENT, uuid) : null;
    if (!document || !status) return;
    const agreement = decodeRecord(document);
    if (agreement.data.status === status) return;
    if (status === "terminated") {
      this.pendingAgreementStatus = {
        uuid,
        name: agreement.document.name,
        fromLabel: AGREEMENT_STATUS_LABELS[agreement.data.status] ?? stateLabel(agreement.data.status),
        toLabel: AGREEMENT_STATUS_LABELS[status] ?? stateLabel(status),
        status,
        expectedModifiedTime: agreement.document?._stats?.modifiedTime ?? null
      };
      this.render({ force: true });
      return;
    }
    this.isStrategicIntelBusy = true;
    try {
      await executeCommandAuthoritatively({
        commandType: COMMAND_TYPES.AGREEMENT_STATUS,
        payload: {
          agreement: entityReference(agreement),
          expectedModifiedTime: agreement.document?._stats?.modifiedTime ?? null,
          status
        }
      });
      ui.notifications.info(`Acordo alterado para ${stateLabel(status)}.`);
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao alterar Agreement", error);
      ui.notifications.error(error.message ?? "Falha ao alterar acordo.");
    } finally {
      this.isStrategicIntelBusy = false;
    }
  }

  static onCancelAgreementStatus() {
    this.pendingAgreementStatus = null;
    this.render({ force: true });
  }

  static async onConfirmAgreementStatus() {
    if (!isModuleManager(game.user) || this.isStrategicIntelBusy || !this.pendingAgreementStatus) return;
    const pending = this.pendingAgreementStatus;
    const document = recordIndex.get(RECORD_TYPES.AGREEMENT, pending.uuid);
    if (!document) return;
    this.isStrategicIntelBusy = true;
    try {
      await executeCommandAuthoritatively({
        commandType: COMMAND_TYPES.AGREEMENT_STATUS,
        payload: {
          agreement: entityReference(decodeRecord(document)),
          expectedModifiedTime: pending.expectedModifiedTime,
          status: pending.status
        }
      });
      this.pendingAgreementStatus = null;
      ui.notifications.info(`Acordo alterado para ${stateLabel(pending.status)}.`);
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao encerrar Agreement", error);
      ui.notifications.error(error.message ?? "Falha ao encerrar acordo.");
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
    if (!isModuleManager(game.user) || !this.selectedDomainUuid) return;
    this.editingIntelId = String(target?.dataset?.intelId ?? "__new__");
    this.render({ force: true });
  }

  static onCloseIntelEditor() {
    this.editingIntelId = null;
    this.render({ force: true });
  }

  static async onSubmitIntelEditor() {
    if (!isModuleManager(game.user) || this.isStrategicIntelBusy || !this.selectedDomainUuid) return;
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
          expectedModifiedTime: Number(data.get("expectedModifiedTime")) || null,
          localId: String(data.get("localId") ?? ""),
          title: String(data.get("title") ?? ""),
          category: String(data.get("category") ?? "fact"),
          visibility: String(data.get("visibility") ?? "all_controllers"),
          targetDomain: targetDocument ? entityReference(decodeRecord(targetDocument)) : null,
          content: String(data.get("content") ?? ""),
          credibility: String(data.get("credibility") ?? "confirmed"),
          source: String(data.get("source") ?? ""),
          revealed: String(data.get("visibility") ?? "all_controllers") === "public",
          tags: String(data.get("tags") ?? "").split(",").map((tag) => tag.trim()).filter(Boolean)
        }
      });
      this.selectedIntelId = result.intel?.localId ?? this.selectedIntelId;
      this.editingIntelId = null;
      ui.notifications.info("Informação atualizada.");
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha ao salvar Intel", error);
      ui.notifications.error(error.message ?? "Falha ao salvar informação.");
    } finally {
      this.isStrategicIntelBusy = false;
    }
  }

  static onRemoveIntel(event, target) {
    this.openIntelConfirmation("remove", target);
  }

  static onRevealIntel(event, target) {
    this.openIntelConfirmation("reveal", target);
  }

  static openIntelConfirmation(kind, target) {
    if (!isModuleManager(game.user) || this.isStrategicIntelBusy || !this.selectedDomainUuid) return;
    const localId = String(target?.dataset?.intelId ?? "");
    const domainDocument = recordIndex.get(RECORD_TYPES.DOMAIN, this.selectedDomainUuid);
    if (!localId || !domainDocument) return;
    const domain = decodeRecord(domainDocument);
    const intel = (domain.data.intel ?? []).find((entry) => entry.localId === localId);
    if (!intel || (kind === "reveal" && (intel.revealed || intel.visibility === "public"))) return;
    this.pendingIntelAction = {
      kind,
      isRemove: kind === "remove",
      isReveal: kind === "reveal",
      localId,
      title: intel.title,
      visibilityLabel: INTEL_VISIBILITY_LABELS[intel.visibility] ?? stateLabel(intel.visibility),
      expectedModifiedTime: domain.document?._stats?.modifiedTime ?? null
    };
    this.render({ force: true });
  }

  static onCancelIntelAction() {
    this.pendingIntelAction = null;
    this.render({ force: true });
  }

  static async onConfirmIntelAction() {
    if (!isModuleManager(game.user) || this.isStrategicIntelBusy || !this.selectedDomainUuid || !this.pendingIntelAction) return;
    const pending = this.pendingIntelAction;
    const domainDocument = recordIndex.get(RECORD_TYPES.DOMAIN, this.selectedDomainUuid);
    if (!domainDocument) return;
    this.isStrategicIntelBusy = true;
    try {
      await executeCommandAuthoritatively({
        commandType: pending.isRemove ? COMMAND_TYPES.INTEL_REMOVE : COMMAND_TYPES.INTEL_REVEAL,
        payload: {
          domain: entityReference(decodeRecord(domainDocument)),
          expectedModifiedTime: pending.expectedModifiedTime,
          localId: pending.localId
        }
      });
      if (pending.isRemove && this.selectedIntelId === pending.localId) this.selectedIntelId = null;
      if (pending.isRemove) this.editingIntelId = null;
      this.pendingIntelAction = null;
      ui.notifications.info(pending.isRemove ? "Informação removida." : "Informação revelada ao público.");
      await this.render({ force: true });
    } catch (error) {
      console.error("Domain Manager | Falha na ação de Intel", error);
      ui.notifications.error(error.message ?? "Falha ao alterar informação.");
    } finally {
      this.isStrategicIntelBusy = false;
    }
  }

  static async onAdvanceTicks(event, target) {
    if (!isModuleManager(game.user) || this.isAdvanceBusy) return;
    const ticks = Math.max(1, Math.floor(Number(target?.dataset?.ticks ?? 1)));
    this.isAdvanceBusy = true;
    try {
      const result = await executeAdvanceRun({ deltaTicks: ticks });
      ui.notifications.info(`Simulação avançada em ${ticks} ciclo(s).`);
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
