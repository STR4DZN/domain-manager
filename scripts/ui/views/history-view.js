/**
 * HistoryView — Controlador e Preparador de Contexto de Histórico e Crônicas
 * Linha do Tempo Cronológica, Eras de Governança e Marcos
 */

export class HistoryView {
  static prepareContext({ fullHistory, recentChronicles, user }) {
    const history = fullHistory || [];
    const recent = recentChronicles || history.slice(0, 5);

    return {
      history,
      recentChronicles: recent,
      totalEntries: history.length,
      canEdit: Boolean(user?.isGM)
    };
  }
}
