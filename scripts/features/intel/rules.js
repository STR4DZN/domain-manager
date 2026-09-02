/**
 * Regras e Enums do Bloco 11: Segredos e Conhecimento (Secrets & Knowledge / Intel).
 */

export const INTEL_CATEGORIES = Object.freeze({
  FACT: "fact",
  RUMOR: "rumor",
  SECRET: "secret",
  CLUE: "clue",
  LORE: "lore"
});

export const INTEL_CATEGORY_LABELS = Object.freeze({
  fact: "Fato Comprovado",
  rumor: "Boato / Rumor",
  secret: "Segredo Confidencial",
  clue: "Pista / Investigação",
  lore: "História / Tradição"
});

export const INTEL_CATEGORY_ICONS = Object.freeze({
  fact: "fa-solid fa-scroll",
  rumor: "fa-solid fa-ear-listen",
  secret: "fa-solid fa-user-secret",
  clue: "fa-solid fa-magnifying-glass",
  lore: "fa-solid fa-book-open"
});

export const INTEL_CREDIBILITY = Object.freeze({
  CONFIRMED: "confirmed",
  LIKELY: "likely",
  DOUBTFUL: "doubtful",
  FALSE: "false"
});

export const INTEL_CREDIBILITY_LABELS = Object.freeze({
  confirmed: "Confirmado",
  likely: "Provável",
  doubtful: "Duvidoso",
  false: "Falso / Desinformação"
});

export const INTEL_CREDIBILITY_COLORS = Object.freeze({
  confirmed: "#22c55e",
  likely: "#3b82f6",
  doubtful: "#f97316",
  false: "#ef4444"
});

export const INTEL_VISIBILITY = Object.freeze({
  GM_ONLY: "gm_only",
  ALL_CONTROLLERS: "all_controllers",
  PUBLIC: "public"
});

export const INTEL_VISIBILITY_LABELS = Object.freeze({
  gm_only: "Apenas o Mestre (GM)",
  all_controllers: "Controladores do Domínio",
  public: "Público / Todos os Jogadores"
});

export function validateIntelData(intel) {
  if (!intel || typeof intel !== "object") {
    throw new Error("Dados de conhecimento/segredo inválidos.");
  }
  if (!intel.title || typeof intel.title !== "string" || !intel.title.trim()) {
    throw new Error("Conhecimento/segredo exige um título válido.");
  }
  const validCategories = Object.values(INTEL_CATEGORIES);
  if (intel.category && !validCategories.includes(intel.category)) {
    throw new Error(`Categoria de intel inválida: '${intel.category}'.`);
  }
  const validCredibility = Object.values(INTEL_CREDIBILITY);
  if (intel.credibility && !validCredibility.includes(intel.credibility)) {
    throw new Error(`Credibilidade de intel inválida: '${intel.credibility}'.`);
  }
  const validVisibility = Object.values(INTEL_VISIBILITY);
  if (intel.visibility && !validVisibility.includes(intel.visibility)) {
    throw new Error(`Visibilidade de intel inválida: '${intel.visibility}'.`);
  }
}

export function canViewIntel(intel, { user, controllerIds = [] } = {}) {
  if (!intel || !user) return false;
  if (user.isGM) return true;
  if (intel.visibility === INTEL_VISIBILITY.PUBLIC || intel.revealed) return true;
  return intel.visibility === INTEL_VISIBILITY.ALL_CONTROLLERS
    && controllerIds.includes(user.id);
}

export function listVisibleIntel(intelList, options = {}) {
  return (intelList ?? []).filter((intel) => canViewIntel(intel, options));
}
