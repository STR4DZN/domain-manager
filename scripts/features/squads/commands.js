import { EVENT_TYPES, RECORD_TYPES } from "../../core/constants.js";
import { ERROR_CODES, ModuleError } from "../../core/errors.js";
import { hasCapability } from "../../core/management-contracts.js";
import { createRecord, deleteRecord, updateRecord } from "../../data/journal-store.js";
import { recordIndex } from "../../data/record-index.js";
import { decodeRecord } from "../../models/record-codec.js";
import {
  normalizeSquadAdminPayload,
  normalizeSquadCreatePayload,
  normalizeSquadPatchPayload
} from "./contracts.js";

function resolveReference(reference, expectedType) {
  const byEntityId = reference.entityId ? recordIndex.getByEntityId(reference.entityId) : null;
  const byUuid = reference.uuid ? recordIndex.get(expectedType, reference.uuid) : null;

  if (byEntityId && byUuid && byEntityId.uuid !== byUuid.uuid) {
    throw new ModuleError(ERROR_CODES.CONFLICT, "A referência aponta para UUID e entityId de entidades diferentes.");
  }

  const document = byEntityId ?? byUuid;
  if (!document) throw new ModuleError(ERROR_CODES.NOT_FOUND, `${expectedType} não encontrado.`);
  const record = decodeRecord(document);
  if (record.recordType !== expectedType) {
    throw new ModuleError(ERROR_CODES.VALIDATION, `A referência não corresponde a um registro ${expectedType}.`);
  }
  return record;
}

function caller(callerUserId) {
  const user = game.users.get(callerUserId);
  if (!user) throw new ModuleError(ERROR_CODES.PERMISSION, `Usuário não encontrado: ${callerUserId}`);
  return user;
}

function assertCallerGM(callerUserId) {
  const user = caller(callerUserId);
  if (!user.isGM) throw new ModuleError(ERROR_CODES.PERMISSION, "Somente GM pode administrar Squads.");
  return user;
}

function assertControllersExist(controllerIds = []) {
  for (const userId of controllerIds) {
    if (!game.users.get(userId)) {
      throw new ModuleError(ERROR_CODES.VALIDATION, `Controller inexistente: ${userId}`);
    }
  }
}

function controllerIds(record) {
  return record.data?.governance?.controllers ?? [];
}

function squadResult(record) {
  return {
    uuid: record.uuid,
    entityId: record.data.entityId,
    name: record.document.name,
    status: record.data.status,
    strength: record.data.strength,
    capacity: record.data.capacity,
    controllers: [...controllerIds(record)]
  };
}

function assertRevision(record, expectedModifiedTime) {
  if (expectedModifiedTime == null) return;
  if ((record.document?._stats?.modifiedTime ?? null) !== expectedModifiedTime) {
    throw new ModuleError(ERROR_CODES.CONFLICT, "O Squad mudou enquanto o formulário estava aberto.");
  }
}

export async function executeSquadCreate({ payload, callerUserId }) {
  assertCallerGM(callerUserId);
  const normalized = normalizeSquadCreatePayload(payload);
  const parentDomain = resolveReference(normalized.parentDomain, RECORD_TYPES.DOMAIN);
  if (!hasCapability(parentDomain.data, "squads")) {
    throw new ModuleError(ERROR_CODES.VALIDATION, `O Domain '${parentDomain.document.name}' não possui a capability squads.`);
  }
  assertControllersExist(normalized.controllerIds);

  const created = await createRecord({
    recordType: RECORD_TYPES.SQUAD,
    name: normalized.name,
    controllerIds: normalized.controllerIds,
    data: {
      description: normalized.description,
      parentDomain: {
        recordType: RECORD_TYPES.DOMAIN,
        uuid: parentDomain.uuid,
        entityId: parentDomain.data.entityId
      },
      governance: { controllers: normalized.controllerIds },
      status: normalized.status,
      capacity: normalized.capacity,
      strength: normalized.strength,
      morale: normalized.morale,
      condition: normalized.condition,
      composition: [],
      resources: [],
      equipment: [],
      notablePeople: [],
      currentMission: null,
      tags: []
    }
  });

  return {
    result: squadResult(created),
    entities: [parentDomain.data.entityId, created.data.entityId],
    events: [{
      type: EVENT_TYPES.SQUAD_CREATED,
      entities: [parentDomain.data.entityId, created.data.entityId],
      payload: squadResult(created)
    }],
    rollback: async () => deleteRecord(created.uuid)
  };
}

export async function executeSquadPatch({ payload, callerUserId }) {
  const normalized = normalizeSquadPatchPayload(payload);
  const squad = resolveReference(normalized.squad, RECORD_TYPES.SQUAD);
  assertRevision(squad, normalized.expectedModifiedTime);
  const user = caller(callerUserId);
  if (!user.isGM && !controllerIds(squad).includes(user.id)) {
    throw new ModuleError(ERROR_CODES.PERMISSION, "O usuário não controla este Squad.");
  }

  const before = foundry.utils.deepClone(squad.data);
  const data = foundry.utils.deepClone(squad.data);
  Object.assign(data, normalized.patch);
  const updated = await updateRecord({
    uuid: squad.uuid,
    recordType: RECORD_TYPES.SQUAD,
    name: squad.document.name,
    data
  });

  return {
    result: squadResult(updated),
    entities: [squad.data.entityId],
    events: [{
      type: EVENT_TYPES.SQUAD_UPDATED,
      entities: [squad.data.entityId],
      payload: { entityId: squad.data.entityId, patch: normalized.patch }
    }],
    rollback: () => updateRecord({
      uuid: squad.uuid,
      recordType: RECORD_TYPES.SQUAD,
      name: squad.document.name,
      data: before
    })
  };
}

export async function executeSquadAdminUpdate({ payload, callerUserId }) {
  assertCallerGM(callerUserId);
  const normalized = normalizeSquadAdminPayload(payload);
  const squad = resolveReference(normalized.squad, RECORD_TYPES.SQUAD);
  assertRevision(squad, normalized.expectedModifiedTime);
  assertControllersExist(normalized.controllerIds);

  const before = foundry.utils.deepClone(squad.data);
  const beforeName = squad.document.name;
  const beforeControllers = [...controllerIds(squad)];
  const data = foundry.utils.deepClone(squad.data);
  Object.assign(data, normalized.patch);
  data.governance.controllers = [...normalized.controllerIds];

  const updated = await updateRecord({
    uuid: squad.uuid,
    recordType: RECORD_TYPES.SQUAD,
    name: normalized.name,
    data,
    controllerIds: normalized.controllerIds
  });

  return {
    result: squadResult(updated),
    entities: [squad.data.entityId],
    events: [{
      type: EVENT_TYPES.SQUAD_UPDATED,
      entities: [squad.data.entityId],
      payload: squadResult(updated)
    }],
    rollback: () => updateRecord({
      uuid: squad.uuid,
      recordType: RECORD_TYPES.SQUAD,
      name: beforeName,
      data: before,
      controllerIds: beforeControllers
    })
  };
}
