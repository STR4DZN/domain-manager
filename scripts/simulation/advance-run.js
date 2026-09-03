import { calculateDomainUpkeep } from "../features/economy/upkeep.js";
/**
 * Bloco 8 — Advance Run: Motor de Execução Temporal com Commit Real no Mundo.
 * Aplica as mutações determinísticas calculadas pelo kernel de simulação.
 */

import { MODULE_ID, RECORD_TYPES } from "../core/constants.js";
import { recordIndex } from "../data/record-index.js";
import { decodeRecord } from "../models/record-codec.js";
import { updateRecord } from "../data/journal-store.js";
import { getResourceCatalogSetting } from "../core/settings.js";
import { buildSimulationSnapshot } from "./snapshot.js";
import { simulateAdvance } from "./simulate.js";

import { syncWorldTimeAdvance, getTimekeepingStatus } from "../integration/timekeeping.js";

/**
 * Executa o avanço temporal real e persiste as mudanças nos JournalEntries.
 * @param {Object} options
 * @param {number} options.deltaTicks - Quantidade de ticks a avançar (inteiro positivo >= 1)
 * @returns {Promise<Object>} Resultado do avanço { success, report, updatedDomains, updatedProjects, timekeeping }
 */
export async function executeAdvanceRun({ deltaTicks = 1, fromWorldTimeHook = false } = {}) {
  if (!game.user.isGM) {
    throw new Error("Apenas o Mestre (GM) possui autoridade para avançar o tempo do mundo.");
  }

  const ticks = Math.max(1, Math.floor(Number(deltaTicks) || 1));

  // 1. Obter snapshot atual e simular
  const domainDocs = recordIndex.list(RECORD_TYPES.DOMAIN);
  const projectDocs = recordIndex.list(RECORD_TYPES.PROJECT);
  const domains = domainDocs.map(decodeRecord);
  const projects = projectDocs.map(decodeRecord);
  const catalog = getResourceCatalogSetting();

  const snapshot = buildSimulationSnapshot({ domains, projects, catalog });
  const report = simulateAdvance({ snapshot, deltaTicks: ticks });

  const updatedDomains = [];
  const updatedProjects = [];

  // 2. Aplicar mutações nos Domínios (Estoques e decaimento de Condições)
  for (const domReport of report.domains) {
    const doc = recordIndex.get(RECORD_TYPES.DOMAIN, domReport.uuid);
    if (!doc) continue;

    const decoded = decodeRecord(doc);
    const domainData = foundry.utils.deepClone(decoded.data);

    // Atualizar estoques com os valores projetados (clampando em 0 caso allowNegative seja false)
    const newStocks = domReport.resources.map((r) => {
      const finalAmount = (!r.allowNegative && r.projectedStock < 0) ? 0 : r.projectedStock;
      return {
        resourceId: r.resourceId,
        amount: finalAmount
      };
    });
    domainData.economy.stocks = newStocks;

    // Impacto do Sustento da População (Fome e Desabastecimento)
    const upkeepInfo = calculateDomainUpkeep({ domainData, catalog });
    const hasFoodShortfall = domReport.resources.some(
      (r) => !r.allowNegative && r.projectedStock <= 0 && r.resourceId === upkeepInfo.foodResId && upkeepInfo.rawFoodUnits > 0
    );
    const hasWaterShortfall = domReport.resources.some(
      (r) => !r.allowNegative && r.projectedStock <= 0 && r.resourceId === upkeepInfo.waterResId && upkeepInfo.rawWaterUnits > 0
    );

    if (hasFoodShortfall || hasWaterShortfall) {
      // Degradar agitação e satisfação da população
      const groups = domainData.population?.groups ?? domainData.people?.groups ?? [];
      for (const g of groups) {
        const currentScore = Number(g.assignment) || 2;
        g.assignment = String(Math.min(10, currentScore + 2));
        if (g.quality === "Muito Alta") g.quality = "Estável";
        else if (g.quality === "Estável") g.quality = "Insatisfeito";
        else if (g.quality === "Insatisfeito") g.quality = "Rebelde";
      }

      // Adicionar condição crítica de Escassez & Fome
      if (!Array.isArray(domainData.conditions)) domainData.conditions = [];
      const existingFamine = domainData.conditions.find((c) => c.localId === "cond_famine");
      if (existingFamine) {
        existingFamine.durationTicks = 3;
        existingFamine.active = true;
      } else {
        domainData.conditions.push({
          localId: "cond_famine",
          name: "Escassez & Fome",
          severity: "crisis",
          durationTicks: 3,
          active: true,
          description: `A base ${decoded.document.name} sofre com desabastecimento de provisões básicas. Agitação elevada e segurança comprometida.`
        });
      }

      // Registrar Crônica histórica
      if (!Array.isArray(domainData.history)) domainData.history = [];
      domainData.history.push({
        localId: `famine_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        title: "Crise de Desabastecimento",
        category: "crisis",
        summary: `A população de ${decoded.document.name} sofreu com a falta de recursos vitais neste ciclo.`,
        details: "Estoques de sustento esgotados causaram inquietação e protestos na colônia.",
        timestamp: Date.now()
      });
    } else {
      // Se há comida e água em abundância, remover condição de fome se expirada
      if (Array.isArray(domainData.conditions)) {
        domainData.conditions = domainData.conditions.filter((c) => c.localId !== "cond_famine" || c.durationTicks > 0);
      }
    }

    // Decaimento de Condições (Bloco 9)
    if (Array.isArray(domainData.conditions)) {
      domainData.conditions = domainData.conditions
        .map((cond) => {
          if (typeof cond.durationTicks === "number" && cond.durationTicks > 0) {
            const remaining = Math.max(0, cond.durationTicks - ticks);
            return { ...cond, durationTicks: remaining, active: remaining > 0 };
          }
          return cond;
        })
        .filter((cond) => cond.active !== false || cond.durationTicks === null);
    }

    // Decaimento e Gestão de Acordos Temporários e Quebras (Bloco 10)
    const domainShortfallResIds = new Set(
      domReport.resources.filter((r) => !r.allowNegative && r.projectedStock < 0).map((r) => r.resourceId)
    );

    if (Array.isArray(domainData.agreements)) {
      domainData.agreements = domainData.agreements.map((agr) => {
        // Verificar se acordo ativo foi violado por falta de recurso
        const hasBreach = agr.status === "active" && (agr.transfers ?? []).some(
          (t) => t.direction === "send" && domainShortfallResIds.has(t.resourceId)
        );

        if (hasBreach) {
          return {
            ...agr,
            status: "breached"
          };
        }

        if (agr.status === "active" && typeof agr.remainingTicks === "number" && agr.remainingTicks > 0) {
          const remaining = Math.max(0, agr.remainingTicks - ticks);
          const isTerminated = remaining === 0;
          return {
            ...agr,
            remainingTicks: remaining,
            status: isTerminated ? "terminated" : agr.status
          };
        }
        return agr;
      });
    }

    // Registro Histórico Automático do Avanço (Bloco 12)
    if (!Array.isArray(domainData.history)) domainData.history = [];
    const completedProjectsInDom = (report.projects ?? []).filter(
      (p) => p.domainUuid === domReport.uuid && p.projectedStatus === "completed"
    );

    // 1. Registro do Avanço Temporal
    const summaryParts = [`Avanço de ${ticks} tick(s)`];
    if (completedProjectsInDom.length) {
      summaryParts.push(`${completedProjectsInDom.length} projeto(s) concluído(s)`);
    }
    domainData.history.push({
      localId: `hist_adv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      tick: ticks,
      title: `Avanço Temporal (${ticks} tick${ticks > 1 ? "s" : ""})`,
      category: "advance",
      summary: summaryParts.join(" · "),
      details: `Executado avanço temporal de ${ticks} tick(s). Estoques e fluxos atualizados com sucesso.`,
      significance: completedProjectsInDom.length ? "major" : "minor",
      visibility: "all"
    });

    // 2. Registro Específico de Projetos Concluídos
    for (const p of completedProjectsInDom) {
      domainData.history.push({
        localId: `hist_proj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        timestamp: Date.now(),
        tick: ticks,
        title: `Projeto Concluído: ${p.name || "Obra"}`,
        category: "project",
        summary: `A obra '${p.name || "Obra"}' foi concluída com 100% de progresso!`,
        details: `O projeto atingiu a meta de trabalho necessária e suas reservas de recursos foram liberadas para uso comum.`,
        significance: "major",
        visibility: "all"
      });
    }

    // 3. Registro de Escassez Crítica de Recursos
    for (const r of domReport.resources) {
      if (!r.allowNegative && r.projectedStock < 0) {
        domainData.history.push({
          localId: `hist_shortfall_${Date.now().toString(36)}_${r.resourceId}`,
          timestamp: Date.now(),
          tick: ticks,
          title: `Escassez Crítica: ${r.resourceName || r.resourceId}`,
          category: "crisis",
          summary: `Estoque de ${r.resourceName || r.resourceId} esgotou e acumulou déficit.`,
          details: `Durante o avanço temporal, o consumo e obrigações superaram o estoque disponível. Estoque clampado em zero.`,
          significance: "major",
          visibility: "all"
        });
      }
    }

    await updateRecord({
      uuid: domReport.uuid,
      recordType: RECORD_TYPES.DOMAIN,
      data: domainData
    });
    updatedDomains.push(domReport.uuid);
  }

  // 3. Aplicar mutações nos Projetos (Trabalho, Carry, Status e Custos)
  for (const projReport of report.projects) {
    const doc = recordIndex.get(RECORD_TYPES.PROJECT, projReport.uuid);
    if (!doc) continue;

    const decoded = decodeRecord(doc);
    const projData = foundry.utils.deepClone(decoded.data);

    projData.status = projReport.projectedStatus;
    projData.work.completed = projReport.projectedCompleted;
    projData.work.carry = projReport.projectedCarry;

    // Atualizar custos consumidos
    if (Array.isArray(projReport.costs) && Array.isArray(projData.costs)) {
      const costMap = new Map(projReport.costs.map((c) => [c.localId, c]));
      projData.costs = projData.costs.map((c) => {
        const rep = costMap.get(c.localId);
        if (rep) {
          return {
            ...c,
            consumedAmount: rep.projectedConsumed
          };
        }
        return c;
      });
    }

    await updateRecord({
      uuid: projReport.uuid,
      recordType: RECORD_TYPES.PROJECT,
      data: projData
    });
    updatedProjects.push(projReport.uuid);
  }

  // 4. Sincronizar com Simple Timekeeping e Foundry Core World Time (apenas se não veio do próprio hook)
  const timeResult = fromWorldTimeHook
    ? { advanced: false, deltaSeconds: 0 }
    : await syncWorldTimeAdvance({ deltaTicks: ticks });

  // 5. Notificar Hooks do Foundry
  Hooks.callAll(`${MODULE_ID}.advanceRun`, {
    deltaTicks: ticks,
    report,
    updatedDomains,
    updatedProjects,
    timekeeping: timeResult,
    fromWorldTimeHook
  });

  return {
    success: true,
    deltaTicks: ticks,
    report,
    updatedDomains,
    updatedProjects,
    timekeeping: timeResult
  };
}
