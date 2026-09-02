import {
  GROUP_STATUSES,
  NOTABLE_STATUSES,
  POPULATION_COUNT_MODES
} from "../../core/constants.js";
import {
  ERROR_CODES,
  ModuleError
} from "../../core/errors.js";

function cleanText(value) {
  return String(value ?? "").trim();
}

export function normalizePopulationSummary({
  total,
  countMode
}) {
  const normalizedTotal = Number(total);

  if (
    !Number.isInteger(normalizedTotal)
    || normalizedTotal < 0
  ) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      "População total precisa ser um inteiro maior ou igual a zero."
    );
  }

  if (
    !POPULATION_COUNT_MODES.includes(countMode)
  ) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      `countMode inválido: ${countMode}`
    );
  }

  return {
    total: normalizedTotal,
    countMode
  };
}

export function normalizeGroup({
  localId,
  name,
  count,
  includedInTotal = true,
  function: functionName = "",
  quality = "",
  status = "active",
  assignment = ""
}) {
  const cleanName = cleanText(name);
  const normalizedCount = Number(count);

  if (!cleanName) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      "O nome do grupo é obrigatório."
    );
  }

  if (
    !Number.isInteger(normalizedCount)
    || normalizedCount < 0
  ) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      "A quantidade do grupo precisa ser um inteiro maior ou igual a zero."
    );
  }

  if (!GROUP_STATUSES.includes(status)) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      `Status de grupo inválido: ${status}`
    );
  }

  return {
    localId: cleanText(localId),
    name: cleanName,
    count: normalizedCount,
    includedInTotal: Boolean(includedInTotal),
    function: cleanText(functionName),
    quality: cleanText(quality),
    status,
    assignment: cleanText(assignment)
  };
}

export function normalizeNotable({
  localId,
  name,
  actorUuid = null,
  portrait = "",
  function: functionName = "",
  specialization = "",
  role = "",
  description = "",
  currentLocationUuid = null,
  status = "active",
  assignment = ""
}) {
  const cleanName = cleanText(name);

  if (!cleanName) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      "O nome do NPC é obrigatório."
    );
  }

  if (!NOTABLE_STATUSES.includes(status)) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      `Status de NPC inválido: ${status}`
    );
  }

  return {
    localId: cleanText(localId),
    name: cleanName,
    actorUuid: cleanText(actorUuid) || null,
    portrait: cleanText(portrait),
    function: cleanText(functionName),
    specialization: cleanText(specialization),
    role: cleanText(role),
    description: cleanText(description),
    currentLocationUuid: cleanText(currentLocationUuid) || null,
    status,
    assignment: cleanText(assignment)
  };
}

export function upsertLocalRecord(collection, entry) {
  const result = structuredClone(collection ?? []);
  const index = result.findIndex(
    (existing) => existing.localId === entry.localId
  );

  if (index >= 0) result[index] = entry;
  else result.push(entry);

  return result;
}

export function removeLocalRecord(collection, localId) {
  return (collection ?? []).filter(
    (entry) => entry.localId !== localId
  );
}

export function derivePopulationSummary(population) {
  const total = population?.total ?? 0;
  const groups = population?.groups ?? [];

  const includedGroupCount = groups
    .filter((group) => group.includedInTotal)
    .reduce((sum, group) => sum + group.count, 0);

  return {
    total,
    countMode: population?.countMode ?? "direct",
    groupCount: groups.length,
    includedGroupCount,
    ungroupedEstimate: Math.max(0, total - includedGroupCount),
    groupsExceedTotal: includedGroupCount > total,
    notableCount: population?.notables?.length ?? 0
  };
}
