/**
 * DiplomacyView — Controlador e Preparador de Contexto de Diplomacia
 * Relações Exteriores, Pactos Bilaterais, Posturas e Tratados
 */

export class DiplomacyView {
  static prepareContext({ relations, agreements, selectedDomain }) {
    const allRelations = relations || [];
    const allAgreements = agreements || [];

    const alliedCount = allRelations.filter((r) => r.posture === "allied").length;
    const friendlyCount = allRelations.filter((r) => r.posture === "friendly").length;
    const hostileCount = allRelations.filter((r) => r.posture === "hostile" || r.posture === "at_war").length;

    return {
      relations: allRelations,
      agreements: allAgreements,
      totalRelations: allRelations.length,
      alliedCount,
      friendlyCount,
      hostileCount,
      hasRelations: allRelations.length > 0
    };
  }
}
