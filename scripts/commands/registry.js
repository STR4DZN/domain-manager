import { COMMAND_TYPES } from "../core/constants.js";
import {
  executeResourceTransfer,
  transferResourceKeys
} from "../features/economy/transfers.js";
import {
  executeSquadAdminUpdate,
  executeSquadCreate,
  executeSquadPatch
} from "../features/squads/commands.js";
import {
  executeMissionCreate,
  executeMissionLaunch,
  executeMissionPrepare,
  executeMissionRelease,
  executeMissionResolve
} from "../features/missions/commands.js";
import {
  missionCreateResourceKeys,
  missionPrepareResourceKeys,
  missionReferenceResourceKeys,
  missionReleaseResourceKeys,
  missionResolveResourceKeys
} from "../features/missions/contracts.js";
import {
  squadAdminResourceKeys,
  squadCreateResourceKeys,
  squadPatchResourceKeys
} from "../features/squads/contracts.js";
import {
  executeStructureAdminUpdate,
  executeStructureBeginConstruction,
  executeStructureCreate,
  executeStructurePatch
} from "../features/structures/commands.js";
import {
  structureAdminResourceKeys,
  structureConstructionResourceKeys,
  structureCreateResourceKeys,
  structurePatchResourceKeys
} from "../features/structures/contracts.js";

const COMMAND_REGISTRY = Object.freeze({
  [COMMAND_TYPES.TRANSFER_RESOURCES]: Object.freeze({
    resourceKeys: transferResourceKeys,
    execute: executeResourceTransfer
  }),
  [COMMAND_TYPES.SQUAD_CREATE]: Object.freeze({
    resourceKeys: squadCreateResourceKeys,
    execute: executeSquadCreate
  }),
  [COMMAND_TYPES.SQUAD_PATCH]: Object.freeze({
    resourceKeys: squadPatchResourceKeys,
    execute: executeSquadPatch
  }),
  [COMMAND_TYPES.SQUAD_ADMIN_UPDATE]: Object.freeze({
    resourceKeys: squadAdminResourceKeys,
    execute: executeSquadAdminUpdate
  }),
  [COMMAND_TYPES.MISSION_CREATE]: Object.freeze({
    resourceKeys: missionCreateResourceKeys,
    execute: executeMissionCreate
  }),
  [COMMAND_TYPES.MISSION_PREPARE]: Object.freeze({
    resourceKeys: missionPrepareResourceKeys,
    execute: executeMissionPrepare
  }),
  [COMMAND_TYPES.MISSION_RELEASE]: Object.freeze({
    resourceKeys: missionReleaseResourceKeys,
    execute: executeMissionRelease
  }),
  [COMMAND_TYPES.MISSION_LAUNCH]: Object.freeze({
    resourceKeys: missionReferenceResourceKeys,
    execute: executeMissionLaunch
  }),
  [COMMAND_TYPES.MISSION_RESOLVE]: Object.freeze({
    resourceKeys: missionResolveResourceKeys,
    execute: executeMissionResolve
  }),
  [COMMAND_TYPES.STRUCTURE_CREATE]: Object.freeze({
    resourceKeys: structureCreateResourceKeys,
    execute: executeStructureCreate
  }),
  [COMMAND_TYPES.STRUCTURE_PATCH]: Object.freeze({
    resourceKeys: structurePatchResourceKeys,
    execute: executeStructurePatch
  }),
  [COMMAND_TYPES.STRUCTURE_ADMIN_UPDATE]: Object.freeze({
    resourceKeys: structureAdminResourceKeys,
    execute: executeStructureAdminUpdate
  }),
  [COMMAND_TYPES.STRUCTURE_BEGIN_CONSTRUCTION]: Object.freeze({
    resourceKeys: structureConstructionResourceKeys,
    execute: executeStructureBeginConstruction
  })
});

export function getCommandDefinition(commandType) {
  return COMMAND_REGISTRY[String(commandType ?? "").trim()] ?? null;
}

export function listCommandTypes() {
  return Object.freeze(Object.keys(COMMAND_REGISTRY));
}
