import { ECONOMY_LIMITS, RECORD_TYPES } from "../../core/constants.js";
import { normalizeEntityReference } from "../../core/entity-contracts.js";
import { ERROR_CODES, ModuleError } from "../../core/errors.js";

function clean(value) { return String(value ?? "").trim(); }

function integer(value, { min = 0, max = ECONOMY_LIMITS.MAX_MINOR_AMOUNT, label = "Valor" } = {}) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) {
    throw new ModuleError(ERROR_CODES.VALIDATION, `${label} precisa ser um inteiro entre ${min} e ${max}.`);
  }
  return number;
}

export function normalizeResourcePolicies(values = [], catalog = { resources: [] }) {
  if (!Array.isArray(values)) throw new ModuleError(ERROR_CODES.VALIDATION, "resourcePolicies precisa ser uma lista.");
  const known = new Set((catalog.resources ?? []).map((resource) => resource.id));
  const seen = new Set();
  const result = [];

  for (const raw of values) {
    const resourceId = clean(raw?.resourceId);
    if (!resourceId || !known.has(resourceId)) {
      throw new ModuleError(ERROR_CODES.VALIDATION, `Política referencia recurso desconhecido: ${resourceId || "(vazio)"}.`);
    }
    if (seen.has(resourceId)) throw new ModuleError(ERROR_CODES.VALIDATION, `Política duplicada para '${resourceId}'.`);
    seen.add(resourceId);

    const criticalFloor = integer(raw?.criticalFloor ?? 0, { label: `Piso crítico (${resourceId})` });
    const reserveTarget = integer(raw?.reserveTarget ?? 0, { label: `Reserva-alvo (${resourceId})` });
    const storageCapacity = integer(raw?.storageCapacity ?? 0, { label: `Capacidade (${resourceId})` });
    if (criticalFloor > reserveTarget) {
      throw new ModuleError(ERROR_CODES.VALIDATION, `Piso crítico de '${resourceId}' não pode exceder a reserva-alvo.`);
    }
    if (storageCapacity > 0 && reserveTarget > storageCapacity) {
      throw new ModuleError(ERROR_CODES.VALIDATION, `Reserva-alvo de '${resourceId}' não pode exceder a capacidade.`);
    }
    result.push({ resourceId, criticalFloor, reserveTarget, storageCapacity });
  }

  return result.sort((a, b) => a.resourceId.localeCompare(b.resourceId));
}

export function normalizeEconomyConfigurePayload(payload = {}, catalog = { resources: [] }) {
  const domain = normalizeEntityReference(payload.domain, { allowedTypes: [RECORD_TYPES.DOMAIN] });
  const result = { domain };

  if (payload.resourcePolicies != null) {
    result.resourcePolicies = normalizeResourcePolicies(payload.resourcePolicies, catalog);
  }

  if (payload.sustenanceSettings != null) {
    const raw = payload.sustenanceSettings;
    result.sustenanceSettings = {
      enabled: raw.enabled !== false,
      foodPer100: Number(raw.foodPer100 ?? 1),
      waterPer100: Number(raw.waterPer100 ?? 1),
      guardUpkeep: Number(raw.guardUpkeep ?? 1)
    };
    for (const [key, value] of Object.entries(result.sustenanceSettings)) {
      if (key === "enabled") continue;
      if (!Number.isFinite(value) || value < 0) {
        throw new ModuleError(ERROR_CODES.VALIDATION, `${key} precisa ser um número não-negativo.`);
      }
    }
  }

  if (payload.stocks != null) {
    if (!Array.isArray(payload.stocks)) throw new ModuleError(ERROR_CODES.VALIDATION, "stocks precisa ser uma lista.");
    const known = new Map((catalog.resources ?? []).map((resource) => [resource.id, resource]));
    const seen = new Set();
    result.stocks = payload.stocks.map((raw) => {
      const resourceId = clean(raw?.resourceId);
      const resource = known.get(resourceId);
      if (!resource) throw new ModuleError(ERROR_CODES.VALIDATION, `Estoque referencia recurso desconhecido: ${resourceId}.`);
      if (seen.has(resourceId)) throw new ModuleError(ERROR_CODES.VALIDATION, `Estoque duplicado para '${resourceId}'.`);
      seen.add(resourceId);
      const amount = Number(raw?.amount ?? 0);
      if (!Number.isSafeInteger(amount) || Math.abs(amount) > ECONOMY_LIMITS.MAX_MINOR_AMOUNT) {
        throw new ModuleError(ERROR_CODES.VALIDATION, `Estoque de '${resourceId}' precisa ser um inteiro seguro.`);
      }
      if (amount < 0 && !resource.allowNegative) {
        throw new ModuleError(ERROR_CODES.VALIDATION, `${resource.name ?? resourceId} não permite estoque negativo.`);
      }
      return { resourceId, amount };
    }).sort((a, b) => a.resourceId.localeCompare(b.resourceId));
  }

  if (!Object.keys(result).some((key) => key !== "domain")) {
    throw new ModuleError(ERROR_CODES.VALIDATION, "Nenhuma configuração econômica foi informada.");
  }
  return result;
}

export function economyConfigureResourceKeys(payload = {}) {
  const reference = normalizeEntityReference(payload.domain, { allowedTypes: [RECORD_TYPES.DOMAIN] });
  return [reference.entityId ?? reference.uuid].filter(Boolean);
}
