import { EVENT_TYPES, RECORD_TYPES } from "../../core/constants.js";
import { ERROR_CODES, ModuleError } from "../../core/errors.js";
import { recordIndex } from "../../data/record-index.js";
import { updateRecord } from "../../data/journal-store.js";
import { decodeRecord } from "../../models/record-codec.js";
import { isModuleManager } from "../../core/permissions.js";
import {
  normalizeHistoryAddPayload,
  normalizeHistoryClearPayload,
  normalizeHistoryRemovePayload
} from "./contracts.js";
import { buildStructuredHistoryEvent } from "./structured.js";

function resolveDomain(reference) {
  const byEntityId = reference.entityId
    ? recordIndex.getByEntityId(reference.entityId)
    : null;
  const byUuid = reference.uuid
    ? recordIndex.get(RECORD_TYPES.DOMAIN, reference.uuid)
    : null;
  if (byEntityId && byUuid && byEntityId.uuid !== byUuid.uuid) {
    throw new ModuleError(
      ERROR_CODES.CONFLICT,
      "A referência de histórico aponta para Domains diferentes."
    );
  }
  const document = byEntityId ?? byUuid;
  if (!document) throw new ModuleError(ERROR_CODES.NOT_FOUND, "Domain do histórico não encontrado.");
  const domain = decodeRecord(document);
  if (domain.recordType !== RECORD_TYPES.DOMAIN) {
    throw new ModuleError(ERROR_CODES.VALIDATION, "Histórico persistente exige um Domain.");
  }
  return domain;
}

function assertGM(callerUserId) {
  if (!isModuleManager(game.users.get(callerUserId))) {
    throw new ModuleError(
      ERROR_CODES.PERMISSION,
      "Apenas o Mestre ou Assistente do Mestre pode alterar o histórico persistente."
    );
  }
}

function assertRevision(domain, expectedModifiedTime) {
  const current = domain.document?._stats?.modifiedTime ?? null;
  if (expectedModifiedTime !== null && current !== expectedModifiedTime) {
    throw new ModuleError(
      ERROR_CODES.CONFLICT,
      "O Domain mudou enquanto o histórico estava aberto. Recarregue os dados antes de continuar."
    );
  }
}

function findEntry(domain, localId) {
  return (domain.data.history ?? []).find((entry) => entry.localId === localId) ?? null;
}

function persist(domain, data) {
  return updateRecord({
    uuid: domain.uuid,
    recordType: RECORD_TYPES.DOMAIN,
    name: domain.document.name,
    data,
    controllerIds: domain.data.governance?.controllers ?? []
  });
}

function rollback(domain, before) {
  return () => persist(domain, before);
}

export async function executeHistoryAdd({
  payload,
  callerUserId,
  operationId
}) {
  assertGM(callerUserId);
  const normalized = normalizeHistoryAddPayload(payload);
  const domain = resolveDomain(normalized.domain);
  assertRevision(domain, normalized.expectedModifiedTime);

  const before = foundry.utils.deepClone(domain.data);
  const data = foundry.utils.deepClone(domain.data);
  data.history ??= [];
  const entry = buildStructuredHistoryEvent({
    eventType: EVENT_TYPES.HISTORY_ADDED,
    operationId,
    actorUserId: callerUserId,
    entityIds: [domain.data.entityId],
    ...normalized.entry,
    timestamp: normalized.entry.timestamp ?? Date.now()
  });
  data.history.push(entry);
  const updated = await persist(domain, data);
  const saved = findEntry(updated, entry.localId) ?? entry;

  return {
    result: {
      uuid: updated.uuid,
      domainEntityId: updated.data.entityId,
      entry: saved
    },
    entities: [domain.data.entityId],
    events: [{
      type: EVENT_TYPES.HISTORY_ADDED,
      entities: [domain.data.entityId],
      payload: { localId: saved.localId, category: saved.category }
    }],
    rollback: rollback(domain, before)
  };
}

export async function executeHistoryRemove({ payload, callerUserId }) {
  assertGM(callerUserId);
  const normalized = normalizeHistoryRemovePayload(payload);
  const domain = resolveDomain(normalized.domain);
  assertRevision(domain, normalized.expectedModifiedTime);
  const existing = findEntry(domain, normalized.localId);
  if (!existing) {
    throw new ModuleError(
      ERROR_CODES.NOT_FOUND,
      `Registro histórico '${normalized.localId}' não encontrado.`
    );
  }

  const before = foundry.utils.deepClone(domain.data);
  const data = foundry.utils.deepClone(domain.data);
  data.history = (data.history ?? []).filter((entry) => entry.localId !== normalized.localId);
  const updated = await persist(domain, data);

  return {
    result: {
      uuid: updated.uuid,
      domainEntityId: updated.data.entityId,
      localId: normalized.localId,
      removed: true
    },
    entities: [domain.data.entityId],
    events: [{
      type: EVENT_TYPES.HISTORY_REMOVED,
      entities: [domain.data.entityId],
      payload: { localId: normalized.localId }
    }],
    rollback: rollback(domain, before)
  };
}

export async function executeHistoryClear({ payload, callerUserId }) {
  assertGM(callerUserId);
  const normalized = normalizeHistoryClearPayload(payload);
  const domain = resolveDomain(normalized.domain);
  assertRevision(domain, normalized.expectedModifiedTime);

  const before = foundry.utils.deepClone(domain.data);
  const removedCount = (domain.data.history ?? []).length;
  const data = foundry.utils.deepClone(domain.data);
  data.history = [];
  const updated = await persist(domain, data);

  return {
    result: {
      uuid: updated.uuid,
      domainEntityId: updated.data.entityId,
      removedCount
    },
    entities: [domain.data.entityId],
    events: [{
      type: EVENT_TYPES.HISTORY_CLEARED,
      entities: [domain.data.entityId],
      payload: { removedCount }
    }],
    rollback: rollback(domain, before)
  };
}
