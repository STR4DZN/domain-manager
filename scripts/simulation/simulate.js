/**
 * Motor de Simulação Determinística Pura (Simulation Kernel).
 * Não persiste nada; calcula e retorna o SimulationReport em memória.
 */

import { findMilestones } from "./milestones.js";

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Executa o preview determinístico do avanço temporal de deltaTicks.
 * @param {Object} options
 * @param {Object} options.snapshot - Snapshot obtido via buildSimulationSnapshot
 * @param {number} options.deltaTicks - Quantidade de ticks a simular (inteiro positivo >= 1)
 * @returns {Object} SimulationReport
 */
export function simulateAdvance({ snapshot, deltaTicks = 1 }) {
  const ticks = Math.max(1, Math.floor(Number(deltaTicks) || 1));
  const snap = clone(snapshot);
  const catalogMap = new Map((snap.catalog ?? []).map((res) => [res.id, res]));

  const domainReports = [];
  const projectReports = [];
  const alerts = [];

  // 1. Processar Projetos
  const domainProjectMap = new Map();

  for (const project of snap.projects ?? []) {
    const workReq = Math.max(1, Number(project.work?.required ?? 100));
    const workComp = Number(project.work?.completed ?? 0);
    const rate = Number(project.work?.rateAmount ?? 0);
    const period = Math.max(1, Number(project.work?.periodTicks ?? 1));
    const carry = Number(project.work?.carry ?? 0);

    let projectedCompleted = workComp;
    let projectedCarry = carry;
    let wouldComplete = false;
    let wouldBlock = false;
    let blockReason = null;
    let projectedStatus = project.status;

    if (project.status === "active") {
      const accumulated = (rate * ticks) + carry;
      const workDelta = Math.floor(accumulated / period);
      projectedCarry = accumulated % period;
      projectedCompleted = Math.min(workReq, workComp + workDelta);

      if (projectedCompleted >= workReq) {
        projectedCompleted = workReq;
        projectedCarry = 0; // Carry zera na conclusão
        wouldComplete = true;
        projectedStatus = "completed";
      }
    }

    const progressPercent = Math.min(100, Math.floor((projectedCompleted * 100) / workReq));

    // Custos projetados
    const costReports = (project.costs ?? []).map((cost) => {
      const totalAmount = Number(cost.amount ?? 0);
      const consumedAmount = Number(cost.consumedAmount ?? 0);
      const mode = cost.mode ?? "reserved";

      let projectedConsumed = consumedAmount;
      let projectedReserved = 0;
      let dueNow = 0;

      if (mode === "progressive") {
        const cumulativeObligation = Math.floor((totalAmount * projectedCompleted) / workReq);
        dueNow = Math.max(0, cumulativeObligation - consumedAmount);
        projectedConsumed = consumedAmount + dueNow;
      } else if (mode === "reserved") {
        if (wouldComplete) {
          // Na conclusão, o restante reservado é liquidado
          dueNow = Math.max(0, totalAmount - consumedAmount);
          projectedConsumed = totalAmount;
          projectedReserved = 0;
        } else if (projectedStatus === "active" || projectedStatus === "paused" || projectedStatus === "blocked") {
          projectedReserved = Math.max(0, totalAmount - consumedAmount);
        }
      }

      const remaining = Math.max(0, totalAmount - projectedConsumed);

      return {
        localId: cost.localId,
        resourceId: cost.resourceId,
        mode,
        amount: totalAmount,
        projectedConsumed,
        projectedReserved,
        dueNow,
        remaining
      };
    });

    const projectReport = {
      uuid: project.uuid,
      name: project.name,
      domainUuid: project.domainUuid,
      initialStatus: project.status,
      projectedStatus,
      initialCompleted: workComp,
      projectedCompleted,
      workRequired: workReq,
      initialCarry: carry,
      projectedCarry,
      progressPercent,
      wouldComplete,
      wouldBlock,
      blockReason,
      costs: costReports
    };

    projectReports.push(projectReport);

    if (!domainProjectMap.has(project.domainUuid)) {
      domainProjectMap.set(project.domainUuid, []);
    }
    domainProjectMap.get(project.domainUuid).push(projectReport);
  }

  // 2. Processar Economia por Domínio
  for (const domain of snap.domains ?? []) {
    const initialStocks = new Map(domain.stocks.map((s) => [s.resourceId, Number(s.amount ?? 0)]));
    const projectedStocks = new Map(initialStocks);
    const flowDeltas = new Map();

    // Integrar fluxos
    for (const flow of domain.flows ?? []) {
      if (!flow.active) continue;
      const resId = flow.resourceId;
      const amount = Number(flow.amount ?? 0);
      const period = Math.max(1, Number(flow.periodTicks ?? 1));
      const direction = flow.direction ?? "inflow";

      const totalFlow = Math.floor((amount * ticks) / period);
      const delta = direction === "inflow" ? totalFlow : -totalFlow;

      const current = flowDeltas.get(resId) ?? 0;
      flowDeltas.set(resId, current + delta);
    }

    // Integrar transferências de Acordos Diplomáticos (Bloco 10)
    for (const agr of domain.agreements ?? []) {
      if (agr.status !== "active") continue;
      for (const transfer of agr.transfers ?? []) {
        const resId = transfer.resourceId;
        const transferAmount = Number(transfer.amountPerTick ?? 0) * ticks;
        if (transferAmount <= 0) continue;

        const delta = transfer.direction === "receive" ? transferAmount : -transferAmount;
        const cur = flowDeltas.get(resId) ?? 0;
        flowDeltas.set(resId, cur + delta);
      }
    }

    // Aplicar fluxos aos estoques
    for (const [resId, delta] of flowDeltas.entries()) {
      const initial = projectedStocks.get(resId) ?? 0;
      projectedStocks.set(resId, initial + delta);
    }

    // Calcular reservas e custos devidos dos projetos deste domínio
    const relatedProjects = domainProjectMap.get(domain.uuid) ?? [];
    const reservedMap = new Map();
    const dueNowMap = new Map();

    for (const proj of relatedProjects) {
      for (const cost of proj.costs) {
        if (cost.projectedReserved > 0) {
          const cur = reservedMap.get(cost.resourceId) ?? 0;
          reservedMap.set(cost.resourceId, cur + cost.projectedReserved);
        }
        if (cost.dueNow > 0) {
          const cur = dueNowMap.get(cost.resourceId) ?? 0;
          dueNowMap.set(cost.resourceId, cur + cost.dueNow);
        }
      }
    }

    // Construir relatório de recursos do domínio
    const allResourceIds = new Set([
      ...initialStocks.keys(),
      ...projectedStocks.keys(),
      ...flowDeltas.keys(),
      ...reservedMap.keys(),
      ...dueNowMap.keys()
    ]);

    const resourceSummaries = [];

    for (const resId of allResourceIds) {
      const resDef = catalogMap.get(resId) ?? { id: resId, name: resId, precision: 0, allowNegative: false };
      const initialStock = initialStocks.get(resId) ?? 0;
      const projectedStock = projectedStocks.get(resId) ?? 0;
      const netDelta = flowDeltas.get(resId) ?? 0;
      const projectedReserved = reservedMap.get(resId) ?? 0;
      const projectedAvailable = projectedStock - projectedReserved;
      const dueNow = dueNowMap.get(resId) ?? 0;

      const shortfall = !resDef.allowNegative && projectedStock < 0;
      const overReserved = !resDef.allowNegative && projectedReserved > 0 && projectedReserved > projectedStock;

      if (shortfall) {
        alerts.push({
          type: "shortfall",
          domainUuid: domain.uuid,
          domainName: domain.name,
          resourceId: resId,
          resourceName: resDef.name,
          message: `Estoque de '${resDef.name}' no domínio '${domain.name}' ficará negativo (${projectedStock}).`
        });

        const hasAgreement = (domain.agreements ?? []).some(
          (a) => a.status === "active" && (a.transfers ?? []).some((t) => t.resourceId === resId && t.direction === "send")
        );
        if (hasAgreement) {
          alerts.push({
            type: "agreementBreach",
            domainUuid: domain.uuid,
            domainName: domain.name,
            resourceId: resId,
            resourceName: resDef.name,
            message: `Risco de Quebra de Acordo: Domínio '${domain.name}' não conseguirá honrar transferências de '${resDef.name}'.`
          });
        }
      }

      if (overReserved && !shortfall) {
        alerts.push({
          type: "overReserved",
          domainUuid: domain.uuid,
          domainName: domain.name,
          resourceId: resId,
          resourceName: resDef.name,
          message: `Reservas de '${resDef.name}' (${projectedReserved}) excedem o estoque projetado (${projectedStock}) em '${domain.name}'.`
        });
      }

      resourceSummaries.push({
        resourceId: resId,
        resourceName: resDef.name,
        unit: resDef.unit,
        precision: resDef.precision,
        allowNegative: resDef.allowNegative,
        initialStock,
        projectedStock,
        netDelta,
        projectedReserved,
        projectedAvailable,
        dueNow,
        shortfall,
        overReserved
      });
    }

    domainReports.push({
      uuid: domain.uuid,
      name: domain.name,
      resources: resourceSummaries
    });
  }

  // 3. Milestones
  const milestones = findMilestones({ snapshot: snap, deltaTicks: ticks });

  return {
    deltaTicks: ticks,
    timestamp: Date.now(),
    domains: domainReports,
    projects: projectReports,
    milestones,
    alerts
  };
}
