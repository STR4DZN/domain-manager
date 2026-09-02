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

function assertGM() {
  if (!game.user.isGM) {
    throw new ModuleError(
      ERROR_CODES.PERMISSION,
      "Persistência oficial deve ser executada por um GM."
    );
  }
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
  const document = await JournalEntry.create({
    name,
    folder: folder?.id ?? null,
    ownership: buildObserverOwnership(controllerIds),
    flags: buildRecordFlags(recordType, data)
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

  const update = {
    [`flags.${MODULE_ID}.schemaVersion`]: SCHEMA_VERSION,
    [`flags.${MODULE_ID}.recordType`]: recordType,
    [`flags.${MODULE_ID}.data`]: normalizeRecordData(
      recordType,
      data
    )
  };

  if (name != null) update.name = name;

  if (controllerIds != null) {
    update.ownership = buildObserverOwnership(controllerIds);
  }

  const document = await record.document.update(update);
  return decodeRecord(document);
}

export async function deleteRecord(uuid) {
  assertGM();
  const record = await getRecord(uuid);
  await record.document.delete();
  return true;
}

