import { EVENT_TYPES, MODULE_ID } from "../../core/constants.js";
import { domainEventBus } from "../../core/event-bus.js";

let unsubscribeChatObserver = null;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}

/**
 * Observer pós-commit. Falhas de apresentação são isoladas pelo EventBus e não
 * revertem uma transação já confirmada no ledger.
 */
export async function postAppliedDomainEventToChat(event = {}) {
  const payload = event.payload ?? {};
  if (payload.postToChat === false) return false;
  if (typeof globalThis.ChatMessage?.create !== "function") return false;

  const chat = payload.chat;
  if (!chat || typeof chat !== "object") {
    console.warn(`[${MODULE_ID}] Evento aplicado sem dados para o observer de chat.`);
    return false;
  }

  await globalThis.ChatMessage.create({
    content: [
      "<section>",
      `<h3>Evento de Domínio: ${escapeHtml(chat.eventTitle)}</h3>`,
      `<p><strong>${escapeHtml(chat.domainName)}</strong></p>`,
      `<p>${escapeHtml(chat.description)}</p>`,
      `<p><strong>Resultado:</strong> ${escapeHtml(chat.outcomeLabel)}</p>`,
      "</section>"
    ].join(""),
    speaker: { alias: "Domain Manager // Crônicas" }
  });
  return true;
}

export function registerDomainEventChatObserver() {
  if (unsubscribeChatObserver) return unsubscribeChatObserver;
  unsubscribeChatObserver = domainEventBus.subscribe(
    EVENT_TYPES.DOMAIN_EVENT_APPLIED,
    postAppliedDomainEventToChat
  );
  return unsubscribeChatObserver;
}

registerDomainEventChatObserver();
