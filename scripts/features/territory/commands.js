import { EVENT_TYPES, RECORD_TYPES } from "../../core/constants.js";
import { ERROR_CODES, ModuleError } from "../../core/errors.js";
import { hasCapability } from "../../core/management-contracts.js";
import { updateRecord } from "../../data/journal-store.js";
import { recordIndex } from "../../data/record-index.js";
import { decodeRecord } from "../../models/record-codec.js";
import { normalizeTerritoryConfigurePayload } from "./contracts.js";

function resolveReference(reference, expectedType) {
  const byEntityId = reference?.entityId ? recordIndex.getByEntityId(reference.entityId) : null;
  const byUuid = reference?.uuid ? recordIndex.get(expectedType, reference.uuid) : null;
  if (byEntityId && byUuid && byEntityId.uuid !== byUuid.uuid) {
    throw new ModuleError(ERROR_CODES.CONFLICT, "A referência aponta para UUID e entityId de entidades diferentes.");
  }
  const document = byEntityId ?? byUuid;
  if (!document) throw new ModuleError(ERROR_CODES.NOT_FOUND, `${expectedType} não encontrado.`);
  const record = decodeRecord(document);
  if (record.recordType !== expectedType) throw new ModuleError(ERROR_CODES.VALIDATION, `Registro não é ${expectedType}.`);
  return record;
}
function assertGM(callerUserId) {
  const actor = game.users.get(callerUserId);
  if (!actor?.isGM) throw new ModuleError(ERROR_CODES.PERMISSION, "Apenas GM pode alterar controle territorial.");
  return actor;
}
function ref(record) { return { recordType: record.recordType, uuid: record.uuid, entityId: record.data.entityId }; }

export async function executeTerritoryConfigure({ payload, callerUserId }) {
  assertGM(callerUserId);
  const normalized = normalizeTerritoryConfigurePayload(payload);
  const domain = resolveReference(normalized.domain, RECORD_TYPES.DOMAIN);
  if (!hasCapability(domain.data, "territory")) {
    throw new ModuleError(ERROR_CODES.VALIDATION, `O Domain '${domain.document.name}' não possui capability territory.`);
  }
  const controller = normalized.controller ? resolveReference(normalized.controller, RECORD_TYPES.DOMAIN) : null;
  const influence = normalized.influence.map((entry) => ({
    ...entry,
    domain: ref(resolveReference(entry.domain, RECORD_TYPES.DOMAIN))
  }));
  const before = foundry.utils.deepClone(domain.data);
  const data = foundry.utils.deepClone(domain.data);
  data.territory = {
    controlState: normalized.controlState,
    controller: controller ? ref(controller) : null,
    control: normalized.control,
    strategicValue: normalized.strategicValue,
    influence,
    notes: normalized.notes
  };
  const updated = await updateRecord({ uuid: domain.uuid, recordType: RECORD_TYPES.DOMAIN, data });
  return {
    result: { domainEntityId: updated.data.entityId, territory: updated.data.territory },
    entities: [updated.data.entityId, controller?.data.entityId, ...influence.map((entry) => entry.domain.entityId)].filter(Boolean),
    events: [{ type: EVENT_TYPES.TERRITORY_CONFIGURED, entities: [updated.data.entityId], payload: { territory: updated.data.territory } }],
    rollback: () => updateRecord({ uuid: domain.uuid, recordType: RECORD_TYPES.DOMAIN, data: before })
  };
}
