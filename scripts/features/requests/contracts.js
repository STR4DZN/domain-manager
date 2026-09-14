import {
  RECORD_TYPES,
  REQUEST_HANDLINGS,
  REQUEST_REVIEW_STATUSES,
  REQUEST_TYPES
} from "../../core/constants.js";
import { ERROR_CODES, ModuleError } from "../../core/errors.js";

function clean(value) {
  return String(value ?? "").trim();
}

function expectedRevision(value) {
  const expectedModifiedTime = value == null || value === "" ? null : Number(value);
  if (expectedModifiedTime !== null && (!Number.isSafeInteger(expectedModifiedTime) || expectedModifiedTime < 0)) {
    throw new ModuleError(ERROR_CODES.VALIDATION, "expectedModifiedTime precisa ser inteiro não-negativo.");
  }
  return expectedModifiedTime;
}

function editableRequestFields(payload = {}) {
  const type = clean(payload.type);
  const customTypeLabel = type === "custom" ? clean(payload.customTypeLabel) : "";
  const intent = clean(payload.intent);
  const title = clean(payload.title);
  const details = clean(payload.details);

  if (!REQUEST_TYPES.includes(type)) {
    throw new ModuleError(ERROR_CODES.VALIDATION, `Tipo de Request inválido: ${type || "(vazio)"}`);
  }
  if (!title) throw new ModuleError(ERROR_CODES.VALIDATION, "O título da solicitação é obrigatório.");
  if (!intent) throw new ModuleError(ERROR_CODES.VALIDATION, "Explique o que deseja conseguir com a solicitação.");
  if (title.length > 160) throw new ModuleError(ERROR_CODES.VALIDATION, "O título não pode exceder 160 caracteres.");
  if (intent.length > 1200) throw new ModuleError(ERROR_CODES.VALIDATION, "A intenção não pode exceder 1200 caracteres.");
  if (details.length > 6000) throw new ModuleError(ERROR_CODES.VALIDATION, "Os detalhes não podem exceder 6000 caracteres.");
  if (customTypeLabel.length > 80) {
    throw new ModuleError(ERROR_CODES.VALIDATION, "O nome do tipo personalizado não pode exceder 80 caracteres.");
  }

  return { type, customTypeLabel, title, intent, details };
}

function normalizeReference(value, expectedType, label) {
  const source = value && typeof value === "object" ? value : {};
  const recordType = clean(source.recordType || expectedType);
  const uuid = clean(source.uuid) || null;
  const entityId = clean(source.entityId) || null;
  if (recordType !== expectedType) {
    throw new ModuleError(ERROR_CODES.VALIDATION, `${label} precisa referenciar '${expectedType}'.`);
  }
  if (!uuid && !entityId) {
    throw new ModuleError(ERROR_CODES.VALIDATION, `${label} exige uuid ou entityId.`);
  }
  return { recordType, uuid, entityId };
}

export function normalizeRequestCreatePayload(payload = {}) {
  return {
    domain: normalizeReference(payload.domain, RECORD_TYPES.DOMAIN, "Domain da Request"),
    ...editableRequestFields(payload)
  };
}

export function normalizeRequestResubmitPayload(payload = {}) {
  return {
    request: normalizeReference(payload.request, RECORD_TYPES.REQUEST, "Request"),
    expectedModifiedTime: expectedRevision(payload.expectedModifiedTime),
    ...editableRequestFields(payload)
  };
}

export function normalizeRequestReviewPayload(payload = {}) {
  const status = clean(payload.status);
  const handling = clean(payload.handling || "none");
  const summary = clean(payload.summary);
  const expectedModifiedTime = expectedRevision(payload.expectedModifiedTime);

  if (!REQUEST_REVIEW_STATUSES.includes(status)) {
    throw new ModuleError(ERROR_CODES.VALIDATION, `Status de revisão inválido: ${status || "(vazio)"}`);
  }
  if (!REQUEST_HANDLINGS.includes(handling)) {
    throw new ModuleError(ERROR_CODES.VALIDATION, `Handling inválido: ${handling || "(vazio)"}`);
  }
  if (handling !== "none" && status !== "approved") {
    throw new ModuleError(ERROR_CODES.VALIDATION, "Handling diferente de 'none' só pode ser preparado em Request aprovado.");
  }
  if (summary.length > 4000) {
    throw new ModuleError(ERROR_CODES.VALIDATION, "A decisão do Mestre não pode exceder 4000 caracteres.");
  }

  return {
    request: normalizeReference(payload.request, RECORD_TYPES.REQUEST, "Request"),
    status,
    summary,
    handling,
    expectedModifiedTime
  };
}

export function requestCreateResourceKeys(payload = {}) {
  const ref = payload.domain ?? {};
  return [`domain:${clean(ref.entityId || ref.uuid) || "unknown"}:requests`];
}

export function requestReviewResourceKeys(payload = {}) {
  const ref = payload.request ?? {};
  return [`request:${clean(ref.entityId || ref.uuid) || "unknown"}`];
}

export function requestResubmitResourceKeys(payload = {}) {
  const ref = payload.request ?? {};
  return [`request:${clean(ref.entityId || ref.uuid) || "unknown"}`];
}

export function normalizeRequestMissionPayload(payload = {}) {
  const expectedModifiedTime = expectedRevision(payload.expectedModifiedTime);
  return {
    request: normalizeReference(payload.request, RECORD_TYPES.REQUEST, "Request"),
    expectedModifiedTime
  };
}

export function requestMissionResourceKeys(payload = {}) {
  const ref = payload.request ?? {};
  return [`request:${clean(ref.entityId || ref.uuid) || "unknown"}`];
}

export function normalizeRequestLifecyclePayload(payload = {}) {
  const expectedModifiedTime = expectedRevision(payload.expectedModifiedTime);
  const summary = clean(payload.summary);
  if (summary.length > 4000) {
    throw new ModuleError(ERROR_CODES.VALIDATION, "O resumo de encerramento não pode exceder 4000 caracteres.");
  }
  return {
    request: normalizeReference(payload.request, RECORD_TYPES.REQUEST, "Request"),
    expectedModifiedTime,
    summary
  };
}

export function requestLifecycleResourceKeys(payload = {}) {
  const ref = payload.request ?? {};
  return [`request:${clean(ref.entityId || ref.uuid) || "unknown"}`];
}
