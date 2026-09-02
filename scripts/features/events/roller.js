/**
 * Bloco 15 — Motor de Sorteio e Rolagem de Eventos de Domínio.
 */

import { REALM_EVENT_TABLES } from "./tables.js";
import { EVENT_SEVERITIES } from "./constants.js";

/**
 * Rola um evento aleatório ou ponderado para um domínio.
 * @param {Object} params
 * @param {Object} [params.domain] - Domínio alvo
 * @param {string} [params.category] - Categoria específica (opcional)
 * @param {Object} [params.risks] - Riscos calculados do domínio { shortfall, unrest }
 * @param {Function} [params.randomFn=Math.random] - Gerador de números aleatórios
 * @returns {Object} Evento selecionado
 */
export function rollDomainEvent({
  domain = null,
  category = null,
  risks = null,
  randomFn = Math.random
} = {}) {
  let pool = [...REALM_EVENT_TABLES];

  // Filtro por categoria se especificado
  if (category) {
    pool = pool.filter((e) => e.category === category);
  }

  if (pool.length === 0) {
    pool = [...REALM_EVENT_TABLES];
  }

  // Ponderação baseada em riscos do domínio
  const unrestRisk = risks?.unrestRisk ?? risks?.unrest;
  const scarcityRisk = risks?.scarcityRisk ?? risks?.shortfall;
  const isHighUnrest = unrestRisk?.level === "high"
    || unrestRisk?.level === "critical"
    || Number(unrestRisk?.percent ?? 0) >= 60;
  const isHighShortfall = scarcityRisk?.level === "high"
    || scarcityRisk?.level === "critical"
    || Number(scarcityRisk?.percent ?? 0) >= 60;

  // Cria lista ponderada
  const weightedPool = [];
  for (const event of pool) {
    let weight = 1;

    if (event.severity === EVENT_SEVERITIES.CRISIS) {
      if (isHighUnrest && event.category === "social") weight += 3;
      if (isHighShortfall && event.category === "economy") weight += 3;
    } else if (event.severity === EVENT_SEVERITIES.BOON) {
      // Se estiver em paz ou com baixos riscos, mantém chances equilibradas
      if (!isHighUnrest && !isHighShortfall) weight += 1;
    }

    for (let i = 0; i < weight; i++) {
      weightedPool.push(event);
    }
  }

  const index = Math.floor(randomFn() * weightedPool.length);
  return weightedPool[index] ?? weightedPool[0];
}
