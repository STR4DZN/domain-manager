import { EVENT_TYPES, RECORD_TYPES } from "../../core/constants.js";
import { ERROR_CODES, ModuleError } from "../../core/errors.js";
import { hasCapability } from "../../core/management-contracts.js";
import { getResourceCatalogSetting } from "../../core/settings.js";
import { createRecord, deleteRecord, updateRecord } from "../../data/journal-store.js";
import { recordIndex } from "../../data/record-index.js";
import { decodeRecord } from "../../models/record-codec.js";
import {
  normalizeProjectCostRemovePayload,
  normalizeProjectCostUpsertPayload,
  normalizeProjectCreatePayload,
  normalizeProjectUpdatePayload
} from "./contracts.js";
import {
  assessReservationCapacity,
  deriveProjectReservations,
  normalizeProjectCost,
  normalizeProjectDraft,
  removeProjectCost,
  upsertProjectCost
} from "./rules.js";

function resolveReference(reference, expectedType) {
  const byEntityId = reference?.entityId ? recordIndex.getByEntityId(reference.entityId) : null;
  const byUuid = reference?.uuid ? recordIndex.get(expectedType, reference.uuid) : null;
  if (byEntityId && byUuid && byEntityId.uuid !== byUuid.uuid) {
    throw new ModuleError(ERROR_CODES.CONFLICT, "A referência aponta para UUID e entityId de entidades diferentes.");
  }
  const document = byEntityId ?? byUuid;
  if (!document) throw new ModuleError(ERROR_CODES.NOT_FOUND, `${expectedType} não encontrado.`);
  const record = decodeRecord(document);
  if (record.recordType !== expectedType) {
    throw new ModuleError(ERROR_CODES.VALIDATION, `A referência não corresponde a um registro ${expectedType}.`);
  }
  return record;
}

function actor(callerUserId) {
  const user = game.users.get(callerUserId);
  if (!user) throw new ModuleError(ERROR_CODES.PERMISSION, `Usuário não encontrado: ${callerUserId}`);
  return user;
}

function controllers(domain) {
  return domain.data.governance?.controllers ?? [];
}

function assertProjectOperator(domain, callerUserId) {
  const user = actor(callerUserId);
  if (!user.isGM && !controllers(domain).includes(user.id)) {
    throw new ModuleError(ERROR_CODES.PERMISSION, `O usuário não controla o Domain '${domain.document.name}'.`);
  }
  if (!hasCapability(domain.data, "projects")) {
    throw new ModuleError(ERROR_CODES.VALIDATION, `O Domain '${domain.document.name}' não possui capability projects.`);
  }
  return user;
}

function assertProjectBelongsToDomain(project, domain) {
  if (project.data.domainUuid !== domain.uuid) {
    throw new ModuleError(ERROR_CODES.CONFLICT, "Project não pertence ao Domain informado.");
  }
}

function assertMutable(project) {
  if (["completed", "cancelled"].includes(project.data.status)) {
    throw new ModuleError(ERROR_CODES.CONFLICT, `Project ${project.data.status} é terminal e não pode ser alterado.`);
  }
}

function assertRevision(project, expectedModifiedTime) {
  if (expectedModifiedTime == null) return;
  if ((project.document?._stats?.modifiedTime ?? null) !== expectedModifiedTime) {
    throw new ModuleError(ERROR_CODES.CONFLICT, "O Project mudou enquanto o formulário estava aberto.");
  }
}

function linkedStructures(project) {
  const documents = [
    ...recordIndex.structuresForProject(project.uuid),
    ...recordIndex.structuresForProject(project.data.entityId)
  ];
  return [...new Map(documents.map((document) => [document.uuid, document])).values()]
    .map(decodeRecord)
    .filter(Boolean);
}

function validateCatalogCosts(costs = []) {
  const catalog = getResourceCatalogSetting();
  const resourceMap = new Map((catalog.resources ?? []).map((resource) => [resource.id, resource]));
  for (const cost of costs) {
    if (!resourceMap.has(cost.resourceId)) {
      throw new ModuleError(ERROR_CODES.VALIDATION, `Recurso desconhecido no Project: ${cost.resourceId}`);
    }
  }
  return catalog;
}

function domainReservations(domainUuid, { excludeProjectUuid = null } = {}) {
  return recordIndex.list(RECORD_TYPES.PROJECT)
    .map(decodeRecord)
    .filter((record) => record?.data.domainUuid === domainUuid && record.uuid !== excludeProjectUuid)
    .flatMap((record) => deriveProjectReservations(record.data, {
      projectUuid: record.uuid,
      projectName: record.document.name
    }));
}

function assertFundingCapacity(domain, projectData, { projectUuid = null, projectName = "Project" } = {}) {
  const catalog = validateCatalogCosts(projectData.costs ?? []);
  const shortages = assessReservationCapacity({
    catalog,
    stocks: domain.data.economy?.stocks ?? [],
    existingReservations: domainReservations(domain.uuid, { excludeProjectUuid: projectUuid }),
    candidateReservations: deriveProjectReservations(projectData, { projectUuid, projectName })
  });
  if (!shortages.length) return;
  const first = shortages[0];
  const resource = (catalog.resources ?? []).find((entry) => entry.id === first.resourceId);
  throw new ModuleError(
    ERROR_CODES.CONFLICT,
    `Reserva insuficiente para ${resource?.name ?? first.resourceId}: estoque ${first.stock}, necessário ${first.reserved}.`
  );
}

function projectResult(project) {
  const required = Math.max(1, Number(project.data.work?.required ?? 1));
  const completed = Math.max(0, Number(project.data.work?.completed ?? 0));
  return {
    uuid: project.uuid,
    entityId: project.data.entityId,
    name: project.document.name,
    domainUuid: project.data.domainUuid,
    status: project.data.status,
    blockedReason: project.data.blockedReason ?? "",
    workRequired: required,
    workCompleted: completed,
    rateAmount: Number(project.data.work?.rateAmount ?? 0),
    periodTicks: Number(project.data.work?.periodTicks ?? 1),
    progressPercent: Math.min(100, Math.floor((completed * 100) / required)),
    costs: (project.data.costs ?? []).map((cost) => ({ ...cost }))
  };
}

export async function executeProjectCreate({ payload, callerUserId }) {
  const normalized = normalizeProjectCreatePayload(payload);
  const domain = resolveReference(normalized.domain, RECORD_TYPES.DOMAIN);
  assertProjectOperator(domain, callerUserId);

  const costs = normalized.costs.map((cost) => normalizeProjectCost({
    localId: cost.localId || foundry.utils.randomID(),
    resourceId: cost.resourceId,
    mode: cost.mode,
    amount: cost.amount,
    consumedAmount: 0
  }));
  const data = normalizeProjectDraft({
    domainUuid: domain.uuid,
    description: normalized.description,
    status: normalized.status,
    blockedReason: "",
    workRequired: normalized.workRequired,
    workCompleted: 0,
    rateAmount: normalized.rateAmount,
    periodTicks: normalized.periodTicks,
    carry: 0,
    costs
  });
  assertFundingCapacity(domain, data, { projectName: normalized.name });

  const created = await createRecord({
    recordType: RECORD_TYPES.PROJECT,
    name: normalized.name,
    data,
    controllerIds: controllers(domain)
  });

  return {
    result: projectResult(created),
    entities: [domain.data.entityId, created.data.entityId],
    events: [{
      type: EVENT_TYPES.PROJECT_CREATED,
      entities: [domain.data.entityId, created.data.entityId],
      payload: projectResult(created)
    }],
    rollback: () => deleteRecord(created.uuid)
  };
}

export async function executeProjectUpdate({ payload, callerUserId }) {
  const normalized = normalizeProjectUpdatePayload(payload);
  const domain = resolveReference(normalized.domain, RECORD_TYPES.DOMAIN);
  const project = resolveReference(normalized.project, RECORD_TYPES.PROJECT);
  assertProjectOperator(domain, callerUserId);
  assertProjectBelongsToDomain(project, domain);
  assertMutable(project);
  assertRevision(project, normalized.expectedModifiedTime);

  const completed = Number(project.data.work?.completed ?? 0);
  const currentRequired = Number(project.data.work?.required ?? normalized.workRequired);
  if (completed > 0 && normalized.workRequired !== currentRequired) {
    throw new ModuleError(ERROR_CODES.CONFLICT, "Trabalho total não pode mudar depois que o Project já iniciou progresso.");
  }
  if (normalized.workRequired < completed) {
    throw new ModuleError(ERROR_CODES.CONFLICT, "Trabalho total não pode ficar abaixo do trabalho já realizado.");
  }
  if (normalized.status === "cancelled" && linkedStructures(project).some((structure) => structure.data.status === "planned")) {
    throw new ModuleError(ERROR_CODES.CONFLICT, "Project vinculado a Structure planned não pode ser cancelado sem um fluxo explícito de cancelamento da construção.");
  }

  const beforeData = foundry.utils.deepClone(project.data);
  const beforeName = project.document.name;
  const periodChanged = normalized.periodTicks !== Number(project.data.work?.periodTicks ?? 1);
  const normalizedDraft = normalizeProjectDraft({
    domainUuid: project.data.domainUuid,
    originRequestUuid: project.data.originRequestUuid,
    description: normalized.description,
    status: normalized.status,
    blockedReason: normalized.blockedReason,
    workRequired: normalized.workRequired,
    workCompleted: completed,
    rateAmount: normalized.rateAmount,
    periodTicks: normalized.periodTicks,
    carry: periodChanged ? 0 : Number(project.data.work?.carry ?? 0),
    costs: project.data.costs ?? []
  });
  // Preserve the immutable identity and presentation/model fields that are not
  // part of the operational edit contract. updateRecord must never observe a
  // regenerated entityId, and an operational edit must not erase UI metadata.
  const data = {
    ...foundry.utils.deepClone(project.data),
    ...normalizedDraft,
    entityId: project.data.entityId,
    work: normalizedDraft.work,
    costs: normalizedDraft.costs
  };
  assertFundingCapacity(domain, data, { projectUuid: project.uuid, projectName: normalized.name });

  const updated = await updateRecord({
    uuid: project.uuid,
    recordType: RECORD_TYPES.PROJECT,
    name: normalized.name,
    data,
    controllerIds: controllers(domain)
  });

  return {
    result: projectResult(updated),
    entities: [domain.data.entityId, project.data.entityId],
    events: [{
      type: EVENT_TYPES.PROJECT_UPDATED,
      entities: [domain.data.entityId, project.data.entityId],
      payload: projectResult(updated)
    }],
    rollback: () => updateRecord({
      uuid: project.uuid,
      recordType: RECORD_TYPES.PROJECT,
      name: beforeName,
      data: beforeData,
      controllerIds: controllers(domain)
    })
  };
}

export async function executeProjectCostUpsert({ payload, callerUserId }) {
  const normalized = normalizeProjectCostUpsertPayload(payload);
  const domain = resolveReference(normalized.domain, RECORD_TYPES.DOMAIN);
  const project = resolveReference(normalized.project, RECORD_TYPES.PROJECT);
  assertProjectOperator(domain, callerUserId);
  assertProjectBelongsToDomain(project, domain);
  assertMutable(project);
  assertRevision(project, normalized.expectedModifiedTime);

  if (Number(project.data.work?.completed ?? 0) > 0) {
    throw new ModuleError(ERROR_CODES.CONFLICT, "Plano de custos não pode ser alterado depois que o Project já iniciou progresso.");
  }

  const existing = normalized.cost.localId
    ? (project.data.costs ?? []).find((entry) => entry.localId === normalized.cost.localId)
    : null;
  if (normalized.cost.localId && !existing) {
    throw new ModuleError(ERROR_CODES.NOT_FOUND, "Custo do Project não encontrado.");
  }

  const cost = normalizeProjectCost({
    localId: existing?.localId ?? normalized.cost.localId ?? foundry.utils.randomID(),
    resourceId: normalized.cost.resourceId,
    mode: normalized.cost.mode,
    amount: normalized.cost.amount,
    consumedAmount: existing?.consumedAmount ?? 0
  });
  const costs = upsertProjectCost(project.data.costs ?? [], cost);
  const duplicate = costs.find((entry) => entry.localId !== cost.localId && entry.resourceId === cost.resourceId && entry.mode === cost.mode);
  if (duplicate) {
    throw new ModuleError(ERROR_CODES.CONFLICT, `Já existe custo '${cost.resourceId}' no modo '${cost.mode}'.`);
  }

  const beforeData = foundry.utils.deepClone(project.data);
  const data = { ...foundry.utils.deepClone(project.data), costs };
  assertFundingCapacity(domain, data, { projectUuid: project.uuid, projectName: project.document.name });
  const updated = await updateRecord({
    uuid: project.uuid,
    recordType: RECORD_TYPES.PROJECT,
    name: project.document.name,
    data,
    controllerIds: controllers(domain)
  });

  return {
    result: projectResult(updated),
    entities: [domain.data.entityId, project.data.entityId],
    events: [{
      type: EVENT_TYPES.PROJECT_UPDATED,
      entities: [domain.data.entityId, project.data.entityId],
      payload: projectResult(updated)
    }],
    rollback: () => updateRecord({
      uuid: project.uuid,
      recordType: RECORD_TYPES.PROJECT,
      name: project.document.name,
      data: beforeData,
      controllerIds: controllers(domain)
    })
  };
}

export async function executeProjectCostRemove({ payload, callerUserId }) {
  const normalized = normalizeProjectCostRemovePayload(payload);
  const domain = resolveReference(normalized.domain, RECORD_TYPES.DOMAIN);
  const project = resolveReference(normalized.project, RECORD_TYPES.PROJECT);
  assertProjectOperator(domain, callerUserId);
  assertProjectBelongsToDomain(project, domain);
  assertMutable(project);
  assertRevision(project, normalized.expectedModifiedTime);

  if (Number(project.data.work?.completed ?? 0) > 0) {
    throw new ModuleError(ERROR_CODES.CONFLICT, "Plano de custos não pode ser alterado depois que o Project já iniciou progresso.");
  }
  const existing = (project.data.costs ?? []).find((entry) => entry.localId === normalized.localId);
  if (!existing) throw new ModuleError(ERROR_CODES.NOT_FOUND, "Custo do Project não encontrado.");
  if (Number(existing.consumedAmount ?? 0) > 0) {
    throw new ModuleError(ERROR_CODES.CONFLICT, "Custo já consumido não pode ser removido.");
  }

  const beforeData = foundry.utils.deepClone(project.data);
  const data = {
    ...foundry.utils.deepClone(project.data),
    costs: removeProjectCost(project.data.costs ?? [], normalized.localId)
  };
  assertFundingCapacity(domain, data, { projectUuid: project.uuid, projectName: project.document.name });
  const updated = await updateRecord({
    uuid: project.uuid,
    recordType: RECORD_TYPES.PROJECT,
    name: project.document.name,
    data,
    controllerIds: controllers(domain)
  });

  return {
    result: projectResult(updated),
    entities: [domain.data.entityId, project.data.entityId],
    events: [{
      type: EVENT_TYPES.PROJECT_UPDATED,
      entities: [domain.data.entityId, project.data.entityId],
      payload: projectResult(updated)
    }],
    rollback: () => updateRecord({
      uuid: project.uuid,
      recordType: RECORD_TYPES.PROJECT,
      name: project.document.name,
      data: beforeData,
      controllerIds: controllers(domain)
    })
  };
}
