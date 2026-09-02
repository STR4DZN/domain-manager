/**
 * Regras e Enums do Bloco 12: Crônicas e Histórico (Events & History).
 */

export const HISTORY_CATEGORIES = Object.freeze({
  ADVANCE: "advance",
  PROJECT: "project",
  MISSION: "mission",
  RELATION: "relation",
  CONDITION: "condition",
  CRISIS: "crisis",
  STORY: "story",
  CUSTOM: "custom"
});

export const HISTORY_CATEGORY_LABELS = Object.freeze({
  advance: "Avanço Temporal",
  project: "Projeto Concluído",
  mission: "Missão / Operação",
  relation: "Diplomacia & Tratados",
  condition: "Condição / Crise",
  crisis: "Evento Crítico",
  story: "Crônica Narrativa",
  custom: "Registro Geral"
});

export const HISTORY_CATEGORY_ICONS = Object.freeze({
  advance: "fa-solid fa-clock-rotate-left",
  project: "fa-solid fa-diagram-project",
  mission: "fa-solid fa-bullseye",
  relation: "fa-solid fa-handshake",
  condition: "fa-solid fa-triangle-exclamation",
  crisis: "fa-solid fa-skull-crossbones",
  story: "fa-solid fa-feather-pointed",
  custom: "fa-solid fa-bookmark"
});

export const HISTORY_SIGNIFICANCE = Object.freeze({
  MINOR: "minor",
  MAJOR: "major",
  CRITICAL: "critical"
});

export const HISTORY_SIGNIFICANCE_LABELS = Object.freeze({
  minor: "Menor",
  major: "Importante",
  critical: "Crítico / Histórico"
});

export const HISTORY_SIGNIFICANCE_COLORS = Object.freeze({
  minor: "#64748b",
  major: "#3b82f6",
  critical: "#ef4444"
});

export function validateHistoryEventData(event) {
  if (!event || typeof event !== "object") {
    throw new Error("Dados de evento histórico inválidos.");
  }
  if (!event.title || typeof event.title !== "string" || !event.title.trim()) {
    throw new Error("Registro histórico exige um título válido.");
  }
  const validCategories = Object.values(HISTORY_CATEGORIES);
  if (event.category && !validCategories.includes(event.category)) {
    throw new Error(`Categoria de evento inválida: '${event.category}'.`);
  }
  const validSignificances = Object.values(HISTORY_SIGNIFICANCE);
  if (event.significance && !validSignificances.includes(event.significance)) {
    throw new Error(`Nível de significância inválido: '${event.significance}'.`);
  }
}

export function canViewHistoryEvent(event, user) {
  if (!event || !user) return false;
  return user.isGM || event.visibility !== "gm_only";
}

export function listVisibleHistoryEvents(history, user) {
  return (history ?? [])
    .filter((event) => canViewHistoryEvent(event, user))
    .sort((left, right) => (right.timestamp ?? 0) - (left.timestamp ?? 0));
}
