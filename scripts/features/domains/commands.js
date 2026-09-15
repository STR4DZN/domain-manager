import {
  COMMAND_TYPES,
  DOMAIN_NATURES,
  DOMAIN_STATES,
  EVENT_TYPES,
  RECORD_TYPES
} from "../../core/constants.js";
import { ERROR_CODES, ModuleError } from "../../core/errors.js";
import {
  createRecord,
  deleteRecord,
  getRecord,
  updateRecord
} from "../../data/journal-store.js";
import { recordIndex } from "../../data/record-index.js";
import { decodeRecord } from "../../models/record-codec.js";
import { normalizeDomainDeletePayload } from "./contracts.js";
import { buildDomainDependencyReport } from "./dependencies.js";
import {
  assertNoSelfReference,
  wouldCreateCycle
} from "./hierarchy.js";
import { normalizeDomainDraft } from "./rules.js";

const STRING_VISUAL_FIELDS = new Set([
  "visuals.bannerImg",
  "visuals.crestImg",
  "visuals.image",
  "visuals.imageFit",
  "visuals.imagePosition",
  "visuals.themeColorHex"
]);

const NUMBER_VISUAL_FIELDS = new Set([
  "visuals.imageHeight",
  "visuals.imagePosX",
  "visuals.imagePosY",
  "visuals.imageZoom"
]);

function assertUserIdsExist(userIds) {
  for (const userId of userIds) {
    if (!game.users.get(userId)) {
      throw new ModuleError(ERROR_CODES.VALIDATION, `Controller inexistente: ${userId}`);
    }
  }
}

async function assertDomainReference(uuid, label) {
  if (!uuid) return;
  const record = await getRecord(uuid);
  if (record.recordType !== RECORD_TYPES.DOMAIN) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      `${label} precisa apontar para outro Domain.`
    );
  }
}

function getAdministrativeParent(uuid) {
  const document = recordIndex.get(RECORD_TYPES.DOMAIN, uuid);
  if (!document) return null;
  return decodeRecord(document).data.hierarchy.administrativeParentUuid ?? null;
}

function getLocatedParent(uuid) {
  const document = recordIndex.get(RECORD_TYPES.DOMAIN, uuid);
  if (!document) return null;
  return decodeRecord(document).data.hierarchy.locatedInUuid ?? null;
}

async function validateHierarchy({
  domainUuid = null,
  locatedInUuid = null,
  administrativeParentUuid = null
}) {
  await assertDomainReference(locatedInUuid, "Localização");
  await assertDomainReference(administrativeParentUuid, "Administração superior");
  if (!domainUuid) return;

  assertNoSelfReference(domainUuid, locatedInUuid, "Localização");
  assertNoSelfReference(domainUuid, administrativeParentUuid, "Administração superior");

  if (wouldCreateCycle({
    domainUuid,
    candidateParentUuid: locatedInUuid,
    getParentUuid: getLocatedParent
  })) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      "Essa localização criaria um ciclo na hierarquia física."
    );
  }

  if (wouldCreateCycle({
    domainUuid,
    candidateParentUuid: administrativeParentUuid,
    getParentUuid: getAdministrativeParent
  })) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      "Essa administração superior criaria um ciclo."
    );
  }
}

function validateEnums({ nature, state }) {
  if (!DOMAIN_NATURES.includes(nature)) {
    throw new ModuleError(ERROR_CODES.VALIDATION, `Nature inválida: ${nature}`);
  }
  if (!DOMAIN_STATES.includes(state)) {
    throw new ModuleError(ERROR_CODES.VALIDATION, `State inválido: ${state}`);
  }
}

function assertExpectedRevision(record, expectedModifiedTime, message) {
  if (expectedModifiedTime == null || expectedModifiedTime === "") return;
  const expected = Number(expectedModifiedTime);
  if (!Number.isFinite(expected)) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      "expectedModifiedTime precisa ser um número válido."
    );
  }
  if ((record.document._stats?.modifiedTime ?? null) !== expected) {
    throw new ModuleError(ERROR_CODES.CONFLICT, message);
  }
}

function applyMediaField(data, fieldPath, value) {
  data.visuals ??= {};

  if (STRING_VISUAL_FIELDS.has(fieldPath)) {
    const key = fieldPath.slice("visuals.".length);
    data.visuals[key] = String(value ?? "").trim();
    return;
  }

  if (NUMBER_VISUAL_FIELDS.has(fieldPath)) {
    const key = fieldPath.slice("visuals.".length);
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      throw new ModuleError(
        ERROR_CODES.VALIDATION,
        `Valor visual inválido para '${fieldPath}'.`
      );
    }
    if (["imagePosX", "imagePosY"].includes(key)) {
      data.visuals[key] = Math.max(0, Math.min(100, numeric));
    } else if (key === "imageZoom") {
      data.visuals[key] = Math.max(25, Math.min(400, numeric));
    } else if (key === "imageHeight") {
      data.visuals[key] = Math.max(80, Math.min(900, numeric));
    }
    return;
  }

  if (fieldPath?.startsWith("population.notables.")) {
    const [, , notableId, property] = fieldPath.split(".");
    if (property !== "portrait") {
      throw new ModuleError(ERROR_CODES.VALIDATION, `Campo de mídia não permitido: '${fieldPath}'.`);
    }
    const notable = data.population?.notables?.find((item) => item.localId === notableId);
    if (!notable) {
      throw new ModuleError(ERROR_CODES.NOT_FOUND, `Pessoa notável '${notableId}' não encontrada.`);
    }
    notable.portrait = String(value ?? "").trim();
    return;
  }

  throw new ModuleError(ERROR_CODES.VALIDATION, `Campo de mídia não permitido: '${fieldPath}'.`);
}

async function createDomainRecord({
  name,
  description = "",
  category = "Base",
  nature = "physical",
  state = "active",
  tags = [],
  controllerIds = [],
  locatedInUuid = null,
  administrativeParentUuid = null,
  managementPreset = "base",
  capabilities = null
}) {
  const cleanName = String(name ?? "").trim();
  if (!cleanName) {
    throw new ModuleError(ERROR_CODES.VALIDATION, "O nome do Domain é obrigatório.");
  }
  validateEnums({ nature, state });
  assertUserIdsExist(controllerIds);
  await validateHierarchy({ locatedInUuid, administrativeParentUuid });

  const data = normalizeDomainDraft({
    description,
    category,
    nature,
    state,
    tags,
    controllers: controllerIds,
    locatedInUuid,
    administrativeParentUuid,
    managementPreset,
    capabilities
  });

  return createRecord({
    recordType: RECORD_TYPES.DOMAIN,
    name: cleanName,
    data,
    controllerIds: data.governance.controllers
  });
}

async function updateDomainRecord({
  domainUuid,
  expectedModifiedTime,
  name,
  description,
  category,
  nature,
  state,
  tags,
  controllerIds,
  locatedInUuid,
  administrativeParentUuid,
  managementPreset = null,
  capabilities = null
}) {
  const record = await getRecord(domainUuid);
  if (record.recordType !== RECORD_TYPES.DOMAIN) {
    throw new ModuleError(ERROR_CODES.VALIDATION, "O registro não é um Domain.");
  }
  assertExpectedRevision(record, expectedModifiedTime, "O Domain mudou enquanto o formulário estava aberto.");

  const cleanName = String(name ?? "").trim();
  if (!cleanName) {
    throw new ModuleError(ERROR_CODES.VALIDATION, "O nome do Domain é obrigatório.");
  }
  validateEnums({ nature, state });
  assertUserIdsExist(controllerIds);
  await validateHierarchy({ domainUuid, locatedInUuid, administrativeParentUuid });

  const data = normalizeDomainDraft({
    description,
    category,
    nature,
    state,
    tags,
    controllers: controllerIds,
    locatedInUuid,
    administrativeParentUuid,
    managementPreset,
    capabilities,
    population: record.data.population,
    economy: record.data.economy,
    existingData: record.data
  });

  return updateRecord({
    uuid: domainUuid,
    recordType: RECORD_TYPES.DOMAIN,
    name: cleanName,
    data,
    controllerIds: data.governance.controllers
  });
}

async function updateDomainMediaRecord({
  domainUuid,
  expectedModifiedTime = null,
  fields = []
}) {
  if (!domainUuid) {
    throw new ModuleError(ERROR_CODES.VALIDATION, "Domínio é obrigatório.");
  }
  const record = await getRecord(domainUuid);
  if (record.recordType !== RECORD_TYPES.DOMAIN) {
    throw new ModuleError(ERROR_CODES.VALIDATION, "O registro não é um Domain.");
  }
  assertExpectedRevision(
    record,
    expectedModifiedTime,
    "O Domain mudou enquanto a edição de aparência estava aberta."
  );

  if (!Array.isArray(fields)) {
    throw new ModuleError(ERROR_CODES.VALIDATION, "fields precisa ser uma lista de campos visuais.");
  }
  const data = foundry.utils.deepClone(record.data);
  for (const field of fields) {
    if (!Array.isArray(field) || field.length < 2) {
      throw new ModuleError(ERROR_CODES.VALIDATION, "Cada campo visual precisa conter caminho e valor.");
    }
    applyMediaField(data, field[0], field[1]);
  }

  return updateRecord({
    uuid: domainUuid,
    recordType: RECORD_TYPES.DOMAIN,
    data
  });
}

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

export async function executeDomainCreate({ payload, callerUserId }) {
  caller(callerUserId);
  const created = await createDomainRecord(payload);
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
  const updated = await updateDomainRecord({
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
  const updated = await updateDomainMediaRecord({
    domainUuid: current.uuid,
    expectedModifiedTime: payload.expectedModifiedTime,
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
