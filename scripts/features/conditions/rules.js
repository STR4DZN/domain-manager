/**
 * Regras puras para Conditions (Condições e Efeitos Temporários) de Domínios.
 */

import { ModuleError, ERROR_CODES } from "../../core/errors.js";

function generateLocalId() {
  return "cond_" + Math.random().toString(36).substring(2, 9);
}

export function addDomainCondition(domainData, input = {}) {
  const name = String(input.name ?? "").trim();
  if (!name) {
    throw new ModuleError(ERROR_CODES.VALIDATION, "Nome da condição é obrigatório.");
  }

  const conditions = Array.isArray(domainData.conditions) ? [...domainData.conditions] : [];
  const localId = input.localId || generateLocalId();

  if (conditions.some((c) => c.localId === localId)) {
    throw new ModuleError(ERROR_CODES.VALIDATION, `Condição com id ${localId} já existe.`);
  }

  const newCond = {
    localId,
    name,
    description: String(input.description ?? "").trim(),
    durationTicks: input.durationTicks != null ? Math.max(1, Math.floor(Number(input.durationTicks))) : null,
    severity: ["minor", "moderate", "severe"].includes(input.severity) ? input.severity : "minor",
    category: String(input.category ?? "environmental").trim(),
    active: input.active !== false
  };

  conditions.push(newCond);
  return {
    ...domainData,
    conditions
  };
}

export function updateDomainCondition(domainData, localId, patch = {}) {
  const conditions = (domainData.conditions ?? []).map((cond) => {
    if (cond.localId !== localId) return cond;

    return {
      ...cond,
      name: patch.name != null ? String(patch.name).trim() : cond.name,
      description: patch.description != null ? String(patch.description).trim() : cond.description,
      durationTicks: patch.durationTicks != null ? Math.max(1, Math.floor(Number(patch.durationTicks))) : cond.durationTicks,
      severity: patch.severity && ["minor", "moderate", "severe"].includes(patch.severity) ? patch.severity : cond.severity,
      category: patch.category != null ? String(patch.category).trim() : cond.category,
      active: patch.active != null ? Boolean(patch.active) : cond.active
    };
  });

  return {
    ...domainData,
    conditions
  };
}

export function removeDomainCondition(domainData, localId) {
  const conditions = (domainData.conditions ?? []).filter((c) => c.localId !== localId);
  return {
    ...domainData,
    conditions
  };
}

export function decayDomainConditions(domainData, deltaTicks = 1) {
  const ticks = Math.max(1, Math.floor(Number(deltaTicks) || 1));
  const conditions = (domainData.conditions ?? [])
    .map((cond) => {
      if (typeof cond.durationTicks === "number" && cond.durationTicks > 0) {
        const remaining = Math.max(0, cond.durationTicks - ticks);
        return {
          ...cond,
          durationTicks: remaining,
          active: remaining > 0
        };
      }
      return cond;
    })
    .filter((cond) => cond.active !== false || cond.durationTicks === null);

  return {
    ...domainData,
    conditions
  };
}
