import { PROJECT_EDITABLE_STATUSES, RECORD_TYPES } from "../../core/constants.js";
import { ERROR_CODES, ModuleError } from "../../core/errors.js";
import { getResourceCatalogSetting } from "../../core/settings.js";
import { parseMinorUnits } from "../../core/numbers.js";
import { createRecord, getRecord, updateRecord } from "../../data/journal-store.js";
import { buildDomainProjectReservations } from "./selectors.js";
import {
  assessReservationCapacity,
  deriveProjectReservations,
  normalizeProjectCost,
  normalizeProjectDraft,
  removeProjectCost,
  upsertProjectCost
} from "./rules.js";

function assertGM() {
  if (!game.user.isGM) throw new ModuleError(ERROR_CODES.PERMISSION, "Somente GM altera Projects no Bloco 5.");
}
function assertRevision(document, expectedModifiedTime) {
  if (expectedModifiedTime == null) return;
  if ((document._stats?.modifiedTime ?? null) !== expectedModifiedTime) throw new ModuleError(ERROR_CODES.CONFLICT, "O Project mudou enquanto o formulário estava aberto.");
}
async function loadProject(projectUuid, expectedModifiedTime) {
  assertGM();
  const record = await getRecord(projectUuid);
  if (record.recordType !== RECORD_TYPES.PROJECT) throw new ModuleError(ERROR_CODES.VALIDATION, "O registro não é um Project.");
  assertRevision(record.document, expectedModifiedTime);
  return record;
}
async function loadDomain(domainUuid) {
  const record = await getRecord(domainUuid);
  if (record.recordType !== RECORD_TYPES.DOMAIN) throw new ModuleError(ERROR_CODES.VALIDATION, "Project precisa apontar para um Domain.");
  return record;
}
async function assertFundingCapacity(projectData, {projectUuid=null, projectName="Project"}={}) {
  const domain = await loadDomain(projectData.domainUuid);
  const catalog = getResourceCatalogSetting();
  for (const cost of projectData.costs ?? []) {
    if (!catalog.resources.some((r) => r.id === cost.resourceId)) throw new ModuleError(ERROR_CODES.VALIDATION, `Recurso desconhecido no Project: ${cost.resourceId}`);
  }
  const existingReservations = buildDomainProjectReservations(projectData.domainUuid, game.user, {excludeProjectUuid:projectUuid});
  const candidateReservations = deriveProjectReservations(projectData, {projectUuid, projectName});
  const shortages = assessReservationCapacity({catalog, stocks:domain.data.economy?.stocks ?? [], existingReservations, candidateReservations});
  if (shortages.length) {
    const first = shortages[0];
    const resource = catalog.resources.find((r) => r.id === first.resourceId);
    throw new ModuleError(ERROR_CODES.VALIDATION, `Reserva insuficiente para ${resource?.name ?? first.resourceId}: estoque ${first.stock}, reservado necessário ${first.reserved}.`);
  }
  return domain;
}

export async function createProjectAction({domainUuid, name, description="", status="planned", blockedReason="", workRequired, rateAmount, periodTicks, originRequestUuid=null}) {
  assertGM();
  const cleanName = String(name ?? "").trim();
  if (!cleanName) throw new ModuleError(ERROR_CODES.VALIDATION, "Nome do Project é obrigatório.");
  const domain = await loadDomain(domainUuid);
  const data = normalizeProjectDraft({domainUuid, originRequestUuid, description, status, blockedReason, workRequired:Number(workRequired), workCompleted:0, rateAmount:Number(rateAmount), periodTicks:Number(periodTicks), carry:0, costs:[]});
  await assertFundingCapacity(data, {projectName:cleanName});
  return createRecord({recordType:RECORD_TYPES.PROJECT, name:cleanName, data, controllerIds:domain.data.governance.controllers});
}

export async function updateProjectAction({projectUuid, expectedModifiedTime, name, description, status, blockedReason, workRequired, rateAmount, periodTicks}) {
  const record = await loadProject(projectUuid, expectedModifiedTime);
  if (!PROJECT_EDITABLE_STATUSES.includes(status)) throw new ModuleError(ERROR_CODES.VALIDATION, "Status só pode virar completed pelo futuro settlement de Simulation.");
  const cleanName = String(name ?? "").trim();
  if (!cleanName) throw new ModuleError(ERROR_CODES.VALIDATION, "Nome do Project é obrigatório.");
  const oldWork = record.data.work;
  const newPeriod = Number(periodTicks);
  const data = normalizeProjectDraft({
    domainUuid:record.data.domainUuid,
    originRequestUuid:record.data.originRequestUuid,
    description,
    status,
    blockedReason,
    workRequired:Number(workRequired),
    workCompleted:oldWork.completed,
    rateAmount:Number(rateAmount),
    periodTicks:newPeriod,
    carry:newPeriod === oldWork.periodTicks ? oldWork.carry : 0,
    costs:record.data.costs
  });
  const domain = await assertFundingCapacity(data, {projectUuid:record.uuid, projectName:cleanName});
  return updateRecord({uuid:record.uuid, recordType:RECORD_TYPES.PROJECT, name:cleanName, data, controllerIds:domain.data.governance.controllers});
}

export async function upsertProjectCostAction({projectUuid, expectedModifiedTime, localId=null, resourceId, mode, displayAmount}) {
  const record = await loadProject(projectUuid, expectedModifiedTime);
  const catalog = getResourceCatalogSetting();
  const resource = catalog.resources.find((r) => r.id === resourceId);
  if (!resource) throw new ModuleError(ERROR_CODES.VALIDATION, `Recurso desconhecido: ${resourceId}`);
  let amount;
  try { amount = parseMinorUnits(displayAmount, resource.precision); }
  catch (error) { throw new ModuleError(ERROR_CODES.VALIDATION, `${resource.name}: ${error.message}`, {cause:error}); }
  const existing = localId ? record.data.costs.find((c) => c.localId === localId) : null;
  const cost = normalizeProjectCost({localId:localId || foundry.utils.randomID(), resourceId, mode, amount, consumedAmount:existing?.consumedAmount ?? 0});
  const data = {...record.data, costs:upsertProjectCost(record.data.costs, cost)};
  const domain = await assertFundingCapacity(data, {projectUuid:record.uuid, projectName:record.document.name});
  return updateRecord({uuid:record.uuid, recordType:RECORD_TYPES.PROJECT, name:record.document.name, data, controllerIds:domain.data.governance.controllers});
}

export async function removeProjectCostAction({projectUuid, expectedModifiedTime, localId}) {
  const record = await loadProject(projectUuid, expectedModifiedTime);
  const existing = record.data.costs.find((c) => c.localId === localId);
  if (existing?.consumedAmount > 0) throw new ModuleError(ERROR_CODES.VALIDATION, "Custo já consumido não pode ser removido.");
  const data = {...record.data, costs:removeProjectCost(record.data.costs, localId)};
  const domain = await assertFundingCapacity(data, {projectUuid:record.uuid, projectName:record.document.name});
  return updateRecord({uuid:record.uuid, recordType:RECORD_TYPES.PROJECT, name:record.document.name, data, controllerIds:domain.data.governance.controllers});
}

export async function deleteProjectAction({ projectUuid }) {
  assertGM();
  const record = await getRecord(projectUuid);
  if (record.recordType !== RECORD_TYPES.PROJECT) {
    throw new ModuleError(ERROR_CODES.VALIDATION, "O registro não é um Project.");
  }
  await record.document.delete();
  const { recordIndex } = await import("../../data/record-index.js");
  recordIndex.remove(projectUuid);
  return true;
}

