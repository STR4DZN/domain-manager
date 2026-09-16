import { EVENT_TYPES, RECORD_TYPES } from "../../core/constants.js";
import { ERROR_CODES, ModuleError } from "../../core/errors.js";
import { updateRecord } from "../../data/journal-store.js";
import { recordIndex } from "../../data/record-index.js";
import { decodeRecord } from "../../models/record-codec.js";
import { isModuleManager } from "../../core/permissions.js";
import { normalizeConditionCreatePayload, normalizeConditionReferencePayload, normalizeConditionUpdatePayload } from "./contracts.js";
import { addDomainCondition, removeDomainCondition, updateDomainCondition } from "./rules.js";

function resolveDomain(reference) {
  const byId = reference.entityId ? recordIndex.getByEntityId(reference.entityId) : null;
  const byUuid = reference.uuid ? recordIndex.get(RECORD_TYPES.DOMAIN, reference.uuid) : null;
  if (byId && byUuid && byId.uuid !== byUuid.uuid) throw new ModuleError(ERROR_CODES.CONFLICT, "Referência de Condition aponta para Domains diferentes.");
  const document = byId ?? byUuid;
  if (!document) throw new ModuleError(ERROR_CODES.NOT_FOUND, "Domain não encontrado.");
  const record = decodeRecord(document);
  if (record.recordType !== RECORD_TYPES.DOMAIN) throw new ModuleError(ERROR_CODES.VALIDATION, "Condition exige Domain.");
  return record;
}
function assertGM(callerUserId) {
  if (!isModuleManager(game.users.get(callerUserId))) throw new ModuleError(ERROR_CODES.PERMISSION, "Apenas o Mestre ou Assistente do Mestre pode alterar Conditions persistentes.");
}
function assertRevision(domain, expectedModifiedTime) {
  const currentModifiedTime = domain.document._stats?.modifiedTime ?? null;
  if (expectedModifiedTime !== null && currentModifiedTime !== expectedModifiedTime) {
    throw new ModuleError(ERROR_CODES.CONFLICT, "O Domain mudou enquanto a edição de Condições estava aberta.");
  }
}
function find(domain, id) { return (domain.data.conditions ?? []).find((entry) => entry.localId === id) ?? null; }
async function persist(domain, data) {
  return updateRecord({ uuid: domain.uuid, recordType: RECORD_TYPES.DOMAIN, name: domain.document.name, data, controllerIds: domain.data.governance?.controllers ?? [] });
}
function rollback(domain, before) { return () => persist(domain, before); }

export async function executeConditionCreate({ payload, callerUserId }) {
  assertGM(callerUserId); const normalized = normalizeConditionCreatePayload(payload); const domain = resolveDomain(normalized.domain);
  assertRevision(domain, normalized.expectedModifiedTime);
  const before = foundry.utils.deepClone(domain.data);
  const condition = { ...normalized.condition, localId: normalized.condition.localId || foundry.utils.randomID() };
  const updated = await persist(domain, addDomainCondition(foundry.utils.deepClone(domain.data), condition));
  const saved = find(updated, condition.localId);
  return { result: { domainEntityId: domain.data.entityId, condition: saved }, entities: [domain.data.entityId], events: [{ type: EVENT_TYPES.CONDITION_CREATED, entities: [domain.data.entityId], payload: saved }], rollback: rollback(domain, before) };
}
export async function executeConditionUpdate({ payload, callerUserId }) {
  assertGM(callerUserId); const normalized = normalizeConditionUpdatePayload(payload); const domain = resolveDomain(normalized.domain);
  assertRevision(domain, normalized.expectedModifiedTime);
  if (!find(domain, normalized.localId)) throw new ModuleError(ERROR_CODES.NOT_FOUND, `Condição '${normalized.localId}' não encontrada.`);
  const before = foundry.utils.deepClone(domain.data);
  const updated = await persist(domain, updateDomainCondition(foundry.utils.deepClone(domain.data), normalized.localId, normalized.patch));
  const saved = find(updated, normalized.localId);
  return { result: { domainEntityId: domain.data.entityId, condition: saved }, entities: [domain.data.entityId], events: [{ type: EVENT_TYPES.CONDITION_UPDATED, entities: [domain.data.entityId], payload: saved }], rollback: rollback(domain, before) };
}
export async function executeConditionRemove({ payload, callerUserId }) {
  assertGM(callerUserId); const normalized = normalizeConditionReferencePayload(payload); const domain = resolveDomain(normalized.domain);
  assertRevision(domain, normalized.expectedModifiedTime);
  const existing = find(domain, normalized.localId); if (!existing) throw new ModuleError(ERROR_CODES.NOT_FOUND, `Condição '${normalized.localId}' não encontrada.`);
  const before = foundry.utils.deepClone(domain.data);
  await persist(domain, removeDomainCondition(foundry.utils.deepClone(domain.data), normalized.localId));
  return { result: { domainEntityId: domain.data.entityId, localId: normalized.localId, removed: true }, entities: [domain.data.entityId], events: [{ type: EVENT_TYPES.CONDITION_REMOVED, entities: [domain.data.entityId], payload: { localId: normalized.localId } }], rollback: rollback(domain, before) };
}
export async function executeConditionToggle({ payload, callerUserId }) {
  assertGM(callerUserId); const normalized = normalizeConditionReferencePayload(payload); const domain = resolveDomain(normalized.domain);
  assertRevision(domain, normalized.expectedModifiedTime);
  const existing = find(domain, normalized.localId); if (!existing) throw new ModuleError(ERROR_CODES.NOT_FOUND, `Condição '${normalized.localId}' não encontrada.`);
  const before = foundry.utils.deepClone(domain.data);
  const updated = await persist(domain, updateDomainCondition(foundry.utils.deepClone(domain.data), normalized.localId, { active: !existing.active }));
  const saved = find(updated, normalized.localId);
  return { result: { domainEntityId: domain.data.entityId, condition: saved }, entities: [domain.data.entityId], events: [{ type: EVENT_TYPES.CONDITION_TOGGLED, entities: [domain.data.entityId], payload: saved }], rollback: rollback(domain, before) };
}
