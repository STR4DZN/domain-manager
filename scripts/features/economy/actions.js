import {
  RECORD_TYPES
} from "../../core/constants.js";
import {
  getResourceCatalogSetting,
  setResourceCatalogSetting
} from "../../core/settings.js";
import {
  parseMinorUnits
} from "../../core/numbers.js";
import {
  ERROR_CODES,
  ModuleError
} from "../../core/errors.js";
import {
  getRecord,
  updateRecord
} from "../../data/journal-store.js";
import {
  normalizeFlow,
  normalizeStockEntries,
  upsertFlow,
  upsertResourceInCatalog
} from "./rules.js";

function assertGM() {
  if (!game.user.isGM) {
    throw new ModuleError(
      ERROR_CODES.PERMISSION,
      "Somente GM altera a economia oficial no Bloco 3."
    );
  }
}

function assertRevision(
  document,
  expectedModifiedTime
) {
  if (expectedModifiedTime == null) return;

  const current =
    document._stats?.modifiedTime ?? null;

  if (
    current !== expectedModifiedTime
  ) {
    throw new ModuleError(
      ERROR_CODES.CONFLICT,
      "O Domain mudou enquanto o formulário estava aberto."
    );
  }
}

export async function upsertResourceDefinitionAction({
  originalId = null,
  name,
  unit = "",
  precision = 0,
  allowNegative = false
}) {
  assertGM();

  const catalog =
    getResourceCatalogSetting();

  const next =
    upsertResourceInCatalog(
      catalog,
      {
        id: originalId || undefined,
        name,
        unit,
        precision,
        allowNegative
      },
      { originalId }
    );

  await setResourceCatalogSetting(next);

  return next.resources.find(
    (resource) =>
      resource.id === (
        originalId
        || next.resources.find(
          (entry) =>
            entry.name === String(name).trim()
        )?.id
      )
  ) ?? null;
}

export async function updateDomainStocksAction({
  domainUuid,
  expectedModifiedTime,
  displayAmounts
}) {
  assertGM();

  const record =
    await getRecord(domainUuid);

  if (
    record.recordType
    !== RECORD_TYPES.DOMAIN
  ) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      "O registro não é um Domain."
    );
  }

  assertRevision(
    record.document,
    expectedModifiedTime
  );

  const catalog =
    getResourceCatalogSetting();

  const resourceById =
    new Map(
      catalog.resources.map(
        (resource) => [
          resource.id,
          resource
        ]
      )
    );

  const entries = Object.entries(
    displayAmounts ?? {}
  ).map(
    ([resourceId, displayAmount]) => {
      const resource =
        resourceById.get(resourceId);

      if (!resource) {
        throw new ModuleError(
          ERROR_CODES.VALIDATION,
          `Recurso desconhecido: ${resourceId}`
        );
      }

      let amount;

      try {
        amount = parseMinorUnits(
          displayAmount,
          resource.precision
        );
      } catch (error) {
        throw new ModuleError(
          ERROR_CODES.VALIDATION,
          `${resource.name}: ${error.message}`,
          { cause: error }
        );
      }

      return {
        resourceId,
        amount
      };
    }
  );

  const stocks =
    normalizeStockEntries(
      entries,
      catalog
    );

  const nextData = {
    ...record.data,

    economy: {
      ...record.data.economy,
      stocks
    }
  };

  return updateRecord({
    uuid: domainUuid,
    recordType: RECORD_TYPES.DOMAIN,
    name: record.document.name,
    data: nextData,
    controllerIds:
      record.data.governance.controllers
  });
}

export async function upsertDomainFlowAction({
  domainUuid,
  expectedModifiedTime,
  localId = null,
  name,
  resourceId,
  direction,
  displayAmount,
  periodTicks,
  category,
  source,
  active
}) {
  assertGM();

  const record =
    await getRecord(domainUuid);

  if (
    record.recordType
    !== RECORD_TYPES.DOMAIN
  ) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      "O registro não é um Domain."
    );
  }

  assertRevision(
    record.document,
    expectedModifiedTime
  );

  const catalog =
    getResourceCatalogSetting();

  const resource =
    catalog.resources.find(
      (entry) =>
        entry.id === resourceId
    );

  if (!resource) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      `Recurso desconhecido: ${resourceId}`
    );
  }

  let amount;

  try {
    amount = parseMinorUnits(
      displayAmount,
      resource.precision
    );
  } catch (error) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      `${resource.name}: ${error.message}`,
      { cause: error }
    );
  }

  const flow =
    normalizeFlow(
      {
        localId,
        name,
        resourceId,
        direction,
        amount,
        periodTicks:
          Number(periodTicks),
        category,
        source,
        active
      },
      catalog
    );

  const flows =
    upsertFlow(
      record.data.economy?.flows,
      flow
    );

  const nextData = {
    ...record.data,

    economy: {
      ...record.data.economy,
      flows
    }
  };

  return updateRecord({
    uuid: domainUuid,
    recordType: RECORD_TYPES.DOMAIN,
    name: record.document.name,
    data: nextData,
    controllerIds:
      record.data.governance.controllers
  });
}

export async function removeResourceDefinitionAction(resourceId) {
  assertGM();
  const catalog = getResourceCatalogSetting();
  const next = {
    version: (catalog.version ?? 1) + 1,
    resources: (catalog.resources ?? []).filter((r) => r.id !== resourceId)
  };
  await setResourceCatalogSetting(next);
  return next;
}

export async function removeDomainFlowAction({ domainUuid, localId }) {
  assertGM();
  const record = await getRecord(domainUuid);
  if (record.recordType !== RECORD_TYPES.DOMAIN) {
    throw new ModuleError(ERROR_CODES.VALIDATION, "O registro não é um Domain.");
  }
  const flows = (record.data.economy?.flows ?? []).filter((f) => f.localId !== localId);
  const nextData = {
    ...record.data,
    economy: {
      ...record.data.economy,
      flows
    }
  };
  return updateRecord({
    uuid: domainUuid,
    recordType: RECORD_TYPES.DOMAIN,
    name: record.document.name,
    data: nextData,
    controllerIds: record.data.governance.controllers
  });
}

