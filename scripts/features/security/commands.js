import { EVENT_TYPES, RECORD_TYPES } from "../../core/constants.js";
import { ERROR_CODES, ModuleError } from "../../core/errors.js";
import { hasCapability } from "../../core/management-contracts.js";
import { updateRecord } from "../../data/journal-store.js";
import { recordIndex } from "../../data/record-index.js";
import { decodeRecord } from "../../models/record-codec.js";
import { normalizeSecurityConfigurePayload } from "./contracts.js";

function resolveDomain(reference) {
  const byEntityId = reference.entityId ? recordIndex.getByEntityId(reference.entityId) : null;
  const byUuid = reference.uuid ? recordIndex.get(RECORD_TYPES.DOMAIN, reference.uuid) : null;
  if (byEntityId && byUuid && byEntityId.uuid !== byUuid.uuid) {
    throw new ModuleError(ERROR_CODES.CONFLICT, "A referência de Defense aponta para Domains diferentes.");
  }
  const document = byEntityId ?? byUuid;
  if (!document) throw new ModuleError(ERROR_CODES.NOT_FOUND, "Domain de Defense não encontrado.");
  const record = decodeRecord(document);
  if (record.recordType !== RECORD_TYPES.DOMAIN) {
    throw new ModuleError(ERROR_CODES.VALIDATION, "O registro de Defense não é um Domain.");
  }
  return record;
}

function assertGM(callerUserId) {
  const caller = game.users.get(callerUserId);
  if (!caller?.isGM) {
    throw new ModuleError(ERROR_CODES.PERMISSION, "Apenas GM pode alterar Defense persistente.");
  }
}

export async function executeSecurityConfigure({ payload, callerUserId }) {
  assertGM(callerUserId);
  const normalized = normalizeSecurityConfigurePayload(payload);
  const domain = resolveDomain(normalized.domain);
  if (!hasCapability(domain.data, "security")) {
    throw new ModuleError(ERROR_CODES.VALIDATION, `O Domain '${domain.document.name}' não possui capability security.`);
  }

  const before = foundry.utils.deepClone(domain.data);
  const data = foundry.utils.deepClone(domain.data);
  data.security = {
    defenseRating: normalized.defenseRating,
    guardCount: normalized.guardCount,
    fortifications: normalized.fortifications
  };

  const updated = await updateRecord({
    uuid: domain.uuid,
    recordType: RECORD_TYPES.DOMAIN,
    name: domain.document.name,
    data,
    controllerIds: domain.data.governance?.controllers ?? []
  });

  return {
    result: {
      uuid: updated.uuid,
      entityId: updated.data.entityId,
      security: updated.data.security
    },
    entities: [updated.data.entityId],
    events: [{
      type: EVENT_TYPES.SECURITY_CONFIGURED,
      entities: [updated.data.entityId],
      payload: { entityId: updated.data.entityId, security: updated.data.security }
    }],
    rollback: () => updateRecord({
      uuid: domain.uuid,
      recordType: RECORD_TYPES.DOMAIN,
      name: domain.document.name,
      data: before,
      controllerIds: domain.data.governance?.controllers ?? []
    })
  };
}
