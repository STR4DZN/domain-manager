import {
  GROUP_STATUSES,
  PERSON_STATUSES,
  POPULATION_COUNT_MODES,
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

function percentage(value, { label = "Percentual", fallback = 60 } = {}) {
  return integer(value ?? fallback, { min: 0, max: 100, label });
}

function revision(value, label = "expectedModifiedTime") {
  if (value == null || value === "") return null;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new ModuleError(ERROR_CODES.VALIDATION, `${label} precisa ser um inteiro não-negativo.`);
  }
  return number;
}

function stringList(values, { label = "Lista" } = {}) {
  if (values == null) return [];
  const source = Array.isArray(values) ? values : String(values).split(",");
  const result = source.map(clean).filter(Boolean);
  if (new Set(result).size !== result.length) {
    throw new ModuleError(ERROR_CODES.VALIDATION, `${label} contém valores duplicados.`);
  }
  return result;
}

function optionalReference(value, allowedTypes) {
  if (value == null || value === "") return null;
  return normalizeEntityReference(value, { allowedTypes });
}

function referenceKey(reference) {
  return reference?.entityId ?? reference?.uuid ?? "";
}

export function normalizePopulationConfigurePayload(payload = {}) {
  const domain = normalizeEntityReference(payload.domain, { allowedTypes: [RECORD_TYPES.DOMAIN] });
  const total = integer(payload.total, { min: 0, label: "População total" });
  const countMode = clean(payload.countMode || "direct");
  if (!POPULATION_COUNT_MODES.includes(countMode)) {
    throw new ModuleError(ERROR_CODES.VALIDATION, `countMode inválido: ${countMode}`);
  }
  return {
    domain,
    expectedModifiedTime: revision(payload.expectedModifiedTime),
    total,
    countMode,
    morale: percentage(payload.morale, { label: "Moral populacional" })
  };
}

export function normalizePopulationGroupPayload(payload = {}) {
  const domain = normalizeEntityReference(payload.domain, { allowedTypes: [RECORD_TYPES.DOMAIN] });
  const name = clean(payload.name);
  if (!name) throw new ModuleError(ERROR_CODES.VALIDATION, "Nome do grupo é obrigatório.");
  const count = integer(payload.count, { min: 0, label: "Quantidade do grupo" });
  const workforceEligible = integer(payload.workforceEligible ?? count, {
    min: 0,
    max: count,
    label: "Mão de obra elegível"
  });
  const status = clean(payload.status || "active");
  if (!GROUP_STATUSES.includes(status)) {
    throw new ModuleError(ERROR_CODES.VALIDATION, `Status de grupo inválido: ${status}`);
  }
  return {
    domain,
    expectedModifiedTime: revision(payload.expectedModifiedTime),
    localId: clean(payload.localId),
    name,
    count,
    includedInTotal: payload.includedInTotal !== false,
    function: clean(payload.function),
    quality: clean(payload.quality),
    status,
    assignment: clean(payload.assignment),
    morale: percentage(payload.morale, { label: "Moral do grupo" }),
    workforceEligible
  };
}

export function normalizePopulationGroupRemovePayload(payload = {}) {
  const domain = normalizeEntityReference(payload.domain, { allowedTypes: [RECORD_TYPES.DOMAIN] });
  const localId = clean(payload.localId);
  if (!localId) throw new ModuleError(ERROR_CODES.VALIDATION, "localId do grupo é obrigatório.");
  return { domain, expectedModifiedTime: revision(payload.expectedModifiedTime), localId };
}

export function normalizeWorkforceAllocation(raw = {}) {
  const groupLocalId = clean(raw.groupLocalId);
  if (!groupLocalId) throw new ModuleError(ERROR_CODES.VALIDATION, "groupLocalId da alocação é obrigatório.");
  return {
    localId: clean(raw.localId),
    groupLocalId,
    target: normalizeEntityReference(raw.target, { allowedTypes: [RECORD_TYPES.STRUCTURE] }),
    count: integer(raw.count, { min: 0, label: "Quantidade alocada" }),
    role: clean(raw.role)
  };
}

export function normalizePopulationWorkforcePayload(payload = {}) {
  const domain = normalizeEntityReference(payload.domain, { allowedTypes: [RECORD_TYPES.DOMAIN] });
  if (!Array.isArray(payload.allocations)) {
    throw new ModuleError(ERROR_CODES.VALIDATION, "allocations precisa ser uma lista.");
  }
  const allocations = payload.allocations.map(normalizeWorkforceAllocation);
  return { domain, expectedModifiedTime: revision(payload.expectedModifiedTime), allocations };
}

function normalizePersonBase(payload = {}) {
  const name = clean(payload.name);
  if (!name) throw new ModuleError(ERROR_CODES.VALIDATION, "Nome da pessoa é obrigatório.");
  const status = clean(payload.status || "active");
  if (!PERSON_STATUSES.includes(status)) {
    throw new ModuleError(ERROR_CODES.VALIDATION, `Status de Person inválido: ${status}`);
  }
  return {
    name,
    description: clean(payload.description),
    portrait: clean(payload.portrait),
    actorUuid: clean(payload.actorUuid) || null,
    role: clean(payload.role),
    specialization: clean(payload.specialization),
    morale: percentage(payload.morale, { label: "Moral da pessoa", fallback: 60 }),
    condition: percentage(payload.condition, { label: "Condição da pessoa", fallback: 100 }),
    status,
    tags: stringList(payload.tags, { label: "Tags" }),
    notes: clean(payload.notes),
    squad: optionalReference(payload.squad, [RECORD_TYPES.SQUAD]),
    currentLocation: optionalReference(payload.currentLocation, [RECORD_TYPES.DOMAIN])
  };
}

export function normalizePersonCreatePayload(payload = {}) {
  return {
    domain: normalizeEntityReference(payload.domain, { allowedTypes: [RECORD_TYPES.DOMAIN] }),
    migrateLegacyLocalId: clean(payload.migrateLegacyLocalId) || null,
    ...normalizePersonBase(payload)
  };
}

export function normalizePersonUpdatePayload(payload = {}) {
  return {
    person: normalizeEntityReference(payload.person, { allowedTypes: [RECORD_TYPES.PERSON] }),
    expectedModifiedTime: revision(payload.expectedModifiedTime),
    ...normalizePersonBase(payload),
    confirmTerminalTransition: payload.confirmTerminalTransition === true
  };
}

export function normalizePersonDeletePayload(payload = {}) {
  return {
    person: normalizeEntityReference(payload.person, { allowedTypes: [RECORD_TYPES.PERSON] }),
    expectedModifiedTime: revision(payload.expectedModifiedTime)
  };
}

export function populationConfigureResourceKeys(payload = {}) {
  const ref = normalizeEntityReference(payload.domain, { allowedTypes: [RECORD_TYPES.DOMAIN] });
  return [`domain:${referenceKey(ref)}`, `population:${referenceKey(ref)}`];
}

export const populationGroupResourceKeys = populationConfigureResourceKeys;

export function populationWorkforceResourceKeys(payload = {}) {
  const normalized = normalizePopulationWorkforcePayload(payload);
  return [
    `domain:${referenceKey(normalized.domain)}`,
    `population:${referenceKey(normalized.domain)}`,
    ...normalized.allocations.map((entry) => `structure:${referenceKey(entry.target)}`)
  ].filter((value, index, all) => value && all.indexOf(value) === index);
}

export function personCreateResourceKeys(payload = {}) {
  const normalized = normalizePersonCreatePayload(payload);
  return [
    `domain:${referenceKey(normalized.domain)}`,
    `people:${referenceKey(normalized.domain)}`,
    normalized.squad ? `squad:${referenceKey(normalized.squad)}` : null
  ].filter(Boolean);
}

export function personUpdateResourceKeys(payload = {}) {
  const normalized = normalizePersonUpdatePayload(payload);
  return [
    `person:${referenceKey(normalized.person)}`,
    normalized.squad ? `squad:${referenceKey(normalized.squad)}` : null,
    normalized.currentLocation ? `domain:${referenceKey(normalized.currentLocation)}` : null
  ].filter(Boolean);
}

export function personDeleteResourceKeys(payload = {}) {
  const normalized = normalizePersonDeletePayload(payload);
  return [`person:${referenceKey(normalized.person)}`];
}
