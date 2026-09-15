import { COMMAND_TYPES } from "../../core/constants.js";
import { executeCommandAuthoritatively } from "../../authority/execute.js";

function command(commandType, payload = {}) {
  const {
    operationId: requestedOperationId = null,
    ...commandPayload
  } = payload ?? {};

  return executeCommandAuthoritatively({
    commandType,
    payload: commandPayload,
    operationId: String(requestedOperationId ?? "").trim() || null
  });
}

/** Compatibility wrapper. Persistence and authority live in structure.create. */
export function createStructureAction(payload = {}) {
  return command(COMMAND_TYPES.STRUCTURE_CREATE, payload);
}

/** Compatibility wrapper. Persistence and authority live in structure.patch. */
export function patchStructureAction(payload = {}) {
  return command(COMMAND_TYPES.STRUCTURE_PATCH, payload);
}

/** Compatibility wrapper. Persistence and authority live in structure.admin-update. */
export function updateStructureAdministrationAction(payload = {}) {
  return command(COMMAND_TYPES.STRUCTURE_ADMIN_UPDATE, payload);
}

/** Compatibility wrapper. Persistence and authority live in structure.begin-construction. */
export function beginStructureConstructionAction(payload = {}) {
  return command(COMMAND_TYPES.STRUCTURE_BEGIN_CONSTRUCTION, payload);
}
