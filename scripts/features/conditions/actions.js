import { COMMAND_TYPES, RECORD_TYPES } from "../../core/constants.js";
import { dispatchAuthoritativeCommand } from "../../commands/execute.js";
import { getRecord } from "../../data/journal-store.js";

function ref(uuid) { return { recordType: RECORD_TYPES.DOMAIN, uuid, entityId: null }; }
function operationId(value = null) { return String(value ?? "").trim() || foundry.utils.randomID(); }
async function run(commandType, domainUuid, payload, requestedOperationId) {
  await dispatchAuthoritativeCommand({ commandType, operationId: operationId(requestedOperationId), payload: { domain: ref(domainUuid), ...payload } }, { callerUserId: game.user.id });
  return getRecord(domainUuid);
}
export function createDomainConditionAction({ domainUuid, expectedModifiedTime, condition, operationId: id = null }) { return run(COMMAND_TYPES.CONDITION_CREATE, domainUuid, { expectedModifiedTime, condition }, id); }
export function updateDomainConditionAction({ domainUuid, expectedModifiedTime, localId, patch, operationId: id = null }) { return run(COMMAND_TYPES.CONDITION_UPDATE, domainUuid, { expectedModifiedTime, localId, patch }, id); }
export function removeDomainConditionAction({ domainUuid, expectedModifiedTime, localId, operationId: id = null }) { return run(COMMAND_TYPES.CONDITION_REMOVE, domainUuid, { expectedModifiedTime, localId }, id); }
export function toggleDomainConditionAction({ domainUuid, expectedModifiedTime, localId, operationId: id = null }) { return run(COMMAND_TYPES.CONDITION_TOGGLE, domainUuid, { expectedModifiedTime, localId }, id); }
