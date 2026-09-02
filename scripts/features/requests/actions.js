import {
  RECORD_TYPES
} from "../../core/constants.js";
import {
  ERROR_CODES,
  ModuleError
} from "../../core/errors.js";
import {
  createRecord,
  getRecord,
  listRecordDocuments,
  updateRecord
} from "../../data/journal-store.js";
import {
  decodeRecord
} from "../../models/record-codec.js";
import {
  canControlDomain
} from "../domains/rules.js";
import {
  normalizeRequestDraft,
  planRequestDecision
} from "./rules.js";

function userFromId(userId) {
  const user = game.users.get(userId);

  if (!user) {
    throw new ModuleError(
      ERROR_CODES.PERMISSION,
      "Usuário de origem não encontrado."
    );
  }

  return user;
}

function userIdFromUuid(userUuid) {
  return game.users.find(
    (user) => user.uuid === userUuid
  )?.id ?? null;
}

function assertGM() {
  if (!game.user.isGM) {
    throw new ModuleError(
      ERROR_CODES.PERMISSION,
      "A revisão oficial de Requests deve executar em um cliente GM."
    );
  }
}

function findRequestByOperationId(operationId) {
  for (
    const document
    of listRecordDocuments(RECORD_TYPES.REQUEST)
  ) {
    const record = decodeRecord(document);

    if (
      record.data.operationId === operationId
    ) {
      return record;
    }
  }

  return null;
}

export async function performCreateRequest(
  payload,
  callerUserId
) {
  assertGM();

  const caller = userFromId(callerUserId);
  const duplicate = findRequestByOperationId(
    payload.operationId
  );

  if (duplicate) {
    if (
      duplicate.data.requesterUserUuid
      !== caller.uuid
    ) {
      throw new ModuleError(
        ERROR_CODES.CONFLICT,
        "operationId já foi usado por outro usuário."
      );
    }

    return {
      uuid: duplicate.uuid,
      duplicate: true
    };
  }

  const domain = await getRecord(
    payload.primaryDomainUuid
  );

  if (domain.recordType !== RECORD_TYPES.DOMAIN) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      "A solicitação precisa apontar para um Domain."
    );
  }

  if (!canControlDomain(caller, domain.data)) {
    throw new ModuleError(
      ERROR_CODES.PERMISSION,
      "Você não controla este Domain."
    );
  }

  const data = normalizeRequestDraft({
    operationId: payload.operationId,
    type: payload.type,
    requesterUserUuid: caller.uuid,
    primaryDomainUuid: domain.uuid,
    intent: payload.intent,
    title: payload.title,
    details: payload.details
  });

  const record = await createRecord({
    recordType: RECORD_TYPES.REQUEST,
    name: data.proposal.title,
    data,
    controllerIds: [caller.id]
  });

  return {
    uuid: record.uuid,
    duplicate: false
  };
}

export async function reviewRequestAction({
  requestUuid,
  expectedModifiedTime,
  status,
  summary,
  handling = "none"
}) {
  assertGM();

  const record = await getRecord(requestUuid);

  if (record.recordType !== RECORD_TYPES.REQUEST) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      "O registro não é uma Request."
    );
  }

  const currentModifiedTime =
    record.document._stats?.modifiedTime ?? null;

  if (
    expectedModifiedTime != null
    && currentModifiedTime
      !== expectedModifiedTime
  ) {
    throw new ModuleError(
      ERROR_CODES.CONFLICT,
      "A Request mudou enquanto a revisão estava aberta."
    );
  }

  const requesterUserId =
    userIdFromUuid(
      record.data.requesterUserUuid
    );

  const nextData = planRequestDecision(
    record.data,
    {
      status,
      summary,
      handling,
      decidedByUserUuid: game.user.uuid
    }
  );

  return updateRecord({
    uuid: requestUuid,
    recordType: RECORD_TYPES.REQUEST,
    name: record.document.name,
    data: nextData,
    controllerIds:
      requesterUserId
        ? [requesterUserId]
        : []
  });
}
