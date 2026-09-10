/**
 * ProjectsView — Controlador e Preparador de Contexto de Engenharia e Obras
 * Canteiro de Obras, Tiers Progressivos, Modificadores Ativos e Slots
 */

export class ProjectsView {
  static prepareContext({ domainProjects }) {
    const projects = domainProjects || [];
    const active = projects.filter((p) => !p.isCompleted);
    const completed = projects.filter((p) => p.isCompleted);

    let totalDefenseBonus = 0;
    let totalIncomeBonus = 0;
    let totalUnrestReduction = 0;
    let totalPopulationBonus = 0;

    for (const p of completed) {
      if (p.modifiers) {
        totalDefenseBonus += Number(p.modifiers.defenseBonus) || 0;
        totalIncomeBonus += Number(p.modifiers.incomeBonus) || 0;
        totalUnrestReduction += Number(p.modifiers.unrestReduction) || 0;
        totalPopulationBonus += Number(p.modifiers.populationBonus) || 0;
      }
    }

    const averageProgress = active.length > 0
      ? Math.round(active.reduce((acc, p) => acc + (p.progressPercent || 0), 0) / active.length)
      : (projects.length > 0 ? 100 : 0);

    return {
      allProjects: projects,
      activeProjects: active,
      completedProjects: completed,
      activeCount: active.length,
      completedCount: completed.length,
      averageProgress,
      totalBonuses: {
        defense: totalDefenseBonus,
        income: totalIncomeBonus,
        unrestReduction: totalUnrestReduction,
        population: totalPopulationBonus,
        hasAny: Boolean(totalDefenseBonus || totalIncomeBonus || totalUnrestReduction || totalPopulationBonus)
      }
    };
  }
}
