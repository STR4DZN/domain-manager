import { COMMAND_TYPES } from "../../core/constants.js";
import { executeCommandAuthoritatively } from "../../authority/execute.js";

export function createSquadAction(payload = {}) {
  return executeCommandAuthoritatively({
    commandType: COMMAND_TYPES.SQUAD_CREATE,
    payload
  });
}

export function patchSquadAction(payload = {}) {
  return executeCommandAuthoritatively({
    commandType: COMMAND_TYPES.SQUAD_PATCH,
    payload
  });
}

export function updateSquadAdministrationAction(payload = {}) {
  return executeCommandAuthoritatively({
    commandType: COMMAND_TYPES.SQUAD_ADMIN_UPDATE,
    payload
  });
}
