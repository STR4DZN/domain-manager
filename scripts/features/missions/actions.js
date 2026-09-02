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
  updateRecord
} from "../../data/journal-store.js";
import {
  normalizeMissionDraft,
  normalizeObjective,
  removeObjective,
  upsertObjective
} from "./rules.js";

function assertGM() {
  if (!game.user.isGM) {
    throw new ModuleError(
      ERROR_CODES.PERMISSION,
      "Somente GM altera Missions no Bloco 6."
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
      "A Mission mudou enquanto o formulário estava aberto."
    );
  }
}

async function loadDomain(uuid) {
  const record = await getRecord(uuid);
  if (record.recordType !== RECORD_TYPES.DOMAIN) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      "Mission precisa apontar para um Domain."
    );
  }
  return record;
}

function validateAudience(userIds) {
  const unique = Array.from(
    new Set(userIds ?? [])
  );

  for (const id of unique) {
    const user = game.users.get(id);
    if (!user || user.isGM) {
      throw new ModuleError(
        ERROR_CODES.VALIDATION,
        `Audiência inválida: ${id}`
      );
    }
  }

  return unique;
}

async function validateRelatedDomains(
  primaryDomainUuid,
  relatedDomainUuids
) {
  for (const uuid of relatedDomainUuids ?? []) {
    if (uuid === primaryDomainUuid) {
      throw new ModuleError(
        ERROR_CODES.VALIDATION,
        "Domain principal não deve ser repetido como relacionado."
      );
    }
    await loadDomain(uuid);
  }
}

async function loadMission(
  missionUuid,
  expectedModifiedTime
) {
  assertGM();
  const record = await getRecord(missionUuid);
  if (record.recordType !== RECORD_TYPES.MISSION) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      "O registro não é uma Mission."
    );
  }
  assertRevision(
    record.document,
    expectedModifiedTime
  );
  return record;
}

export async function createMissionAction({
  name,
  primaryDomainUuid,
  relatedDomainUuids = [],
  audienceUserIds = [],
  status = "planned",
  briefing = "",
  outcomeSummary = "",
  originKind = "manual",
  originUuid = null
}) {
  assertGM();

  const cleanName = String(name ?? "").trim();
  if (!cleanName) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      "Nome da Mission é obrigatório."
    );
  }

  await loadDomain(primaryDomainUuid);
  await validateRelatedDomains(
    primaryDomainUuid,
    relatedDomainUuids
  );
  const audience = validateAudience(
    audienceUserIds
  );

  const data = normalizeMissionDraft({
    primaryDomainUuid,
    relatedDomainUuids,
    originKind,
    originUuid,
    status,
    briefing,
    audienceUserIds: audience,
    objectives: [],
    outcomeSummary
  });

  return createRecord({
    recordType: RECORD_TYPES.MISSION,
    name: cleanName,
    data,
    controllerIds: audience
  });
}

export async function updateMissionAction({
  missionUuid,
  expectedModifiedTime,
  name,
  primaryDomainUuid,
  relatedDomainUuids,
  audienceUserIds,
  status,
  briefing,
  outcomeSummary
}) {
  const record = await loadMission(
    missionUuid,
    expectedModifiedTime
  );

  const cleanName = String(name ?? "").trim();
  if (!cleanName) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      "Nome da Mission é obrigatório."
    );
  }

  await loadDomain(primaryDomainUuid);
  await validateRelatedDomains(
    primaryDomainUuid,
    relatedDomainUuids
  );
  const audience = validateAudience(
    audienceUserIds
  );

  const data = normalizeMissionDraft({
    primaryDomainUuid,
    relatedDomainUuids,
    originKind: record.data.origin.kind,
    originUuid: record.data.origin.uuid,
    status,
    briefing,
    audienceUserIds: audience,
    objectives: record.data.objectives,
    outcomeSummary
  });

  return updateRecord({
    uuid: record.uuid,
    recordType: RECORD_TYPES.MISSION,
    name: cleanName,
    data,
    controllerIds: audience
  });
}

export async function upsertMissionObjectiveAction({
  missionUuid,
  expectedModifiedTime,
  localId = null,
  title,
  description = "",
  status = "pending",
  optional = false
}) {
  const record = await loadMission(
    missionUuid,
    expectedModifiedTime
  );

  const objective = normalizeObjective({
    localId:
      localId
      || foundry.utils.randomID(),
    title,
    description,
    status,
    optional
  });

  const data = {
    ...record.data,
    objectives: upsertObjective(
      record.data.objectives,
      objective
    )
  };

  return updateRecord({
    uuid: record.uuid,
    recordType: RECORD_TYPES.MISSION,
    name: record.document.name,
    data,
    controllerIds:
      record.data.audienceUserIds
  });
}

export async function removeMissionObjectiveAction({
  missionUuid,
  expectedModifiedTime,
  localId
}) {
  const record = await loadMission(
    missionUuid,
    expectedModifiedTime
  );

  const data = {
    ...record.data,
    objectives: removeObjective(
      record.data.objectives,
      localId
    )
  };

  return updateRecord({
    uuid: record.uuid,
    recordType: RECORD_TYPES.MISSION,
    name: record.document.name,
    data,
    controllerIds:
      record.data.audienceUserIds
  });
}
