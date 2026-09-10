/**
 * PeopleView — Controlador e Preparador de Contexto de População e Notáveis
 * Censo Demográfico, Estratos Sociais, Dossiê Tático e Bio-Monitor 6-D
 */

export class PeopleView {
  static prepareContext({ notables, groups, metrics, activeNotableDossierLocalId }) {
    const allNotables = notables || [];
    const allGroups = groups || [];

    const activeDossierNotable = activeNotableDossierLocalId
      ? allNotables.find((n) => n.localId === activeNotableDossierLocalId) || null
      : null;

    const totalPop = metrics.populationTotal || allGroups.reduce((sum, g) => sum + (g.count || 0), 0);

    return {
      notables: allNotables,
      groups: allGroups,
      notableCount: allNotables.length,
      groupCount: allGroups.length,
      totalPopulation: totalPop.toLocaleString("pt-BR"),
      unrestRiskPercent: metrics.unrestRiskPercent || 0,
      unrestRiskLevel: metrics.unrestRiskLevel || "low",
      activeDossierNotable,
      hasActiveDossier: Boolean(activeDossierNotable)
    };
  }
}
