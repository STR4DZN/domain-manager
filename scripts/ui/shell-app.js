import { COMMAND_TYPES, MODULE_ID, MODULE_TITLE, RECORD_TYPES } from "../core/constants.js";
import { recordIndex } from "../data/record-index.js";
import { decodeRecord } from "../models/record-codec.js";
import { getResourceCatalogSetting } from "../core/settings.js";
import { formatMinorUnits, parseMinorUnits } from "../core/numbers.js";
import { executeCommandAuthoritatively } from "../authority/execute.js";
import { buildDomainLedger } from "../features/economy/ledger.js";
import { buildDomainProjectReservations } from "../features/projects/selectors.js";
import { createDomainAction } from "../features/domains/actions.js";
import {
  createSquadAction,
  patchSquadAction,
  updateSquadAdministrationAction
} from "../features/squads/actions.js";
import { executeAdvanceRun } from "../simulation/advance-run.js";
import { isAuthorityReady } from "../authority/socket.js";
import { isPrimaryActiveGM } from "../authority/primary-gm.js";
import { getTimekeepingStatus } from "../integration/timekeeping.js";
import {
  buildDomainNavigation,
  buildGlobalNavigation,
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

function buildViewFlags(view) {
  const keys = [
    "command", "domains", "operations", "system", "overview", "economy",
    "population", "people", "structures", "projects", "squads", "missions",
    "diplomacy", "territory", "intel", "security", "history"
  ];
  return Object.fromEntries(keys.map((key) => [key, key === view]));
}

function buildResourceRows(domain, catalog) {
  if (!domain) return [];
  const reservations = buildDomainProjectReservations(domain.uuid);
  const ledger = buildDomainLedger({
    catalog,
    economy: domain.data.economy,
    reservations
  });
  const defs = new Map((catalog?.resources ?? []).map((resource) => [resource.id, resource]));
  return ledger.map((entry) => {
    const definition = defs.get(entry.resourceId) ?? {};
    const pressureTone = entry.overReserved || entry.pressure
      ? "critical"
      : entry.netDirection === "negative"
        ? "warning"
        : entry.netDirection === "positive"
          ? "nominal"
          : "neutral";
    return {
      ...entry,
      name: definition.name ?? entry.resourceId,
      symbol: definition.symbol ?? "",
      tone: pressureTone,
      runway: entry.runwayTicksFloor == null ? "—" : `${entry.runwayTicksFloor} t`
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
    requests: decode(recordIndex.requestsForDomain(domain.uuid)),
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
    name: person.name,
    status: person.status,
    statusLabel: stateLabel(person.status),
    tone: statusTone(person.status),
    role: person.role || person.function || "Notável",
    specialization: person.specialization || "",
    portrait: person.portrait || ""
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
  isAdvanceBusy = false;

  static DEFAULT_OPTIONS = {
    id: "domain-manager-app",
    classes: ["domain-manager-app-window"],
    position: { width: 1360, height: 820 },
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
      advanceTicks: DomainManagerShellApp.onAdvanceTicks
    }
  };

  static PARTS = {
    main: {
      template: `modules/${MODULE_ID}/templates/app-shell.hbs`,
      scrollable: [".dm-app__workspace-scroll", ".dm-entity-deck__list"]
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
        this.render({ force: true });
      });
    }
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
    const resources = buildResourceRows(selectedDomain, catalog);
    const telemetry = summarizeDomainTelemetry({ domain: selectedDomain, ...related });
    const domainNav = selectedDomain
      ? buildDomainNavigation(selectedDomain.data, { activeView: this.activeView })
      : [];

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

    const projects = related.projects.map((record) => {
      const required = Math.max(1, Number(record.data.work?.required ?? 1));
      const completed = Math.max(0, Number(record.data.work?.completed ?? 0));
      const progress = Math.min(100, (completed / required) * 100);
      return {
        ...recordSummary(record),
        progress,
        progressDisplay: `${Math.round(progress)}%`,
        segments: meterSegments(progress),
        description: record.data.description ?? ""
      };
    });

    const users = listUsers();
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
    const structureStatusOptions = ["planned", "operational", "damaged", "disabled", "destroyed", "decommissioned"]
      .map((value) => ({ value, label: stateLabel(value), selected: editingStructure?.status === value }));
    const structureOperatorStatusOptions = ["operational", "disabled"]
      .map((value) => ({ value, label: stateLabel(value), selected: editingStructure?.status === value }));

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

    const people = [
      ...related.people.map((record) => ({
        ...recordSummary(record),
        role: record.data.role ?? record.data.function ?? "Pessoa",
        specialization: record.data.specialization ?? "",
        portrait: record.data.portrait ?? ""
      })),
      ...buildLegacyPeople(selectedDomain)
    ];

    const relations = (selectedDomain?.data?.relations ?? []).map((relation) => ({
      ...relation,
      postureLabel: stateLabel(relation.posture),
      tone: statusTone(relation.posture),
      targetName: domains.find((domain) => domain.uuid === relation.targetDomainUuid)?.document?.name ?? "Entidade externa"
    }));

    const intel = (selectedDomain?.data?.intel ?? []).map((entry) => ({
      ...entry,
      tone: entry.secret ? "warning" : "neutral"
    }));

    const history = [...(selectedDomain?.data?.history ?? [])].reverse();
    const conditions = (selectedDomain?.data?.conditions ?? []).map((condition) => ({
      ...condition,
      tone: condition.severity === "severe" ? "critical" : condition.severity === "moderate" ? "warning" : "neutral"
    }));

    const controllers = (selectedDomain?.data?.governance?.controllers ?? []).map((id) => game.users.get(id)?.name ?? id);
    const timekeeping = getTimekeepingStatus?.() ?? {};

    return {
      ...context,
      appVersion: game.modules.get(MODULE_ID)?.version ?? "dev",
      isGM: game.user.isGM,
      isPrimaryGM: isPrimaryActiveGM(),
      authorityReady: isAuthorityReady(),
      activeView: this.activeView,
      view: buildViewFlags(this.activeView),
      globalNav,
      domainNav,
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
      missions,
      squads,
      structures,
      people,
      relations,
      agreements: related.agreements.map(recordSummary),
      requests: related.requests.map(recordSummary),
      intel,
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
    if (GLOBAL_VIEW_IDS.has(this.activeView) && this.activeView !== "domains") this.activeView = "overview";
    this.render({ force: true });
  }

  static onApplySearch() {
    const input = this.element?.querySelector?.("[data-dm-search]");
    this.searchQuery = input?.value?.trim?.() ?? "";
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
