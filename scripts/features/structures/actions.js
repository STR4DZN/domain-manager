import { COMMAND_TYPES } from "../../core/constants.js";
import { executeCommandAuthoritatively } from "../../authority/execute.js";

export function createStructureAction(payload = {}) {
  return executeCommandAuthoritatively({ commandType: COMMAND_TYPES.STRUCTURE_CREATE, payload });
}

export function patchStructureAction(payload = {}) {
  return executeCommandAuthoritatively({ commandType: COMMAND_TYPES.STRUCTURE_PATCH, payload });
}

export function updateStructureAdministrationAction(payload = {}) {
  return executeCommandAuthoritatively({ commandType: COMMAND_TYPES.STRUCTURE_ADMIN_UPDATE, payload });
}

export function beginStructureConstructionAction(payload = {}) {
  return executeCommandAuthoritatively({ commandType: COMMAND_TYPES.STRUCTURE_BEGIN_CONSTRUCTION, payload });
}
