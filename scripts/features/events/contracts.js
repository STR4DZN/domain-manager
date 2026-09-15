import { ECONOMY_LIMITS, RECORD_TYPES } from "../../core/constants.js";
import { normalizeEntityReference } from "../../core/entity-contracts.js";
import { ERROR_CODES, ModuleError } from "../../core/errors.js";
import { EVENT_CATEGORIES, EVENT_SEVERITIES } from "./constants.js";

const EVENT_CATEGORY_VALUES = Object.freeze(Object.values(EVENT_CATEGORIES));
const EVENT_SEVERITY_VALUES = Object.freeze(Object.values(EVENT_SEVERITIES));

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
      "expectedModifiedTime é obrigatório ao aplicar um evento de domínio."
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

function normalizeStockBonus(value) {
  if (value == null) return null;
  const amount = Number(value.amount);
  if (
    !Number.isSafeInteger(amount)
    || Math.abs(amount) > ECONOMY_LIMITS.MAX_MINOR_AMOUNT
  ) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      "A alteração de estoque do evento precisa ser um inteiro seguro."
    );
  }

  return {
    amount,
    resourceId: clean(value.resourceId) || null
  };
}

function normalizeCondition(value) {
  if (value == null) return null;
  const name = clean(value.name);
  if (!name) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      "A condição gerada pelo evento exige nome."
    );
  }

  let durationTicks = null;
  if (value.durationTicks != null && value.durationTicks !== "") {
    durationTicks = Number(value.durationTicks);
    if (!Number.isSafeInteger(durationTicks) || durationTicks < 1) {
      throw new ModuleError(
        ERROR_CODES.VALIDATION,
        "A duração da condição do evento precisa ser inteiro >= 1 ou null."
      );
    }
  }

  return {
    name,
    description: clean(value.description),
    durationTicks
  };
}

function normalizeOutcome(value = {}) {
  const label = clean(value.label);
  if (!label) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      "Todo resultado de evento exige um rótulo."
    );
  }

  return {
    id: clean(value.id) || null,
    label,
    description: clean(value.description),
    stockBonus: normalizeStockBonus(value.stockBonus),
    condition: normalizeCondition(value.condition),
    chronicleTitle: clean(value.chronicleTitle) || null
  };
}

function normalizeEvent(value = {}) {
  const title = clean(value.title);
  const category = clean(value.category);
  const severity = clean(value.severity);
  if (!title) {
    throw new ModuleError(ERROR_CODES.VALIDATION, "Evento de domínio exige título.");
  }
  if (!EVENT_CATEGORY_VALUES.includes(category)) {
    throw new ModuleError(ERROR_CODES.VALIDATION, `Categoria de evento inválida: ${category}`);
  }
  if (!EVENT_SEVERITY_VALUES.includes(severity)) {
    throw new ModuleError(ERROR_CODES.VALIDATION, `Severidade de evento inválida: ${severity}`);
  }

  const outcomes = Array.isArray(value.outcomes)
    ? value.outcomes.map((outcome) => normalizeOutcome(outcome))
    : [];
  if (!outcomes.length) {
    throw new ModuleError(ERROR_CODES.VALIDATION, "Evento de domínio exige ao menos um resultado.");
  }

  return {
    id: clean(value.id) || null,
    title,
    category,
    severity,
    description: clean(value.description),
    outcomes
  };
}

export function normalizeDomainEventApplyPayload(payload = {}) {
  const outcomeIndex = Number(payload.outcomeIndex ?? 0);
  if (!Number.isSafeInteger(outcomeIndex) || outcomeIndex < 0) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      "outcomeIndex precisa ser um inteiro não-negativo."
    );
  }
  const event = normalizeEvent(payload.event);
  if (outcomeIndex >= event.outcomes.length) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      `Resultado de evento inexistente no índice ${outcomeIndex}.`
    );
  }

  return {
    domain: domainReference(payload.domain),
    expectedModifiedTime: requiredRevision(payload.expectedModifiedTime),
    event,
    outcomeIndex,
    postToChat: payload.postToChat !== false
  };
}

export function domainEventResourceKeys(payload = {}) {
  const domain = domainReference(payload.domain);
  return [`domain:${domain.entityId ?? domain.uuid}`];
}
