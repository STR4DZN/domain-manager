import { RECORD_TYPES, SQUAD_STATUSES } from "../../core/constants.js";
import { normalizeEntityReference } from "../../core/entity-contracts.js";
import { ERROR_CODES, ModuleError } from "../../core/errors.js";

function clampInteger(value, { min, max, label }) {
  const number = Math.floor(Number(value));
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new ModuleError(ERROR_CODES.VALIDATION, `${label} precisa estar entre ${min} e ${max}.`);
  }
  return number;
}

function normalizeControllers(controllerIds = []) {
  if (!Array.isArray(controllerIds)) {
    throw new ModuleError(ERROR_CODES.VALIDATION, "controllerIds precisa ser uma lista.");
  }
  return [...new Set(controllerIds.map((id) => String(id ?? "").trim()).filter(Boolean))];
}

function normalizeStatus(status, fallback = "ready") {
  const value = String(status ?? fallback).trim();
  if (!SQUAD_STATUSES.includes(value)) {
    throw new ModuleError(ERROR_CODES.VALIDATION, `Status de Squad inválido: ${value}`);
  }
  return value;
}

export function normalizeSquadCreatePayload(payload = {}) {
  const name = String(payload.name ?? "").trim();
  if (!name) throw new ModuleError(ERROR_CODES.VALIDATION, "Nome do Squad é obrigatório.");

  const capacity = clampInteger(payload.capacity ?? 20, { min: 1, max: 100000, label: "Capacidade" });
  const strength = payload.strength == null
    ? capacity
    : clampInteger(payload.strength, { min: 0, max: capacity, label: "Efetivo" });

  return {
    name,
    parentDomain: normalizeEntityReference(payload.parentDomain, { allowedTypes: [RECORD_TYPES.DOMAIN] }),
    description: String(payload.description ?? "").trim(),
    controllerIds: normalizeControllers(payload.controllerIds),
    capacity,
    strength,
    morale: clampInteger(payload.morale ?? 60, { min: 0, max: 100, label: "Moral" }),
    condition: clampInteger(payload.condition ?? 100, { min: 0, max: 100, label: "Condição" }),
    status: normalizeStatus(payload.status, "ready")
  };
}

export function squadCreateResourceKeys(payload = {}) {
  const normalized = normalizeSquadCreatePayload(payload);
  return [normalized.parentDomain.entityId ?? normalized.parentDomain.uuid].filter(Boolean);
}

export function normalizeSquadPatchPayload(payload = {}) {
  const squad = normalizeEntityReference(payload.squad, { allowedTypes: [RECORD_TYPES.SQUAD] });
  const patch = payload.patch && typeof payload.patch === "object" ? payload.patch : {};
  const result = {};

  if (patch.description != null) result.description = String(patch.description).trim();
  if (patch.status != null) result.status = normalizeStatus(patch.status);
  if (patch.morale != null) result.morale = clampInteger(patch.morale, { min: 0, max: 100, label: "Moral" });
  if (patch.condition != null) result.condition = clampInteger(patch.condition, { min: 0, max: 100, label: "Condição" });

  if (!Object.keys(result).length) {
    throw new ModuleError(ERROR_CODES.VALIDATION, "Nenhuma alteração operacional foi informada para o Squad.");
  }

  return { squad, patch: result };
}

export function squadPatchResourceKeys(payload = {}) {
  const normalized = normalizeSquadPatchPayload(payload);
  return [normalized.squad.entityId ?? normalized.squad.uuid].filter(Boolean);
}

export function normalizeSquadAdminPayload(payload = {}) {
  const squad = normalizeEntityReference(payload.squad, { allowedTypes: [RECORD_TYPES.SQUAD] });
  const name = String(payload.name ?? "").trim();
  if (!name) throw new ModuleError(ERROR_CODES.VALIDATION, "Nome do Squad é obrigatório.");

  const capacity = clampInteger(payload.capacity, { min: 1, max: 100000, label: "Capacidade" });
  const strength = clampInteger(payload.strength, { min: 0, max: capacity, label: "Efetivo" });

  return {
    squad,
    name,
    controllerIds: normalizeControllers(payload.controllerIds),
    patch: {
      description: String(payload.description ?? "").trim(),
      status: normalizeStatus(payload.status),
      capacity,
      strength,
      morale: clampInteger(payload.morale, { min: 0, max: 100, label: "Moral" }),
      condition: clampInteger(payload.condition, { min: 0, max: 100, label: "Condição" })
    }
  };
}

export function squadAdminResourceKeys(payload = {}) {
  const normalized = normalizeSquadAdminPayload(payload);
  return [normalized.squad.entityId ?? normalized.squad.uuid].filter(Boolean);
}
