import { validateHistoryEventData } from "./rules.js";

function localId(operationId = null) {
  const safe = String(operationId ?? "").replace(/[^a-zA-Z0-9_-]/g, "").slice(-24);
  const random = globalThis.foundry?.utils?.randomID?.(8)
    ?? Math.random().toString(36).slice(2, 10);
  return `hist_evt_${safe || random}_${random}`;
}

export function normalizeHistoryMetadata(metadata = {}) {
  if (Array.isArray(metadata)) {
    return metadata.map((entry) => ({
      key: String(entry?.key ?? "").trim(),
      value: String(entry?.value ?? "")
    })).filter((entry) => entry.key);
  }
  if (!metadata || typeof metadata !== "object") return [];
  return Object.entries(metadata)
    .map(([key, value]) => ({ key: String(key), value: value == null ? "" : String(value) }))
    .sort((left, right) => left.key.localeCompare(right.key));
}

export function buildStructuredHistoryEvent({
  eventType,
  operationId = null,
  actorUserId = null,
  entityIds = [],
  metadata = {},
  title,
  category = "custom",
  summary = "",
  details = "",
  significance = "minor",
  tick = null,
  visibility = "all",
  timestamp = Date.now()
} = {}) {
  const cleanEventType = String(eventType ?? "").trim();
  if (!cleanEventType) throw new Error("Structured history exige eventType.");

  const event = {
    localId: localId(operationId),
    timestamp: Number(timestamp),
    tick: tick == null ? null : Number(tick),
    title: String(title ?? "").trim(),
    category,
    summary: String(summary ?? "").trim(),
    details: String(details ?? "").trim(),
    significance,
    visibility,
    eventType: cleanEventType,
    operationId: operationId == null ? null : String(operationId),
    actorUserId: actorUserId == null ? null : String(actorUserId),
    entityIds: [...new Set((entityIds ?? []).filter(Boolean).map(String))],
    metadata: normalizeHistoryMetadata(metadata)
  };

  validateHistoryEventData(event);
  return event;
}
