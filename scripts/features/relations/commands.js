import { EVENT_TYPES, RECORD_TYPES } from "../../core/constants.js";
import { ERROR_CODES, ModuleError } from "../../core/errors.js";
import { hasCapability } from "../../core/management-contracts.js";
import { getResourceCatalogSetting } from "../../core/settings.js";
import { createRecord, updateRecord } from "../../data/journal-store.js";
import { recordIndex } from "../../data/record-index.js";
import { decodeRecord } from "../../models/record-codec.js";
import {
  normalizeAgreementCreatePayload,
  normalizeAgreementStatusPayload,
  normalizeAgreementUpdatePayload,
  normalizeRelationRemovePayload,
  normalizeRelationUpsertPayload
} from "./contracts.js";

function resolve(reference, expectedType) {
  const byId = reference?.entityId ? recordIndex.getByEntityId(reference.entityId) : null;
  const byUuid = reference?.uuid ? recordIndex.get(expectedType, reference.uuid) : null;
  if (byId && byUuid && byId.uuid !== byUuid.uuid) throw new ModuleError(ERROR_CODES.CONFLICT, "A referência aponta para UUID e entityId de entidades diferentes.");
  const doc = byId ?? byUuid;
  if (!doc) throw new ModuleError(ERROR_CODES.NOT_FOUND, `${expectedType} não encontrado.`);
  const record = decodeRecord(doc);
  if (record.recordType !== expectedType) throw new ModuleError(ERROR_CODES.VALIDATION, `Registro não é ${expectedType}.`);
  return record;
}
function ref(record) { return { recordType: record.recordType, uuid: record.uuid, entityId: record.data.entityId }; }
function actor(callerUserId) {
  const u = game.users.get(callerUserId); if (!u) throw new ModuleError(ERROR_CODES.PERMISSION, "Usuário não encontrado."); return u;
}
function assertGM(callerUserId) { const u = actor(callerUserId); if (!u.isGM) throw new ModuleError(ERROR_CODES.PERMISSION, "Apenas GM pode alterar relações e Agreements."); return u; }
function assertDiplomacy(domain) { if (!hasCapability(domain.data, "diplomacy")) throw new ModuleError(ERROR_CODES.VALIDATION, `O Domain '${domain.document.name}' não possui capability diplomacy.`); }
function assertRevision(record, expectedModifiedTime, label) {
  if (expectedModifiedTime == null) return;
  if ((record.document?._stats?.modifiedTime ?? null) !== expectedModifiedTime) throw new ModuleError(ERROR_CODES.CONFLICT, `${label} mudou enquanto estava aberto. Recarregue os dados antes de salvar novamente.`);
}
function controllersFor(records) { return [...new Set(records.flatMap((record) => record.data?.governance?.controllers ?? []))]; }
function catalogIds() { const c=getResourceCatalogSetting(); return new Set((Array.isArray(c)?c:(c?.resources??[])).map((r)=>r.id)); }
function validateTransfers(transfers, parties) {
  const partyKeys = new Set(parties.flatMap((p) => [p.uuid,p.entityId].filter(Boolean)));
  const resources = catalogIds();
  for (const t of transfers) {
    if (!resources.has(t.resourceId)) throw new ModuleError(ERROR_CODES.VALIDATION, `Recurso desconhecido no Agreement: ${t.resourceId}`);
    const from=resolve(t.fromDomain, RECORD_TYPES.DOMAIN); const to=resolve(t.toDomain, RECORD_TYPES.DOMAIN);
    if (from.uuid===to.uuid) throw new ModuleError(ERROR_CODES.VALIDATION, "Transferência não pode ter o mesmo Domain como origem e destino.");
    if (![from.uuid,from.data.entityId].some((k)=>partyKeys.has(k)) || ![to.uuid,to.data.entityId].some((k)=>partyKeys.has(k))) {
      throw new ModuleError(ERROR_CODES.VALIDATION, "Transferência precisa usar Domains participantes do Agreement.");
    }
  }
}

export async function executeRelationUpsert({ payload, callerUserId }) {
  assertGM(callerUserId); const n=normalizeRelationUpsertPayload(payload);
  const domain=resolve(n.domain,RECORD_TYPES.DOMAIN); const target=resolve(n.target,RECORD_TYPES.DOMAIN); assertDiplomacy(domain); assertRevision(domain,n.expectedModifiedTime,"O Domain");
  if (domain.uuid===target.uuid) throw new ModuleError(ERROR_CODES.VALIDATION,"Domain não pode possuir relação diplomática consigo mesmo.");
  const before=foundry.utils.deepClone(domain.data); const data=foundry.utils.deepClone(domain.data); data.relations ??=[];
  let idx=n.localId?data.relations.findIndex((r)=>r.localId===n.localId):data.relations.findIndex((r)=>r.targetDomainUuid===target.uuid || r.target?.entityId===target.data.entityId);
  if(n.localId&&idx<0) throw new ModuleError(ERROR_CODES.NOT_FOUND,"Relação não encontrada. A edição não pode recriar uma relação removida.");
  const localId=idx>=0?data.relations[idx].localId:(n.localId||`rel_${foundry.utils.randomID()}`);
  const entry={ localId, targetDomainUuid:target.uuid, target:ref(target), posture:n.posture, score:n.score, trust:n.trust, tension:n.tension, notes:n.notes };
  if(idx>=0)data.relations[idx]=entry;else data.relations.push(entry);
  const updated=await updateRecord({uuid:domain.uuid,recordType:RECORD_TYPES.DOMAIN,data});
  return { result:{domainEntityId:updated.data.entityId,relation:entry}, entities:[updated.data.entityId,target.data.entityId], events:[{type:EVENT_TYPES.RELATION_UPDATED,entities:[updated.data.entityId,target.data.entityId],payload:entry}], rollback:()=>updateRecord({uuid:domain.uuid,recordType:RECORD_TYPES.DOMAIN,data:before}) };
}
export async function executeRelationRemove({ payload, callerUserId }) {
  assertGM(callerUserId); const n=normalizeRelationRemovePayload(payload); const domain=resolve(n.domain,RECORD_TYPES.DOMAIN); assertDiplomacy(domain); assertRevision(domain,n.expectedModifiedTime,"O Domain");
  const before=foundry.utils.deepClone(domain.data); const data=foundry.utils.deepClone(domain.data); const found=(data.relations??[]).find((r)=>r.localId===n.localId);
  if(!found) throw new ModuleError(ERROR_CODES.NOT_FOUND,"Relação não encontrada."); data.relations=(data.relations??[]).filter((r)=>r.localId!==n.localId);
  const updated=await updateRecord({uuid:domain.uuid,recordType:RECORD_TYPES.DOMAIN,data});
  return { result:{domainEntityId:updated.data.entityId,localId:n.localId}, entities:[updated.data.entityId,found.target?.entityId].filter(Boolean), events:[{type:EVENT_TYPES.RELATION_REMOVED,entities:[updated.data.entityId],payload:{localId:n.localId}}], rollback:()=>updateRecord({uuid:domain.uuid,recordType:RECORD_TYPES.DOMAIN,data:before}) };
}
export async function executeAgreementCreate({ payload, callerUserId }) {
  assertGM(callerUserId); const n=normalizeAgreementCreatePayload(payload); const parties=n.parties.map((p)=>resolve(p,RECORD_TYPES.DOMAIN)); parties.forEach(assertDiplomacy); const refs=parties.map(ref); validateTransfers(n.transfers,refs);
  const transfers=n.transfers.map((t)=>({...t,fromDomain:ref(resolve(t.fromDomain,RECORD_TYPES.DOMAIN)),toDomain:ref(resolve(t.toDomain,RECORD_TYPES.DOMAIN))}));
  const created=await createRecord({recordType:RECORD_TYPES.AGREEMENT,name:n.name,controllerIds:controllersFor(parties),data:{description:n.description,parties:refs,type:n.type,status:n.status,startTick:n.startTick,endTick:n.endTick,transfers,tags:n.tags}});
  return { result:{uuid:created.uuid,entityId:created.data.entityId,name:created.document.name,status:created.data.status}, entities:[created.data.entityId,...parties.map((p)=>p.data.entityId)], events:[{type:EVENT_TYPES.AGREEMENT_CREATED,entities:[created.data.entityId],payload:{name:n.name,status:n.status}}] };
}
export async function executeAgreementUpdate({ payload, callerUserId }) {
  assertGM(callerUserId); const n=normalizeAgreementUpdatePayload(payload); const agreement=resolve(n.agreement,RECORD_TYPES.AGREEMENT); assertRevision(agreement,n.expectedModifiedTime,"O Agreement"); const parties=n.parties.map((p)=>resolve(p,RECORD_TYPES.DOMAIN)); parties.forEach(assertDiplomacy); const refs=parties.map(ref); validateTransfers(n.transfers,refs);
  const before=foundry.utils.deepClone(agreement.data); const beforeName=agreement.document.name; const data={...foundry.utils.deepClone(agreement.data),description:n.description,parties:refs,type:n.type,status:n.status,startTick:n.startTick,endTick:n.endTick,transfers:n.transfers.map((t)=>({...t,fromDomain:ref(resolve(t.fromDomain,RECORD_TYPES.DOMAIN)),toDomain:ref(resolve(t.toDomain,RECORD_TYPES.DOMAIN))})),tags:n.tags};
  const updated=await updateRecord({uuid:agreement.uuid,recordType:RECORD_TYPES.AGREEMENT,name:n.name,data,controllerIds:controllersFor(parties)});
  return { result:{uuid:updated.uuid,entityId:updated.data.entityId,status:updated.data.status},entities:[updated.data.entityId,...parties.map((p)=>p.data.entityId)],events:[{type:EVENT_TYPES.AGREEMENT_UPDATED,entities:[updated.data.entityId],payload:{name:n.name,status:n.status}}],rollback:()=>updateRecord({uuid:agreement.uuid,recordType:RECORD_TYPES.AGREEMENT,name:beforeName,data:before}) };
}
export async function executeAgreementStatus({ payload, callerUserId }) {
  assertGM(callerUserId); const n=normalizeAgreementStatusPayload(payload); const agreement=resolve(n.agreement,RECORD_TYPES.AGREEMENT); assertRevision(agreement,n.expectedModifiedTime,"O Agreement");
  if(agreement.data.status==="terminated"&&n.status!=="terminated") throw new ModuleError(ERROR_CODES.CONFLICT,"Agreement encerrado não pode ser reativado; crie um novo acordo para representar a renegociação.");
  const before=foundry.utils.deepClone(agreement.data); const data={...foundry.utils.deepClone(agreement.data),status:n.status};
  const updated=await updateRecord({uuid:agreement.uuid,recordType:RECORD_TYPES.AGREEMENT,data});
  return { result:{entityId:updated.data.entityId,status:updated.data.status},entities:[updated.data.entityId],events:[{type:EVENT_TYPES.AGREEMENT_STATUS_CHANGED,entities:[updated.data.entityId],payload:{status:n.status}}],rollback:()=>updateRecord({uuid:agreement.uuid,recordType:RECORD_TYPES.AGREEMENT,data:before}) };
}
