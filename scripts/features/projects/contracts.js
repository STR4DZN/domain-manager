import {
  ECONOMY_LIMITS,
  PROJECT_COST_MODES,
  PROJECT_EDITABLE_STATUSES,
  RECORD_TYPES
} from "../../core/constants.js";
import { normalizeEntityReference } from "../../core/entity-contracts.js";
import { ERROR_CODES, ModuleError } from "../../core/errors.js";

function clean(value) {
  return String(value ?? "").trim();
}

function integer(value, { min = 0, max = Number.MAX_SAFE_INTEGER, label = "Valor" } = {}) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) {
    throw new ModuleError(ERROR_CODES.VALIDATION, `${label} precisa ser um inteiro entre ${min} e ${max}.`);
  }
  return number;
}

function projectStatus(value, { create = false } = {}) {
  const status = clean(value || (create ? "planned" : "active"));
  const allowed = create ? ["planned", "active"] : PROJECT_EDITABLE_STATUSES;
  if (!allowed.includes(status)) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      create
        ? "Project novo precisa iniciar como planned ou active."
        : `Status de Project não pode ser definido manualmente como '${status}'.`
    );
  }
  return status;
}

function normalizeCost(raw = {}, index = 0, { localIdOptional = false } = {}) {
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
  const localId = clean(raw.localId);
  if (!localIdOptional && !localId) {
    throw new ModuleError(ERROR_CODES.VALIDATION, `Custo ${index + 1}: localId é obrigatório.`);
  }
  return { localId: localId || null, resourceId, mode, amount };
}

function assertUniqueCosts(costs = []) {
  const seen = new Set();
  for (const cost of costs) {
    const key = `${cost.resourceId}:${cost.mode}`;
    if (seen.has(key)) {
      throw new ModuleError(ERROR_CODES.VALIDATION, `Project possui custo duplicado '${cost.resourceId}' no modo '${cost.mode}'.`);
    }
    seen.add(key);
  }
}

function domainRef(value) {
  return normalizeEntityReference(value, { allowedTypes: [RECORD_TYPES.DOMAIN] });
}

function projectRef(value) {
  return normalizeEntityReference(value, { allowedTypes: [RECORD_TYPES.PROJECT] });
}

function referenceKey(reference) {
  return reference?.entityId ?? reference?.uuid ?? "unknown";
}

export function normalizeProjectCreatePayload(payload = {}) {
  const name = clean(payload.name);
  if (!name) throw new ModuleError(ERROR_CODES.VALIDATION, "Nome do Project é obrigatório.");
  const status = projectStatus(payload.status, { create: true });
  const costs = (Array.isArray(payload.costs) ? payload.costs : [])
    .map((entry, index) => normalizeCost(entry, index, { localIdOptional: true }));
  assertUniqueCosts(costs);
  return {
    domain: domainRef(payload.domain),
    name,
    description: clean(payload.description),
    status,
    workRequired: integer(payload.workRequired ?? 100, { min: 1, max: ECONOMY_LIMITS.MAX_MINOR_AMOUNT, label: "Trabalho necessário" }),
    rateAmount: integer(payload.rateAmount ?? 10, { min: 1, max: ECONOMY_LIMITS.MAX_MINOR_AMOUNT, label: "Taxa de trabalho" }),
    periodTicks: integer(payload.periodTicks ?? 1, { min: 1, max: ECONOMY_LIMITS.MAX_PERIOD_TICKS, label: "Período do trabalho" }),
    costs
  };
}

export function normalizeProjectUpdatePayload(payload = {}) {
  const name = clean(payload.name);
  if (!name) throw new ModuleError(ERROR_CODES.VALIDATION, "Nome do Project é obrigatório.");
  const status = projectStatus(payload.status);
  const blockedReason = clean(payload.blockedReason);
  if (status === "blocked" && !blockedReason) {
    throw new ModuleError(ERROR_CODES.VALIDATION, "Project bloqueado exige motivo do bloqueio.");
  }
  return {
    domain: domainRef(payload.domain),
    project: projectRef(payload.project),
    expectedModifiedTime: payload.expectedModifiedTime ?? null,
    name,
    description: clean(payload.description),
    status,
    blockedReason: status === "blocked" ? blockedReason : "",
    workRequired: integer(payload.workRequired, { min: 1, max: ECONOMY_LIMITS.MAX_MINOR_AMOUNT, label: "Trabalho necessário" }),
    rateAmount: integer(payload.rateAmount, { min: 1, max: ECONOMY_LIMITS.MAX_MINOR_AMOUNT, label: "Taxa de trabalho" }),
    periodTicks: integer(payload.periodTicks, { min: 1, max: ECONOMY_LIMITS.MAX_PERIOD_TICKS, label: "Período do trabalho" })
  };
}

export function normalizeProjectCostUpsertPayload(payload = {}) {
  return {
    domain: domainRef(payload.domain),
    project: projectRef(payload.project),
    expectedModifiedTime: payload.expectedModifiedTime ?? null,
    cost: normalizeCost(payload.cost ?? payload, 0, { localIdOptional: true })
  };
}

export function normalizeProjectCostRemovePayload(payload = {}) {
  const localId = clean(payload.localId);
  if (!localId) throw new ModuleError(ERROR_CODES.VALIDATION, "localId do custo é obrigatório.");
  return {
    domain: domainRef(payload.domain),
    project: projectRef(payload.project),
    expectedModifiedTime: payload.expectedModifiedTime ?? null,
    localId
  };
}

export function projectCreateResourceKeys(payload = {}) {
  const normalized = normalizeProjectCreatePayload(payload);
  return [`domain:${referenceKey(normalized.domain)}`];
}

export function projectUpdateResourceKeys(payload = {}) {
  const normalized = normalizeProjectUpdatePayload(payload);
  return [
    `domain:${referenceKey(normalized.domain)}`,
    `project:${referenceKey(normalized.project)}`
  ];
}

export function projectCostUpsertResourceKeys(payload = {}) {
  const normalized = normalizeProjectCostUpsertPayload(payload);
  return [
    `domain:${referenceKey(normalized.domain)}`,
    `project:${referenceKey(normalized.project)}`
  ];
}

export function projectCostRemoveResourceKeys(payload = {}) {
  const normalized = normalizeProjectCostRemovePayload(payload);
  return [
    `domain:${referenceKey(normalized.domain)}`,
    `project:${referenceKey(normalized.project)}`
  ];
}
