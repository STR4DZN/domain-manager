import { COMMAND_TYPES, RECORD_TYPES } from "../../core/constants.js";
import { ERROR_CODES, ModuleError } from "../../core/errors.js";
import { getResourceCatalogSetting } from "../../core/settings.js";
import { parseMinorUnits } from "../../core/numbers.js";
import { dispatchAuthoritativeCommand } from "../../commands/execute.js";
import { getRecord } from "../../data/journal-store.js";

function operationId(value = null) {
  const clean = String(value ?? "").trim();
  return clean || foundry.utils.randomID();
}

function reference(recordType, uuid) {
  return { recordType, uuid, entityId: null };
}

async function projectContext(projectUuid) {
  const project = await getRecord(projectUuid);
  return {
    project,
    projectRef: reference(RECORD_TYPES.PROJECT, projectUuid),
    domainRef: reference(RECORD_TYPES.DOMAIN, project.data.domainUuid)
  };
}

/** Compatibility wrapper. Persistence and authority live in project.create. */
export async function createProjectAction({
  domainUuid,
  name,
  description = "",
  status = "planned",
  blockedReason = "",
  workRequired,
  rateAmount,
  periodTicks,
  originRequestUuid = null,
  operationId: requestedOperationId = null
}) {
  if (originRequestUuid) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      "Project originado por Request exige bridge canônico; a API legada não pode fabricar provenance."
    );
  }
  if (blockedReason && status !== "blocked") {
    // Legacy payload accepted the field even when it had no persisted meaning.
    blockedReason = "";
  }
  const result = await dispatchAuthoritativeCommand({
    commandType: COMMAND_TYPES.PROJECT_CREATE,
    operationId: operationId(requestedOperationId),
    payload: {
      domain: reference(RECORD_TYPES.DOMAIN, domainUuid),
      name,
      description,
      status,
      workRequired: Number(workRequired),
      rateAmount: Number(rateAmount),
      periodTicks: Number(periodTicks),
      costs: []
    }
  }, { callerUserId: game.user.id });
  return getRecord(result.uuid);
}

export async function updateProjectAction({
  projectUuid,
  expectedModifiedTime,
  name,
  description,
  status,
  blockedReason,
  workRequired,
  rateAmount,
  periodTicks,
  operationId: requestedOperationId = null
}) {
  const { projectRef, domainRef } = await projectContext(projectUuid);
  await dispatchAuthoritativeCommand({
    commandType: COMMAND_TYPES.PROJECT_UPDATE,
    operationId: operationId(requestedOperationId),
    payload: {
      domain: domainRef,
      project: projectRef,
      expectedModifiedTime,
      name,
      description,
      status,
      blockedReason,
      workRequired: Number(workRequired),
      rateAmount: Number(rateAmount),
      periodTicks: Number(periodTicks)
    }
  }, { callerUserId: game.user.id });
  return getRecord(projectUuid);
}

export async function upsertProjectCostAction({
  projectUuid,
  expectedModifiedTime,
  localId = null,
  resourceId,
  mode,
  displayAmount,
  operationId: requestedOperationId = null
}) {
  const { projectRef, domainRef } = await projectContext(projectUuid);
  const catalog = getResourceCatalogSetting();
  const resource = (catalog.resources ?? []).find((entry) => entry.id === resourceId);
  if (!resource) throw new ModuleError(ERROR_CODES.VALIDATION, `Recurso desconhecido: ${resourceId}`);
  let amount;
  try { amount = parseMinorUnits(displayAmount, resource.precision); }
  catch (error) { throw new ModuleError(ERROR_CODES.VALIDATION, `${resource.name}: ${error.message}`, { cause: error }); }

  await dispatchAuthoritativeCommand({
    commandType: COMMAND_TYPES.PROJECT_COST_UPSERT,
    operationId: operationId(requestedOperationId),
    payload: {
      domain: domainRef,
      project: projectRef,
      expectedModifiedTime,
      cost: { localId, resourceId, mode, amount }
    }
  }, { callerUserId: game.user.id });
  return getRecord(projectUuid);
}

export async function removeProjectCostAction({
  projectUuid,
  expectedModifiedTime,
  localId,
  operationId: requestedOperationId = null
}) {
  const { projectRef, domainRef } = await projectContext(projectUuid);
  await dispatchAuthoritativeCommand({
    commandType: COMMAND_TYPES.PROJECT_COST_REMOVE,
    operationId: operationId(requestedOperationId),
    payload: { domain: domainRef, project: projectRef, expectedModifiedTime, localId }
  }, { callerUserId: game.user.id });
  return getRecord(projectUuid);
}

/**
 * Physical deletion is deliberately disabled. Recreating a deleted Project in
 * rollback would change its UUID and could invalidate references/provenance.
 */
export async function deleteProjectAction() {
  throw new ModuleError(
    ERROR_CODES.CONFLICT,
    "Hard-delete de Project foi desativado. Use o lifecycle de cancelamento para preservar histórico e referências."
  );
}
