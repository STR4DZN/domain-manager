import { RECORD_TYPES } from "./constants.js";

const RECORD_TYPE_VALUES = Object.freeze(Object.values(RECORD_TYPES));

export function buildEntityId(recordType, randomPart = null) {
  if (!RECORD_TYPE_VALUES.includes(recordType)) {
    throw new Error(`recordType inválido para entityId: ${recordType}`);
  }

  const generated = randomPart
    ?? globalThis.foundry?.utils?.randomID?.()
    ?? globalThis.crypto?.randomUUID?.().replaceAll("-", "")
    ?? Math.random().toString(36).slice(2);
  const clean = String(generated ?? "").trim();

  if (!clean) throw new Error("Não foi possível gerar entityId.");
  return `${recordType}:${clean}`;
}

export function normalizeEntityId(value, { recordType = null } = {}) {
  const entityId = String(value ?? "").trim();
  if (!entityId) throw new Error("entityId é obrigatório.");

  const separator = entityId.indexOf(":");
  if (separator <= 0 || separator === entityId.length - 1) {
    throw new Error(`entityId inválido: ${entityId}`);
  }

  const prefix = entityId.slice(0, separator);
  if (!RECORD_TYPE_VALUES.includes(prefix)) {
    throw new Error(`Prefixo de entityId desconhecido: ${prefix}`);
  }
  if (recordType && prefix !== recordType) {
    throw new Error(`entityId '${entityId}' não pertence ao tipo '${recordType}'.`);
  }

  return entityId;
}

export function normalizeEntityReference(reference, {
  allowedTypes = null,
  nullable = false
} = {}) {
  if (reference == null) {
    if (nullable) return null;
    throw new Error("Referência de entidade é obrigatória.");
  }

  const recordType = String(reference.recordType ?? "").trim();
  const uuid = reference.uuid == null ? null : String(reference.uuid).trim() || null;
  const entityId = reference.entityId == null
    ? null
    : normalizeEntityId(reference.entityId, { recordType });

  if (!RECORD_TYPE_VALUES.includes(recordType)) {
    throw new Error(`recordType de referência inválido: ${recordType}`);
  }
  if (Array.isArray(allowedTypes) && !allowedTypes.includes(recordType)) {
    throw new Error(`Referência '${recordType}' não é permitida neste campo.`);
  }
  if (!uuid && !entityId) {
    throw new Error("Referência precisa de uuid ou entityId.");
  }

  return { recordType, uuid, entityId };
}

export function entityReferenceKeys(reference) {
  const normalized = normalizeEntityReference(reference);
  const keys = [];
  if (normalized.entityId) keys.push(`id:${normalized.entityId}`);
  if (normalized.uuid) keys.push(`uuid:${normalized.uuid}`);
  return keys;
}

export function assertUniqueEntityReferences(references = []) {
  const seen = new Set();
  for (const raw of references ?? []) {
    for (const key of entityReferenceKeys(raw)) {
      if (seen.has(key)) {
        throw new Error(`Referência duplicada: ${key}`);
      }
      seen.add(key);
    }
  }
  return true;
}
