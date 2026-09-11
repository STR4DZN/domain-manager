import { RECORD_TYPES, TERRITORY_CONTROL_STATES } from "../../core/constants.js";
import { normalizeEntityReference } from "../../core/entity-contracts.js";
import { ERROR_CODES, ModuleError } from "../../core/errors.js";

function clean(value) { return String(value ?? "").trim(); }
function integer(value, { min = 0, max = 100, label = "Valor" } = {}) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < min || n > max) {
    throw new ModuleError(ERROR_CODES.VALIDATION, `${label} precisa ser inteiro entre ${min} e ${max}.`);
  }
  return n;
}
function optionalDomainRef(value) {
  if (value == null || value === "") return null;
  return normalizeEntityReference(value, { allowedTypes: [RECORD_TYPES.DOMAIN] });
}
function referenceKey(ref) { return ref?.entityId ?? ref?.uuid ?? ""; }

export function normalizeTerritoryConfigurePayload(payload = {}) {
  const domain = normalizeEntityReference(payload.domain, { allowedTypes: [RECORD_TYPES.DOMAIN] });
  const controlState = clean(payload.controlState || "unknown");
  if (!TERRITORY_CONTROL_STATES.includes(controlState)) {
    throw new ModuleError(ERROR_CODES.VALIDATION, `Estado territorial inválido: ${controlState}`);
  }
  const controller = optionalDomainRef(payload.controller);
  const rawInfluence = Array.isArray(payload.influence) ? payload.influence : [];
  const seen = new Set();
  const influence = rawInfluence.map((entry, index) => {
    const ref = normalizeEntityReference(entry.domain, { allowedTypes: [RECORD_TYPES.DOMAIN] });
    const key = referenceKey(ref);
    if (seen.has(key)) throw new ModuleError(ERROR_CODES.VALIDATION, "Influência territorial contém Domain duplicado.");
    seen.add(key);
    return {
      localId: clean(entry.localId) || `inf_${index}_${key.replace(/[^a-z0-9]/gi, "_")}`,
      domain: ref,
      value: integer(entry.value ?? 0, { label: "Influência" }),
      notes: clean(entry.notes)
    };
  });
  return {
    domain,
    controlState,
    controller,
    control: integer(payload.control ?? 0, { label: "Controle" }),
    strategicValue: integer(payload.strategicValue ?? 0, { label: "Valor estratégico" }),
    influence,
    notes: clean(payload.notes)
  };
}

export function territoryConfigureResourceKeys(payload = {}) {
  const normalized = normalizeTerritoryConfigurePayload(payload);
  return [
    `domain:${referenceKey(normalized.domain)}`,
    normalized.controller ? `domain:${referenceKey(normalized.controller)}` : null,
    ...normalized.influence.map((entry) => `domain:${referenceKey(entry.domain)}`)
  ].filter((value, index, all) => value && all.indexOf(value) === index);
}
