/**
 * Bloco 15 — Constantes e Enums para o Sistema de Eventos de Domínio.
 */

export const EVENT_CATEGORIES = Object.freeze({
  ECONOMY: "economy",
  SOCIAL: "social",
  MILITARY: "military",
  NATURE: "nature"
});

export const EVENT_CATEGORY_LABELS = Object.freeze({
  [EVENT_CATEGORIES.ECONOMY]: "Econômico / Comercial",
  [EVENT_CATEGORIES.SOCIAL]: "Social & Político",
  [EVENT_CATEGORIES.MILITARY]: "Militar & Segurança",
  [EVENT_CATEGORIES.NATURE]: "Natural & Clima"
});

export const EVENT_SEVERITIES = Object.freeze({
  BOON: "boon",
  NEUTRAL: "neutral",
  CRISIS: "crisis"
});

export const EVENT_SEVERITY_LABELS = Object.freeze({
  [EVENT_SEVERITIES.BOON]: "Bênção / Oportunidade",
  [EVENT_SEVERITIES.NEUTRAL]: "Acontecimento Neutro",
  [EVENT_SEVERITIES.CRISIS]: "Crise / Revés"
});
