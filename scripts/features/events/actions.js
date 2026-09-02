import { RECORD_TYPES } from "../../core/constants.js";
import { getResourceCatalogSetting } from "../../core/settings.js";
import { recordIndex } from "../../data/record-index.js";
import { updateRecord } from "../../data/journal-store.js";
import { decodeRecord } from "../../models/record-codec.js";
import { calculateDomainRisks } from "../risks/rules.js";
import { EVENT_SEVERITIES } from "./constants.js";
import { rollDomainEvent } from "./roller.js";

function assertGM() {
  if (!game.user.isGM) {
    throw new Error("Apenas o Mestre pode rolar e aplicar eventos.");
  }
}

function generateLocalId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}

function conditionSeverity(eventSeverity) {
  if (eventSeverity === EVENT_SEVERITIES.CRISIS) return "severe";
  if (eventSeverity === EVENT_SEVERITIES.NEUTRAL) return "moderate";
  return "minor";
}

/** Rola um evento e retorna dados puros para a futura interface apresentar. */
export function rollEventForDomain({
  domainUuid = null,
  category = null,
  randomFn = Math.random
} = {}) {
  assertGM();

  const document = domainUuid
    ? recordIndex.get(RECORD_TYPES.DOMAIN, domainUuid)
    : recordIndex.list(RECORD_TYPES.DOMAIN)[0];

  if (!document) throw new Error("Nenhum domínio disponível para o evento.");

  const domain = decodeRecord(document);
  const catalog = getResourceCatalogSetting();
  const risks = calculateDomainRisks(domain.data, catalog);
  const event = rollDomainEvent({
    domain: domain.data,
    category,
    risks,
    randomFn
  });

  return { domain, event, risks, catalog };
}

/** Aplica um resultado já escolhido sem criar dialogs ou depender do DOM. */
export async function executeApplyEventOutcome({
  domainUuid,
  event,
  outcomeIndex = 0,
  postToChat = true,
  catalog = null
} = {}) {
  assertGM();

  const document = recordIndex.get(RECORD_TYPES.DOMAIN, domainUuid);
  if (!document) throw new Error(`Domínio '${domainUuid}' não encontrado.`);
  if (!event) throw new Error("Evento é obrigatório.");

  const domain = decodeRecord(document);
  const outcome = event.outcomes?.[outcomeIndex] ?? event.outcomes?.[0];
  if (!outcome) throw new Error("O evento não possui resultado aplicável.");

  const data = foundry.utils.deepClone(domain.data);
  const resourceCatalog = catalog ?? getResourceCatalogSetting();

  if (outcome.stockBonus && Number.isFinite(outcome.stockBonus.amount)) {
    const stocks = data.economy.stocks;
    const resourceId = stocks[0]?.resourceId
      ?? resourceCatalog.resources?.[0]?.id
      ?? null;

    if (resourceId) {
      const stock = stocks.find((item) => item.resourceId === resourceId);
      if (stock) {
        stock.amount = Math.max(0, stock.amount + outcome.stockBonus.amount);
      } else {
        stocks.push({
          resourceId,
          amount: Math.max(0, outcome.stockBonus.amount)
        });
      }
    }
  }

  if (outcome.condition) {
    data.conditions.push({
      localId: generateLocalId("evt"),
      name: String(outcome.condition.name ?? "Evento").trim(),
      description: String(outcome.condition.description ?? "").trim(),
      durationTicks: outcome.condition.durationTicks == null
        ? null
        : Math.max(1, Math.floor(Number(outcome.condition.durationTicks))),
      severity: conditionSeverity(event.severity),
      category: event.category || "event",
      active: true
    });
  }

  if (outcome.chronicleTitle) {
    data.history.push({
      localId: generateLocalId("hist"),
      timestamp: Date.now(),
      tick: null,
      title: String(outcome.chronicleTitle).trim(),
      category: event.severity === EVENT_SEVERITIES.CRISIS
        ? "crisis"
        : "story",
      summary: String(event.description ?? "").trim(),
      details: String(outcome.description ?? outcome.label ?? "").trim(),
      significance: event.severity === EVENT_SEVERITIES.CRISIS
        ? "critical"
        : "major",
      visibility: "all"
    });
  }

  const result = await updateRecord({
    uuid: domainUuid,
    recordType: RECORD_TYPES.DOMAIN,
    data
  });

  if (postToChat && typeof ChatMessage !== "undefined") {
    await ChatMessage.create({
      content: [
        "<section>",
        `<h3>Evento de Domínio: ${escapeHtml(event.title)}</h3>`,
        `<p><strong>${escapeHtml(domain.document.name)}</strong></p>`,
        `<p>${escapeHtml(event.description)}</p>`,
        `<p><strong>Resultado:</strong> ${escapeHtml(outcome.label)}</p>`,
        "</section>"
      ].join(""),
      speaker: { alias: "Domain Manager // Crônicas" }
    });
  }

  return result;
}
