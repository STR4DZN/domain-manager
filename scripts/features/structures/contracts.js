import {
  ECONOMY_LIMITS,
  PROJECT_COST_MODES,
  RECORD_TYPES,
  STRUCTURE_STATUSES
} from "../../core/constants.js";
import { normalizeEntityReference } from "../../core/entity-contracts.js";
import { ERROR_CODES, ModuleError } from "../../core/errors.js";

function integer(value, { min = 0, max = Number.MAX_SAFE_INTEGER, label = "Valor" } = {}) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) {
    throw new ModuleError(ERROR_CODES.VALIDATION, `${label} precisa ser um inteiro entre ${min} e ${max}.`);
  }
  return number;
}

function clean(value) {
  return String(value ?? "").trim();
}

function expectedModifiedTime(value) {
  if (value == null || value === "") return null;
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) {
    throw new ModuleError(ERROR_CODES.VALIDATION, "expectedModifiedTime precisa ser um número válido.");
  }
  return normalized;
}

function status(value, fallback = "operational") {
  const normalized = clean(value || fallback);
  if (!STRUCTURE_STATUSES.includes(normalized)) {
    throw new ModuleError(ERROR_CODES.VALIDATION, `Status de Structure inválido: ${normalized}`);
  }
  return normalized;
}

function tags(values = []) {
  if (!Array.isArray(values)) throw new ModuleError(ERROR_CODES.VALIDATION, "tags precisa ser uma lista.");
  const normalized = values.map(clean).filter(Boolean);
  if (new Set(normalized).size !== normalized.length) {
    throw new ModuleError(ERROR_CODES.VALIDATION, "Structure.tags contém valores duplicados.");
  }
  return normalized;
}

export function normalizeStructureResourceEntries(values = [], { label = "Recursos" } = {}) {
  if (!Array.isArray(values)) throw new ModuleError(ERROR_CODES.VALIDATION, `${label} precisa ser uma lista.`);
  const seen = new Set();
  const result = [];

  for (const raw of values) {
    const resourceId = clean(raw?.resourceId);
    if (!resourceId) throw new ModuleError(ERROR_CODES.VALIDATION, `${label}: resourceId é obrigatório.`);
    if (seen.has(resourceId)) throw new ModuleError(ERROR_CODES.VALIDATION, `${label}: recurso duplicado '${resourceId}'.`);
    seen.add(resourceId);
    const amount = integer(raw?.amount, {
      min: 1,
      max: ECONOMY_LIMITS.MAX_MINOR_AMOUNT,
      label: `${label} (${resourceId})`
    });
    result.push({ resourceId, amount });
  }

  return result.sort((a, b) => a.resourceId.localeCompare(b.resourceId));
}

function baseBlueprint(payload = {}, { defaultStatus = "operational" } = {}) {
  const name = clean(payload.name);
  if (!name) throw new ModuleError(ERROR_CODES.VALIDATION, "Nome da Structure é obrigatório.");

  const tier = integer(payload.tier ?? 1, { min: 1, max: 1000, label: "Tier" });
  const maxTier = integer(payload.maxTier ?? tier, { min: 1, max: 1000, label: "Max Tier" });
  if (tier > maxTier) throw new ModuleError(ERROR_CODES.VALIDATION, "Tier não pode exceder Max Tier.");

  return {
    name,
    description: clean(payload.description),
    category: clean(payload.category) || "general",
    tier,
    maxTier,
    status: status(payload.status, defaultStatus),
    condition: integer(payload.condition ?? 100, { min: 0, max: 100, label: "Condição" }),
    capacity: integer(payload.capacity ?? 0, { min: 0, max: ECONOMY_LIMITS.MAX_MINOR_AMOUNT, label: "Capacidade" }),
    maintenancePriority: integer(payload.maintenancePriority ?? 50, { min: 0, max: 100, label: "Prioridade de manutenção" }),
    workforceRequired: integer(payload.workforceRequired ?? 0, { min: 0, max: ECONOMY_LIMITS.MAX_MINOR_AMOUNT, label: "Workforce necessário" }),
    maintenance: normalizeStructureResourceEntries(payload.maintenance ?? [], { label: "Manutenção" }),
    production: normalizeStructureResourceEntries(payload.production ?? [], { label: "Produção" }),
    tags: tags(payload.tags ?? [])
  };
}

export function normalizeStructureCreatePayload(payload = {}) {
  return {
    domain: normalizeEntityReference(payload.domain, { allowedTypes: [RECORD_TYPES.DOMAIN] }),
    ...baseBlueprint(payload, { defaultStatus: "operational" })
  };
}

export function structureCreateResourceKeys(payload = {}) {
  const normalized = normalizeStructureCreatePayload(payload);
  return [normalized.domain.entityId ?? normalized.domain.uuid].filter(Boolean);
}

export function normalizeStructurePatchPayload(payload = {}) {
  const structure = normalizeEntityReference(payload.structure, { allowedTypes: [RECORD_TYPES.STRUCTURE] });
  const patch = payload.patch && typeof payload.patch === "object" ? payload.patch : {};
  const result = {};

  if (patch.description != null) result.description = clean(patch.description);
  if (patch.status != null) {
    const next = status(patch.status);
    if (!["operational", "disabled"].includes(next)) {
      throw new ModuleError(ERROR_CODES.VALIDATION, "Operadores só podem alternar Structure entre operational e disabled.");
    }
    result.status = next;
  }

  if (!Object.keys(result).length) {
    throw new ModuleError(ERROR_CODES.VALIDATION, "Nenhuma alteração operacional foi informada para a Structure.");
  }

  return { structure, expectedModifiedTime: expectedModifiedTime(payload.expectedModifiedTime), patch: result };
}

export function structurePatchResourceKeys(payload = {}) {
  const normalized = normalizeStructurePatchPayload(payload);
  return [normalized.structure.entityId ?? normalized.structure.uuid].filter(Boolean);
}

export function normalizeStructureAdminPayload(payload = {}) {
  return {
    structure: normalizeEntityReference(payload.structure, { allowedTypes: [RECORD_TYPES.STRUCTURE] }),
    expectedModifiedTime: expectedModifiedTime(payload.expectedModifiedTime),
    ...baseBlueprint(payload, { defaultStatus: "operational" }),
    confirmTerminalTransition: payload.confirmTerminalTransition === true
  };
}

export function structureAdminResourceKeys(payload = {}) {
  const normalized = normalizeStructureAdminPayload(payload);
  return [normalized.structure.entityId ?? normalized.structure.uuid].filter(Boolean);
}

function normalizeConstructionCost(raw = {}, index = 0) {
  const resourceId = clean(raw.resourceId);
  if (!resourceId) throw new ModuleError(ERROR_CODES.VALIDATION, `Custo ${index + 1}: resourceId é obrigatório.`);
  const mode = clean(raw.mode || "reserved");
  if (!PROJECT_COST_MODES.includes(mode)) {
    throw new ModuleError(ERROR_CODES.VALIDATION, `Custo ${index + 1}: modo inválido '${mode}'.`);
  }
  const amount = integer(raw.amount, {
    min: 1,
    max: ECONOMY_LIMITS.MAX_MINOR_AMOUNT,
    label: `Custo ${index + 1}`
  });
  return { resourceId, mode, amount };
}

export function normalizeStructureConstructionPayload(payload = {}) {
  const domain = normalizeEntityReference(payload.domain, { allowedTypes: [RECORD_TYPES.DOMAIN] });
  const blueprint = baseBlueprint({ ...payload, status: "planned", condition: 100 }, { defaultStatus: "planned" });
  const project = payload.project && typeof payload.project === "object" ? payload.project : {};
  const costs = Array.isArray(project.costs) ? project.costs.map(normalizeConstructionCost) : [];
  const seen = new Set();
  for (const cost of costs) {
    if (seen.has(cost.resourceId)) {
      throw new ModuleError(ERROR_CODES.VALIDATION, `Projeto de construção possui custo duplicado para '${cost.resourceId}'.`);
    }
    seen.add(cost.resourceId);
  }

  return {
    domain,
    blueprint,
    project: {
      name: clean(project.name) || `Construção // ${blueprint.name}`,
      description: clean(project.description) || `Construção da estrutura ${blueprint.name}.`,
      workRequired: integer(project.workRequired ?? 100, { min: 1, max: ECONOMY_LIMITS.MAX_MINOR_AMOUNT, label: "Trabalho necessário" }),
      rateAmount: integer(project.rateAmount ?? 10, { min: 1, max: ECONOMY_LIMITS.MAX_MINOR_AMOUNT, label: "Taxa de trabalho" }),
      periodTicks: integer(project.periodTicks ?? 1, { min: 1, max: ECONOMY_LIMITS.MAX_PERIOD_TICKS, label: "Período do trabalho" }),
      costs
    }
  };
}

export function structureConstructionResourceKeys(payload = {}) {
  const normalized = normalizeStructureConstructionPayload(payload);
  return [normalized.domain.entityId ?? normalized.domain.uuid].filter(Boolean);
}
