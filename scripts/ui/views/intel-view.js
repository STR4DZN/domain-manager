/**
 * IntelView — Controlador e Preparador de Contexto de Inteligência e Espionagem
 * Dossiês Confidenciais, Grau de Sigilo, Classificação e Credibilidade
 */

export class IntelView {
  static prepareContext({ intelList, user }) {
    const list = intelList || [];
    const secrets = list.filter((i) => i.category === "secret");
    const rumors = list.filter((i) => i.category === "rumor");
    const facts = list.filter((i) => i.category === "fact");

    return {
      intelList: list,
      secretCount: secrets.length,
      rumorCount: rumors.length,
      factCount: facts.length,
      totalCount: list.length,
      canEdit: Boolean(user?.isGM)
    };
  }
}
