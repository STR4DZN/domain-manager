/**
 * EconomyView — Controlador e Preparador de Contexto do Módulo Econômico
 * Gestão de Estoques, Balanço Fiscal /tick, Custos de Sustento e Matriz de Recursos
 */

export class EconomyView {
  static prepareContext({ domainStocks, domainFlows, upkeepSettings, catalog }) {
    const totalPositiveFlow = (domainFlows || [])
      .filter((f) => f.isInflow && f.active)
      .reduce((sum, f) => sum + (parseFloat(f.amountPerTickFormatted?.replace(",", ".")) || 0), 0);

    const totalNegativeFlow = (domainFlows || [])
      .filter((f) => !f.isInflow && f.active)
      .reduce((sum, f) => sum + (parseFloat(f.amountPerTickFormatted?.replace(",", ".")) || 0), 0);

    const netFiscalBalance = totalPositiveFlow - totalNegativeFlow;

    return {
      stocks: domainStocks || [],
      flows: domainFlows || [],
      totalPositiveFlow: totalPositiveFlow.toFixed(2),
      totalNegativeFlow: totalNegativeFlow.toFixed(2),
      netFiscalBalance: (netFiscalBalance >= 0 ? "+" : "") + netFiscalBalance.toFixed(2),
      isFiscalSurplus: netFiscalBalance >= 0,
      resourceCount: (domainStocks || []).length,
      activeFlowCount: (domainFlows || []).filter((f) => f.active).length,
      upkeepEnabled: upkeepSettings?.enabled !== false
    };
  }
}
