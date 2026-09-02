/**
 * Regras e Enums do Bloco 10: Relações Diplomáticas e Acordos (Administration & Relations).
 */

export const DIPLOMATIC_POSTURES = Object.freeze({
  ALLIED: "allied",
  FRIENDLY: "friendly",
  TRADE_PARTNER: "trade_partner",
  NEUTRAL: "neutral",
  RIVAL: "rival",
  HOSTILE: "hostile",
  OVERLORD: "overlord",
  VASSAL: "vassal"
});

export const DIPLOMATIC_POSTURE_LABELS = Object.freeze({
  allied: "Aliado",
  friendly: "Amigável",
  trade_partner: "Parceiro Comercial",
  neutral: "Neutro",
  rival: "Rival",
  hostile: "Hostil",
  overlord: "Suserano",
  vassal: "Vassalo"
});

export const DIPLOMATIC_POSTURE_COLORS = Object.freeze({
  allied: "#22c55e",
  friendly: "#3b82f6",
  trade_partner: "#eab308",
  neutral: "#94a3b8",
  rival: "#f97316",
  hostile: "#ef4444",
  overlord: "#a855f7",
  vassal: "#06b6d4"
});

export const AGREEMENT_TYPES = Object.freeze({
  TRIBUTE: "tribute",
  TRADE_PACT: "trade_pact",
  DEFENSE_PACT: "defense_pact",
  NON_AGGRESSION: "non_aggression",
  CUSTOM: "custom"
});

export const AGREEMENT_TYPE_LABELS = Object.freeze({
  tribute: "Tributo / Vassalagem",
  trade_pact: "Pacto Comercial",
  defense_pact: "Pacto de Defesa Mútua",
  non_aggression: "Pacto de Não-Agressão",
  custom: "Tratado Personalizado"
});

export const AGREEMENT_STATUSES = Object.freeze({
  ACTIVE: "active",
  SUSPENDED: "suspended",
  BREACHED: "breached",
  TERMINATED: "terminated"
});

export const AGREEMENT_STATUS_LABELS = Object.freeze({
  active: "Ativo",
  suspended: "Suspenso",
  breached: "Violado",
  terminated: "Encerrado"
});

export function validateRelationData(relation) {
  if (!relation || typeof relation !== "object") {
    throw new Error("Dados da relação diplomática inválidos.");
  }
  if (!relation.targetDomainUuid || typeof relation.targetDomainUuid !== "string") {
    throw new Error("Relação diplomática exige um targetDomainUuid válido.");
  }
  const validPostures = Object.values(DIPLOMATIC_POSTURES);
  if (relation.posture && !validPostures.includes(relation.posture)) {
    throw new Error(`Postura diplomática inválida: '${relation.posture}'.`);
  }
}

export function validateAgreementData(agreement) {
  if (!agreement || typeof agreement !== "object") {
    throw new Error("Dados do acordo/tratado inválidos.");
  }
  if (!agreement.name || typeof agreement.name !== "string" || !agreement.name.trim()) {
    throw new Error("Acordo/tratado exige um nome válido.");
  }
  if (!agreement.targetDomainUuid || typeof agreement.targetDomainUuid !== "string") {
    throw new Error("Acordo/tratado exige um targetDomainUuid válido.");
  }
  if (Array.isArray(agreement.transfers)) {
    for (const t of agreement.transfers) {
      if (!t.resourceId || typeof t.resourceId !== "string") {
        throw new Error("Transferência do acordo exige um resourceId válido.");
      }
      if (typeof t.amountPerTick !== "number" || t.amountPerTick < 0) {
        throw new Error("Transferência do acordo exige amountPerTick numérico não-negativo.");
      }
    }
  }
}
