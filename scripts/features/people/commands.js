import { COMMAND_TYPES, EVENT_TYPES, RECORD_TYPES } from "../../core/constants.js";
import { ERROR_CODES, ModuleError } from "../../core/errors.js";
import { hasCapability } from "../../core/management-contracts.js";
import { createRecord, deleteRecord, updateRecord } from "../../data/journal-store.js";
import { recordIndex } from "../../data/record-index.js";
import { decodeRecord } from "../../models/record-codec.js";
import {
  normalizePersonCreatePayload,
  normalizePersonUpdatePayload,
  normalizePopulationConfigurePayload,
  normalizePopulationGroupPayload,
  normalizePopulationGroupRemovePayload,
  normalizePopulationWorkforcePayload
} from "./contracts.js";

function resolveReference(reference, expectedType) {
  const byEntityId = reference?.entityId ? recordIndex.getByEntityId(reference.entityId) : null;
  const byUuid = reference?.uuid ? recordIndex.get(expectedType, reference.uuid) : null;
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

function user(callerUserId) {
  const actor = game.users.get(callerUserId);
  if (!actor) throw new ModuleError(ERROR_CODES.PERMISSION, `Usuário não encontrado: ${callerUserId}`);
  return actor;
}

function controllers(domain) {
  return domain.data?.governance?.controllers ?? [];
}

function assertDomainCapability(domain, callerUserId, capability) {
  const actor = user(callerUserId);
  if (!actor.isGM && !controllers(domain).includes(actor.id)) {
    throw new ModuleError(ERROR_CODES.PERMISSION, `O usuário não controla o Domain '${domain.document.name}'.`);
  }
  if (!hasCapability(domain.data, capability)) {
    throw new ModuleError(ERROR_CODES.VALIDATION, `O Domain '${domain.document.name}' não possui a capability ${capability}.`);
  }
  return actor;
}

function assertRevision(record, expectedModifiedTime, label) {
  if (expectedModifiedTime == null) return;
  if ((record.document?._stats?.modifiedTime ?? null) !== expectedModifiedTime) {
    throw new ModuleError(ERROR_CODES.CONFLICT, `${label} mudou enquanto estava aberto. Recarregue os dados antes de salvar novamente.`);
  }
}

function ref(record) {
  return { recordType: record.recordType, uuid: record.uuid, entityId: record.data.entityId };
}

function referenceMatchesRecord(reference, record) {
  return Boolean(reference && (
    (reference.entityId && reference.entityId === record.data.entityId)
    || (reference.uuid && reference.uuid === record.uuid)
  ));
}

function canonicalOptionalReference(reference, expectedType) {
  if (!reference) return null;
  return ref(resolveReference(reference, expectedType));
}

function populationResult(domain) {
  const population = domain.data.population ?? {};
  const groups = population.groups ?? [];
  const allocations = population.workforce?.allocations ?? [];
  const eligible = groups
    .filter((group) => group.status === "active")
    .reduce((sum, group) => sum + Number(group.workforceEligible ?? 0), 0);
  const assigned = allocations.reduce((sum, entry) => sum + Number(entry.count ?? 0), 0);
  return {
    uuid: domain.uuid,
    entityId: domain.data.entityId,
    total: Number(population.total ?? 0),
    morale: Number(population.morale ?? 60),
    groups: groups.length,
    workforceEligible: eligible,
    workforceAssigned: assigned,
    workforceAvailable: Math.max(0, eligible - assigned)
  };
}

function personResult(record) {
  return {
    uuid: record.uuid,
    entityId: record.data.entityId,
    name: record.document.name,
    status: record.data.status,
    role: record.data.role,
    specialization: record.data.specialization,
    morale: record.data.morale,
    condition: record.data.condition,
    primaryDomainEntityId: record.data.primaryDomain?.entityId ?? null,
    squadEntityId: record.data.squad?.entityId ?? null
  };
}

function validateSquadForDomain(squadReference, domain) {
  if (!squadReference) return null;
  const squad = resolveReference(squadReference, RECORD_TYPES.SQUAD);
  if (!referenceMatchesRecord(squad.data.parentDomain, domain)) {
    throw new ModuleError(ERROR_CODES.CONFLICT, "O Squad selecionado não pertence ao Domain principal da pessoa.");
  }
  return squad;
}

export async function executePopulationConfigure({ payload, callerUserId }) {
  const normalized = normalizePopulationConfigurePayload(payload);
  const domain = resolveReference(normalized.domain, RECORD_TYPES.DOMAIN);
  assertDomainCapability(domain, callerUserId, "population");
  assertRevision(domain, normalized.expectedModifiedTime, "O Domain");

  const before = foundry.utils.deepClone(domain.data);
  const data = foundry.utils.deepClone(domain.data);
  data.population ??= { total: 0, countMode: "direct", morale: 60, groups: [], workforce: { allocations: [] }, notables: [] };
  data.population.total = normalized.total;
  data.population.countMode = normalized.countMode;
  data.population.morale = normalized.morale;

  const updated = await updateRecord({
    uuid: domain.uuid,
    recordType: RECORD_TYPES.DOMAIN,
    name: domain.document.name,
    data,
    controllerIds: controllers(domain)
  });

  return {
    result: populationResult(updated),
    entities: [domain.data.entityId],
    events: [{
      type: EVENT_TYPES.POPULATION_CONFIGURED,
      entities: [domain.data.entityId],
      payload: populationResult(updated)
    }],
    rollback: () => updateRecord({
      uuid: domain.uuid,
      recordType: RECORD_TYPES.DOMAIN,
      name: domain.document.name,
      data: before,
      controllerIds: controllers(domain)
    })
  };
}

export async function executePopulationGroupUpsert({ payload, callerUserId }) {
  const normalized = normalizePopulationGroupPayload(payload);
  const domain = resolveReference(normalized.domain, RECORD_TYPES.DOMAIN);
  assertDomainCapability(domain, callerUserId, "population");
  assertRevision(domain, normalized.expectedModifiedTime, "O Domain");

  const before = foundry.utils.deepClone(domain.data);
  const data = foundry.utils.deepClone(domain.data);
  data.population ??= { total: 0, countMode: "direct", morale: 60, groups: [], workforce: { allocations: [] }, notables: [] };
  data.population.groups ??= [];
  data.population.workforce ??= { allocations: [] };
  data.population.workforce.allocations ??= [];

  const localId = normalized.localId || foundry.utils.randomID();
  const existingIndex = data.population.groups.findIndex((group) => group.localId === localId);
  if (normalized.localId && existingIndex < 0) {
    throw new ModuleError(ERROR_CODES.NOT_FOUND, `Grupo '${normalized.localId}' não encontrado. A edição não pode recriar um grupo removido.`);
  }
  const allocated = data.population.workforce.allocations
    .filter((entry) => entry.groupLocalId === localId)
    .reduce((sum, entry) => sum + Number(entry.count ?? 0), 0);
  if (allocated > normalized.workforceEligible) {
    throw new ModuleError(
      ERROR_CODES.CONFLICT,
      `O grupo possui ${allocated} trabalhadores alocados, acima do novo limite elegível (${normalized.workforceEligible}).`
    );
  }
  if (normalized.status !== "active" && allocated > 0) {
    throw new ModuleError(ERROR_CODES.CONFLICT, "Remova as alocações de workforce antes de desativar este grupo.");
  }

  const entry = { ...normalized, localId };
  delete entry.domain;
  if (existingIndex >= 0) data.population.groups[existingIndex] = entry;
  else data.population.groups.push(entry);

  const updated = await updateRecord({
    uuid: domain.uuid,
    recordType: RECORD_TYPES.DOMAIN,
    name: domain.document.name,
    data,
    controllerIds: controllers(domain)
  });
  const updatedEntry = updated.data.population.groups.find((group) => group.localId === localId);

  return {
    result: { domainEntityId: domain.data.entityId, group: updatedEntry },
    entities: [domain.data.entityId],
    events: [{
      type: EVENT_TYPES.POPULATION_GROUP_UPDATED,
      entities: [domain.data.entityId],
      payload: { domainEntityId: domain.data.entityId, group: updatedEntry }
    }],
    rollback: () => updateRecord({
      uuid: domain.uuid,
      recordType: RECORD_TYPES.DOMAIN,
      name: domain.document.name,
      data: before,
      controllerIds: controllers(domain)
    })
  };
}

export async function executePopulationGroupRemove({ payload, callerUserId }) {
  const normalized = normalizePopulationGroupRemovePayload(payload);
  const domain = resolveReference(normalized.domain, RECORD_TYPES.DOMAIN);
  assertDomainCapability(domain, callerUserId, "population");
  assertRevision(domain, normalized.expectedModifiedTime, "O Domain");

  const existing = domain.data.population?.groups?.find((group) => group.localId === normalized.localId);
  if (!existing) throw new ModuleError(ERROR_CODES.NOT_FOUND, `Grupo '${normalized.localId}' não encontrado.`);
  const allocations = domain.data.population?.workforce?.allocations ?? [];
  if (allocations.some((entry) => entry.groupLocalId === normalized.localId)) {
    throw new ModuleError(ERROR_CODES.CONFLICT, "Remova as alocações de workforce antes de excluir o grupo.");
  }

  const before = foundry.utils.deepClone(domain.data);
  const data = foundry.utils.deepClone(domain.data);
  data.population.groups = data.population.groups.filter((group) => group.localId !== normalized.localId);
  const updated = await updateRecord({
    uuid: domain.uuid,
    recordType: RECORD_TYPES.DOMAIN,
    name: domain.document.name,
    data,
    controllerIds: controllers(domain)
  });

  return {
    result: { domainEntityId: domain.data.entityId, localId: normalized.localId, removed: true },
    entities: [domain.data.entityId],
    events: [{
      type: EVENT_TYPES.POPULATION_GROUP_REMOVED,
      entities: [domain.data.entityId],
      payload: { domainEntityId: domain.data.entityId, localId: normalized.localId }
    }],
    rollback: () => updateRecord({
      uuid: domain.uuid,
      recordType: RECORD_TYPES.DOMAIN,
      name: domain.document.name,
      data: before,
      controllerIds: controllers(domain)
    })
  };
}

export async function executePopulationWorkforceSet({ payload, callerUserId }) {
  const normalized = normalizePopulationWorkforcePayload(payload);
  const domain = resolveReference(normalized.domain, RECORD_TYPES.DOMAIN);
  assertDomainCapability(domain, callerUserId, "population");
  assertRevision(domain, normalized.expectedModifiedTime, "O Domain");

  const groups = new Map((domain.data.population?.groups ?? []).map((group) => [group.localId, group]));
  const pairKeys = new Set();
  const byGroup = new Map();
  const allocations = [];

  for (const raw of normalized.allocations) {
    if (raw.count === 0) continue;
    const group = groups.get(raw.groupLocalId);
    if (!group) throw new ModuleError(ERROR_CODES.NOT_FOUND, `Grupo '${raw.groupLocalId}' não encontrado.`);
    if (group.status !== "active") {
      throw new ModuleError(ERROR_CODES.CONFLICT, `Grupo '${group.name}' não está ativo para alocação de workforce.`);
    }
    const structure = resolveReference(raw.target, RECORD_TYPES.STRUCTURE);
    if (!referenceMatchesRecord(structure.data.domain, domain)) {
      throw new ModuleError(ERROR_CODES.CONFLICT, `Structure '${structure.document.name}' não pertence ao Domain selecionado.`);
    }
    const key = `${raw.groupLocalId}|${structure.data.entityId}`;
    if (pairKeys.has(key)) {
      throw new ModuleError(ERROR_CODES.VALIDATION, "Existe mais de uma alocação para o mesmo grupo e Structure.");
    }
    pairKeys.add(key);
    const total = (byGroup.get(raw.groupLocalId) ?? 0) + raw.count;
    if (total > Number(group.workforceEligible ?? 0)) {
      throw new ModuleError(
        ERROR_CODES.CONFLICT,
        `Workforce alocada (${total}) excede elegíveis (${group.workforceEligible ?? 0}) no grupo '${group.name}'.`
      );
    }
    byGroup.set(raw.groupLocalId, total);
    allocations.push({
      localId: raw.localId || foundry.utils.randomID(),
      groupLocalId: raw.groupLocalId,
      target: ref(structure),
      count: raw.count,
      role: raw.role
    });
  }

  const before = foundry.utils.deepClone(domain.data);
  const data = foundry.utils.deepClone(domain.data);
  data.population ??= { total: 0, countMode: "direct", morale: 60, groups: [], workforce: { allocations: [] }, notables: [] };
  data.population.workforce = { allocations };

  const updated = await updateRecord({
    uuid: domain.uuid,
    recordType: RECORD_TYPES.DOMAIN,
    name: domain.document.name,
    data,
    controllerIds: controllers(domain)
  });

  return {
    result: { domainEntityId: domain.data.entityId, allocations: updated.data.population.workforce.allocations },
    entities: [domain.data.entityId, ...allocations.map((entry) => entry.target.entityId)],
    events: [{
      type: EVENT_TYPES.POPULATION_WORKFORCE_UPDATED,
      entities: [domain.data.entityId, ...allocations.map((entry) => entry.target.entityId)],
      payload: { domainEntityId: domain.data.entityId, allocations: updated.data.population.workforce.allocations }
    }],
    rollback: () => updateRecord({
      uuid: domain.uuid,
      recordType: RECORD_TYPES.DOMAIN,
      name: domain.document.name,
      data: before,
      controllerIds: controllers(domain)
    })
  };
}

export async function executePersonCreate({ payload, callerUserId }) {
  const normalized = normalizePersonCreatePayload(payload);
  const domain = resolveReference(normalized.domain, RECORD_TYPES.DOMAIN);
  assertDomainCapability(domain, callerUserId, "people");
  const squad = validateSquadForDomain(normalized.squad, domain);
  const currentLocation = canonicalOptionalReference(normalized.currentLocation, RECORD_TYPES.DOMAIN) ?? ref(domain);

  const created = await createRecord({
    recordType: RECORD_TYPES.PERSON,
    name: normalized.name,
    controllerIds: controllers(domain),
    data: {
      description: normalized.description,
      portrait: normalized.portrait,
      actorUuid: normalized.actorUuid,
      primaryDomain: ref(domain),
      squad: squad ? ref(squad) : null,
      currentLocation,
      role: normalized.role,
      specialization: normalized.specialization,
      morale: normalized.morale,
      condition: normalized.condition,
      status: normalized.status,
      tags: normalized.tags,
      notes: normalized.notes
    }
  });

  return {
    result: personResult(created),
    entities: [domain.data.entityId, created.data.entityId, squad?.data.entityId].filter(Boolean),
    events: [{
      type: EVENT_TYPES.PERSON_CREATED,
      entities: [domain.data.entityId, created.data.entityId, squad?.data.entityId].filter(Boolean),
      payload: personResult(created)
    }],
    rollback: () => deleteRecord(created.uuid)
  };
}

export async function executePersonUpdate({ payload, callerUserId }) {
  const normalized = normalizePersonUpdatePayload(payload);
  const person = resolveReference(normalized.person, RECORD_TYPES.PERSON);
  assertRevision(person, normalized.expectedModifiedTime, "A Person");
  if (!person.data.primaryDomain) {
    throw new ModuleError(ERROR_CODES.CONFLICT, "Person não possui Domain principal e precisa de reparo administrativo.");
  }
  const domain = resolveReference(person.data.primaryDomain, RECORD_TYPES.DOMAIN);
  assertDomainCapability(domain, callerUserId, "people");
  const squad = validateSquadForDomain(normalized.squad, domain);
  const currentLocation = canonicalOptionalReference(normalized.currentLocation, RECORD_TYPES.DOMAIN);

  const before = foundry.utils.deepClone(person.data);
  const beforeName = person.document.name;
  const data = foundry.utils.deepClone(person.data);
  Object.assign(data, {
    description: normalized.description,
    portrait: normalized.portrait,
    actorUuid: normalized.actorUuid,
    squad: squad ? ref(squad) : null,
    currentLocation,
    role: normalized.role,
    specialization: normalized.specialization,
    morale: normalized.morale,
    condition: normalized.condition,
    status: normalized.status,
    tags: normalized.tags,
    notes: normalized.notes
  });

  const updated = await updateRecord({
    uuid: person.uuid,
    recordType: RECORD_TYPES.PERSON,
    name: normalized.name,
    data,
    controllerIds: controllers(domain)
  });

  return {
    result: personResult(updated),
    entities: [domain.data.entityId, person.data.entityId, squad?.data.entityId].filter(Boolean),
    events: [{
      type: EVENT_TYPES.PERSON_UPDATED,
      entities: [domain.data.entityId, person.data.entityId, squad?.data.entityId].filter(Boolean),
      payload: personResult(updated)
    }],
    rollback: () => updateRecord({
      uuid: person.uuid,
      recordType: RECORD_TYPES.PERSON,
      name: beforeName,
      data: before,
      controllerIds: controllers(domain)
    })
  };
}

export const PEOPLE_COMMAND_TYPES = Object.freeze([
  COMMAND_TYPES.POPULATION_CONFIGURE,
  COMMAND_TYPES.POPULATION_GROUP_UPSERT,
  COMMAND_TYPES.POPULATION_GROUP_REMOVE,
  COMMAND_TYPES.POPULATION_WORKFORCE_SET,
  COMMAND_TYPES.PERSON_CREATE,
  COMMAND_TYPES.PERSON_UPDATE
]);
