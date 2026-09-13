import {
  EVENT_TYPES,
  RECORD_TYPES
} from "../../core/constants.js";
import { normalizeEntityReference } from "../../core/entity-contracts.js";
import { ERROR_CODES, ModuleError } from "../../core/errors.js";
import { assertSafeMinorAmount } from "../../core/numbers.js";
import { getResourceCatalogSetting } from "../../core/settings.js";
import { recordIndex } from "../../data/record-index.js";
import { updateRecordsBatch } from "../../data/journal-store.js";
import { decodeRecord } from "../../models/record-codec.js";
import { hasCapability } from "../../core/management-contracts.js";
import { buildStructuredHistoryEvent } from "../history/structured.js";
import { resourceMap } from "./rules.js";

const RESOURCE_HOLDER_TYPES = Object.freeze([
  RECORD_TYPES.DOMAIN,
  RECORD_TYPES.SQUAD
]);

function revision(value, label) {
  if (value == null || value === "") return null;
  const normalized = Number(value);
  if (!Number.isSafeInteger(normalized) || normalized < 0) {
    throw new ModuleError(ERROR_CODES.VALIDATION, `${label} precisa ser um inteiro não-negativo.`);
  }
  return normalized;
}

function resolveHolder(reference) {
  const normalized = normalizeEntityReference(reference, {
    allowedTypes: RESOURCE_HOLDER_TYPES
  });

  const byEntityId = normalized.entityId
    ? recordIndex.getByEntityId(normalized.entityId)
    : null;
  const byUuid = normalized.uuid
    ? recordIndex.get(normalized.recordType, normalized.uuid)
    : null;

  if (byEntityId && byUuid && byEntityId.uuid !== byUuid.uuid) {
    throw new ModuleError(
      ERROR_CODES.CONFLICT,
      "A referência aponta para UUID e entityId de entidades diferentes."
    );
  }

  const document = byEntityId ?? byUuid;
  if (!document) {
    throw new ModuleError(
      ERROR_CODES.NOT_FOUND,
      `Entidade de recursos não encontrada (${normalized.entityId ?? normalized.uuid}).`
    );
  }

  const record = decodeRecord(document);
  if (record.recordType !== normalized.recordType) {
    throw new ModuleError(ERROR_CODES.VALIDATION, "Tipo da referência não corresponde ao registro encontrado.");
  }
  return record;
}

function controllerIds(record) {
  return record.data?.governance?.controllers ?? [];
}

function assertCallerCanTransfer(callerUserId, sourceRecord) {
  const caller = game.users.get(callerUserId);
  if (!caller) throw new ModuleError(ERROR_CODES.PERMISSION, `Usuário não encontrado: ${callerUserId}`);
  if (caller.isGM) return true;
  if (!controllerIds(sourceRecord).includes(caller.id)) {
    throw new ModuleError(ERROR_CODES.PERMISSION, "O usuário não controla a entidade de origem desta transferência.");
  }
  return true;
}

function assertEconomyEnabled(record) {
  if (record.recordType === RECORD_TYPES.DOMAIN && !hasCapability(record.data, "economy")) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      `O Domain '${record.data.entityId}' não possui a capability economy habilitada.`
    );
  }
}

function readStocks(recordData, recordType) {
  if (recordType === RECORD_TYPES.DOMAIN) {
    return Array.isArray(recordData.economy?.stocks) ? recordData.economy.stocks : [];
  }
  return Array.isArray(recordData.resources) ? recordData.resources : [];
}

function writeStocks(recordData, recordType, stocks) {
  if (recordType === RECORD_TYPES.DOMAIN) {
    recordData.economy = recordData.economy ?? { stocks: [], flows: [] };
    recordData.economy.stocks = stocks;
  } else {
    recordData.resources = stocks;
  }
}

function stockAmount(stocks, resourceId) {
  return Number(stocks.find((entry) => entry.resourceId === resourceId)?.amount ?? 0);
}

function setStockAmount(stocks, resourceId, amount) {
  const next = structuredClone(stocks);
  const current = next.find((entry) => entry.resourceId === resourceId);
  if (current) current.amount = amount;
  else next.push({ resourceId, amount });
  return next;
}

function appendTransferHistory(data, {
  operationId,
  callerUserId,
  eventType,
  resourceId,
  amount,
  direction,
  selfEntityId,
  counterpartEntityId
}) {
  if (!Array.isArray(data.history)) return;
  data.history.push(buildStructuredHistoryEvent({
    eventType,
    operationId,
    actorUserId: callerUserId,
    entityIds: [selfEntityId, counterpartEntityId],
    metadata: {
      resourceId,
      amount,
      direction,
      counterpartEntityId
    },
    title: direction === "outgoing" ? "Recursos enviados" : "Recursos recebidos",
    category: "custom",
    summary: `${amount} unidade(s) de ${resourceId} ${direction === "outgoing" ? "enviadas" : "recebidas"}.`,
    significance: "minor",
    visibility: "all"
  }));
}

export function normalizeResourceTransferPayload(payload = {}) {
  const amount = Number(payload.amount);
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new ModuleError(ERROR_CODES.VALIDATION, "Transferência exige amount inteiro positivo em minor units.");
  }
  try {
    assertSafeMinorAmount(amount);
  } catch (error) {
    throw new ModuleError(ERROR_CODES.VALIDATION, error.message, { cause: error });
  }

  const resourceId = String(payload.resourceId ?? "").trim();
  if (!resourceId) throw new ModuleError(ERROR_CODES.VALIDATION, "resourceId é obrigatório.");

  return {
    from: normalizeEntityReference(payload.from, { allowedTypes: RESOURCE_HOLDER_TYPES }),
    to: normalizeEntityReference(payload.to, { allowedTypes: RESOURCE_HOLDER_TYPES }),
    expectedFromModifiedTime: revision(payload.expectedFromModifiedTime, "expectedFromModifiedTime"),
    expectedToModifiedTime: revision(payload.expectedToModifiedTime, "expectedToModifiedTime"),
    resourceId,
    amount
  };
}

export function transferResourceKeys(payload = {}) {
  const normalized = normalizeResourceTransferPayload(payload);
  const key = (ref) => ref.entityId ?? ref.uuid;
  return [key(normalized.from), key(normalized.to)].filter(Boolean);
}

export async function executeResourceTransfer({ payload, operationId, callerUserId }) {
  const normalized = normalizeResourceTransferPayload(payload);
  const from = resolveHolder(normalized.from);
  const to = resolveHolder(normalized.to);

  if (normalized.expectedFromModifiedTime != null
    && (from.document?._stats?.modifiedTime ?? null) !== normalized.expectedFromModifiedTime) {
    throw new ModuleError(ERROR_CODES.CONFLICT, "A origem dos recursos mudou enquanto o formulário estava aberto.");
  }
  if (normalized.expectedToModifiedTime != null
    && (to.document?._stats?.modifiedTime ?? null) !== normalized.expectedToModifiedTime) {
    throw new ModuleError(ERROR_CODES.CONFLICT, "O destino dos recursos mudou enquanto o formulário estava aberto.");
  }

  if (from.uuid === to.uuid || from.data.entityId === to.data.entityId) {
    throw new ModuleError(ERROR_CODES.VALIDATION, "Origem e destino da transferência precisam ser diferentes.");
  }

  assertCallerCanTransfer(callerUserId, from);
  assertEconomyEnabled(from);
  assertEconomyEnabled(to);

  const catalog = getResourceCatalogSetting();
  const resource = resourceMap(catalog).get(normalized.resourceId);
  if (!resource) {
    throw new ModuleError(ERROR_CODES.VALIDATION, `Recurso desconhecido: ${normalized.resourceId}`);
  }

  const fromDataBefore = foundry.utils.deepClone(from.data);
  const toDataBefore = foundry.utils.deepClone(to.data);
  const fromData = foundry.utils.deepClone(from.data);
  const toData = foundry.utils.deepClone(to.data);

  const fromStocks = readStocks(fromData, from.recordType);
  const toStocks = readStocks(toData, to.recordType);
  const fromBefore = stockAmount(fromStocks, normalized.resourceId);
  const toBefore = stockAmount(toStocks, normalized.resourceId);
  const fromAfter = fromBefore - normalized.amount;
  const toAfter = toBefore + normalized.amount;

  if (!resource.allowNegative && fromAfter < 0) {
    throw new ModuleError(
      ERROR_CODES.CONFLICT,
      `Estoque insuficiente de ${resource.name}: disponível ${fromBefore}, solicitado ${normalized.amount}.`
    );
  }
  try {
    assertSafeMinorAmount(fromAfter);
    assertSafeMinorAmount(toAfter);
  } catch (error) {
    throw new ModuleError(ERROR_CODES.VALIDATION, error.message, { cause: error });
  }

  writeStocks(fromData, from.recordType, setStockAmount(fromStocks, normalized.resourceId, fromAfter));
  writeStocks(toData, to.recordType, setStockAmount(toStocks, normalized.resourceId, toAfter));

  appendTransferHistory(fromData, {
    operationId,
    callerUserId,
    eventType: EVENT_TYPES.RESOURCES_TRANSFERRED,
    resourceId: normalized.resourceId,
    amount: normalized.amount,
    direction: "outgoing",
    selfEntityId: from.data.entityId,
    counterpartEntityId: to.data.entityId
  });
  appendTransferHistory(toData, {
    operationId,
    callerUserId,
    eventType: EVENT_TYPES.RESOURCES_TRANSFERRED,
    resourceId: normalized.resourceId,
    amount: normalized.amount,
    direction: "incoming",
    selfEntityId: to.data.entityId,
    counterpartEntityId: from.data.entityId
  });

  const updates = [
    { uuid: from.uuid, recordType: from.recordType, data: fromData },
    { uuid: to.uuid, recordType: to.recordType, data: toData }
  ];
  const rollbackUpdates = [
    { uuid: from.uuid, recordType: from.recordType, data: fromDataBefore },
    { uuid: to.uuid, recordType: to.recordType, data: toDataBefore }
  ];

  try {
    await updateRecordsBatch(updates);
  } catch (error) {
    // Bulk update is preferred, but compensation is still attempted in case a
    // provider/database fails after mutating only part of the batch.
    try { await updateRecordsBatch(rollbackUpdates); } catch (rollbackError) {
      console.error("[DomainManager] Rollback de transferência falhou:", rollbackError);
    }
    throw error;
  }

  const result = {
    from: { entityId: from.data.entityId, recordType: from.recordType, before: fromBefore, after: fromAfter },
    to: { entityId: to.data.entityId, recordType: to.recordType, before: toBefore, after: toAfter },
    resourceId: normalized.resourceId,
    amount: normalized.amount
  };

  return {
    result,
    entities: [from.data.entityId, to.data.entityId],
    events: [{
      type: EVENT_TYPES.RESOURCES_TRANSFERRED,
      entities: [from.data.entityId, to.data.entityId],
      payload: result
    }],
    rollback: async () => updateRecordsBatch(rollbackUpdates)
  };
}
