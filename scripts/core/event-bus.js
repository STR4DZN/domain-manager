import { MODULE_ID } from "./constants.js";

function randomPart() {
  return globalThis.foundry?.utils?.randomID?.()
    ?? globalThis.crypto?.randomUUID?.().replaceAll("-", "")
    ?? Math.random().toString(36).slice(2);
}

export function normalizeDomainEvent(event = {}) {
  const type = String(event.type ?? "").trim();
  if (!type) throw new Error("Domain event exige type.");

  return Object.freeze({
    eventId: String(event.eventId ?? `event:${randomPart()}`),
    type,
    operationId: event.operationId == null ? null : String(event.operationId),
    actorUserId: event.actorUserId == null ? null : String(event.actorUserId),
    timestamp: Number.isFinite(Number(event.timestamp)) ? Number(event.timestamp) : Date.now(),
    entities: Object.freeze([...(event.entities ?? [])].map(String)),
    payload: Object.freeze(structuredClone(event.payload ?? {}))
  });
}

export class DomainEventBus {
  #listeners = new Map();

  subscribe(type, listener) {
    if (typeof listener !== "function") throw new Error("Listener precisa ser função.");
    const key = String(type ?? "").trim();
    if (!key) throw new Error("Event type é obrigatório.");
    const listeners = this.#listeners.get(key) ?? new Set();
    listeners.add(listener);
    this.#listeners.set(key, listeners);
    return () => {
      listeners.delete(listener);
      if (!listeners.size) this.#listeners.delete(key);
    };
  }

  async publish(rawEvent) {
    const event = normalizeDomainEvent(rawEvent);
    const listeners = [
      ...(this.#listeners.get(event.type) ?? []),
      ...(this.#listeners.get("*") ?? [])
    ];
    const errors = [];

    for (const listener of listeners) {
      try {
        await listener(event);
      } catch (error) {
        errors.push(error);
        console.error(`[${MODULE_ID}] Event listener falhou (${event.type}):`, error);
      }
    }

    try {
      globalThis.Hooks?.callAll?.(`${MODULE_ID}.${event.type}`, event);
    } catch (error) {
      errors.push(error);
      console.error(`[${MODULE_ID}] Hook de evento falhou (${event.type}):`, error);
    }

    return { event, errors };
  }
}

export const domainEventBus = new DomainEventBus();
