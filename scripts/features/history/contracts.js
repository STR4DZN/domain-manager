import { RECORD_TYPES } from "../../core/constants.js";
import { normalizeEntityReference } from "../../core/entity-contracts.js";
import { ERROR_CODES, ModuleError } from "../../core/errors.js";
import { HISTORY_CATEGORIES, HISTORY_SIGNIFICANCE } from "./rules.js";

const CATEGORY_VALUES = Object.freeze(Object.values(HISTORY_CATEGORIES));
const SIGNIFICANCE_VALUES = Object.freeze(Object.values(HISTORY_SIGNIFICANCE));
const VISIBILITY_VALUES = Object.freeze(["all", "gm_only"]);

function clean(value) {
  return String(value ?? "").trim();
}

function domainReference(value) {
  return normalizeEntityReference(value, { allowedTypes: [RECORD_TYPES.DOMAIN] });
}

function requiredRevision(value) {
  if (value == null || value === "") {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      "expectedModifiedTime é obrigatório ao alterar o histórico."
    );
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      "expectedModifiedTime precisa ser inteiro não-negativo."
    );
  }
  return parsed;
}

function requiredLocalId(value) {
  const localId = clean(value);
  if (!localId) {
    throw new ModuleError(ERROR_CODES.VALIDATION, "Registro histórico exige localId.");
  }
  return localId;
}

function normalizeEntry(value = {}) {
  const title = clean(value.title);
  const category = clean(value.category || HISTORY_CATEGORIES.STORY);
  const significance = clean(value.significance || HISTORY_SIGNIFICANCE.MINOR);
  const visibility = clean(value.visibility || "all");
  if (!title) {
    throw new ModuleError(ERROR_CODES.VALIDATION, "Registro histórico exige título.");
  }
  if (!CATEGORY_VALUES.includes(category)) {
    throw new ModuleError(ERROR_CODES.VALIDATION, `Categoria de histórico inválida: ${category}`);
  }
  if (!SIGNIFICANCE_VALUES.includes(significance)) {
    throw new ModuleError(ERROR_CODES.VALIDATION, `Significância de histórico inválida: ${significance}`);
  }
  if (!VISIBILITY_VALUES.includes(visibility)) {
    throw new ModuleError(ERROR_CODES.VALIDATION, `Visibilidade de histórico inválida: ${visibility}`);
  }

  let tick = null;
  if (value.tick != null && value.tick !== "") {
    tick = Number(value.tick);
    if (!Number.isSafeInteger(tick) || tick < 0) {
      throw new ModuleError(ERROR_CODES.VALIDATION, "tick do histórico precisa ser inteiro não-negativo ou null.");
    }
  }

  return {
    title,
    category,
    summary: clean(value.summary),
    details: clean(value.details),
    significance,
    tick,
    visibility
  };
}

export function normalizeHistoryAddPayload(payload = {}) {
  return {
    domain: domainReference(payload.domain),
    expectedModifiedTime: requiredRevision(payload.expectedModifiedTime),
    entry: normalizeEntry(payload.entry)
  };
}

export function normalizeHistoryRemovePayload(payload = {}) {
  return {
    domain: domainReference(payload.domain),
    expectedModifiedTime: requiredRevision(payload.expectedModifiedTime),
    localId: requiredLocalId(payload.localId)
  };
}

export function normalizeHistoryClearPayload(payload = {}) {
  return {
    domain: domainReference(payload.domain),
    expectedModifiedTime: requiredRevision(payload.expectedModifiedTime)
  };
}

export function historyResourceKeys(payload = {}) {
  const domain = domainReference(payload.domain);
  return [`domain:${domain.entityId ?? domain.uuid}`];
}
