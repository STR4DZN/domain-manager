import { COMMAND_TYPES, EVENT_TYPES, RECORD_TYPES } from "../../core/constants.js";
import { ERROR_CODES, ModuleError } from "../../core/errors.js";
import { deleteRecord, updateRecord } from "../../data/journal-store.js";
import { recordIndex } from "../../data/record-index.js";
import { decodeRecord } from "../../models/record-codec.js";
import { createDomainAction, updateDomainAction } from "./actions.js";
import { normalizeDomainDeletePayload } from "./contracts.js";
import { buildDomainDependencyReport } from "./dependencies.js";
import { updateDomainMediaFields } from "./media.js";

function caller(callerUserId) {
  const actor = game.users.get(callerUserId);
  if (!actor?.isGM) {
    throw new ModuleError(
      ERROR_CODES.PERMISSION,
      "Somente GM pode criar ou editar Domains oficiais."
    );
  }
  return actor;
}

function resolveDomain(reference) {
  const byEntityId = reference?.entityId ? recordIndex.getByEntityId(reference.entityId) : null;
  const byUuid = reference?.uuid ? recordIndex.get(RECORD_TYPES.DOMAIN, reference.uuid) : null;
  if (byEntityId && byUuid && byEntityId.uuid !== byUuid.uuid) {
    throw new ModuleError(ERROR_CODES.CONFLICT, "A referência aponta para Domains diferentes.");
  }
  const document = byEntityId ?? byUuid;
  if (!document) throw new ModuleError(ERROR_CODES.NOT_FOUND, "Domain não encontrado.");
  const domain = decodeRecord(document);
  if (domain.recordType !== RECORD_TYPES.DOMAIN) {
    throw new ModuleError(ERROR_CODES.VALIDATION, "A referência não corresponde a um Domain.");
  }
  return domain;
}

function domainResult(domain) {
  return {
    uuid: domain.uuid,
    entityId: domain.data.entityId,
    name: domain.document.name,
    state: domain.data.identity?.state ?? "active",
    preset: domain.data.management?.preset ?? "base"
  };
}

function referenceFor(domain) {
  return {
    recordType: RECORD_TYPES.DOMAIN,
    uuid: domain.uuid,
    entityId: domain.data.entityId
  };
}

export async function executeDomainCreate({ payload, callerUserId }) {
  caller(callerUserId);
  const created = await createDomainAction(payload);
  const result = domainResult(created);

  return {
    result,
    entities: [created.data.entityId],
    events: [{
      type: EVENT_TYPES.DOMAIN_CREATED,
      entities: [created.data.entityId],
      payload: result
    }],
    rollback: () => deleteRecord(created.uuid)
  };
}

export async function executeDomainUpdate({ payload, callerUserId }) {
  caller(callerUserId);
  const current = resolveDomain(payload.domain);
  const beforeData = foundry.utils.deepClone(current.data);
  const beforeName = current.document.name;
  const updated = await updateDomainAction({
    ...payload,
    domainUuid: current.uuid
  });
  const result = domainResult(updated);

  return {
    result,
    entities: [updated.data.entityId],
    events: [{
      type: EVENT_TYPES.DOMAIN_UPDATED,
      entities: [updated.data.entityId],
      payload: result
    }],
    rollback: () => updateRecord({
      uuid: current.uuid,
      recordType: RECORD_TYPES.DOMAIN,
      name: beforeName,
      data: beforeData,
      controllerIds: beforeData.governance?.controllers ?? []
    })
  };
}

export async function executeDomainMediaUpdate({ payload, callerUserId }) {
  caller(callerUserId);
  const current = resolveDomain(payload.domain);
  const beforeData = foundry.utils.deepClone(current.data);
  const updated = await updateDomainMediaFields({
    domainUuid: current.uuid,
    fields: payload.fields
  });
  const result = domainResult(updated);

  return {
    result,
    entities: [updated.data.entityId],
    events: [{
      type: EVENT_TYPES.DOMAIN_MEDIA_UPDATED,
      entities: [updated.data.entityId],
      payload: result
    }],
    rollback: () => updateRecord({
      uuid: current.uuid,
      recordType: RECORD_TYPES.DOMAIN,
      name: current.document.name,
      data: beforeData,
      controllerIds: beforeData.governance?.controllers ?? []
    })
  };
}

function snapshotDocument(document) {
  if (typeof document.toObject === "function") return foundry.utils.deepClone(document.toObject());
  return foundry.utils.deepClone({
    _id: document.id,
    name: document.name,
    folder: document.folder?.id ?? document.folder ?? null,
    ownership: document.ownership ?? {},
    flags: document.flags ?? {}
  });
}

async function restoreDeletedDocument(snapshot) {
  const restored = await JournalEntry.create(snapshot, { keepId: true });
  recordIndex.upsert(restored);
  return restored;
}

export async function executeDomainDelete({ payload, callerUserId }) {
  caller(callerUserId);
  const normalized = normalizeDomainDeletePayload(payload);
  const current = resolveDomain(normalized.domain);
  const currentModifiedTime = current.document._stats?.modifiedTime ?? null;

  if (normalized.expectedModifiedTime != null && currentModifiedTime !== normalized.expectedModifiedTime) {
    throw new ModuleError(ERROR_CODES.CONFLICT, "O Domain mudou enquanto a confirmação de exclusão estava aberta.");
  }
  if (normalized.confirmation !== current.data.entityId) {
    throw new ModuleError(ERROR_CODES.VALIDATION, `Digite '${current.data.entityId}' para confirmar a exclusão.`);
  }

  const dependencies = buildDomainDependencyReport(current);
  if (dependencies.blocked) {
    throw new ModuleError(
      ERROR_CODES.CONFLICT,
      `O Domain possui ${dependencies.total} vinculação(ões) e não pode ser excluído enquanto elas existirem.`
    );
  }

  const snapshot = snapshotDocument(current.document);
  const result = { ...domainResult(current), dependencyCount: 0 };
  await deleteRecord(current.uuid);
  recordIndex.remove(current.uuid);

  return {
    result,
    entities: [current.data.entityId],
    events: [{
      type: EVENT_TYPES.DOMAIN_DELETED,
      entities: [current.data.entityId],
      payload: result
    }],
    rollback: () => restoreDeletedDocument(snapshot)
  };
}

export const DOMAIN_COMMAND_TYPES = Object.freeze([
  COMMAND_TYPES.DOMAIN_CREATE,
  COMMAND_TYPES.DOMAIN_UPDATE,
  COMMAND_TYPES.DOMAIN_MEDIA_UPDATE,
  COMMAND_TYPES.DOMAIN_DELETE
]);
