export const MODULE_ID = "domain-manager";
export const MODULE_TITLE = "Domínios // Domain Manager";
export const MODULE_VERSION = "0.1.0-dev.134.1";
export const SCHEMA_VERSION = 6;

export const RECORD_TYPES = Object.freeze({
  DOMAIN: "domain",
  REQUEST: "request",
  PROJECT: "project",
  MISSION: "mission",
  SQUAD: "squad",
  PERSON: "person",
  STRUCTURE: "structure",
  AGREEMENT: "agreement"
});

export const CAPABILITY_KEYS = Object.freeze([
  "economy",
  "population",
  "people",
  "structures",
  "projects",
  "squads",
  "missions",
  "diplomacy",
  "territory",
  "intel",
  "security"
]);

export const MANAGEMENT_PRESETS = Object.freeze([
  "squad",
  "outpost",
  "base",
  "strategic-organization",
  "custom"
]);

export const REQUEST_TYPES = Object.freeze([
  "build",
  "upgrade",
  "purchase",
  "recruit",
  "mission",
  "agreement",
  "transfer",
  "custom"
]);

export const REQUEST_STATUSES = Object.freeze([
  "submitted",
  "under-review",
  "needs-changes",
  "approved",
  "rejected",
  "withdrawn",
  "fulfilled"
]);

export const REQUEST_REVIEW_STATUSES = Object.freeze([
  "submitted",
  "under-review",
  "needs-changes",
  "approved",
  "rejected"
]);

export const REQUEST_HANDLINGS = Object.freeze([
  "none",
  "immediate",
  "project",
  "mission",
  "agreement"
]);

export const PROJECT_STATUSES = Object.freeze([
  "planned",
  "active",
  "paused",
  "blocked",
  "completed",
  "cancelled"
]);

export const PROJECT_EDITABLE_STATUSES = Object.freeze([
  "planned",
  "active",
  "paused",
  "blocked",
  "completed",
  "cancelled"
]);

export const PROJECT_RESERVATION_STATUSES = Object.freeze([
  "active",
  "paused",
  "blocked"
]);

export const PROJECT_COST_MODES = Object.freeze([
  "reserved",
  "progressive"
]);

export const MISSION_STATUSES = Object.freeze([
  "planned",
  "available",
  "active",
  "resolved",
  "failed",
  "cancelled"
]);

export const MISSION_OBJECTIVE_STATUSES = Object.freeze([
  "pending",
  "completed",
  "failed"
]);

export const MISSION_ORIGIN_KINDS = Object.freeze([
  "manual",
  "request",
  "project"
]);

export const SQUAD_STATUSES = Object.freeze([
  "forming",
  "ready",
  "deployed",
  "recovering",
  "inactive",
  "disbanded"
]);

export const PERSON_STATUSES = Object.freeze([
  "active",
  "away",
  "injured",
  "unavailable",
  "missing",
  "dead",
  "retired"
]);

export const STRUCTURE_STATUSES = Object.freeze([
  "planned",
  "operational",
  "damaged",
  "disabled",
  "destroyed",
  "decommissioned"
]);

export const AGREEMENT_STATUSES = Object.freeze([
  "draft",
  "active",
  "suspended",
  "breached",
  "terminated",
  "expired"
]);

export const COMMAND_TYPES = Object.freeze({
  TRANSFER_RESOURCES: "resources.transfer",
  SQUAD_CREATE: "squad.create",
  SQUAD_PATCH: "squad.patch",
  SQUAD_ADMIN_UPDATE: "squad.admin-update",
  MISSION_CREATE: "mission.create",
  MISSION_PREPARE: "mission.prepare",
  MISSION_RELEASE: "mission.release",
  MISSION_LAUNCH: "mission.launch",
  MISSION_RESOLVE: "mission.resolve",
  STRUCTURE_CREATE: "structure.create",
  STRUCTURE_PATCH: "structure.patch",
  STRUCTURE_ADMIN_UPDATE: "structure.admin-update",
  STRUCTURE_BEGIN_CONSTRUCTION: "structure.begin-construction"
});

export const EVENT_TYPES = Object.freeze({
  RESOURCES_TRANSFERRED: "resources.transferred",
  SQUAD_CREATED: "squad.created",
  SQUAD_UPDATED: "squad.updated",
  MISSION_CREATED: "mission.created",
  MISSION_PREPARED: "mission.prepared",
  MISSION_RELEASED: "mission.released",
  MISSION_LAUNCHED: "mission.launched",
  MISSION_RESOLVED: "mission.resolved",
  STRUCTURE_CREATED: "structure.created",
  STRUCTURE_UPDATED: "structure.updated",
  STRUCTURE_CONSTRUCTION_STARTED: "structure.construction-started",
  STRUCTURE_COMMISSIONED: "structure.commissioned",
  COMMAND_COMPLETED: "command.completed"
});

export const SETTINGS = Object.freeze({
  DATA_FOLDER_ID: "dataFolderId",
  RESOURCE_CATALOG: "resourceCatalog",
  SECONDS_PER_TICK: "secondsPerTick",
  SYNC_TIMEKEEPING: "syncTimekeeping",
  OPERATION_LEDGER: "operationLedger"
});

export const ECONOMY_LIMITS = Object.freeze({
  MAX_PRECISION: 4,
  MAX_MINOR_AMOUNT: 9_000_000_000_000,
  MAX_PERIOD_TICKS: 10_000_000
});

export const FLOW_DIRECTIONS = Object.freeze([
  "inflow",
  "outflow"
]);

export const FLOW_CATEGORIES = Object.freeze([
  "production",
  "consumption",
  "upkeep",
  "trade",
  "contract",
  "manual"
]);

export const POPULATION_COUNT_MODES = Object.freeze([
  "direct",
  "inclusive"
]);

export const GROUP_STATUSES = Object.freeze([
  "active",
  "inactive",
  "unavailable",
  "disbanded"
]);

export const NOTABLE_STATUSES = Object.freeze([
  "active",
  "away",
  "unavailable",
  "missing",
  "dead",
  "retired"
]);

export const DOMAIN_NATURES = Object.freeze([
  "physical",
  "organization",
  "hybrid",
  "abstract"
]);

export const DOMAIN_STATES = Object.freeze([
  "active",
  "inactive",
  "lost",
  "destroyed",
  "archived"
]);
