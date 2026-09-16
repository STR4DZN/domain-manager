import { EVENT_TYPES, RECORD_TYPES } from "../../core/constants.js";
import { ERROR_CODES, ModuleError } from "../../core/errors.js";
import { hasCapability } from "../../core/management-contracts.js";
import { createRecord, deleteRecord, updateRecord } from "../../data/journal-store.js";
import { recordIndex } from "../../data/record-index.js";
import { decodeRecord } from "../../models/record-codec.js";
import { isModuleManager } from "../../core/permissions.js";
import { canControlDomain } from "../domains/rules.js";
import { normalizeRequestDraft, planRequestDecision, planRequestFulfillment, planRequestResubmission, planRequestWithdrawal } from "./rules.js";
import { normalizeRequestCreatePayload, normalizeRequestLifecyclePayload, normalizeRequestMissionPayload, normalizeRequestResubmitPayload, normalizeRequestReviewPayload } from "./contracts.js";

function resolveReference(reference, expectedType, label) {
  const byEntityId = reference.entityId ? recordIndex.getByEntityId(reference.entityId) : null;
  const byUuid = reference.uuid ? recordIndex.get(expectedType, reference.uuid) : null;
  if (byEntityId && byUuid && byEntityId.uuid !== byUuid.uuid) {
    throw new ModuleError(ERROR_CODES.CONFLICT, `${label} aponta para registros diferentes.`);
  }
  const document = byEntityId ?? byUuid;
  if (!document) throw new ModuleError(ERROR_CODES.NOT_FOUND, `${label} não encontrada.`);
  const record = decodeRecord(document);
  if (record.recordType !== expectedType) {
    throw new ModuleError(ERROR_CODES.VALIDATION, `${label} não é '${expectedType}'.`);
  }
  return record;
}

function callerFromId(callerUserId) {
  const caller = game.users.get(callerUserId);
  if (!caller) throw new ModuleError(ERROR_CODES.PERMISSION, "Usuário de origem não encontrado.");
  return caller;
}

function requesterIdFromUuid(userUuid) {
  return game.users.find?.((user) => user.uuid === userUuid)?.id
    ?? game.users.contents?.find?.((user) => user.uuid === userUuid)?.id
    ?? null;
}

function requestResult(record) {
  return {
    uuid: record.uuid,
    entityId: record.data.entityId,
    status: record.data.status,
    type: record.data.type,
    title: record.data.proposal?.title ?? record.document.name,
    requesterUserUuid: record.data.requesterUserUuid,
    primaryDomainUuid: record.data.primaryDomainUuid,
    handling: record.data.gmDecision?.handling ?? "none",
    resultUuid: record.data.resultUuid ?? null
  };
}

export async function executeRequestCreate({ payload, callerUserId, operationId }) {
  const normalized = normalizeRequestCreatePayload(payload);
  const caller = callerFromId(callerUserId);
  const domain = resolveReference(normalized.domain, RECORD_TYPES.DOMAIN, "Domain da Request");

  if (!canControlDomain(caller, domain.data)) {
    throw new ModuleError(ERROR_CODES.PERMISSION, "Você não controla este Domain.");
  }

  const data = normalizeRequestDraft({
    operationId,
    type: normalized.type,
    customTypeLabel: normalized.customTypeLabel,
    requesterUserUuid: caller.uuid,
    primaryDomainUuid: domain.uuid,
    intent: normalized.intent,
    title: normalized.title,
    details: normalized.details
  });

  const created = await createRecord({
    recordType: RECORD_TYPES.REQUEST,
    name: data.proposal.title,
    data,
    controllerIds: [caller.id]
  });

  return {
    result: requestResult(created),
    entities: [domain.data.entityId, created.data.entityId],
    events: [{
      type: EVENT_TYPES.REQUEST_CREATED,
      entities: [domain.data.entityId, created.data.entityId],
      payload: requestResult(created)
    }],
    rollback: () => deleteRecord(created.uuid)
  };
}

export async function executeRequestResubmit({ payload, callerUserId }) {
  const normalized = normalizeRequestResubmitPayload(payload);
  const caller = callerFromId(callerUserId);
  const request = resolveReference(normalized.request, RECORD_TYPES.REQUEST, "Request");
  assertExpectedModifiedTime(request, normalized.expectedModifiedTime, "A Request mudou enquanto a correção estava aberta.");

  if (request.data.requesterUserUuid !== caller.uuid) {
    throw new ModuleError(ERROR_CODES.PERMISSION, "Somente o próprio solicitante pode corrigir e reenviar esta Request.");
  }

  const beforeData = foundry.utils.deepClone(request.data);
  const beforeName = request.document.name;
  const nextData = planRequestResubmission(request.data, {
    type: normalized.type,
    customTypeLabel: normalized.customTypeLabel,
    title: normalized.title,
    intent: normalized.intent,
    details: normalized.details,
    resubmittedByUserUuid: caller.uuid
  });
  nextData.entityId = request.data.entityId;
  const requesterUserId = requesterIdFromUuid(request.data.requesterUserUuid);
  const updated = await updateRecord({
    uuid: request.uuid,
    recordType: RECORD_TYPES.REQUEST,
    name: normalized.title,
    data: nextData,
    controllerIds: requesterUserId ? [requesterUserId] : []
  });

  return {
    result: requestResult(updated),
    entities: [updated.data.entityId],
    events: [{
      type: EVENT_TYPES.REQUEST_RESUBMITTED,
      entities: [updated.data.entityId],
      payload: requestResult(updated)
    }],
    rollback: () => updateRecord({
      uuid: request.uuid,
      recordType: RECORD_TYPES.REQUEST,
      name: beforeName,
      data: beforeData,
      controllerIds: requesterUserId ? [requesterUserId] : []
    })
  };
}

export async function executeRequestReview({ payload, callerUserId }) {
  const normalized = normalizeRequestReviewPayload(payload);
  const caller = callerFromId(callerUserId);
  if (!isModuleManager(caller)) {
    throw new ModuleError(ERROR_CODES.PERMISSION, "A revisão oficial de Requests é exclusiva do Mestre ou Assistente do Mestre.");
  }

  const request = resolveReference(normalized.request, RECORD_TYPES.REQUEST, "Request");
  if (request.data.status === "needs-changes") {
    throw new ModuleError(ERROR_CODES.CONFLICT, "A Request aguarda correção e reenvio do solicitante.");
  }
  if (["withdrawn", "fulfilled"].includes(request.data.status)) {
    throw new ModuleError(ERROR_CODES.CONFLICT, "Request encerrada não pode voltar ao fluxo de revisão.");
  }
  if (request.data.resultUuid) {
    throw new ModuleError(ERROR_CODES.CONFLICT, "Request com resultado materializado não pode ter a decisão reaberta.");
  }
  const currentModifiedTime = request.document._stats?.modifiedTime ?? null;
  if (normalized.expectedModifiedTime !== null && currentModifiedTime !== normalized.expectedModifiedTime) {
    throw new ModuleError(ERROR_CODES.CONFLICT, "A Request mudou enquanto a revisão estava aberta.");
  }

  const beforeData = foundry.utils.deepClone(request.data);
  const nextData = planRequestDecision(request.data, {
    status: normalized.status,
    summary: normalized.summary,
    handling: normalized.handling,
    decidedByUserUuid: caller.uuid
  });
  // Identity belongs to the record and must survive operational edits verbatim.
  nextData.entityId = request.data.entityId;
  const requesterUserId = requesterIdFromUuid(request.data.requesterUserUuid);

  const updated = await updateRecord({
    uuid: request.uuid,
    recordType: RECORD_TYPES.REQUEST,
    name: request.document.name,
    data: nextData,
    controllerIds: requesterUserId ? [requesterUserId] : []
  });

  return {
    result: requestResult(updated),
    entities: [updated.data.entityId],
    events: [{
      type: EVENT_TYPES.REQUEST_REVIEWED,
      entities: [updated.data.entityId],
      payload: requestResult(updated)
    }],
    rollback: () => updateRecord({
      uuid: request.uuid,
      recordType: RECORD_TYPES.REQUEST,
      name: request.document.name,
      data: beforeData,
      controllerIds: requesterUserId ? [requesterUserId] : []
    })
  };
}

function missionByRequestOrigin(requestUuid) {
  return recordIndex.list(RECORD_TYPES.MISSION)
    .map((document) => decodeRecord(document))
    .find((mission) => mission.data.origin?.kind === "request" && mission.data.origin?.uuid === requestUuid) ?? null;
}

function missionResult(record, { reused = false } = {}) {
  return {
    uuid: record.uuid,
    entityId: record.data.entityId,
    name: record.document.name,
    status: record.data.status,
    originRequestUuid: record.data.origin?.uuid ?? null,
    reused
  };
}

export async function executeRequestCreateMission({ payload, callerUserId }) {
  const normalized = normalizeRequestMissionPayload(payload);
  const caller = callerFromId(callerUserId);
  if (!isModuleManager(caller)) {
    throw new ModuleError(ERROR_CODES.PERMISSION, "Somente o Mestre ou Assistente do Mestre pode materializar uma Request como Mission.");
  }

  const request = resolveReference(normalized.request, RECORD_TYPES.REQUEST, "Request");
  const currentModifiedTime = request.document._stats?.modifiedTime ?? null;
  if (normalized.expectedModifiedTime !== null && currentModifiedTime !== normalized.expectedModifiedTime) {
    throw new ModuleError(ERROR_CODES.CONFLICT, "A Request mudou enquanto a materialização estava aberta.");
  }
  if (request.data.status !== "approved") {
    throw new ModuleError(ERROR_CODES.CONFLICT, "A Request precisa estar aprovada antes de gerar Mission.");
  }
  if (request.data.gmDecision?.handling !== "mission") {
    throw new ModuleError(ERROR_CODES.CONFLICT, "A Request aprovada precisa estar encaminhada como Mission.");
  }

  const domainDocument = recordIndex.get(RECORD_TYPES.DOMAIN, request.data.primaryDomainUuid);
  if (!domainDocument) throw new ModuleError(ERROR_CODES.NOT_FOUND, "Domain principal da Request não encontrado.");
  const domain = decodeRecord(domainDocument);
  if (!hasCapability(domain.data, "missions")) {
    throw new ModuleError(ERROR_CODES.VALIDATION, `O Domain '${domain.document.name}' não possui capability missions.`);
  }
  for (const uuid of request.data.relatedDomainUuids ?? []) {
    if (!recordIndex.get(RECORD_TYPES.DOMAIN, uuid)) {
      throw new ModuleError(ERROR_CODES.NOT_FOUND, `Domain relacionado da Request não encontrado: ${uuid}`);
    }
  }

  let mission = missionByRequestOrigin(request.uuid);
  if (request.data.resultUuid && !mission) {
    throw new ModuleError(ERROR_CODES.CONFLICT, "A Request já possui resultUuid, mas não existe Mission canônica com esta origem.");
  }
  if (mission && request.data.resultUuid && request.data.resultUuid !== mission.uuid) {
    throw new ModuleError(ERROR_CODES.CONFLICT, "A Request aponta para resultado diferente da Mission encontrada por origem.");
  }

  const beforeRequest = foundry.utils.deepClone(request.data);
  const requester = game.users.find?.((candidate) => candidate.uuid === request.data.requesterUserUuid)
    ?? game.users.contents?.find?.((candidate) => candidate.uuid === request.data.requesterUserUuid)
    ?? null;
  let createdMission = false;

  try {
    if (!mission) {
      const details = String(request.data.proposal?.details ?? "").trim();
      const briefing = [String(request.data.intent ?? "").trim(), details].filter(Boolean).join("\n\n");
      mission = await createRecord({
        recordType: RECORD_TYPES.MISSION,
        name: request.data.proposal?.title ?? request.document.name,
        controllerIds: requester && !requester.isGM ? [requester.id] : [],
        data: {
          primaryDomainUuid: domain.uuid,
          relatedDomainUuids: structuredClone(request.data.relatedDomainUuids ?? []),
          origin: { kind: "request", uuid: request.uuid },
          status: "available",
          briefing,
          audienceUserIds: requester && !requester.isGM ? [requester.id] : [],
          objectives: [],
          assignments: [],
          startedAtWorldTime: null,
          resolvedAtWorldTime: null,
          outcomeSummary: ""
        }
      });
      createdMission = true;
    }

    if (request.data.resultUuid !== mission.uuid) {
      const nextData = foundry.utils.deepClone(request.data);
      nextData.entityId = request.data.entityId;
      nextData.resultUuid = mission.uuid;
      nextData.history = [
        ...(nextData.history ?? []),
        {
          kind: "mission-created",
          summary: `Mission criada: ${mission.document.name}`,
          userUuid: caller.uuid,
          tick: null
        }
      ];
      const requesterUserId = requesterIdFromUuid(request.data.requesterUserUuid);
      await updateRecord({
        uuid: request.uuid,
        recordType: RECORD_TYPES.REQUEST,
        name: request.document.name,
        data: nextData,
        controllerIds: requesterUserId ? [requesterUserId] : []
      });
    }
  } catch (error) {
    if (createdMission && mission?.uuid) {
      try { await deleteRecord(mission.uuid); } catch (rollbackError) {
        console.error("[DomainManager] Falha ao remover Mission após erro de materialização de Request:", rollbackError);
      }
    }
    throw error;
  }

  const result = missionResult(mission, { reused: !createdMission });
  return {
    result,
    entities: [domain.data.entityId, request.data.entityId, mission.data.entityId],
    events: createdMission ? [
      { type: EVENT_TYPES.MISSION_CREATED, entities: [domain.data.entityId, mission.data.entityId], payload: result },
      { type: EVENT_TYPES.REQUEST_MISSION_CREATED, entities: [request.data.entityId, mission.data.entityId], payload: result }
    ] : [],
    rollback: async () => {
      const requesterUserId = requesterIdFromUuid(request.data.requesterUserUuid);
      await updateRecord({
        uuid: request.uuid,
        recordType: RECORD_TYPES.REQUEST,
        name: request.document.name,
        data: beforeRequest,
        controllerIds: requesterUserId ? [requesterUserId] : []
      });
      if (createdMission && mission?.uuid) await deleteRecord(mission.uuid);
    }
  };
}


function assertExpectedModifiedTime(record, expectedModifiedTime, message) {
  const currentModifiedTime = record.document._stats?.modifiedTime ?? null;
  if (expectedModifiedTime !== null && currentModifiedTime !== expectedModifiedTime) {
    throw new ModuleError(ERROR_CODES.CONFLICT, message);
  }
}

export async function executeRequestWithdraw({ payload, callerUserId }) {
  const normalized = normalizeRequestLifecyclePayload(payload);
  const caller = callerFromId(callerUserId);
  const request = resolveReference(normalized.request, RECORD_TYPES.REQUEST, "Request");
  assertExpectedModifiedTime(request, normalized.expectedModifiedTime, "A Request mudou enquanto a retirada estava sendo confirmada.");

  if (request.data.requesterUserUuid !== caller.uuid) {
    throw new ModuleError(ERROR_CODES.PERMISSION, "Somente o próprio solicitante pode retirar esta Request.");
  }

  const beforeData = foundry.utils.deepClone(request.data);
  const nextData = planRequestWithdrawal(request.data, {
    withdrawnByUserUuid: caller.uuid,
    summary: normalized.summary
  });
  nextData.entityId = request.data.entityId;
  const requesterUserId = requesterIdFromUuid(request.data.requesterUserUuid);
  const updated = await updateRecord({
    uuid: request.uuid,
    recordType: RECORD_TYPES.REQUEST,
    name: request.document.name,
    data: nextData,
    controllerIds: requesterUserId ? [requesterUserId] : []
  });

  return {
    result: requestResult(updated),
    entities: [updated.data.entityId],
    events: [{
      type: EVENT_TYPES.REQUEST_WITHDRAWN,
      entities: [updated.data.entityId],
      payload: requestResult(updated)
    }],
    rollback: () => updateRecord({
      uuid: request.uuid,
      recordType: RECORD_TYPES.REQUEST,
      name: request.document.name,
      data: beforeData,
      controllerIds: requesterUserId ? [requesterUserId] : []
    })
  };
}

export async function executeRequestFulfill({ payload, callerUserId }) {
  const normalized = normalizeRequestLifecyclePayload(payload);
  const caller = callerFromId(callerUserId);
  if (!isModuleManager(caller)) {
    throw new ModuleError(ERROR_CODES.PERMISSION, "Somente o Mestre ou Assistente do Mestre pode confirmar o cumprimento de uma Request.");
  }

  const request = resolveReference(normalized.request, RECORD_TYPES.REQUEST, "Request");
  assertExpectedModifiedTime(request, normalized.expectedModifiedTime, "A Request mudou enquanto o cumprimento estava sendo confirmado.");
  if (request.data.status !== "approved") {
    throw new ModuleError(ERROR_CODES.CONFLICT, "Somente Request aprovada pode ser marcada como cumprida.");
  }

  const handling = request.data.gmDecision?.handling ?? "none";
  let fulfillmentEvidence = null;

  if (handling === "immediate") {
    if (request.data.resultUuid) {
      throw new ModuleError(ERROR_CODES.CONFLICT, "Request de atendimento imediato possui resultUuid inesperado.");
    }
    fulfillmentEvidence = { kind: "immediate", resultUuid: null };
  } else if (handling === "mission") {
    if (!request.data.resultUuid) {
      throw new ModuleError(ERROR_CODES.CONFLICT, "Request encaminhada como Mission ainda não possui resultado materializado.");
    }
    const missionDocument = recordIndex.get(RECORD_TYPES.MISSION, request.data.resultUuid);
    if (!missionDocument) {
      throw new ModuleError(ERROR_CODES.NOT_FOUND, "Mission vinculada à Request não foi encontrada.");
    }
    const mission = decodeRecord(missionDocument);
    if (mission.data.origin?.kind !== "request" || mission.data.origin?.uuid !== request.uuid) {
      throw new ModuleError(ERROR_CODES.CONFLICT, "Mission vinculada não possui provenance canônica para esta Request.");
    }
    if (mission.data.status !== "resolved") {
      throw new ModuleError(
        ERROR_CODES.CONFLICT,
        mission.data.status === "failed"
          ? "Mission falhou; a Request não pode ser marcada como cumprida."
          : "A Mission vinculada precisa estar resolvida antes do cumprimento da Request."
      );
    }
    fulfillmentEvidence = { kind: "mission", resultUuid: mission.uuid, missionStatus: mission.data.status };
  } else {
    throw new ModuleError(
      ERROR_CODES.CONFLICT,
      `O encaminhamento '${handling}' ainda não possui regra canônica de fulfillment.`
    );
  }

  const beforeData = foundry.utils.deepClone(request.data);
  const nextData = planRequestFulfillment(request.data, {
    fulfilledByUserUuid: caller.uuid,
    summary: normalized.summary
  });
  nextData.entityId = request.data.entityId;
  const requesterUserId = requesterIdFromUuid(request.data.requesterUserUuid);
  const updated = await updateRecord({
    uuid: request.uuid,
    recordType: RECORD_TYPES.REQUEST,
    name: request.document.name,
    data: nextData,
    controllerIds: requesterUserId ? [requesterUserId] : []
  });

  const result = { ...requestResult(updated), fulfillmentEvidence };
  return {
    result,
    entities: [updated.data.entityId],
    events: [{
      type: EVENT_TYPES.REQUEST_FULFILLED,
      entities: [updated.data.entityId],
      payload: result
    }],
    rollback: () => updateRecord({
      uuid: request.uuid,
      recordType: RECORD_TYPES.REQUEST,
      name: request.document.name,
      data: beforeData,
      controllerIds: requesterUserId ? [requesterUserId] : []
    })
  };
}
