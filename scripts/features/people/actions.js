import { RECORD_TYPES } from "../../core/constants.js";
import {
  ERROR_CODES,
  ModuleError
} from "../../core/errors.js";
import {
  getRecord,
  updateRecord
} from "../../data/journal-store.js";
import {
  normalizeGroup,
  normalizeNotable,
  normalizePopulationSummary,
  removeLocalRecord,
  upsertLocalRecord
} from "./rules.js";

function assertGM() {
  if (!game.user.isGM) {
    throw new ModuleError(
      ERROR_CODES.PERMISSION,
      "Somente GM altera People no Bloco 4."
    );
  }
}

function assertRevision(document, expectedModifiedTime) {
  if (expectedModifiedTime == null) return;

  const current = document._stats?.modifiedTime ?? null;
  if (current !== expectedModifiedTime) {
    throw new ModuleError(
      ERROR_CODES.CONFLICT,
      "O Domain mudou enquanto o formulário estava aberto."
    );
  }
}

async function loadDomain(domainUuid, expectedModifiedTime) {
  assertGM();
  const record = await getRecord(domainUuid);

  if (record.recordType !== RECORD_TYPES.DOMAIN) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      "O registro não é um Domain."
    );
  }

  assertRevision(record.document, expectedModifiedTime);
  return record;
}

async function persistPopulation(record, population) {
  return updateRecord({
    uuid: record.uuid,
    recordType: RECORD_TYPES.DOMAIN,
    name: record.document.name,
    data: {
      ...record.data,
      population
    },
    controllerIds: record.data.governance.controllers
  });
}

export async function updatePopulationSummaryAction({
  domainUuid,
  expectedModifiedTime,
  total,
  countMode
}) {
  const record = await loadDomain(domainUuid, expectedModifiedTime);
  const summary = normalizePopulationSummary({ total, countMode });

  return persistPopulation(record, {
    ...record.data.population,
    ...summary
  });
}

export async function upsertGroupAction({
  domainUuid,
  expectedModifiedTime,
  localId = null,
  name,
  count,
  includedInTotal,
  function: functionName,
  quality,
  status,
  assignment
}) {
  const record = await loadDomain(domainUuid, expectedModifiedTime);
  const group = normalizeGroup({
    localId: localId || foundry.utils.randomID(),
    name,
    count,
    includedInTotal,
    function: functionName,
    quality,
    status,
    assignment
  });

  const groups = upsertLocalRecord(
    record.data.population?.groups,
    group
  );

  return persistPopulation(record, {
    ...record.data.population,
    groups
  });
}

export async function removeGroupAction({
  domainUuid,
  expectedModifiedTime,
  localId
}) {
  const record = await loadDomain(domainUuid, expectedModifiedTime);
  const groups = removeLocalRecord(
    record.data.population?.groups,
    localId
  );

  return persistPopulation(record, {
    ...record.data.population,
    groups
  });
}

export async function upsertNotableAction({
  domainUuid,
  expectedModifiedTime,
  localId = null,
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
  const record = await loadDomain(domainUuid, expectedModifiedTime);

  if (actorUuid) {
    const actor = await fromUuid(actorUuid);
    if (!actor || actor.documentName !== "Actor") {
      throw new ModuleError(
        ERROR_CODES.VALIDATION,
        "actorUuid precisa apontar para um Actor existente."
      );
    }
  }

  if (currentLocationUuid) {
    const location = await getRecord(currentLocationUuid);
    if (location.recordType !== RECORD_TYPES.DOMAIN) {
      throw new ModuleError(
        ERROR_CODES.VALIDATION,
        "currentLocationUuid precisa apontar para um Domain."
      );
    }
  }

  const notable = normalizeNotable({
    localId: localId || foundry.utils.randomID(),
    name,
    actorUuid,
    portrait,
    function: functionName,
    specialization,
    role,
    description,
    currentLocationUuid,
    status,
    assignment
  });

  const notables = upsertLocalRecord(
    record.data.population?.notables,
    notable
  );

  return persistPopulation(record, {
    ...record.data.population,
    notables
  });
}

export async function removeNotableAction({
  domainUuid,
  expectedModifiedTime,
  localId
}) {
  const record = await loadDomain(domainUuid, expectedModifiedTime);
  const notables = removeLocalRecord(
    record.data.population?.notables,
    localId
  );

  return persistPopulation(record, {
    ...record.data.population,
    notables
  });
}
