import { EVENT_TYPES, RECORD_TYPES } from "../../core/constants.js";
import { ERROR_CODES, ModuleError } from "../../core/errors.js";
import { hasCapability } from "../../core/management-contracts.js";
import { getResourceCatalogSetting } from "../../core/settings.js";
import { createRecord, deleteRecord, updateRecord } from "../../data/journal-store.js";
import { recordIndex } from "../../data/record-index.js";
import { decodeRecord } from "../../models/record-codec.js";
import {
  assessReservationCapacity,
  deriveProjectReservations,
  normalizeProjectCost,
  normalizeProjectDraft
} from "../projects/rules.js";
import {
  normalizeStructureAdminPayload,
  normalizeStructureConstructionPayload,
  normalizeStructureCreatePayload,
  normalizeStructurePatchPayload
} from "./contracts.js";

function resolveReference(reference, expectedType) {
  const byEntityId = reference.entityId ? recordIndex.getByEntityId(reference.entityId) : null;
  const byUuid = reference.uuid ? recordIndex.get(expectedType, reference.uuid) : null;

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

function user(callerUserId) {
  const found = game.users.get(callerUserId);
  if (!found) throw new ModuleError(ERROR_CODES.PERMISSION, `Usuário não encontrado: ${callerUserId}`);
  return found;
}

function domainControllers(domain) {
  return domain.data?.governance?.controllers ?? [];
}

function assertDomainOperator(domain, callerUserId, { requireProjects = false } = {}) {
  const caller = user(callerUserId);
  if (!caller.isGM && !domainControllers(domain).includes(caller.id)) {
    throw new ModuleError(ERROR_CODES.PERMISSION, `O usuário não controla o Domain '${domain.document.name}'.`);
  }
  if (!hasCapability(domain.data, "structures")) {
    throw new ModuleError(ERROR_CODES.VALIDATION, `O Domain '${domain.document.name}' não possui a capability structures.`);
  }
  if (requireProjects && !hasCapability(domain.data, "projects")) {
    throw new ModuleError(ERROR_CODES.VALIDATION, `O Domain '${domain.document.name}' não possui a capability projects.`);
  }
  return caller;
}

function assertGM(callerUserId) {
  const caller = user(callerUserId);
  if (!caller.isGM) throw new ModuleError(ERROR_CODES.PERMISSION, "Somente GM pode administrar Structures diretamente.");
  return caller;
}

function reference(record) {
  return { recordType: record.recordType, uuid: record.uuid, entityId: record.data.entityId };
}

function validateResourceProfiles({ maintenance = [], production = [], costs = [] } = {}) {
  const catalog = getResourceCatalogSetting();
  const known = new Set((catalog?.resources ?? []).map((resource) => resource.id));
  for (const entry of [...maintenance, ...production, ...costs]) {
    if (!known.has(entry.resourceId)) {
      throw new ModuleError(ERROR_CODES.VALIDATION, `Recurso desconhecido: ${entry.resourceId}`);
    }
  }
  return catalog;
}

function structureDataFromBlueprint(domain, blueprint, { activeProject = null } = {}) {
  return {
    domain: reference(domain),
    activeProject,
    description: blueprint.description,
    category: blueprint.category,
    tier: blueprint.tier,
    maxTier: blueprint.maxTier,
    status: blueprint.status,
    condition: blueprint.condition,
    capacity: blueprint.capacity,
    maintenancePriority: blueprint.maintenancePriority,
    workforceRequired: blueprint.workforceRequired,
    maintenance: blueprint.maintenance,
    production: blueprint.production,
    tags: blueprint.tags
  };
}

function structureResult(record) {
  return {
    uuid: record.uuid,
    entityId: record.data.entityId,
    name: record.document.name,
    status: record.data.status,
    category: record.data.category,
    tier: record.data.tier,
    maxTier: record.data.maxTier,
    condition: record.data.condition,
    capacity: record.data.capacity,
    maintenancePriority: record.data.maintenancePriority,
    workforceRequired: record.data.workforceRequired,
    domainEntityId: record.data.domain?.entityId ?? null,
    projectEntityId: record.data.activeProject?.entityId ?? null
  };
}

function allProjectReservations(domainUuid) {
  return recordIndex.list(RECORD_TYPES.PROJECT)
    .map((document) => decodeRecord(document))
    .filter((record) => record.data.domainUuid === domainUuid)
    .flatMap((record) => deriveProjectReservations(record.data, {
      projectUuid: record.uuid,
      projectName: record.document.name
    }));
}

export async function executeStructureCreate({ payload, callerUserId }) {
  assertGM(callerUserId);
  const normalized = normalizeStructureCreatePayload(payload);
  const domain = resolveReference(normalized.domain, RECORD_TYPES.DOMAIN);
  assertDomainOperator(domain, callerUserId);
  validateResourceProfiles(normalized);

  const created = await createRecord({
    recordType: RECORD_TYPES.STRUCTURE,
    name: normalized.name,
    controllerIds: domainControllers(domain),
    data: structureDataFromBlueprint(domain, normalized)
  });

  return {
    result: structureResult(created),
    entities: [domain.data.entityId, created.data.entityId],
    events: [{
      type: EVENT_TYPES.STRUCTURE_CREATED,
      entities: [domain.data.entityId, created.data.entityId],
      payload: structureResult(created)
    }],
    rollback: () => deleteRecord(created.uuid)
  };
}

export async function executeStructurePatch({ payload, callerUserId }) {
  const normalized = normalizeStructurePatchPayload(payload);
  const structure = resolveReference(normalized.structure, RECORD_TYPES.STRUCTURE);
  const domain = resolveReference(structure.data.domain, RECORD_TYPES.DOMAIN);
  const caller = assertDomainOperator(domain, callerUserId);

  if (!caller.isGM && ["planned", "destroyed", "decommissioned"].includes(structure.data.status)) {
    throw new ModuleError(ERROR_CODES.PERMISSION, "Esta Structure exige intervenção administrativa do GM.");
  }
  if (normalized.patch.status === "operational" && structure.data.condition <= 0) {
    throw new ModuleError(ERROR_CODES.CONFLICT, "Structure com condição 0 não pode ser colocada em operação.");
  }

  const before = foundry.utils.deepClone(structure.data);
  const data = foundry.utils.deepClone(structure.data);
  Object.assign(data, normalized.patch);
  const updated = await updateRecord({
    uuid: structure.uuid,
    recordType: RECORD_TYPES.STRUCTURE,
    name: structure.document.name,
    data
  });

  return {
    result: structureResult(updated),
    entities: [domain.data.entityId, structure.data.entityId],
    events: [{
      type: EVENT_TYPES.STRUCTURE_UPDATED,
      entities: [domain.data.entityId, structure.data.entityId],
      payload: { entityId: structure.data.entityId, patch: normalized.patch }
    }],
    rollback: () => updateRecord({
      uuid: structure.uuid,
      recordType: RECORD_TYPES.STRUCTURE,
      name: structure.document.name,
      data: before
    })
  };
}

export async function executeStructureAdminUpdate({ payload, callerUserId }) {
  assertGM(callerUserId);
  const normalized = normalizeStructureAdminPayload(payload);
  const structure = resolveReference(normalized.structure, RECORD_TYPES.STRUCTURE);
  const domain = resolveReference(structure.data.domain, RECORD_TYPES.DOMAIN);
  assertDomainOperator(domain, callerUserId);
  validateResourceProfiles(normalized);

  const before = foundry.utils.deepClone(structure.data);
  const beforeName = structure.document.name;
  const data = {
    ...structureDataFromBlueprint(domain, normalized, {
      activeProject: structure.data.activeProject ?? null
    }),
    entityId: structure.data.entityId
  };
  const updated = await updateRecord({
    uuid: structure.uuid,
    recordType: RECORD_TYPES.STRUCTURE,
    name: normalized.name,
    data,
    controllerIds: domainControllers(domain)
  });

  return {
    result: structureResult(updated),
    entities: [domain.data.entityId, structure.data.entityId],
    events: [{
      type: EVENT_TYPES.STRUCTURE_UPDATED,
      entities: [domain.data.entityId, structure.data.entityId],
      payload: structureResult(updated)
    }],
    rollback: () => updateRecord({
      uuid: structure.uuid,
      recordType: RECORD_TYPES.STRUCTURE,
      name: beforeName,
      data: before,
      controllerIds: domainControllers(domain)
    })
  };
}

export async function executeStructureBeginConstruction({ payload, callerUserId }) {
  const normalized = normalizeStructureConstructionPayload(payload);
  const domain = resolveReference(normalized.domain, RECORD_TYPES.DOMAIN);
  assertDomainOperator(domain, callerUserId, { requireProjects: true });
  const catalog = validateResourceProfiles({
    maintenance: normalized.blueprint.maintenance,
    production: normalized.blueprint.production,
    costs: normalized.project.costs
  });

  const costs = normalized.project.costs.map((cost) => normalizeProjectCost({
    localId: foundry.utils.randomID(),
    resourceId: cost.resourceId,
    mode: cost.mode,
    amount: cost.amount,
    consumedAmount: 0
  }));
  const projectData = normalizeProjectDraft({
    domainUuid: domain.uuid,
    description: normalized.project.description,
    status: "active",
    blockedReason: "",
    workRequired: normalized.project.workRequired,
    workCompleted: 0,
    rateAmount: normalized.project.rateAmount,
    periodTicks: normalized.project.periodTicks,
    carry: 0,
    costs
  });

  const shortages = assessReservationCapacity({
    catalog,
    stocks: domain.data.economy?.stocks ?? [],
    existingReservations: allProjectReservations(domain.uuid),
    candidateReservations: deriveProjectReservations(projectData, {
      projectName: normalized.project.name
    })
  });
  if (shortages.length) {
    const first = shortages[0];
    const resource = (catalog.resources ?? []).find((entry) => entry.id === first.resourceId);
    throw new ModuleError(
      ERROR_CODES.CONFLICT,
      `Reserva insuficiente para ${resource?.name ?? first.resourceId}: estoque ${first.stock}, necessário ${first.reserved}.`
    );
  }

  let project = null;
  let structure = null;
  try {
    project = await createRecord({
      recordType: RECORD_TYPES.PROJECT,
      name: normalized.project.name,
      controllerIds: domainControllers(domain),
      data: projectData
    });

    structure = await createRecord({
      recordType: RECORD_TYPES.STRUCTURE,
      name: normalized.blueprint.name,
      controllerIds: domainControllers(domain),
      data: structureDataFromBlueprint(domain, normalized.blueprint, {
        activeProject: reference(project)
      })
    });
  } catch (error) {
    if (structure) {
      try { await deleteRecord(structure.uuid); } catch {}
    }
    if (project) {
      try { await deleteRecord(project.uuid); } catch {}
    }
    throw error;
  }

  const result = {
    ...structureResult(structure),
    project: {
      uuid: project.uuid,
      entityId: project.data.entityId,
      name: project.document.name,
      status: project.data.status
    }
  };

  return {
    result,
    entities: [domain.data.entityId, structure.data.entityId, project.data.entityId],
    events: [{
      type: EVENT_TYPES.STRUCTURE_CONSTRUCTION_STARTED,
      entities: [domain.data.entityId, structure.data.entityId, project.data.entityId],
      payload: result
    }],
    rollback: async () => {
      try { await deleteRecord(structure.uuid); } finally { await deleteRecord(project.uuid); }
    }
  };
}
