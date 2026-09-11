import { calculateExactFlowAdvance } from "../core/exact-math.js";
import { calculateDomainUpkeep } from "../features/economy/upkeep.js";
import { advanceProjectWorkByTicks } from "../features/projects/rules.js";
import { findMilestones } from "./milestones.js";

/**
 * Motor de Simulação Determinística Pura (Simulation Kernel).
 * Não persiste nada; calcula e retorna o SimulationReport em memória.
 */

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function projectCostReports(project, {
  projectedCompleted,
  projectedStatus,
  wouldComplete
}) {
  const workReq = Math.max(1, Number(project.work?.required ?? 100));

  return (project.costs ?? []).map((cost) => {
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
        dueNow = Math.max(0, totalAmount - consumedAmount);
        projectedConsumed = consumedAmount + dueNow;
      } else if (["active", "paused", "blocked"].includes(projectedStatus)) {
        projectedReserved = Math.max(0, totalAmount - consumedAmount);
      }
    }

    return {
      localId: cost.localId,
      resourceId: cost.resourceId,
      mode,
      amount: totalAmount,
      initialConsumed: consumedAmount,
      projectedConsumed,
      projectedReserved,
      dueNow,
      remaining: Math.max(0, totalAmount - projectedConsumed)
    };
  });
}

function buildProjectReport(project, ticks) {
  const workReq = Math.max(1, Number(project.work?.required ?? 100));
  const workComp = Number(project.work?.completed ?? 0);
  const carry = Number(project.work?.carry ?? 0);

  let projectedCompleted = workComp;
  let projectedCarry = carry;
  let wouldComplete = false;
  let projectedStatus = project.status;

  if (project.status === "active") {
    const workResult = advanceProjectWorkByTicks({
      required: workReq,
      completed: workComp,
      rateAmount: Number(project.work?.rateAmount ?? 0),
      periodTicks: Math.max(1, Number(project.work?.periodTicks ?? 1)),
      carry
    }, ticks);

    projectedCompleted = workResult.completed;
    projectedCarry = workResult.carry;
    wouldComplete = workResult.didComplete && workComp < workReq;

    if (projectedCompleted >= workReq) {
      projectedCompleted = workReq;
      projectedCarry = 0;
      projectedStatus = "completed";
    }
  }

  const report = {
    entityId: project.entityId ?? null,
    uuid: project.uuid,
    name: project.name,
    domainUuid: project.domainUuid,
    initialStatus: project.status,
    initialBlockedReason: project.blockedReason ?? null,
    projectedStatus,
    projectedBlockedReason: projectedStatus === "blocked" ? (project.blockedReason ?? null) : null,
    initialCompleted: workComp,
    projectedCompleted,
    workRequired: workReq,
    initialCarry: carry,
    projectedCarry,
    progressPercent: Math.min(100, Math.floor((projectedCompleted * 100) / workReq)),
    wouldComplete,
    wouldBlock: false,
    blockReason: null,
    costs: []
  };

  report.costs = projectCostReports(project, report);
  return report;
}

function aggregateDue(costs) {
  const due = new Map();
  for (const cost of costs ?? []) {
    if (cost.dueNow <= 0) continue;
    due.set(cost.resourceId, (due.get(cost.resourceId) ?? 0) + cost.dueNow);
  }
  return due;
}

function fundingShortage(projectReport, projectedStocks, catalogMap) {
  for (const [resourceId, due] of aggregateDue(projectReport.costs)) {
    const resource = catalogMap.get(resourceId) ?? { id: resourceId, name: resourceId, allowNegative: false };
    if (resource.allowNegative) continue;

    const stock = projectedStocks.get(resourceId) ?? 0;
    if (stock < due) {
      return {
        resourceId,
        resourceName: resource.name ?? resourceId,
        due,
        stock,
        missing: due - stock
      };
    }
  }

  return null;
}

function copyProjection(target, source) {
  target.projectedStatus = source.projectedStatus;
  target.projectedCompleted = source.projectedCompleted;
  target.projectedCarry = source.projectedCarry;
  target.progressPercent = source.progressPercent;
  target.wouldComplete = source.wouldComplete;
  target.costs = source.costs;
}

function findAffordableProjectProjection(project, ticks, projectedStocks, catalogMap) {
  const full = buildProjectReport(project, ticks);
  if (!fundingShortage(full, projectedStocks, catalogMap)) {
    return { projection: full, stalled: false, shortage: null };
  }

  // Obrigações são monotônicas com o progresso, então podemos localizar o maior
  // número de ticks financiável sem iterar tick por tick.
  let low = 0;
  let high = Math.max(0, ticks - 1);
  let best = buildProjectReport(project, 0);

  // Se o próprio estado inicial já carrega dívida progressiva incompatível,
  // não fabricamos consumo: o Project simplesmente não avança neste ciclo.
  if (fundingShortage(best, projectedStocks, catalogMap)) {
    best.costs = (project.costs ?? []).map((cost) => ({
      localId: cost.localId,
      resourceId: cost.resourceId,
      mode: cost.mode ?? "reserved",
      amount: Number(cost.amount ?? 0),
      initialConsumed: Number(cost.consumedAmount ?? 0),
      projectedConsumed: Number(cost.consumedAmount ?? 0),
      projectedReserved: (cost.mode ?? "reserved") === "reserved"
        ? Math.max(0, Number(cost.amount ?? 0) - Number(cost.consumedAmount ?? 0))
        : 0,
      dueNow: 0,
      remaining: Math.max(0, Number(cost.amount ?? 0) - Number(cost.consumedAmount ?? 0))
    }));
    return {
      projection: best,
      stalled: true,
      shortage: fundingShortage(full, projectedStocks, catalogMap)
    };
  }

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candidate = buildProjectReport(project, mid);
    if (fundingShortage(candidate, projectedStocks, catalogMap)) {
      high = mid - 1;
    } else {
      best = candidate;
      low = mid + 1;
    }
  }

  return {
    projection: best,
    stalled: true,
    shortage: fundingShortage(full, projectedStocks, catalogMap)
  };
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
  const domainProjectMap = new Map();
  const domainStructureMap = new Map();

  const addStructureKey = (key, structure) => {
    if (!key) return;
    let map = domainStructureMap.get(key);
    if (!map) {
      map = new Map();
      domainStructureMap.set(key, map);
    }
    map.set(structure.entityId ?? structure.uuid, structure);
  };
  for (const structure of snap.structures ?? []) {
    addStructureKey(structure.domain?.uuid, structure);
    addStructureKey(structure.domain?.entityId, structure);
  }

  // 1. Projetar trabalho e obrigações dos Projects. O settlement financeiro
  // acontece por Domain, depois que os fluxos daquele período são calculados.
  for (const project of snap.projects ?? []) {
    const report = buildProjectReport(project, ticks);
    projectReports.push(report);

    if (!domainProjectMap.has(project.domainUuid)) {
      domainProjectMap.set(project.domainUuid, []);
    }
    domainProjectMap.get(project.domainUuid).push({ project, report });
  }

  // 2. Processar Economia por Domain.
  for (const domain of snap.domains ?? []) {
    const initialStocks = new Map((domain.stocks ?? []).map((s) => [s.resourceId, Number(s.amount ?? 0)]));
    const projectedStocks = new Map(initialStocks);
    const flowDeltas = new Map();
    const flowReports = [];

    const upkeepInfo = calculateDomainUpkeep({ domainData: domain, catalog: snap.catalog });
    const persistedFlowIds = new Set((domain.flows ?? []).map((flow) => flow.localId));
    const relatedStructureMap = new Map([
      ...(domainStructureMap.get(domain.uuid)?.entries?.() ?? []),
      ...(domainStructureMap.get(domain.entityId)?.entries?.() ?? [])
    ]);
    const relatedStructures = [...relatedStructureMap.values()];
    const structureFlows = [];
    const structureReports = [];

    for (const structure of relatedStructures) {
      const active = ["operational", "damaged"].includes(structure.status);
      const efficiency = structure.status === "damaged"
        ? Math.max(0, Math.min(100, Number(structure.condition ?? 0)))
        : (active ? 100 : 0);
      const maintenance = [];
      const production = [];

      if (active) {
        for (const entry of structure.maintenance ?? []) {
          const perTick = Math.max(0, Number(entry.amount ?? 0));
          if (perTick <= 0) continue;
          structureFlows.push({
            localId: `structure:${structure.entityId ?? structure.uuid}:maintenance:${entry.resourceId}`,
            resourceId: entry.resourceId,
            direction: "outflow",
            amount: perTick,
            periodTicks: 1,
            carry: 0,
            active: true,
            category: "upkeep"
          });
          maintenance.push({ resourceId: entry.resourceId, perTick, delta: perTick * ticks });
        }

        for (const entry of structure.production ?? []) {
          const raw = Math.max(0, Number(entry.amount ?? 0));
          const perTick = Math.floor((raw * efficiency) / 100);
          if (perTick <= 0) {
            production.push({ resourceId: entry.resourceId, perTick: 0, delta: 0, nominalPerTick: raw });
            continue;
          }
          structureFlows.push({
            localId: `structure:${structure.entityId ?? structure.uuid}:production:${entry.resourceId}`,
            resourceId: entry.resourceId,
            direction: "inflow",
            amount: perTick,
            periodTicks: 1,
            carry: 0,
            active: true,
            category: "production"
          });
          production.push({ resourceId: entry.resourceId, perTick, delta: perTick * ticks, nominalPerTick: raw });
        }
      }

      structureReports.push({
        uuid: structure.uuid,
        entityId: structure.entityId,
        name: structure.name,
        status: structure.status,
        condition: structure.condition,
        efficiency,
        active,
        maintenance,
        production
      });
    }

    const allDomainFlows = [...(domain.flows ?? []), ...upkeepInfo.syntheticFlows, ...structureFlows];

    // Fluxos periódicos com carry persistente. Fluxos sintéticos de upkeep têm
    // periodTicks=1 e, portanto, não precisam persistir carry.
    for (const flow of allDomainFlows) {
      if (!flow.active) continue;

      const resId = flow.resourceId;
      const direction = flow.direction ?? "inflow";
      const initialCarry = Number(flow.carry ?? 0);
      const { deltaAmount, nextCarry } = calculateExactFlowAdvance({
        ratePerPeriod: Number(flow.amount ?? 0),
        periodTicks: Math.max(1, Number(flow.periodTicks ?? 1)),
        deltaTicks: ticks,
        initialCarry
      });
      const delta = direction === "inflow" ? deltaAmount : -deltaAmount;

      flowDeltas.set(resId, (flowDeltas.get(resId) ?? 0) + delta);

      if (persistedFlowIds.has(flow.localId)) {
        flowReports.push({
          localId: flow.localId,
          resourceId: resId,
          initialCarry,
          projectedCarry: nextCarry,
          delta
        });
      }
    }

    // Acordos são definidos como amountPerTick, portanto não possuem fração de período.
    for (const agr of domain.agreements ?? []) {
      if (agr.status !== "active") continue;
      for (const transfer of agr.transfers ?? []) {
        const resId = transfer.resourceId;
        const transferAmount = Number(transfer.amountPerTick ?? 0) * ticks;
        if (transferAmount <= 0) continue;

        const delta = transfer.direction === "receive" ? transferAmount : -transferAmount;
        flowDeltas.set(resId, (flowDeltas.get(resId) ?? 0) + delta);
      }
    }

    for (const [resId, delta] of flowDeltas.entries()) {
      projectedStocks.set(resId, (projectedStocks.get(resId) ?? 0) + delta);
    }

    // Settlement dos custos de Project. Se o intervalo inteiro não for financiável,
    // o kernel aplica apenas a maior parcela de progresso que cabe no orçamento do
    // ciclo. O Project permanece ativo para poder retomar automaticamente quando
    // houver recursos, em vez de exigir intervenção manual para um bloqueio transitório.
    const relatedProjects = domainProjectMap.get(domain.uuid) ?? [];
    const paidProjectCosts = new Map();

    for (const { project, report } of relatedProjects) {
      const settlement = findAffordableProjectProjection(project, ticks, projectedStocks, catalogMap);
      copyProjection(report, settlement.projection);

      if (settlement.stalled) {
        const shortage = settlement.shortage;
        report.wouldBlock = true;
        report.blockReason = `Recursos insuficientes: ${shortage.resourceName} (necessário ${shortage.due}, disponível ${shortage.stock}).`;
        report.projectedBlockedReason = report.blockReason;
        alerts.push({
          type: "projectFundingShortage",
          domainUuid: domain.uuid,
          domainName: domain.name,
          projectUuid: report.uuid,
          projectName: report.name,
          resourceId: shortage.resourceId,
          resourceName: shortage.resourceName,
          message: `Projeto '${report.name}' teve o avanço limitado por falta de '${shortage.resourceName}'.`
        });
      } else {
        report.wouldBlock = false;
        report.blockReason = null;
        report.projectedBlockedReason = report.projectedStatus === "blocked"
          ? (project.blockedReason ?? null)
          : null;
      }

      for (const [resourceId, due] of aggregateDue(report.costs)) {
        projectedStocks.set(resourceId, (projectedStocks.get(resourceId) ?? 0) - due);
        paidProjectCosts.set(resourceId, (paidProjectCosts.get(resourceId) ?? 0) + due);
      }
    }

    // Reservas são calculadas depois do settlement porque um Project concluído já não
    // deve continuar reservando o que acabou de consumir.
    const reservedMap = new Map();
    for (const { report } of relatedProjects) {
      for (const cost of report.costs ?? []) {
        if (cost.projectedReserved <= 0) continue;
        reservedMap.set(cost.resourceId, (reservedMap.get(cost.resourceId) ?? 0) + cost.projectedReserved);
      }
    }

    const allResourceIds = new Set([
      ...initialStocks.keys(),
      ...projectedStocks.keys(),
      ...flowDeltas.keys(),
      ...reservedMap.keys(),
      ...paidProjectCosts.keys()
    ]);

    const resourceSummaries = [];

    for (const resId of allResourceIds) {
      const resDef = catalogMap.get(resId) ?? { id: resId, name: resId, precision: 0, allowNegative: false };
      const initialStock = initialStocks.get(resId) ?? 0;
      const projectedStock = projectedStocks.get(resId) ?? 0;
      const projectedReserved = reservedMap.get(resId) ?? 0;
      const projectedAvailable = projectedStock - projectedReserved;
      const dueNow = paidProjectCosts.get(resId) ?? 0;
      const netDelta = projectedStock - initialStock;

      const shortfall = !resDef.allowNegative && projectedStock < 0;
      const overReserved = !resDef.allowNegative && projectedReserved > projectedStock;

      if (shortfall) {
        let isSustenanceCrisis = false;
        if (resId === upkeepInfo.foodResId && upkeepInfo.rawFoodUnits > 0) {
          isSustenanceCrisis = true;
          alerts.push({
            type: "famine",
            domainUuid: domain.uuid,
            domainName: domain.name,
            resourceId: resId,
            resourceName: resDef.name,
            message: `Crise de Alimentos: o estoque de provisões em '${domain.name}' não cobre o consumo do período.`
          });
        }
        if (resId === upkeepInfo.waterResId && upkeepInfo.rawWaterUnits > 0) {
          isSustenanceCrisis = true;
          alerts.push({
            type: "drought",
            domainUuid: domain.uuid,
            domainName: domain.name,
            resourceId: resId,
            resourceName: resDef.name,
            message: `Crise Hídrica: o estoque de água em '${domain.name}' não cobre o consumo do período.`
          });
        }
        if (!isSustenanceCrisis) {
          alerts.push({
            type: "shortfall",
            domainUuid: domain.uuid,
            domainName: domain.name,
            resourceId: resId,
            resourceName: resDef.name,
            message: `Estoque de '${resDef.name}' no domínio '${domain.name}' ficará negativo (${projectedStock}).`
          });
        }

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
            message: `Risco de Quebra de Acordo: domínio '${domain.name}' não conseguirá honrar transferências de '${resDef.name}'.`
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
        flowDelta: flowDeltas.get(resId) ?? 0,
        projectCostDelta: -dueNow,
        projectedReserved,
        projectedAvailable,
        dueNow,
        shortfall,
        overReserved
      });
    }

    const resourceSummaryMap = new Map(resourceSummaries.map((entry) => [entry.resourceId, entry]));
    for (const structure of structureReports) {
      for (const maintenance of structure.maintenance) {
        const resource = resourceSummaryMap.get(maintenance.resourceId);
        if (!resource?.shortfall) continue;
        alerts.push({
          type: "structureMaintenanceRisk",
          domainUuid: domain.uuid,
          domainName: domain.name,
          structureUuid: structure.uuid,
          structureEntityId: structure.entityId,
          structureName: structure.name,
          resourceId: maintenance.resourceId,
          resourceName: resource.resourceName,
          message: `Manutenção de '${structure.name}' pressiona o estoque de '${resource.resourceName}'.`
        });
      }
    }

    domainReports.push({
      uuid: domain.uuid,
      entityId: domain.entityId ?? null,
      name: domain.name,
      resources: resourceSummaries,
      flows: flowReports,
      structures: structureReports
    });
  }

  // Milestones de conclusão que foram inviabilizados por falta de recursos não são
  // reportados como conclusão no mesmo preview.
  const blockedProjectIds = new Set(projectReports.filter((p) => p.wouldBlock).map((p) => p.uuid));
  const milestones = findMilestones({ snapshot: snap, deltaTicks: ticks })
    .filter((milestone) => !milestone.projectUuid || !blockedProjectIds.has(milestone.projectUuid));

  return {
    deltaTicks: ticks,
    timestamp: Date.now(),
    domains: domainReports,
    projects: projectReports,
    milestones,
    alerts
  };
}
