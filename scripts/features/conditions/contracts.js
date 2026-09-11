import { RECORD_TYPES } from "../../core/constants.js";
import { normalizeEntityReference } from "../../core/entity-contracts.js";
import { ERROR_CODES, ModuleError } from "../../core/errors.js";

function clean(value) { return String(value ?? "").trim(); }
function domainRef(value) { return normalizeEntityReference(value, { allowedTypes: [RECORD_TYPES.DOMAIN] }); }
function localId(value) {
  const id = clean(value);
  if (!id) throw new ModuleError(ERROR_CODES.VALIDATION, "Condition exige localId.");
  return id;
}
function conditionInput(input = {}, { requireName = true } = {}) {
  const result = {};
  if (requireName || input.name != null) {
    result.name = clean(input.name);
    if (!result.name) throw new ModuleError(ERROR_CODES.VALIDATION, "Nome da condição é obrigatório.");
  }
  if (input.description != null || requireName) result.description = clean(input.description);
  if (input.durationTicks !== undefined) {
    if (input.durationTicks === null || input.durationTicks === "") result.durationTicks = null;
    else {
      const n = Number(input.durationTicks);
      if (!Number.isSafeInteger(n) || n < 1) throw new ModuleError(ERROR_CODES.VALIDATION, "Duração da condição precisa ser inteiro >= 1 ou null.");
      result.durationTicks = n;
    }
  }
  if (input.severity != null || requireName) {
    const severity = clean(input.severity || "minor");
    if (!["minor", "moderate", "severe"].includes(severity)) throw new ModuleError(ERROR_CODES.VALIDATION, `Severity inválida: ${severity}`);
    result.severity = severity;
  }
  if (input.category != null || requireName) {
    const category = clean(input.category || "environmental");
    if (!category) throw new ModuleError(ERROR_CODES.VALIDATION, "Categoria da condição é obrigatória.");
    result.category = category;
  }
  if (input.active != null || requireName) result.active = input.active !== false;
  return result;
}
export function normalizeConditionCreatePayload(payload = {}) {
  return { domain: domainRef(payload.domain), condition: { localId: clean(payload.condition?.localId) || null, ...conditionInput(payload.condition ?? {}, { requireName: true }) } };
}
export function normalizeConditionUpdatePayload(payload = {}) {
  return { domain: domainRef(payload.domain), localId: localId(payload.localId), patch: conditionInput(payload.patch ?? {}, { requireName: false }) };
}
export function normalizeConditionReferencePayload(payload = {}) {
  return { domain: domainRef(payload.domain), localId: localId(payload.localId) };
}
export function conditionResourceKeys(payload = {}) {
  const domain = domainRef(payload.domain);
  return [`domain:${domain.entityId ?? domain.uuid}`];
}
