import { EVENT_TYPES, RECORD_TYPES } from "../../core/constants.js";
import { ERROR_CODES, ModuleError } from "../../core/errors.js";
import { getResourceCatalogSetting } from "../../core/settings.js";
import { updateRecord } from "../../data/journal-store.js";
import { recordIndex } from "../../data/record-index.js";
import { decodeRecord } from "../../models/record-codec.js";
import { normalizeEconomyConfigurePayload } from "./contracts.js";

function resolveDomain(reference) {
  const byEntityId = reference.entityId ? recordIndex.getByEntityId(reference.entityId) : null;
  const byUuid = reference.uuid ? recordIndex.get(RECORD_TYPES.DOMAIN, reference.uuid) : null;
  if (byEntityId && byUuid && byEntityId.uuid !== byUuid.uuid) {
    throw new ModuleError(ERROR_CODES.CONFLICT, "A referência econômica aponta para Domains diferentes.");
  }
  const document = byEntityId ?? byUuid;
  if (!document) throw new ModuleError(ERROR_CODES.NOT_FOUND, "Domain econômico não encontrado.");
  const record = decodeRecord(document);
  if (record.recordType !== RECORD_TYPES.DOMAIN) throw new ModuleError(ERROR_CODES.VALIDATION, "O registro econômico não é um Domain.");
  return record;
}

function assertGM(callerUserId) {
  const caller = game.users.get(callerUserId);
  if (!caller?.isGM) throw new ModuleError(ERROR_CODES.PERMISSION, "Somente GM pode alterar política/estoque estratégico diretamente.");
}

export async function executeEconomyConfigure({ payload, callerUserId }) {
  assertGM(callerUserId);
  const catalog = getResourceCatalogSetting();
  const normalized = normalizeEconomyConfigurePayload(payload, catalog);
  const domain = resolveDomain(normalized.domain);
  const before = foundry.utils.deepClone(domain.data);
  const data = foundry.utils.deepClone(domain.data);
  data.economy ??= { stocks: [], flows: [], resourcePolicies: [] };

  if (normalized.stocks) data.economy.stocks = normalized.stocks;
  if (normalized.resourcePolicies) data.economy.resourcePolicies = normalized.resourcePolicies;
  if (normalized.sustenanceSettings) data.economy.sustenanceSettings = normalized.sustenanceSettings;

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
      policies: updated.data.economy?.resourcePolicies ?? []
    },
    entities: [domain.data.entityId],
    events: [{
      type: EVENT_TYPES.ECONOMY_CONFIGURED,
      entities: [domain.data.entityId],
      payload: { entityId: domain.data.entityId }
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
