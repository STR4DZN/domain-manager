import { COMMAND_TYPES } from "../core/constants.js";
import {
  executeDomainCreate,
  executeDomainDelete,
  executeDomainMediaUpdate,
  executeDomainUpdate
} from "../features/domains/commands.js";
import {
  domainCreateResourceKeys,
  domainDeleteResourceKeys,
  domainMediaUpdateResourceKeys,
  domainUpdateResourceKeys
} from "../features/domains/contracts.js";
import { executeEconomyConfigure, executeResourceCatalogRemove, executeResourceCatalogUpsert } from "../features/economy/commands.js";
import { economyConfigureResourceKeys, resourceCatalogResourceKeys } from "../features/economy/contracts.js";
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
  executeMissionObjectiveRemove,
  executeMissionObjectiveUpsert,
  executeMissionPrepare,
  executeMissionPublish,
  executeMissionRelease,
  executeMissionResolve,
  executeMissionUpdate
} from "../features/missions/commands.js";
import {
  missionCreateResourceKeys,
  missionObjectiveRemoveResourceKeys,
  missionObjectiveUpsertResourceKeys,
  missionPrepareResourceKeys,
  missionReferenceResourceKeys,
  missionReleaseResourceKeys,
  missionResolveResourceKeys,
  missionUpdateResourceKeys
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
import {
  executePersonCreate,
  executePersonUpdate,
  executePopulationConfigure,
  executePopulationGroupRemove,
  executePopulationGroupUpsert,
  executePopulationWorkforceSet
} from "../features/people/commands.js";
import {
  personCreateResourceKeys,
  personUpdateResourceKeys,
  populationConfigureResourceKeys,
  populationGroupResourceKeys,
  populationWorkforceResourceKeys
} from "../features/people/contracts.js";

import { executeTerritoryConfigure } from "../features/territory/commands.js";
import { territoryConfigureResourceKeys } from "../features/territory/contracts.js";
import {
  executeAgreementCreate,
  executeAgreementStatus,
  executeAgreementUpdate,
  executeRelationRemove,
  executeRelationUpsert
} from "../features/relations/commands.js";
import {
  agreementCreateResourceKeys,
  agreementStatusResourceKeys,
  agreementUpdateResourceKeys,
  relationRemoveResourceKeys,
  relationResourceKeys
} from "../features/relations/contracts.js";
import { executeIntelRemove, executeIntelReveal, executeIntelUpsert } from "../features/intel/commands.js";
import { intelReferenceResourceKeys, intelResourceKeys } from "../features/intel/contracts.js";
import { executeSecurityConfigure } from "../features/security/commands.js";
import { securityConfigureResourceKeys } from "../features/security/contracts.js";
import { executeConditionCreate, executeConditionRemove, executeConditionToggle, executeConditionUpdate } from "../features/conditions/commands.js";
import { conditionResourceKeys } from "../features/conditions/contracts.js";
import {
  executeProjectCostRemove,
  executeProjectCostUpsert,
  executeProjectCreate,
  executeProjectUpdate
} from "../features/projects/commands.js";
import {
  projectCostRemoveResourceKeys,
  projectCostUpsertResourceKeys,
  projectCreateResourceKeys,
  projectUpdateResourceKeys
} from "../features/projects/contracts.js";

import { executeRequestCreate, executeRequestCreateMission, executeRequestFulfill, executeRequestResubmit, executeRequestReview, executeRequestWithdraw } from "../features/requests/commands.js";
import { requestCreateResourceKeys, requestLifecycleResourceKeys, requestMissionResourceKeys, requestResubmitResourceKeys, requestReviewResourceKeys } from "../features/requests/contracts.js";
const COMMAND_REGISTRY = Object.freeze({
  [COMMAND_TYPES.DOMAIN_CREATE]: Object.freeze({
    resourceKeys: domainCreateResourceKeys,
    execute: executeDomainCreate
  }),
  [COMMAND_TYPES.DOMAIN_UPDATE]: Object.freeze({
    resourceKeys: domainUpdateResourceKeys,
    execute: executeDomainUpdate
  }),
  [COMMAND_TYPES.DOMAIN_MEDIA_UPDATE]: Object.freeze({
    resourceKeys: domainMediaUpdateResourceKeys,
    execute: executeDomainMediaUpdate
  }),
  [COMMAND_TYPES.DOMAIN_DELETE]: Object.freeze({
    resourceKeys: domainDeleteResourceKeys,
    execute: executeDomainDelete
  }),
  [COMMAND_TYPES.ECONOMY_CONFIGURE]: Object.freeze({
    resourceKeys: economyConfigureResourceKeys,
    execute: executeEconomyConfigure
  }),
  [COMMAND_TYPES.RESOURCE_CATALOG_UPSERT]: Object.freeze({
    resourceKeys: resourceCatalogResourceKeys,
    execute: executeResourceCatalogUpsert
  }),
  [COMMAND_TYPES.RESOURCE_CATALOG_REMOVE]: Object.freeze({
    resourceKeys: resourceCatalogResourceKeys,
    execute: executeResourceCatalogRemove
  }),
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
  [COMMAND_TYPES.MISSION_UPDATE]: Object.freeze({
    resourceKeys: missionUpdateResourceKeys,
    execute: executeMissionUpdate
  }),
  [COMMAND_TYPES.MISSION_OBJECTIVE_UPSERT]: Object.freeze({
    resourceKeys: missionObjectiveUpsertResourceKeys,
    execute: executeMissionObjectiveUpsert
  }),
  [COMMAND_TYPES.MISSION_OBJECTIVE_REMOVE]: Object.freeze({
    resourceKeys: missionObjectiveRemoveResourceKeys,
    execute: executeMissionObjectiveRemove
  }),
  [COMMAND_TYPES.MISSION_PREPARE]: Object.freeze({
    resourceKeys: missionPrepareResourceKeys,
    execute: executeMissionPrepare
  }),
  [COMMAND_TYPES.MISSION_RELEASE]: Object.freeze({
    resourceKeys: missionReleaseResourceKeys,
    execute: executeMissionRelease
  }),
  [COMMAND_TYPES.MISSION_PUBLISH]: Object.freeze({
    resourceKeys: missionReferenceResourceKeys,
    execute: executeMissionPublish
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
  }),
  [COMMAND_TYPES.PROJECT_CREATE]: Object.freeze({
    resourceKeys: projectCreateResourceKeys,
    execute: executeProjectCreate
  }),
  [COMMAND_TYPES.PROJECT_UPDATE]: Object.freeze({
    resourceKeys: projectUpdateResourceKeys,
    execute: executeProjectUpdate
  }),
  [COMMAND_TYPES.PROJECT_COST_UPSERT]: Object.freeze({
    resourceKeys: projectCostUpsertResourceKeys,
    execute: executeProjectCostUpsert
  }),
  [COMMAND_TYPES.PROJECT_COST_REMOVE]: Object.freeze({
    resourceKeys: projectCostRemoveResourceKeys,
    execute: executeProjectCostRemove
  }),
  [COMMAND_TYPES.POPULATION_CONFIGURE]: Object.freeze({
    resourceKeys: populationConfigureResourceKeys,
    execute: executePopulationConfigure
  }),
  [COMMAND_TYPES.POPULATION_GROUP_UPSERT]: Object.freeze({
    resourceKeys: populationGroupResourceKeys,
    execute: executePopulationGroupUpsert
  }),
  [COMMAND_TYPES.POPULATION_GROUP_REMOVE]: Object.freeze({
    resourceKeys: populationGroupResourceKeys,
    execute: executePopulationGroupRemove
  }),
  [COMMAND_TYPES.POPULATION_WORKFORCE_SET]: Object.freeze({
    resourceKeys: populationWorkforceResourceKeys,
    execute: executePopulationWorkforceSet
  }),
  [COMMAND_TYPES.PERSON_CREATE]: Object.freeze({
    resourceKeys: personCreateResourceKeys,
    execute: executePersonCreate
  }),
  [COMMAND_TYPES.PERSON_UPDATE]: Object.freeze({
    resourceKeys: personUpdateResourceKeys,
    execute: executePersonUpdate
  }),
  [COMMAND_TYPES.TERRITORY_CONFIGURE]: Object.freeze({ resourceKeys: territoryConfigureResourceKeys, execute: executeTerritoryConfigure }),
  [COMMAND_TYPES.RELATION_UPSERT]: Object.freeze({ resourceKeys: relationResourceKeys, execute: executeRelationUpsert }),
  [COMMAND_TYPES.RELATION_REMOVE]: Object.freeze({ resourceKeys: relationRemoveResourceKeys, execute: executeRelationRemove }),
  [COMMAND_TYPES.AGREEMENT_CREATE]: Object.freeze({ resourceKeys: agreementCreateResourceKeys, execute: executeAgreementCreate }),
  [COMMAND_TYPES.AGREEMENT_UPDATE]: Object.freeze({ resourceKeys: agreementUpdateResourceKeys, execute: executeAgreementUpdate }),
  [COMMAND_TYPES.AGREEMENT_STATUS]: Object.freeze({ resourceKeys: agreementStatusResourceKeys, execute: executeAgreementStatus }),
  [COMMAND_TYPES.INTEL_UPSERT]: Object.freeze({ resourceKeys: intelResourceKeys, execute: executeIntelUpsert }),
  [COMMAND_TYPES.INTEL_REMOVE]: Object.freeze({ resourceKeys: intelReferenceResourceKeys, execute: executeIntelRemove }),
  [COMMAND_TYPES.INTEL_REVEAL]: Object.freeze({ resourceKeys: intelReferenceResourceKeys, execute: executeIntelReveal }),
  [COMMAND_TYPES.SECURITY_CONFIGURE]: Object.freeze({ resourceKeys: securityConfigureResourceKeys, execute: executeSecurityConfigure }),
  [COMMAND_TYPES.CONDITION_CREATE]: Object.freeze({ resourceKeys: conditionResourceKeys, execute: executeConditionCreate }),
  [COMMAND_TYPES.CONDITION_UPDATE]: Object.freeze({ resourceKeys: conditionResourceKeys, execute: executeConditionUpdate }),
  [COMMAND_TYPES.CONDITION_REMOVE]: Object.freeze({ resourceKeys: conditionResourceKeys, execute: executeConditionRemove }),
  [COMMAND_TYPES.CONDITION_TOGGLE]: Object.freeze({ resourceKeys: conditionResourceKeys, execute: executeConditionToggle }),
  [COMMAND_TYPES.REQUEST_CREATE]: Object.freeze({ resourceKeys: requestCreateResourceKeys, execute: executeRequestCreate }),
  [COMMAND_TYPES.REQUEST_RESUBMIT]: Object.freeze({ resourceKeys: requestResubmitResourceKeys, execute: executeRequestResubmit }),
  [COMMAND_TYPES.REQUEST_REVIEW]: Object.freeze({ resourceKeys: requestReviewResourceKeys, execute: executeRequestReview }),
  [COMMAND_TYPES.REQUEST_CREATE_MISSION]: Object.freeze({ resourceKeys: requestMissionResourceKeys, execute: executeRequestCreateMission }),
  [COMMAND_TYPES.REQUEST_WITHDRAW]: Object.freeze({ resourceKeys: requestLifecycleResourceKeys, execute: executeRequestWithdraw }),
  [COMMAND_TYPES.REQUEST_FULFILL]: Object.freeze({ resourceKeys: requestLifecycleResourceKeys, execute: executeRequestFulfill })
});

export function getCommandDefinition(commandType) {
  return COMMAND_REGISTRY[String(commandType ?? "").trim()] ?? null;
}

export function listCommandTypes() {
  return Object.freeze(Object.keys(COMMAND_REGISTRY));
}
