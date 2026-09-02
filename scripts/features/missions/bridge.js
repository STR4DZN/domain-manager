import {
  RECORD_TYPES
} from "../../core/constants.js";
import {
  ERROR_CODES,
  ModuleError
} from "../../core/errors.js";
import {
  getRecord,
  updateRecord
} from "../../data/journal-store.js";
import {
  findMissionByOrigin
} from "./selectors.js";
import {
  createMissionAction
} from "./actions.js";

function assertGM() {
  if (!game.user.isGM) {
    throw new ModuleError(
      ERROR_CODES.PERMISSION,
      "Somente GM transforma Request em Mission."
    );
  }
}

function assertRevision(
  document,
  expectedModifiedTime
) {
  if (expectedModifiedTime == null) return;

  if (
    (document._stats?.modifiedTime ?? null)
    !== expectedModifiedTime
  ) {
    throw new ModuleError(
      ERROR_CODES.CONFLICT,
      "A Request mudou enquanto a ação estava aberta."
    );
  }
}

export async function createMissionFromRequestAction({
  requestUuid,
  expectedModifiedTime
}) {
  assertGM();

  const request = await getRecord(requestUuid);
  if (request.recordType !== RECORD_TYPES.REQUEST) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      "O registro não é uma Request."
    );
  }

  assertRevision(
    request.document,
    expectedModifiedTime
  );

  if (request.data.status !== "approved") {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      "A Request precisa estar aprovada antes de virar Mission."
    );
  }

  let mission = findMissionByOrigin(
    "request",
    request.uuid
  );

  if (!mission) {
    const requester = game.users.find(
      (user) =>
        user.uuid === request.data.requesterUserUuid
    );

    mission = await createMissionAction({
      name: request.data.proposal.title,
      primaryDomainUuid:
        request.data.primaryDomainUuid,
      relatedDomainUuids:
        request.data.relatedDomainUuids,
      audienceUserIds:
        requester && !requester.isGM
          ? [requester.id]
          : [],
      status: "available",
      briefing:
        request.data.intent
        + (
          request.data.proposal.details
            ? `\n\n${request.data.proposal.details}`
            : ""
        ),
      originKind: "request",
      originUuid: request.uuid
    });
  }

  if (
    request.data.resultUuid !== mission.uuid
    || request.data.gmDecision.handling !== "mission"
  ) {
    const nextRequestData = {
      ...request.data,
      resultUuid: mission.uuid,
      gmDecision: {
        ...request.data.gmDecision,
        handling: "mission"
      },
      history: [
        ...(request.data.history ?? []),
        {
          kind: "mission-created",
          summary:
            `Mission criada: ${mission.document.name}`,
          userUuid: game.user.uuid,
          tick: null
        }
      ]
    };

    const requesterId = game.users.find(
      (user) =>
        user.uuid === request.data.requesterUserUuid
    )?.id;

    await updateRecord({
      uuid: request.uuid,
      recordType: RECORD_TYPES.REQUEST,
      name: request.document.name,
      data: nextRequestData,
      controllerIds:
        requesterId ? [requesterId] : []
    });
  }

  return mission;
}
