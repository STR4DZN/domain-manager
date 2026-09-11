import {
  MODULE_ID,
  SCHEMA_VERSION
} from "../core/constants.js";
import {
  buildRecordFlags,
  decodeRecord,
  isModuleRecord,
  normalizeRecordData
} from "../models/record-codec.js";
import { ModuleError, ERROR_CODES } from "../core/errors.js";
import { ensureDataFolder } from "./folders.js";
import { assertPrimaryActiveGM } from "../authority/primary-gm.js";


function assertEntityIdAvailable(entityId, { excludeUuid = null } = {}) {
  if (!entityId) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      "entityId é obrigatório para registros persistentes."
    );
  }

  const collision = Array.from(globalThis.game?.journal ?? []).find((document) => {
    if (excludeUuid && document.uuid === excludeUuid) return false;
    if (!isModuleRecord(document)) return false;
    return document.getFlag(MODULE_ID, "data")?.entityId === entityId;
  });

  if (collision) {
    throw new ModuleError(
      ERROR_CODES.CONFLICT,
      `entityId '${entityId}' já pertence ao registro ${collision.uuid}.`
    );
  }
}

function assertGM() {
  // A persistência oficial possui uma única autoridade de escrita por mundo.
  // Features legadas que ainda chamam o store diretamente herdam essa proteção.
  assertPrimaryActiveGM();
}

export function buildObserverOwnership(controllerIds = []) {
  const ownership = {
    default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE
  };

  for (const userId of controllerIds) {
    ownership[userId] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
  }

  return ownership;
}

export async function getRecord(uuid) {
  const document = await fromUuid(uuid);

  if (!isModuleRecord(document)) {
    throw new ModuleError(
      ERROR_CODES.NOT_FOUND,
      `Registro do módulo não encontrado: ${uuid}`
    );
  }

  return decodeRecord(document);
}

export function listRecordDocuments(recordType = null) {
  return game.journal.filter((document) => {
    if (!isModuleRecord(document)) return false;
    if (!recordType) return true;

    return document.getFlag(
      MODULE_ID,
      "recordType"
    ) === recordType;
  });
}

export async function createRecord({
  recordType,
  name,
  data,
  controllerIds = []
}) {
  assertGM();

  const folder = await ensureDataFolder();
  const flags = buildRecordFlags(recordType, data);
  assertEntityIdAvailable(flags[MODULE_ID].data.entityId);

  const document = await JournalEntry.create({
    name,
    folder: folder?.id ?? null,
    ownership: buildObserverOwnership(controllerIds),
    flags
  });

  return decodeRecord(document);
}

export async function updateRecord({
  uuid,
  recordType,
  name,
  data,
  controllerIds = null
}) {
  assertGM();

  const record = await getRecord(uuid);

  if (record.recordType !== recordType) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      `Tipo de registro inesperado: ${record.recordType}`
    );
  }

  const normalizedData = normalizeRecordData(recordType, data);
  if (normalizedData.entityId !== record.data.entityId) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      "entityId é imutável após a criação do registro."
    );
  }
  assertEntityIdAvailable(normalizedData.entityId, { excludeUuid: uuid });

  const update = {
    [`flags.${MODULE_ID}.schemaVersion`]: SCHEMA_VERSION,
    [`flags.${MODULE_ID}.recordType`]: recordType,
    [`flags.${MODULE_ID}.data`]: normalizedData
  };

  if (name != null) update.name = name;

  if (controllerIds != null) {
    update.ownership = buildObserverOwnership(controllerIds);
  }

  const document = await record.document.update(update);
  return decodeRecord(document);
}


export async function updateRecordsBatch(updates = []) {
  assertGM();

  if (!Array.isArray(updates) || updates.length === 0) return [];

  const prepared = [];
  const seenUuids = new Set();

  for (const update of updates) {
    const uuid = String(update?.uuid ?? "").trim();
    if (!uuid) {
      throw new ModuleError(ERROR_CODES.VALIDATION, "Batch update exige uuid em todas as entradas.");
    }
    if (seenUuids.has(uuid)) {
      throw new ModuleError(ERROR_CODES.VALIDATION, `Batch update contém uuid duplicado: ${uuid}`);
    }
    seenUuids.add(uuid);

    const record = await getRecord(uuid);
    if (record.recordType !== update.recordType) {
      throw new ModuleError(
        ERROR_CODES.VALIDATION,
        `Tipo de registro inesperado em ${uuid}: ${record.recordType}`
      );
    }

    const normalizedData = normalizeRecordData(update.recordType, update.data);
    if (normalizedData.entityId !== record.data.entityId) {
      throw new ModuleError(
        ERROR_CODES.VALIDATION,
        `entityId é imutável após a criação do registro (${uuid}).`
      );
    }
    assertEntityIdAvailable(normalizedData.entityId, { excludeUuid: uuid });

    const changes = {
      _id: record.document.id,
      [`flags.${MODULE_ID}.schemaVersion`]: SCHEMA_VERSION,
      [`flags.${MODULE_ID}.recordType`]: update.recordType,
      [`flags.${MODULE_ID}.data`]: normalizedData
    };
    if (update.name != null) changes.name = update.name;
    if (update.controllerIds != null) changes.ownership = buildObserverOwnership(update.controllerIds);

    prepared.push({ record, changes });
  }

  // Foundry recebe todas as mutações em uma única operação de coleção, reduzindo
  // drasticamente a janela de estado parcial entre documentos do mesmo mundo.
  const documents = await JournalEntry.updateDocuments(prepared.map((entry) => entry.changes));
  return documents.map((document) => decodeRecord(document));
}

export async function deleteRecord(uuid) {
  assertGM();
  const record = await getRecord(uuid);
  await record.document.delete();
  return true;
}

