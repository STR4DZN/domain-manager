import { RECORD_TYPES } from "../../core/constants.js";
import { normalizeEntityReference } from "../../core/entity-contracts.js";
import { ERROR_CODES, ModuleError } from "../../core/errors.js";

function referenceKey(reference) {
  return reference?.entityId ?? reference?.uuid ?? "";
}

function normalizeDomainReference(value) {
  return normalizeEntityReference(value, { allowedTypes: [RECORD_TYPES.DOMAIN] });
}

export function domainCreateResourceKeys() {
  return ["domains:create"];
}

export function domainUpdateResourceKeys(payload = {}) {
  const domain = normalizeDomainReference(payload.domain);
  return [`domain:${referenceKey(domain)}`];
}

export const domainMediaUpdateResourceKeys = domainUpdateResourceKeys;

export function normalizeDomainDeletePayload(payload = {}) {
  const domain = normalizeDomainReference(payload.domain);
  const confirmation = String(payload.confirmation ?? "").trim();
  const expectedModifiedTime = payload.expectedModifiedTime == null || payload.expectedModifiedTime === ""
    ? null
    : Number(payload.expectedModifiedTime);
  if (!confirmation) throw new ModuleError(ERROR_CODES.VALIDATION, "A confirmação da exclusão é obrigatória.");
  if (expectedModifiedTime != null && !Number.isFinite(expectedModifiedTime)) {
    throw new ModuleError(ERROR_CODES.VALIDATION, "expectedModifiedTime precisa ser um número válido.");
  }
  return { domain, confirmation, expectedModifiedTime, cascade: payload.cascade !== false };
}

export const domainDeleteResourceKeys = domainUpdateResourceKeys;
