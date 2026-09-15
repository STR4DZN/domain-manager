import { COMMAND_TYPES, RECORD_TYPES } from "../../core/constants.js";
import {
  getResourceCatalogSetting
} from "../../core/settings.js";
import { dispatchAuthoritativeCommand } from "../../commands/execute.js";
import {
  parseMinorUnits
} from "../../core/numbers.js";
import {
  ERROR_CODES,
  ModuleError
} from "../../core/errors.js";
import { getRecord } from "../../data/journal-store.js";

function assertGM() {
  if (!game.user.isGM) {
    throw new ModuleError(
      ERROR_CODES.PERMISSION,
      "Somente GM altera a economia oficial no Bloco 3."
    );
  }
}

function commandOperationId(operationId) {
  return String(operationId ?? "").trim() || foundry.utils.randomID();
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
  displayAmounts,
  operationId = null
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

  await dispatchAuthoritativeCommand({
    commandType: COMMAND_TYPES.ECONOMY_CONFIGURE,
    operationId: commandOperationId(operationId),
    payload: {
      domain: { recordType: RECORD_TYPES.DOMAIN, uuid: domainUuid, entityId: record.data.entityId },
      expectedModifiedTime,
      stocks: entries
    }
  }, { callerUserId: game.user.id });
  return getRecord(domainUuid);
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
  active,
  operationId = null
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

  await dispatchAuthoritativeCommand({
    commandType: COMMAND_TYPES.ECONOMY_FLOW_UPSERT,
    operationId: commandOperationId(operationId),
    payload: {
      domain: { recordType: RECORD_TYPES.DOMAIN, uuid: domainUuid, entityId: record.data.entityId },
      expectedModifiedTime,
      localId,
      name,
      resourceId,
      direction,
      amount,
      periodTicks: Number(periodTicks),
      category,
      source,
      active
    }
  }, { callerUserId: game.user.id });
  return getRecord(domainUuid);
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

export async function removeDomainFlowAction({
  domainUuid,
  localId,
  expectedModifiedTime = null,
  operationId = null
}) {
  assertGM();
  const record = await getRecord(domainUuid);
  if (record.recordType !== RECORD_TYPES.DOMAIN) {
    throw new ModuleError(ERROR_CODES.VALIDATION, "O registro não é um Domain.");
  }
  await dispatchAuthoritativeCommand({
    commandType: COMMAND_TYPES.ECONOMY_FLOW_REMOVE,
    operationId: commandOperationId(operationId),
    payload: {
      domain: { recordType: RECORD_TYPES.DOMAIN, uuid: domainUuid, entityId: record.data.entityId },
      expectedModifiedTime,
      localId
    }
  }, { callerUserId: game.user.id });
  return getRecord(domainUuid);
}
