import {
  MISSION_OBJECTIVE_STATUSES,
  MISSION_ORIGIN_KINDS,
  MISSION_STATUSES
} from "../../core/constants.js";
import {
  ERROR_CODES,
  ModuleError
} from "../../core/errors.js";

function clean(value) {
  return String(value ?? "").trim();
}

export function normalizeMissionDraft({
  primaryDomainUuid,
  relatedDomainUuids = [],
  originKind = "manual",
  originUuid = null,
  status = "planned",
  briefing = "",
  audienceUserIds = [],
  objectives = [],
  outcomeSummary = ""
}) {
  if (!primaryDomainUuid) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      "Mission precisa de um Domain principal."
    );
  }

  if (!MISSION_STATUSES.includes(status)) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      `Status de Mission inválido: ${status}`
    );
  }

  if (!MISSION_ORIGIN_KINDS.includes(originKind)) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      `Origem de Mission inválida: ${originKind}`
    );
  }

  if (originKind === "manual" && originUuid) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      "Mission manual não deve possuir originUuid."
    );
  }

  if (originKind !== "manual" && !originUuid) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      "Mission originada exige originUuid."
    );
  }

  const audience = Array.from(
    new Set(
      (audienceUserIds ?? [])
        .map(clean)
        .filter(Boolean)
    )
  );

  const related = Array.from(
    new Set(
      (relatedDomainUuids ?? [])
        .map(clean)
        .filter(
          (uuid) =>
            uuid
            && uuid !== primaryDomainUuid
        )
    )
  );

  return {
    primaryDomainUuid,
    relatedDomainUuids: related,
    origin: {
      kind: originKind,
      uuid:
        originKind === "manual"
          ? null
          : originUuid
    },
    status,
    briefing: clean(briefing),
    audienceUserIds: audience,
    objectives:
      structuredClone(objectives ?? []),
    outcomeSummary:
      clean(outcomeSummary)
  };
}

export function normalizeObjective({
  localId,
  title,
  description = "",
  status = "pending",
  optional = false
}) {
  const cleanTitle = clean(title);

  if (!cleanTitle) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      "O título do objetivo é obrigatório."
    );
  }

  if (
    !MISSION_OBJECTIVE_STATUSES.includes(status)
  ) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      `Status de objetivo inválido: ${status}`
    );
  }

  return {
    localId: clean(localId),
    title: cleanTitle,
    description: clean(description),
    status,
    optional: Boolean(optional)
  };
}

export function upsertObjective(
  objectives,
  objective
) {
  const result =
    structuredClone(objectives ?? []);
  const index = result.findIndex(
    (entry) =>
      entry.localId === objective.localId
  );

  if (index >= 0) result[index] = objective;
  else result.push(objective);

  return result;
}

export function removeObjective(
  objectives,
  localId
) {
  return (objectives ?? []).filter(
    (objective) =>
      objective.localId !== localId
  );
}

export function deriveObjectiveSummary(
  objectives
) {
  const required = (objectives ?? [])
    .filter((objective) => !objective.optional);

  return {
    total: objectives?.length ?? 0,
    required: required.length,
    completed:
      (objectives ?? []).filter(
        (objective) =>
          objective.status === "completed"
      ).length,
    requiredCompleted:
      required.filter(
        (objective) =>
          objective.status === "completed"
      ).length,
    requiredFailed:
      required.filter(
        (objective) =>
          objective.status === "failed"
      ).length,
    allRequiredCompleted:
      required.length > 0
      && required.every(
        (objective) =>
          objective.status === "completed"
      )
  };
}
