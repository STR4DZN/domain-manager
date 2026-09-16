export const MODULE_ID = "domain-manager";
export const MODULE_TITLE = "Domínios // Domain Manager";
export const MODULE_VERSION = "0.2.6";
export const SCHEMA_VERSION = 9;

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


export const TERRITORY_CONTROL_STATES = Object.freeze([
  "controlled",
  "contested",
  "neutral",
  "unclaimed",
  "unknown"
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
  DOMAIN_CREATE: "domain.create",
  DOMAIN_UPDATE: "domain.update",
  DOMAIN_MEDIA_UPDATE: "domain.media-update",
  DOMAIN_DELETE: "domain.delete",
  TRANSFER_RESOURCES: "resources.transfer",
  SQUAD_CREATE: "squad.create",
  SQUAD_PATCH: "squad.patch",
  SQUAD_ADMIN_UPDATE: "squad.admin-update",
  MISSION_CREATE: "mission.create",
  MISSION_UPDATE: "mission.update",
  MISSION_OBJECTIVE_UPSERT: "mission.objective-upsert",
  MISSION_OBJECTIVE_REMOVE: "mission.objective-remove",
  MISSION_PREPARE: "mission.prepare",
  MISSION_RELEASE: "mission.release",
  MISSION_PUBLISH: "mission.publish",
  MISSION_LAUNCH: "mission.launch",
  MISSION_CANCEL: "mission.cancel",
  MISSION_RESOLVE: "mission.resolve",
  STRUCTURE_CREATE: "structure.create",
  STRUCTURE_PATCH: "structure.patch",
  STRUCTURE_ADMIN_UPDATE: "structure.admin-update",
  STRUCTURE_BEGIN_CONSTRUCTION: "structure.begin-construction",
  PROJECT_CREATE: "project.create",
  PROJECT_UPDATE: "project.update",
  PROJECT_DELETE: "project.delete",
  PROJECT_COST_UPSERT: "project.cost-upsert",
  PROJECT_COST_REMOVE: "project.cost-remove",
  ECONOMY_CONFIGURE: "economy.configure",
  ECONOMY_FLOW_UPSERT: "economy.flow-upsert",
  ECONOMY_FLOW_REMOVE: "economy.flow-remove",
  RESOURCE_CATALOG_UPSERT: "resource-catalog.upsert",
  RESOURCE_CATALOG_REMOVE: "resource-catalog.remove",
  POPULATION_CONFIGURE: "population.configure",
  POPULATION_GROUP_UPSERT: "population.group-upsert",
  POPULATION_GROUP_REMOVE: "population.group-remove",
  POPULATION_WORKFORCE_SET: "population.workforce-set",
  PERSON_CREATE: "person.create",
  PERSON_UPDATE: "person.update",
  PERSON_DELETE: "person.delete",
  TERRITORY_CONFIGURE: "territory.configure",
  RELATION_UPSERT: "relation.upsert",
  RELATION_REMOVE: "relation.remove",
  AGREEMENT_CREATE: "agreement.create",
  AGREEMENT_UPDATE: "agreement.update",
  AGREEMENT_STATUS: "agreement.status",
  INTEL_UPSERT: "intel.upsert",
  INTEL_REMOVE: "intel.remove",
  INTEL_REVEAL: "intel.reveal",
  SECURITY_CONFIGURE: "security.configure",
  CONDITION_CREATE: "condition.create",
  CONDITION_UPDATE: "condition.update",
  CONDITION_REMOVE: "condition.remove",
  CONDITION_TOGGLE: "condition.toggle",
  DOMAIN_EVENT_APPLY: "domain-event.apply",
  HISTORY_ADD: "history.add",
  HISTORY_REMOVE: "history.remove",
  HISTORY_CLEAR: "history.clear",
  REQUEST_CREATE: "request.create",
  REQUEST_RESUBMIT: "request.resubmit",
  REQUEST_REVIEW: "request.review",
  REQUEST_CREATE_MISSION: "request.create-mission",
  REQUEST_WITHDRAW: "request.withdraw",
  REQUEST_FULFILL: "request.fulfill"
});

export const EVENT_TYPES = Object.freeze({
  DOMAIN_CREATED: "domain.created",
  DOMAIN_UPDATED: "domain.updated",
  DOMAIN_MEDIA_UPDATED: "domain.media-updated",
  DOMAIN_DELETED: "domain.deleted",
  RESOURCES_TRANSFERRED: "resources.transferred",
  SQUAD_CREATED: "squad.created",
  SQUAD_UPDATED: "squad.updated",
  MISSION_CREATED: "mission.created",
  MISSION_UPDATED: "mission.updated",
  MISSION_OBJECTIVE_UPDATED: "mission.objective-updated",
  MISSION_OBJECTIVE_REMOVED: "mission.objective-removed",
  MISSION_PREPARED: "mission.prepared",
  MISSION_RELEASED: "mission.released",
  MISSION_PUBLISHED: "mission.published",
  MISSION_LAUNCHED: "mission.launched",
  MISSION_CANCELLED: "mission.cancelled",
  MISSION_RESOLVED: "mission.resolved",
  STRUCTURE_CREATED: "structure.created",
  STRUCTURE_UPDATED: "structure.updated",
  STRUCTURE_CONSTRUCTION_STARTED: "structure.construction-started",
  STRUCTURE_COMMISSIONED: "structure.commissioned",
  PROJECT_CREATED: "project.created",
  PROJECT_UPDATED: "project.updated",
  PROJECT_DELETED: "project.deleted",
  ECONOMY_CONFIGURED: "economy.configured",
  ECONOMY_FLOW_UPDATED: "economy.flow-updated",
  ECONOMY_FLOW_REMOVED: "economy.flow-removed",
  RESOURCE_CATALOG_UPDATED: "resource-catalog.updated",
  RESOURCE_CATALOG_REMOVED: "resource-catalog.removed",
  POPULATION_CONFIGURED: "population.configured",
  POPULATION_GROUP_UPDATED: "population.group-updated",
  POPULATION_GROUP_REMOVED: "population.group-removed",
  POPULATION_WORKFORCE_UPDATED: "population.workforce-updated",
  PERSON_CREATED: "person.created",
  PERSON_UPDATED: "person.updated",
  PERSON_DELETED: "person.deleted",
  TERRITORY_CONFIGURED: "territory.configured",
  RELATION_UPDATED: "relation.updated",
  RELATION_REMOVED: "relation.removed",
  AGREEMENT_CREATED: "agreement.created",
  AGREEMENT_UPDATED: "agreement.updated",
  AGREEMENT_STATUS_CHANGED: "agreement.status-changed",
  INTEL_UPDATED: "intel.updated",
  INTEL_REMOVED: "intel.removed",
  INTEL_REVEALED: "intel.revealed",
  SECURITY_CONFIGURED: "security.configured",
  CONDITION_CREATED: "condition.created",
  CONDITION_UPDATED: "condition.updated",
  CONDITION_REMOVED: "condition.removed",
  CONDITION_TOGGLED: "condition.toggled",
  DOMAIN_EVENT_APPLIED: "domain-event.applied",
  HISTORY_ADDED: "history.added",
  HISTORY_REMOVED: "history.removed",
  HISTORY_CLEARED: "history.cleared",
  REQUEST_CREATED: "request.created",
  REQUEST_RESUBMITTED: "request.resubmitted",
  REQUEST_REVIEWED: "request.reviewed",
  REQUEST_MISSION_CREATED: "request.mission-created",
  REQUEST_WITHDRAWN: "request.withdrawn",
  REQUEST_FULFILLED: "request.fulfilled",
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
