import {
  ECONOMY_LIMITS,
  EVENT_TYPES,
  RECORD_TYPES
} from "../../core/constants.js";
import { ERROR_CODES, ModuleError } from "../../core/errors.js";
import { hasCapability } from "../../core/management-contracts.js";
import { getResourceCatalogSetting } from "../../core/settings.js";
import { recordIndex } from "../../data/record-index.js";
import { updateRecord } from "../../data/journal-store.js";
import { decodeRecord } from "../../models/record-codec.js";
import { isModuleManager } from "../../core/permissions.js";
import { buildStructuredHistoryEvent } from "../history/structured.js";
import { EVENT_SEVERITIES } from "./constants.js";
import { normalizeDomainEventApplyPayload } from "./contracts.js";
import "./observers.js";

function resolveDomain(reference) {
  const byEntityId = reference.entityId
    ? recordIndex.getByEntityId(reference.entityId)
    : null;
  const byUuid = reference.uuid
    ? recordIndex.get(RECORD_TYPES.DOMAIN, reference.uuid)
    : null;
  if (byEntityId && byUuid && byEntityId.uuid !== byUuid.uuid) {
    throw new ModuleError(
      ERROR_CODES.CONFLICT,
      "A referência do evento aponta para Domains diferentes."
    );
  }
  const document = byEntityId ?? byUuid;
  if (!document) throw new ModuleError(ERROR_CODES.NOT_FOUND, "Domain do evento não encontrado.");
  const domain = decodeRecord(document);
  if (domain.recordType !== RECORD_TYPES.DOMAIN) {
    throw new ModuleError(ERROR_CODES.VALIDATION, "Eventos de domínio exigem um Domain.");
  }
  return domain;
}

function assertGM(callerUserId) {
  if (!isModuleManager(game.users.get(callerUserId))) {
    throw new ModuleError(
      ERROR_CODES.PERMISSION,
      "Apenas o Mestre ou Assistente do Mestre pode aplicar eventos de domínio."
    );
  }
}

function assertRevision(domain, expectedModifiedTime) {
  const current = domain.document?._stats?.modifiedTime ?? null;
  if (expectedModifiedTime !== null && current !== expectedModifiedTime) {
    throw new ModuleError(
      ERROR_CODES.CONFLICT,
      "O Domain mudou depois da rolagem do evento. Role novamente ou reaplique sobre os dados atuais."
    );
  }
}

function conditionSeverity(eventSeverity) {
  if (eventSeverity === EVENT_SEVERITIES.CRISIS) return "severe";
  if (eventSeverity === EVENT_SEVERITIES.NEUTRAL) return "moderate";
  return "minor";
}

function uniqueLocalId(prefix, entries = []) {
  const occupied = new Set(entries.map((entry) => entry.localId));
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = `${prefix}_${foundry.utils.randomID()}`;
    if (!occupied.has(candidate)) return candidate;
  }
  return `${prefix}_${Date.now().toString(36)}_${occupied.size.toString(36)}`;
}

function persist(domain, data) {
  return updateRecord({
    uuid: domain.uuid,
    recordType: RECORD_TYPES.DOMAIN,
    name: domain.document.name,
    data,
    controllerIds: domain.data.governance?.controllers ?? []
  });
}

export async function executeDomainEventApply({
  payload,
  callerUserId,
  operationId
}) {
  assertGM(callerUserId);
  const normalized = normalizeDomainEventApplyPayload(payload);
  const domain = resolveDomain(normalized.domain);
  assertRevision(domain, normalized.expectedModifiedTime);

  const { event, outcomeIndex } = normalized;
  const outcome = event.outcomes[outcomeIndex];
  const before = foundry.utils.deepClone(domain.data);
  const data = foundry.utils.deepClone(domain.data);
  data.economy ??= { stocks: [], flows: [], resourcePolicies: [] };
  data.economy.stocks ??= [];
  data.conditions ??= [];
  data.history ??= [];

  let stockResourceId = null;
  if (outcome.stockBonus) {
    if (!hasCapability(domain.data, "economy")) {
      throw new ModuleError(
        ERROR_CODES.VALIDATION,
        `O Domain '${domain.document.name}' não possui capability economy para aplicar a alteração de estoque do evento.`
      );
    }
    const catalog = getResourceCatalogSetting();
    stockResourceId = outcome.stockBonus.resourceId
      ?? data.economy.stocks[0]?.resourceId
      ?? catalog.resources?.[0]?.id
      ?? null;
    if (stockResourceId) {
      const knownResource = data.economy.stocks.some((item) => item.resourceId === stockResourceId)
        || (catalog.resources ?? []).some((item) => item.id === stockResourceId);
      if (!knownResource) {
        throw new ModuleError(
          ERROR_CODES.VALIDATION,
          `O evento referencia um recurso desconhecido: ${stockResourceId}`
        );
      }
      const stock = data.economy.stocks.find((item) => item.resourceId === stockResourceId);
      const currentAmount = Number(stock?.amount ?? 0);
      const nextAmount = Math.max(0, currentAmount + outcome.stockBonus.amount);
      if (
        !Number.isSafeInteger(nextAmount)
        || nextAmount > ECONOMY_LIMITS.MAX_MINOR_AMOUNT
      ) {
        throw new ModuleError(
          ERROR_CODES.VALIDATION,
          "O resultado do evento ultrapassa o limite seguro do estoque."
        );
      }
      if (stock) stock.amount = nextAmount;
      else data.economy.stocks.push({ resourceId: stockResourceId, amount: nextAmount });
    }
  }

  let condition = null;
  if (outcome.condition) {
    condition = {
      localId: uniqueLocalId("evt", data.conditions),
      name: outcome.condition.name,
      description: outcome.condition.description,
      durationTicks: outcome.condition.durationTicks,
      severity: conditionSeverity(event.severity),
      category: event.category,
      active: true
    };
    data.conditions.push(condition);
  }

  let historyEntry = null;
  if (outcome.chronicleTitle) {
    historyEntry = buildStructuredHistoryEvent({
      eventType: EVENT_TYPES.DOMAIN_EVENT_APPLIED,
      operationId,
      actorUserId: callerUserId,
      entityIds: [domain.data.entityId],
      metadata: {
        eventId: event.id ?? "",
        outcomeId: outcome.id ?? "",
        category: event.category,
        severity: event.severity
      },
      title: outcome.chronicleTitle,
      category: event.severity === EVENT_SEVERITIES.CRISIS ? "crisis" : "story",
      summary: event.description,
      details: outcome.description || outcome.label,
      significance: event.severity === EVENT_SEVERITIES.CRISIS ? "critical" : "major",
      visibility: "all"
    });
    data.history.push(historyEntry);
  }

  const updated = await persist(domain, data);
  return {
    result: {
      uuid: updated.uuid,
      domainEntityId: updated.data.entityId,
      eventId: event.id,
      outcomeId: outcome.id,
      stockResourceId,
      conditionLocalId: condition?.localId ?? null,
      historyLocalId: historyEntry?.localId ?? null,
      chat: {
        eventTitle: event.title,
        domainName: domain.document.name,
        description: event.description,
        outcomeLabel: outcome.label
      }
    },
    entities: [domain.data.entityId],
    events: [{
      type: EVENT_TYPES.DOMAIN_EVENT_APPLIED,
      entities: [domain.data.entityId],
      payload: {
        eventId: event.id,
        outcomeId: outcome.id,
        stockResourceId,
        conditionLocalId: condition?.localId ?? null,
        historyLocalId: historyEntry?.localId ?? null,
        postToChat: normalized.postToChat,
        chat: {
          eventTitle: event.title,
          domainName: domain.document.name,
          description: event.description,
          outcomeLabel: outcome.label
        }
      }
    }],
    rollback: () => persist(domain, before)
  };
}
