import {
  DOMAIN_NATURES,
  DOMAIN_STATES,
  RECORD_TYPES
} from "../../core/constants.js";
import { ModuleError, ERROR_CODES } from "../../core/errors.js";
import {
  createRecord,
  getRecord,
  updateRecord
} from "../../data/journal-store.js";
import { recordIndex } from "../../data/record-index.js";
import { decodeRecord } from "../../models/record-codec.js";
import {
  normalizeDomainDraft
} from "./rules.js";
import {
  assertNoSelfReference,
  wouldCreateCycle
} from "./hierarchy.js";

function assertGM() {
  if (!game.user.isGM) {
    throw new ModuleError(
      ERROR_CODES.PERMISSION,
      "Somente GM pode criar ou editar Domains oficiais no Bloco 1."
    );
  }
}

function assertUserIdsExist(userIds) {
  for (const userId of userIds) {
    if (!game.users.get(userId)) {
      throw new ModuleError(
        ERROR_CODES.VALIDATION,
        `Controller inexistente: ${userId}`
      );
    }
  }
}

async function assertDomainReference(uuid, label) {
  if (!uuid) return;

  const record = await getRecord(uuid);
  if (record.recordType !== RECORD_TYPES.DOMAIN) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      `${label} precisa apontar para outro Domain.`
    );
  }
}

function getAdministrativeParent(uuid) {
  const document = recordIndex.get(
    RECORD_TYPES.DOMAIN,
    uuid
  );
  if (!document) return null;

  return decodeRecord(document)
    .data.hierarchy.administrativeParentUuid ?? null;
}

function getLocatedParent(uuid) {
  const document = recordIndex.get(
    RECORD_TYPES.DOMAIN,
    uuid
  );
  if (!document) return null;

  return decodeRecord(document)
    .data.hierarchy.locatedInUuid ?? null;
}

async function validateHierarchy({
  domainUuid = null,
  locatedInUuid = null,
  administrativeParentUuid = null
}) {
  await assertDomainReference(
    locatedInUuid,
    "Localização"
  );
  await assertDomainReference(
    administrativeParentUuid,
    "Administração superior"
  );

  if (!domainUuid) return;

  assertNoSelfReference(
    domainUuid,
    locatedInUuid,
    "Localização"
  );
  assertNoSelfReference(
    domainUuid,
    administrativeParentUuid,
    "Administração superior"
  );

  if (wouldCreateCycle({
    domainUuid,
    candidateParentUuid: locatedInUuid,
    getParentUuid: getLocatedParent
  })) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      "Essa localização criaria um ciclo na hierarquia física."
    );
  }

  if (wouldCreateCycle({
    domainUuid,
    candidateParentUuid: administrativeParentUuid,
    getParentUuid: getAdministrativeParent
  })) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      "Essa administração superior criaria um ciclo."
    );
  }
}

function validateEnums({ nature, state }) {
  if (!DOMAIN_NATURES.includes(nature)) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      `Nature inválida: ${nature}`
    );
  }

  if (!DOMAIN_STATES.includes(state)) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      `State inválido: ${state}`
    );
  }
}

export async function createDomainAction({
  name,
  description = "",
  category = "Base",
  nature = "physical",
  state = "active",
  tags = [],
  controllerIds = [],
  locatedInUuid = null,
  administrativeParentUuid = null
}) {
  assertGM();

  const cleanName = String(name ?? "").trim();
  if (!cleanName) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      "O nome do Domain é obrigatório."
    );
  }

  validateEnums({ nature, state });
  assertUserIdsExist(controllerIds);

  await validateHierarchy({
    locatedInUuid,
    administrativeParentUuid,
    population: null,
    economy: null
  });

  const data = normalizeDomainDraft({
    description,
    category,
    nature,
    state,
    tags,
    controllers: controllerIds,
    locatedInUuid,
    administrativeParentUuid
  });

  return createRecord({
    recordType: RECORD_TYPES.DOMAIN,
    name: cleanName,
    data,
    controllerIds: data.governance.controllers
  });
}

export async function updateDomainAction({
  domainUuid,
  expectedModifiedTime,
  name,
  description,
  category,
  nature,
  state,
  tags,
  controllerIds,
  locatedInUuid,
  administrativeParentUuid
}) {
  assertGM();

  const record = await getRecord(domainUuid);

  if (record.recordType !== RECORD_TYPES.DOMAIN) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      "O registro não é um Domain."
    );
  }

  const currentModifiedTime =
    record.document._stats?.modifiedTime ?? null;

  if (
    expectedModifiedTime != null
    && currentModifiedTime !== expectedModifiedTime
  ) {
    throw new ModuleError(
      ERROR_CODES.CONFLICT,
      "O Domain mudou enquanto o formulário estava aberto."
    );
  }

  const cleanName = String(name ?? "").trim();
  if (!cleanName) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      "O nome do Domain é obrigatório."
    );
  }

  validateEnums({ nature, state });
  assertUserIdsExist(controllerIds);

  await validateHierarchy({
    domainUuid,
    locatedInUuid,
    administrativeParentUuid
  });

  const data = normalizeDomainDraft({
    description,
    category,
    nature,
    state,
    tags,
    controllers: controllerIds,
    locatedInUuid,
    administrativeParentUuid,
    population: record.data.population,
    economy: record.data.economy,
    existingData: record.data
  });

  return updateRecord({
    uuid: domainUuid,
    recordType: RECORD_TYPES.DOMAIN,
    name: cleanName,
    data,
    controllerIds: data.governance.controllers
  });
}

export async function deleteDomainAction({ domainUuid }) {
  assertGM();
  const record = await getRecord(domainUuid);
  if (record.recordType !== RECORD_TYPES.DOMAIN) {
    throw new ModuleError(ERROR_CODES.VALIDATION, "O registro não é um Domain.");
  }

  // 1. Desvincular filhos deste domínio (tornando-os independentes)
  const allDomains = recordIndex.list(RECORD_TYPES.DOMAIN);
  for (const doc of allDomains) {
    if (doc.uuid === domainUuid) continue;
    const dec = decodeRecord(doc);
    if (!dec?.data?.hierarchy) continue;
    let modified = false;
    const hierarchy = { ...dec.data.hierarchy };
    if (hierarchy.locatedInUuid === domainUuid) {
      hierarchy.locatedInUuid = null;
      modified = true;
    }
    if (hierarchy.administrativeParentUuid === domainUuid) {
      hierarchy.administrativeParentUuid = null;
      modified = true;
    }
    if (modified) {
      const nextData = { ...dec.data, hierarchy };
      await updateRecord({
        uuid: doc.uuid,
        recordType: RECORD_TYPES.DOMAIN,
        name: doc.name,
        data: nextData
      });
    }
  }

  // 2. Excluir o documento do Journal
  await record.document.delete();
  recordIndex.remove(domainUuid);
  return true;
}

