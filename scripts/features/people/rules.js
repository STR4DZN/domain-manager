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

const QUALITY_MORALE = Object.freeze({
  "Muito Alta": 90,
  "Estável": 70,
  "Insatisfeito": 40,
  "Rebelde": 15
});

export function moraleFromQuality(quality, fallback = 60) {
  return QUALITY_MORALE[cleanText(quality)] ?? fallback;
}

export function moraleBand(value) {
  const morale = Math.max(0, Math.min(100, Number(value ?? 0)));
  if (morale >= 80) return "high";
  if (morale >= 55) return "stable";
  if (morale >= 30) return "strained";
  return "critical";
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
  assignment = "",
  morale = null,
  workforceEligible = null
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

  const normalizedMorale = morale == null ? moraleFromQuality(quality) : Number(morale);
  if (!Number.isInteger(normalizedMorale) || normalizedMorale < 0 || normalizedMorale > 100) {
    throw new ModuleError(ERROR_CODES.VALIDATION, "Moral do grupo precisa ser um inteiro entre 0 e 100.");
  }

  const normalizedEligible = workforceEligible == null ? normalizedCount : Number(workforceEligible);
  if (!Number.isInteger(normalizedEligible) || normalizedEligible < 0 || normalizedEligible > normalizedCount) {
    throw new ModuleError(ERROR_CODES.VALIDATION, "Workforce elegível precisa ser um inteiro entre 0 e a quantidade do grupo.");
  }

  return {
    localId: cleanText(localId),
    name: cleanName,
    count: normalizedCount,
    includedInTotal: Boolean(includedInTotal),
    function: cleanText(functionName),
    quality: cleanText(quality),
    status,
    assignment: cleanText(assignment),
    morale: normalizedMorale,
    workforceEligible: normalizedEligible
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
  const total = Number(population?.total ?? 0);
  const groups = population?.groups ?? [];
  const allocations = population?.workforce?.allocations ?? [];

  const includedGroupCount = groups
    .filter((group) => group.includedInTotal)
    .reduce((sum, group) => sum + Number(group.count ?? 0), 0);

  const workforceEligible = groups
    .filter((group) => group.status === "active")
    .reduce((sum, group) => sum + Number(group.workforceEligible ?? 0), 0);
  const workforceAssigned = allocations.reduce((sum, entry) => sum + Number(entry.count ?? 0), 0);

  const weightedGroups = groups.filter((group) => Number(group.count ?? 0) > 0 && group.includedInTotal !== false);
  const weightedCount = weightedGroups.reduce((sum, group) => sum + Number(group.count ?? 0), 0);
  const groupMorale = weightedCount > 0
    ? Math.round(weightedGroups.reduce((sum, group) => sum + Number(group.morale ?? moraleFromQuality(group.quality)) * Number(group.count ?? 0), 0) / weightedCount)
    : Number(population?.morale ?? 60);
  const morale = Math.max(0, Math.min(100, Number(population?.morale ?? groupMorale)));

  return {
    total,
    morale,
    moraleBand: moraleBand(morale),
    countMode: population?.countMode ?? "direct",
    groupCount: groups.length,
    includedGroupCount,
    ungroupedEstimate: Math.max(0, total - includedGroupCount),
    groupsExceedTotal: includedGroupCount > total,
    notableCount: population?.notables?.length ?? 0,
    workforceEligible,
    workforceAssigned,
    workforceAvailable: Math.max(0, workforceEligible - workforceAssigned),
    workforceOverallocated: workforceAssigned > workforceEligible
  };
}
