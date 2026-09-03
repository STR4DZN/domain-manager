/**
 * Módulo de Sustento da População, Consumo de Recursos (Comida, Água) e Gastos Gerais.
 * Bloco Econômico e Populacional Integrado.
 */

/**
 * Aliases reconhecidos para identificar recursos de sustento no catálogo ou nos estoques.
 */
export const SUSTENANCE_RESOURCE_ALIASES = {
  FOOD: ["food", "comida", "alimento", "provisoes", "provisões", "racoes", "rações"],
  WATER: ["water", "agua", "água", "recursos-hidricos", "recursos-hídricos", "hidratacao", "hidratação"],
  SUPPLIES: ["supplies", "suprimentos", "bens-de-consumo", "consumo"]
};

/**
 * Localiza no catálogo ou nos estoques do domínio o resourceId correspondente a um tipo de sustento.
 * @param {string[]} typeAliases
 * @param {Iterable<string>} availableResourceIds
 * @returns {string|null}
 */
export function findMatchingResourceId(typeAliases, availableResourceIds = []) {
  const ids = Array.from(availableResourceIds).map((id) => String(id).toLowerCase());
  for (const alias of typeAliases) {
    const found = ids.find((id) => id === alias || id.includes(alias));
    if (found) return found;
  }
  return null;
}

/**
 * Calcula o consumo de sustento da população e os gastos gerais de um domínio por tick.
 * Regra Matemática:
 * - População: A cada 100 habitantes (ou fração), consome 1 unidade de Alimento (comida) e 1 unidade de Água por tick.
 * - Segurança: Cada guarda consome 1 unidade monetária (créditos/ouro) por tick para manutenção e soldo.
 * 
 * @param {Object} params
 * @param {Object} params.domainData - Dados do domínio (population, security, economy, etc.)
 * @param {Object} params.catalog - Catálogo de recursos
 * @returns {Object} Detalhes do sustento e fluxos sintéticos gerados
 */
export function calculateDomainUpkeep({ domainData = {}, catalog = { resources: [] } } = {}) {
  const groups = domainData.population?.groups ?? domainData.people?.groups ?? [];
  const totalPop = groups.reduce((acc, g) => acc + (Number(g.count || g.population) || 0), 0);
  const guards = Number(domainData.security?.guardCount || 0);

  const domainStocks = domainData.economy?.stocks || [];
  const knownResourceIds = new Set([
    ...(catalog.resources || []).map((r) => r.id),
    ...domainStocks.map((s) => s.resourceId)
  ]);

  const foodResId = findMatchingResourceId(SUSTENANCE_RESOURCE_ALIASES.FOOD, knownResourceIds) || "food";
  const waterResId = findMatchingResourceId(SUSTENANCE_RESOURCE_ALIASES.WATER, knownResourceIds) || "water";
  const creditsResId = (catalog.resources || []).find((r) => r.precision === 2)?.id || "credits";

  const foodDef = (catalog.resources || []).find((r) => r.id === foodResId) || { precision: 0 };
  const waterDef = (catalog.resources || []).find((r) => r.id === waterResId) || { precision: 0 };
  const creditsDef = (catalog.resources || []).find((r) => r.id === creditsResId) || { precision: 2 };

  const settings = domainData.economy?.sustenanceSettings || {};
  if (settings.enabled === false) {
    return {
      totalPop,
      guards,
      enabled: false,
      rawFoodUnits: 0,
      rawWaterUnits: 0,
      rawGuardUnits: 0,
      foodMinorAmount: 0,
      waterMinorAmount: 0,
      guardMinorAmount: 0,
      syntheticFlows: []
    };
  }

  const foodPer100 = Number(settings.foodPer100 != null ? settings.foodPer100 : 1.0);
  const waterPer100 = Number(settings.waterPer100 != null ? settings.waterPer100 : 1.0);
  const guardUpkeepRate = Number(settings.guardUpkeep != null ? settings.guardUpkeep : 1.0);

  // Taxas de consumo com modificadores do GM:
  const rawFoodUnits = (totalPop > 0 && foodPer100 > 0) ? Math.max(1, Math.ceil((totalPop / 100) * foodPer100)) : 0;
  const rawWaterUnits = (totalPop > 0 && waterPer100 > 0) ? Math.max(1, Math.ceil((totalPop / 100) * waterPer100)) : 0;
  const rawGuardUnits = (guards > 0 && guardUpkeepRate > 0) ? Math.ceil(guards * guardUpkeepRate) : 0;

  const foodMinorAmount = rawFoodUnits * (10 ** (foodDef.precision || 0));
  const waterMinorAmount = rawWaterUnits * (10 ** (waterDef.precision || 0));
  const guardMinorAmount = rawGuardUnits * (10 ** (creditsDef.precision || 2));

  const syntheticFlows = [];

  if (totalPop > 0) {
    syntheticFlows.push({
      localId: "upkeep_food",
      name: "Consumo Populacional (Comida)",
      resourceId: foodResId,
      direction: "outflow",
      amount: foodMinorAmount,
      periodTicks: 1,
      category: "sustento",
      source: "Sistema de População",
      isAutomaticUpkeep: true,
      active: true
    });

    syntheticFlows.push({
      localId: "upkeep_water",
      name: "Consumo Populacional (Água)",
      resourceId: waterResId,
      direction: "outflow",
      amount: waterMinorAmount,
      periodTicks: 1,
      category: "sustento",
      source: "Sistema de População",
      isAutomaticUpkeep: true,
      active: true
    });
  }

  if (guards > 0) {
    syntheticFlows.push({
      localId: "upkeep_guards",
      name: "Manutenção da Guarda",
      resourceId: creditsResId,
      direction: "outflow",
      amount: guardMinorAmount,
      periodTicks: 1,
      category: "segurança",
      source: "Sistema de Segurança",
      isAutomaticUpkeep: true,
      active: true
    });
  }

  return {
    totalPop,
    guards,
    foodResId,
    waterResId,
    creditsResId,
    rawFoodUnits,
    rawWaterUnits,
    rawGuardUnits,
    foodMinorAmount,
    waterMinorAmount,
    guardMinorAmount,
    syntheticFlows
  };
}
