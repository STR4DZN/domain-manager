import { COMMAND_TYPES, RECORD_TYPES } from "../../core/constants.js";
import { ERROR_CODES, ModuleError } from "../../core/errors.js";
import { dispatchAuthoritativeCommand } from "../../commands/execute.js";
import { getRecord } from "../../data/journal-store.js";

function assertGM() {
  if (!game.user.isGM) {
    throw new ModuleError(ERROR_CODES.PERMISSION, "Somente GM transforma Request em Mission.");
  }
}

export async function createMissionFromRequestAction({ requestUuid, expectedModifiedTime }) {
  assertGM();
  const request = await getRecord(requestUuid);
  if (request.recordType !== RECORD_TYPES.REQUEST) {
    throw new ModuleError(ERROR_CODES.VALIDATION, "O registro não é uma Request.");
  }

  const result = await dispatchAuthoritativeCommand({
    commandType: COMMAND_TYPES.REQUEST_CREATE_MISSION,
    operationId: foundry.utils.randomID(),
    payload: {
      request: { recordType: RECORD_TYPES.REQUEST, uuid: request.uuid, entityId: request.data.entityId },
      expectedModifiedTime: expectedModifiedTime ?? null
    }
  }, { callerUserId: game.user.id });

  return getRecord(result.uuid);
}
