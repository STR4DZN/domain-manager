import {
  MODULE_ID,
  RECORD_TYPES,
  SCHEMA_VERSION
} from "../core/constants.js";
import { ModuleError, ERROR_CODES } from "../core/errors.js";
import { DomainModel } from "./domain-model.js";
import { RequestModel } from "./request-model.js";
import { ProjectModel } from "./project-model.js";
import { MissionModel } from "./mission-model.js";

const MODEL_BY_TYPE = Object.freeze({
  [RECORD_TYPES.DOMAIN]: DomainModel,
  [RECORD_TYPES.REQUEST]: RequestModel,
  [RECORD_TYPES.PROJECT]: ProjectModel,
  [RECORD_TYPES.MISSION]: MissionModel
});

function modelFor(recordType) {
  const Model = MODEL_BY_TYPE[recordType];
  if (!Model) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      `recordType desconhecido: ${recordType}`
    );
  }
  return Model;
}

export function normalizeRecordData(recordType, data) {
  const Model = modelFor(recordType);
  const model = new Model(foundry.utils.deepClone(data ?? {}));
  model.validate({ strict: true });
  return model.toObject(true);
}

export function getRecordMeta(document) {
  if (!document || document.documentName !== "JournalEntry") return null;

  const recordType = document.getFlag(MODULE_ID, "recordType");
  if (!recordType) return null;

  return {
    recordType,
    schemaVersion: document.getFlag(MODULE_ID, "schemaVersion"),
    data: document.getFlag(MODULE_ID, "data")
  };
}

export function isModuleRecord(document) {
  return Boolean(getRecordMeta(document));
}

export function decodeRecord(document) {
  const meta = getRecordMeta(document);
  if (!meta) return null;

  if (meta.schemaVersion !== SCHEMA_VERSION) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      `Schema ${meta.schemaVersion} não suportado no T0. Esperado: ${SCHEMA_VERSION}.`
    );
  }

  return {
    document,
    uuid: document.uuid,
    recordType: meta.recordType,
    schemaVersion: meta.schemaVersion,
    data: normalizeRecordData(meta.recordType, meta.data)
  };
}

export function buildRecordFlags(recordType, data) {
  return {
    [MODULE_ID]: {
      recordType,
      schemaVersion: SCHEMA_VERSION,
      data: normalizeRecordData(recordType, data)
    }
  };
}
