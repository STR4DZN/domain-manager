import { RECORD_TYPES } from "../../core/constants.js";
import { normalizeEntityReference } from "../../core/entity-contracts.js";
import { ERROR_CODES, ModuleError } from "../../core/errors.js";

function clean(value) {
  return String(value ?? "").trim();
}

function nonNegativeInteger(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new ModuleError(ERROR_CODES.VALIDATION, `${label} precisa ser um inteiro não-negativo.`);
  }
  return number;
}

function normalizeFortifications(values = []) {
  if (!Array.isArray(values)) {
    throw new ModuleError(ERROR_CODES.VALIDATION, "fortifications precisa ser uma lista.");
  }

  const seen = new Set();
  const result = [];
  for (const raw of values) {
    const value = clean(raw);
    if (!value) continue;
    const key = value.toLocaleLowerCase("pt-BR");
    if (seen.has(key)) {
      throw new ModuleError(ERROR_CODES.VALIDATION, `Fortificação duplicada: ${value}`);
    }
    seen.add(key);
    result.push(value);
  }
  return result;
}

export function normalizeSecurityConfigurePayload(payload = {}) {
  return {
    domain: normalizeEntityReference(payload.domain, { allowedTypes: [RECORD_TYPES.DOMAIN] }),
    defenseRating: nonNegativeInteger(payload.defenseRating ?? 0, "Defense rating"),
    guardCount: nonNegativeInteger(payload.guardCount ?? 0, "Guard count"),
    fortifications: normalizeFortifications(payload.fortifications ?? [])
  };
}

export function securityConfigureResourceKeys(payload = {}) {
  const { domain } = normalizeSecurityConfigurePayload(payload);
  const key = domain.entityId ?? domain.uuid;
  return key ? [`domain:${key}`] : ["global"];
}
