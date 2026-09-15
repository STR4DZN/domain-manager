import { COMMAND_TYPES, RECORD_TYPES } from "../../core/constants.js";
import { ERROR_CODES, ModuleError } from "../../core/errors.js";
import { getResourceCatalogSetting } from "../../core/settings.js";
import { parseMinorUnits } from "../../core/numbers.js";
import { executeCommandAuthoritatively } from "../../authority/execute.js";
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

function copyDefined(target, source, key, sourceKey = key) {
  if (!source || typeof source !== "object") return;
  if (!Object.hasOwn(source, sourceKey) || source[sourceKey] === undefined) return;
  target[key] = source[sourceKey];
}

/**
 * Converte tanto o formato plano atual quanto patches legados (`changes` e
 * `changes.data`) no contrato completo exigido por project.update. Campos
 * sistêmicos de work, como completed/carry, nunca entram pelo adaptador.
 */
function mergeProjectPatch(project, ...patches) {
  const merged = {
    name: project.document.name,
    description: project.data.description ?? "",
    status: project.data.status ?? "planned",
    blockedReason: project.data.blockedReason ?? "",
    workRequired: project.data.work?.required ?? 100,
    rateAmount: project.data.work?.rateAmount ?? 10,
    periodTicks: project.data.work?.periodTicks ?? 1
  };

  for (const patch of patches) {
    if (!patch || typeof patch !== "object") continue;
    const data = patch.data && typeof patch.data === "object" ? patch.data : null;
    const work = patch.work && typeof patch.work === "object" ? patch.work : null;
    const dataWork = data?.work && typeof data.work === "object" ? data.work : null;

    // Nested legacy data is applied first; explicit flat fields win.
    for (const source of [data]) {
      copyDefined(merged, source, "description");
      copyDefined(merged, source, "status");
      copyDefined(merged, source, "blockedReason");
    }
    for (const source of [dataWork, work]) {
      copyDefined(merged, source, "workRequired", "required");
      copyDefined(merged, source, "rateAmount");
      copyDefined(merged, source, "periodTicks");
    }
    for (const key of ["name", "description", "status", "blockedReason", "workRequired", "rateAmount", "periodTicks"]) {
      copyDefined(merged, patch, key);
    }
  }

  return merged;
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
  const result = await executeCommandAuthoritatively({
    commandType: COMMAND_TYPES.PROJECT_CREATE,
    operationId: operationId(requestedOperationId),
    payload: {
      domain: reference(RECORD_TYPES.DOMAIN, domainUuid),
      name,
      description,
      status,
      workRequired,
      rateAmount,
      periodTicks,
      costs: []
    }
  });
  return getRecord(result.uuid);
}

export async function updateProjectAction(payload = {}) {
  const {
    projectUuid,
    expectedModifiedTime,
    changes = null,
    operationId: requestedOperationId = null
  } = payload;
  const { project, projectRef, domainRef } = await projectContext(projectUuid);
  const merged = mergeProjectPatch(project, changes, payload);

  await executeCommandAuthoritatively({
    commandType: COMMAND_TYPES.PROJECT_UPDATE,
    operationId: operationId(requestedOperationId),
    payload: {
      domain: domainRef,
      project: projectRef,
      expectedModifiedTime,
      ...merged
    }
  });
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

  await executeCommandAuthoritatively({
    commandType: COMMAND_TYPES.PROJECT_COST_UPSERT,
    operationId: operationId(requestedOperationId),
    payload: {
      domain: domainRef,
      project: projectRef,
      expectedModifiedTime,
      cost: { localId, resourceId, mode, amount }
    }
  });
  return getRecord(projectUuid);
}

export async function removeProjectCostAction({
  projectUuid,
  expectedModifiedTime,
  localId,
  operationId: requestedOperationId = null
}) {
  const { projectRef, domainRef } = await projectContext(projectUuid);
  await executeCommandAuthoritatively({
    commandType: COMMAND_TYPES.PROJECT_COST_REMOVE,
    operationId: operationId(requestedOperationId),
    payload: { domain: domainRef, project: projectRef, expectedModifiedTime, localId }
  });
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
