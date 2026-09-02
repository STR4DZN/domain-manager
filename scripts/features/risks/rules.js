/**
 * Regras puras para cálculo explicável de Riscos e Segurança de Domínios (Bloco 9).
 */

export function calculateDomainRisks(domainData, catalog = []) {
  const catalogList = Array.isArray(catalog) ? catalog : (catalog?.resources ?? []);
  const catalogMap = new Map(catalogList.map((r) => [r.id, r]));

  const stocks = new Map((domainData?.economy?.stocks ?? []).map((s) => [s.resourceId, Number(s.amount ?? 0)]));
  const flows = domainData?.economy?.flows ?? [];
  const populationTotal = Number(domainData?.population?.total ?? 0);
  const guardCount = Number(domainData?.security?.guardCount ?? 0);
  const defenseRating = Number(domainData?.security?.defenseRating ?? 0);
  const fortifications = domainData?.security?.fortifications ?? [];
  const conditions = (domainData?.conditions ?? []).filter((c) => c.active !== false);

  // 1. Risco de Escassez (Scarcity Risk)
  let scarcityScore = 0;
  const scarcityFactors = [];

  for (const flow of flows) {
    if (!flow.active || flow.direction !== "outflow") continue;
    const resId = flow.resourceId;
    const currentStock = stocks.get(resId) ?? 0;
    const ratePerTick = Number(flow.amount ?? 0) / Math.max(1, Number(flow.periodTicks ?? 1));
    const resName = catalogMap.get(resId)?.name || resId;

    if (currentStock <= 0) {
      scarcityScore += 40;
      scarcityFactors.push(`Estoque de '${resName}' esgotado (déficit contínuo).`);
    } else if (ratePerTick > 0) {
      const ticksRemaining = currentStock / ratePerTick;
      if (ticksRemaining < 10) {
        scarcityScore += 25;
        scarcityFactors.push(`'${resName}' tem menos de 10 ticks de autonomia.`);
      } else if (ticksRemaining < 30) {
        scarcityScore += 10;
        scarcityFactors.push(`'${resName}' tem menos de 30 ticks de autonomia.`);
      }
    }
  }

  const scarcityRiskPct = Math.min(100, Math.round(scarcityScore));

  // 2. Risco de Agitação / Sobrecarga (Unrest Risk)
  let unrestScore = 0;
  const unrestFactors = [];

  if (scarcityRiskPct >= 50) {
    unrestScore += 30;
    unrestFactors.push("Alta escassez de recursos gera pressão populacional.");
  }

  // Severidade de Condições
  for (const cond of conditions) {
    if (cond.severity === "severe") {
      unrestScore += 35;
      unrestFactors.push(`Condição severa ativa: '${cond.name}'.`);
    } else if (cond.severity === "moderate") {
      unrestScore += 15;
      unrestFactors.push(`Condição moderada ativa: '${cond.name}'.`);
    } else if (cond.severity === "minor") {
      unrestScore += 5;
    }
  }

  // Proporção de Guardas vs População
  if (populationTotal > 50) {
    const guardRatio = guardCount / populationTotal;
    if (guardRatio < 0.02) {
      unrestScore += 20;
      unrestFactors.push("Guarda insuficiente para a escala da população (< 2%).");
    }
  }

  const unrestRiskPct = Math.min(100, Math.round(unrestScore));

  // 3. Nível Total de Segurança & Defesa
  const fortBonus = fortifications.length * 5;
  const guardBonus = Math.min(50, Math.floor(guardCount * 1.5));
  const effectiveDefense = defenseRating + fortBonus + guardBonus;

  return {
    scarcityRisk: {
      percent: scarcityRiskPct,
      level: scarcityRiskPct > 60 ? "critical" : scarcityRiskPct > 30 ? "warning" : "nominal",
      factors: scarcityFactors
    },
    unrestRisk: {
      percent: unrestRiskPct,
      level: unrestRiskPct > 60 ? "critical" : unrestRiskPct > 30 ? "warning" : "nominal",
      factors: unrestFactors
    },
    security: {
      defenseRating,
      guardCount,
      fortifications,
      effectiveDefense,
      level: effectiveDefense >= 50 ? "high" : effectiveDefense >= 20 ? "medium" : "low"
    }
  };
}
