import {
  RECORD_TYPES
} from "../../core/constants.js";
import {
  getResourceCatalogSetting
} from "../../core/settings.js";
import { COMMAND_TYPES } from "../../core/constants.js";
import { dispatchAuthoritativeCommand } from "../../commands/execute.js";
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
  upsertFlow
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
  allowNegative = false,
  category = null,
  tags = null
}) {
  assertGM();
  const catalog = getResourceCatalogSetting();
  const existing = originalId ? (catalog.resources ?? []).find((entry) => entry.id === originalId) : null;
  const result = await dispatchAuthoritativeCommand({
    commandType: COMMAND_TYPES.RESOURCE_CATALOG_UPSERT,
    operationId: foundry.utils.randomID(),
    payload: {
      originalId,
      expectedCatalogVersion: catalog.version ?? 1,
      id: originalId || undefined,
      name,
      unit,
      precision,
      allowNegative,
      category: category ?? existing?.category ?? "general",
      tags: tags ?? existing?.tags ?? []
    }
  }, { callerUserId: game.user.id });
  return result.resource ?? null;
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


  const existingFlow = localId
    ? (record.data.economy?.flows ?? []).find((entry) => entry.localId === localId)
    : null;
  const normalizedPeriodTicks = Number(periodTicks);
  const carry = existingFlow && existingFlow.periodTicks === normalizedPeriodTicks
    ? Number(existingFlow.carry ?? 0)
    : 0;

  const flow =
    normalizeFlow(
      {
        localId,
        name,
        resourceId,
        direction,
        amount,
        periodTicks: normalizedPeriodTicks,
        carry,
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
  await dispatchAuthoritativeCommand({
    commandType: COMMAND_TYPES.RESOURCE_CATALOG_REMOVE,
    operationId: foundry.utils.randomID(),
    payload: { resourceId, expectedCatalogVersion: catalog.version ?? 1 }
  }, { callerUserId: game.user.id });
  return getResourceCatalogSetting();
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
