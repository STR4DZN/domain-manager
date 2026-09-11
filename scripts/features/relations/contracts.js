import { AGREEMENT_STATUSES, RECORD_TYPES } from "../../core/constants.js";
import { normalizeEntityReference } from "../../core/entity-contracts.js";
import { ERROR_CODES, ModuleError } from "../../core/errors.js";
import { DIPLOMATIC_POSTURES } from "./rules.js";

function clean(value) { return String(value ?? "").trim(); }
function integer(value, { min = 0, max = 100, label = "Valor" } = {}) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < min || n > max) {
    throw new ModuleError(ERROR_CODES.VALIDATION, `${label} precisa ser inteiro entre ${min} e ${max}.`);
  }
  return n;
}
function nullableInteger(value, { min = 0, label = "Valor" } = {}) {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < min) throw new ModuleError(ERROR_CODES.VALIDATION, `${label} inválido.`);
  return n;
}
function domainRef(value) { return normalizeEntityReference(value, { allowedTypes: [RECORD_TYPES.DOMAIN] }); }
function agreementRef(value) { return normalizeEntityReference(value, { allowedTypes: [RECORD_TYPES.AGREEMENT] }); }
function referenceKey(ref) { return ref?.entityId ?? ref?.uuid ?? ""; }
function stringList(values) {
  const source = values == null ? [] : (Array.isArray(values) ? values : String(values).split(","));
  const list = source.map(clean).filter(Boolean);
  if (new Set(list).size !== list.length) throw new ModuleError(ERROR_CODES.VALIDATION, "Tags contém valores duplicados.");
  return list;
}

export function normalizeRelationUpsertPayload(payload = {}) {
  const domain = domainRef(payload.domain);
  const target = domainRef(payload.target);
  const posture = clean(payload.posture || "neutral");
  if (!Object.values(DIPLOMATIC_POSTURES).includes(posture)) {
    throw new ModuleError(ERROR_CODES.VALIDATION, `Postura diplomática inválida: ${posture}`);
  }
  return {
    domain,
    localId: clean(payload.localId),
    target,
    posture,
    score: integer(payload.score ?? 0, { min: -100, max: 100, label: "Score diplomático" }),
    trust: integer(payload.trust ?? 50, { label: "Confiança" }),
    tension: integer(payload.tension ?? 0, { label: "Tensão" }),
    notes: clean(payload.notes)
  };
}
export function normalizeRelationRemovePayload(payload = {}) {
  const localId = clean(payload.localId);
  if (!localId) throw new ModuleError(ERROR_CODES.VALIDATION, "localId da relação é obrigatório.");
  return { domain: domainRef(payload.domain), localId };
}

function normalizeTransfer(raw = {}, index = 0) {
  const amount = integer(raw.amount ?? 0, { min: 0, max: Number.MAX_SAFE_INTEGER, label: "Quantidade do acordo" });
  const periodTicks = integer(raw.periodTicks ?? 1, { min: 1, max: 10_000_000, label: "Período do acordo" });
  const carry = integer(raw.carry ?? 0, { min: 0, max: periodTicks - 1, label: "Carry do acordo" });
  const resourceId = clean(raw.resourceId);
  if (!resourceId) throw new ModuleError(ERROR_CODES.VALIDATION, "Transferência exige resourceId.");
  return {
    localId: clean(raw.localId) || `transfer_${index}`,
    resourceId,
    fromDomain: domainRef(raw.fromDomain),
    toDomain: domainRef(raw.toDomain),
    amount,
    periodTicks,
    carry
  };
}
function normalizeAgreementBase(payload = {}) {
  const name = clean(payload.name);
  if (!name) throw new ModuleError(ERROR_CODES.VALIDATION, "Nome do Agreement é obrigatório.");
  const parties = (Array.isArray(payload.parties) ? payload.parties : []).map(domainRef);
  if (parties.length < 2) throw new ModuleError(ERROR_CODES.VALIDATION, "Agreement exige pelo menos dois Domains.");
  const seen = new Set();
  for (const party of parties) {
    const key = referenceKey(party);
    if (seen.has(key)) throw new ModuleError(ERROR_CODES.VALIDATION, "Agreement possui Domain participante duplicado.");
    seen.add(key);
  }
  const status = clean(payload.status || "draft");
  if (!AGREEMENT_STATUSES.includes(status)) throw new ModuleError(ERROR_CODES.VALIDATION, `Status de Agreement inválido: ${status}`);
  const startTick = nullableInteger(payload.startTick, { label: "startTick" });
  const endTick = nullableInteger(payload.endTick, { label: "endTick" });
  if (startTick != null && endTick != null && endTick < startTick) throw new ModuleError(ERROR_CODES.VALIDATION, "endTick não pode ser anterior a startTick.");
  return {
    name,
    description: clean(payload.description),
    parties,
    type: clean(payload.type || "custom") || "custom",
    status,
    startTick,
    endTick,
    transfers: (Array.isArray(payload.transfers) ? payload.transfers : []).map(normalizeTransfer),
    tags: stringList(payload.tags)
  };
}
export function normalizeAgreementCreatePayload(payload = {}) { return normalizeAgreementBase(payload); }
export function normalizeAgreementUpdatePayload(payload = {}) { return { agreement: agreementRef(payload.agreement), ...normalizeAgreementBase(payload) }; }
export function normalizeAgreementStatusPayload(payload = {}) {
  const status = clean(payload.status);
  if (!AGREEMENT_STATUSES.includes(status)) throw new ModuleError(ERROR_CODES.VALIDATION, `Status de Agreement inválido: ${status}`);
  return { agreement: agreementRef(payload.agreement), status };
}

export function relationResourceKeys(payload = {}) {
  const n = normalizeRelationUpsertPayload(payload);
  return [`domain:${referenceKey(n.domain)}`, `domain:${referenceKey(n.target)}`];
}
export function relationRemoveResourceKeys(payload = {}) {
  const n = normalizeRelationRemovePayload(payload); return [`domain:${referenceKey(n.domain)}`];
}
export function agreementCreateResourceKeys(payload = {}) {
  const n = normalizeAgreementCreatePayload(payload); return n.parties.map((p) => `domain:${referenceKey(p)}`);
}
export function agreementUpdateResourceKeys(payload = {}) {
  const n = normalizeAgreementUpdatePayload(payload); return [`agreement:${referenceKey(n.agreement)}`, ...n.parties.map((p) => `domain:${referenceKey(p)}`)];
}
export function agreementStatusResourceKeys(payload = {}) {
  const n = normalizeAgreementStatusPayload(payload); return [`agreement:${referenceKey(n.agreement)}`];
}
