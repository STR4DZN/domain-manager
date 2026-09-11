import { calculateExactFlowAdvance } from "../core/exact-math.js";
import { calculateDomainUpkeep } from "../features/economy/upkeep.js";
import { advanceProjectWorkByTicks } from "../features/projects/rules.js";
import { findMilestones } from "./milestones.js";

/**
 * Motor de simulação determinística pura.
 *
 * Desde schema v7, todo avanço é resolvido internamente em passos de 1 tick.
 * Isso mantém a equivalência entre advance(N) e N × advance(1), inclusive
 * quando escassez, capacidade, Projects e Structures mudam o estado no meio
 * do intervalo.
 */

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function projectCostReports(project, { projectedCompleted, projectedStatus, wouldComplete }) {
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

function buildProjectReport(project, ticks = 1) {
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

function fundingShortage(projectReport, stocks, catalogMap) {
  for (const [resourceId, due] of aggregateDue(projectReport.costs)) {
    const resource = catalogMap.get(resourceId) ?? { id: resourceId, name: resourceId, allowNegative: false };
    if (resource.allowNegative) continue;
    const stock = stocks.get(resourceId) ?? 0;
    if (stock < due) {
      return { resourceId, resourceName: resource.name ?? resourceId, due, stock, missing: due - stock };
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

function findAffordableProjectProjection(project, ticks, stocks, catalogMap) {
  const full = buildProjectReport(project, ticks);
  if (!fundingShortage(full, stocks, catalogMap)) return { projection: full, stalled: false, shortage: null };

  let low = 0;
  let high = Math.max(0, ticks - 1);
  let best = buildProjectReport(project, 0);
  if (fundingShortage(best, stocks, catalogMap)) {
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
    return { projection: best, stalled: true, shortage: fundingShortage(full, stocks, catalogMap) };
  }

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candidate = buildProjectReport(project, mid);
    if (fundingShortage(candidate, stocks, catalogMap)) high = mid - 1;
    else { best = candidate; low = mid + 1; }
  }
  return { projection: best, stalled: true, shortage: fundingShortage(full, stocks, catalogMap) };
}

function domainStructureMap(snapshot) {
  const result = new Map();
  const add = (key, structure) => {
    if (!key) return;
    let values = result.get(key);
    if (!values) { values = new Map(); result.set(key, values); }
    values.set(structure.entityId ?? structure.uuid, structure);
  };
  for (const structure of snapshot.structures ?? []) {
    add(structure.domain?.uuid, structure);
    add(structure.domain?.entityId, structure);
  }
  return result;
}

function maintenanceServiceBps(structure, stocks, catalogMap) {
  const requirements = (structure.maintenance ?? []).filter((entry) => Number(entry.amount ?? 0) > 0);
  if (!requirements.length) return 10_000;
  let ratio = 10_000;
  for (const entry of requirements) {
    const required = Math.max(1, Number(entry.amount ?? 0));
    const definition = catalogMap.get(entry.resourceId) ?? { allowNegative: false };
    if (definition.allowNegative) continue;
    const available = Math.max(0, Number(stocks.get(entry.resourceId) ?? 0));
    ratio = Math.min(ratio, Math.max(0, Math.min(10_000, Math.floor((available * 10_000) / required))));
  }
  return ratio;
}

function workforceCoverage(domain, structure) {
  const required = Math.max(0, Number(structure.workforceRequired ?? 0));
  if (required <= 0) return { required: 0, assigned: 0, ratioBps: 10_000 };

  const groups = new Map((domain.population?.groups ?? []).map((group) => [group.localId, group]));
  let assigned = 0;
  for (const allocation of domain.population?.workforce?.allocations ?? []) {
    const target = allocation.target ?? {};
    const matches = (structure.entityId && target.entityId === structure.entityId)
      || (structure.uuid && target.uuid === structure.uuid);
    if (!matches) continue;
    const group = groups.get(allocation.groupLocalId);
    if (!group || group.status !== "active") continue;
    assigned += Math.max(0, Number(allocation.count ?? 0));
  }

  return {
    required,
    assigned,
    ratioBps: Math.max(0, Math.min(10_000, Math.floor((assigned * 10_000) / required)))
  };
}

function structureConditionEfficiency(structure) {
  if (structure.status === "operational") return 100;
  if (structure.status === "damaged") return Math.max(0, Math.min(100, Number(structure.condition ?? 0)));
  return 0;
}

function policyMapForDomain(domain) {
  return new Map((domain.resourcePolicies ?? []).map((policy) => [policy.resourceId, policy]));
}


function domainKeyMatches(domain, reference) {
  if (!domain || !reference) return false;
  return Boolean(
    (reference.uuid && domain.uuid === reference.uuid)
    || (reference.entityId && domain.entityId === reference.entityId)
  );
}

function domainSnapshotForReference(snapshot, reference) {
  return (snapshot.domains ?? []).find((domain) => domainKeyMatches(domain, reference)) ?? null;
}

function domainReportForReference(snapshot, domainReports, reference) {
  const domain = domainSnapshotForReference(snapshot, reference);
  if (!domain) return { domain: null, report: null };
  return {
    domain,
    report: (domainReports ?? []).find((entry) => entry.uuid === domain.uuid) ?? null
  };
}

function resourceProjectionForAgreement({ domain, report, resourceId, catalogMap }) {
  let resource = (report.resources ?? []).find((entry) => entry.resourceId === resourceId);
  if (resource) return resource;

  const definition = catalogMap.get(resourceId) ?? {
    id: resourceId,
    name: resourceId,
    unit: "",
    precision: 0,
    allowNegative: false
  };
  const stock = Number((domain.stocks ?? []).find((entry) => entry.resourceId === resourceId)?.amount ?? 0);
  const policy = (domain.resourcePolicies ?? []).find((entry) => entry.resourceId === resourceId) ?? {
    criticalFloor: 0,
    reserveTarget: 0,
    storageCapacity: 0
  };
  resource = {
    resourceId,
    resourceName: definition.name ?? resourceId,
    unit: definition.unit ?? "",
    precision: Number(definition.precision ?? 0),
    allowNegative: Boolean(definition.allowNegative),
    initialStock: stock,
    projectedStock: stock,
    netDelta: 0,
    flowDelta: 0,
    agreementDelta: 0,
    projectCostDelta: 0,
    projectedReserved: 0,
    projectedAvailable: stock,
    dueNow: 0,
    shortfall: false,
    overReserved: false,
    policy: {
      criticalFloor: Number(policy.criticalFloor ?? 0),
      reserveTarget: Number(policy.reserveTarget ?? 0),
      storageCapacity: Number(policy.storageCapacity ?? 0)
    },
    critical: false,
    belowReserve: false,
    storageOverflow: 0
  };
  report.resources.push(resource);
  return resource;
}

function refreshAgreementResourceState(resource, alerts, domain) {
  resource.projectedAvailable = Number(resource.projectedStock ?? 0) - Number(resource.projectedReserved ?? 0);
  resource.netDelta = Number(resource.projectedStock ?? 0) - Number(resource.initialStock ?? 0);
  resource.shortfall = !resource.allowNegative && Number(resource.projectedStock ?? 0) < 0;
  resource.overReserved = !resource.allowNegative
    && Number(resource.projectedReserved ?? 0) > Math.max(0, Number(resource.projectedStock ?? 0));

  const effectiveAvailable = resource.allowNegative
    ? Number(resource.projectedAvailable ?? 0)
    : Math.max(0, Number(resource.projectedAvailable ?? 0));
  const floor = Number(resource.policy?.criticalFloor ?? 0);
  const target = Number(resource.policy?.reserveTarget ?? 0);
  resource.critical = floor > 0 && effectiveAvailable <= floor;
  resource.belowReserve = target > 0 && effectiveAvailable < target;

  if (resource.critical) {
    alerts.push({
      type: "criticalFloor",
      domainUuid: domain.uuid,
      domainName: domain.name,
      resourceId: resource.resourceId,
      resourceName: resource.resourceName,
      message: `'${resource.resourceName}' atingiu o piso crítico (${floor}) após settlement diplomático.`
    });
  } else if (resource.belowReserve) {
    alerts.push({
      type: "reserveTarget",
      domainUuid: domain.uuid,
      domainName: domain.name,
      resourceId: resource.resourceId,
      resourceName: resource.resourceName,
      message: `'${resource.resourceName}' está abaixo da reserva-alvo (${target}) após settlement diplomático.`
    });
  }
}

/**
 * Liquida Agreements independentes ao FINAL do tick. Dessa forma tratados
 * nunca retroagem para evitar fome/manutenção já resolvidas naquele tick e
 * passam a influenciar o tick seguinte. A ordenação por identidade estável
 * torna a disputa por um mesmo estoque determinística.
 */
function settleStandaloneAgreements({ snapshot, domainReports, catalogMap, alerts }) {
  const settlementTick = Math.max(0, Number(snapshot.currentTick ?? 0)) + 1;
  const reports = [];
  const ordered = [...(snapshot.agreements ?? [])].sort((a, b) =>
    String(a.entityId ?? a.uuid).localeCompare(String(b.entityId ?? b.uuid))
  );

  for (const agreement of ordered) {
    let projectedStatus = agreement.status;
    const transferReports = [];

    const startsNow = agreement.startTick == null || settlementTick >= Number(agreement.startTick);
    const endedBeforeTick = agreement.endTick != null && settlementTick > Number(agreement.endTick);
    if (agreement.status === "active" && endedBeforeTick) {
      projectedStatus = "expired";
      alerts.push({
        type: "agreementExpired",
        agreementUuid: agreement.uuid,
        agreementEntityId: agreement.entityId,
        agreementName: agreement.name,
        tick: settlementTick,
        message: `Agreement '${agreement.name}' expirou antes do tick ${settlementTick}.`
      });
    }

    const maySettle = agreement.status === "active" && projectedStatus === "active" && startsNow;
    let breached = false;

    for (const transfer of agreement.transfers ?? []) {
      const initialCarry = Number(transfer.carry ?? 0);
      let projectedCarry = initialCarry;
      let due = 0;
      let transferred = 0;
      let shortfall = 0;
      let overflow = 0;

      if (maySettle) {
        const exact = calculateExactFlowAdvance({
          ratePerPeriod: Math.max(0, Number(transfer.amount ?? 0)),
          periodTicks: Math.max(1, Number(transfer.periodTicks ?? 1)),
          deltaTicks: 1,
          initialCarry
        });
        due = exact.deltaAmount;
        projectedCarry = exact.nextCarry;

        if (due > 0) {
          const sourceResolved = domainReportForReference(snapshot, domainReports, transfer.fromDomain);
          const targetResolved = domainReportForReference(snapshot, domainReports, transfer.toDomain);
          if (!sourceResolved.domain || !sourceResolved.report || !targetResolved.domain || !targetResolved.report) {
            breached = true;
            shortfall = due;
            alerts.push({
              type: "agreementBreach",
              agreementUuid: agreement.uuid,
              agreementEntityId: agreement.entityId,
              agreementName: agreement.name,
              resourceId: transfer.resourceId,
              due,
              transferred: 0,
              missing: due,
              tick: settlementTick,
              message: `Agreement '${agreement.name}' não encontrou um Domain participante durante o settlement.`
            });
          } else {
            const sourceResource = resourceProjectionForAgreement({
              domain: sourceResolved.domain,
              report: sourceResolved.report,
              resourceId: transfer.resourceId,
              catalogMap
            });
            const targetResource = resourceProjectionForAgreement({
              domain: targetResolved.domain,
              report: targetResolved.report,
              resourceId: transfer.resourceId,
              catalogMap
            });
            const available = sourceResource.allowNegative
              ? due
              : Math.max(0, Number(sourceResource.projectedStock ?? 0) - Number(sourceResource.projectedReserved ?? 0));
            transferred = sourceResource.allowNegative ? due : Math.min(due, available);
            shortfall = Math.max(0, due - transferred);

            sourceResource.projectedStock = Number(sourceResource.projectedStock ?? 0) - transferred;
            sourceResource.agreementDelta = Number(sourceResource.agreementDelta ?? 0) - transferred;
            targetResource.projectedStock = Number(targetResource.projectedStock ?? 0) + transferred;
            targetResource.agreementDelta = Number(targetResource.agreementDelta ?? 0) + transferred;

            const capacity = Math.max(0, Number(targetResource.policy?.storageCapacity ?? 0));
            if (capacity > 0 && Number(targetResource.projectedStock ?? 0) > capacity) {
              overflow = Number(targetResource.projectedStock ?? 0) - capacity;
              targetResource.projectedStock = capacity;
              targetResource.storageOverflow = Number(targetResource.storageOverflow ?? 0) + overflow;
              alerts.push({
                type: "storageOverflow",
                domainUuid: targetResolved.domain.uuid,
                domainName: targetResolved.domain.name,
                resourceId: transfer.resourceId,
                overflow,
                agreementUuid: agreement.uuid,
                message: `Recebimento de '${agreement.name}' excedeu a capacidade de '${targetResource.resourceName}'; ${overflow} unidade(s) foram perdidas.`
              });
            }

            refreshAgreementResourceState(sourceResource, alerts, sourceResolved.domain);
            refreshAgreementResourceState(targetResource, alerts, targetResolved.domain);

            if (shortfall > 0) {
              breached = true;
              alerts.push({
                type: "agreementBreach",
                agreementUuid: agreement.uuid,
                agreementEntityId: agreement.entityId,
                agreementName: agreement.name,
                domainUuid: sourceResolved.domain.uuid,
                domainName: sourceResolved.domain.name,
                resourceId: transfer.resourceId,
                resourceName: sourceResource.resourceName,
                due,
                transferred,
                missing: shortfall,
                tick: settlementTick,
                message: `Agreement '${agreement.name}' recebeu apenas ${transferred}/${due} de '${sourceResource.resourceName}'.`
              });
            }
          }
        }
      }

      transferReports.push({
        localId: transfer.localId,
        resourceId: transfer.resourceId,
        fromDomain: clone(transfer.fromDomain),
        toDomain: clone(transfer.toDomain),
        amount: Number(transfer.amount ?? 0),
        periodTicks: Math.max(1, Number(transfer.periodTicks ?? 1)),
        initialCarry,
        projectedCarry,
        due,
        transferred,
        shortfall,
        overflow
      });
    }

    if (projectedStatus === "active" && breached) projectedStatus = "breached";
    reports.push({
      entityId: agreement.entityId ?? null,
      uuid: agreement.uuid,
      name: agreement.name,
      type: agreement.type,
      startTick: agreement.startTick ?? null,
      endTick: agreement.endTick ?? null,
      initialStatus: agreement.status,
      projectedStatus,
      settlementTick,
      transfers: transferReports
    });
  }

  return reports;
}

function simulateOneTick(snapshot) {
  const snap = clone(snapshot);
  const catalogMap = new Map((snap.catalog ?? []).map((resource) => [resource.id, resource]));
  const structuresByDomain = domainStructureMap(snap);
  const projectReports = [];
  const projectsByDomain = new Map();
  const alerts = [];

  for (const project of snap.projects ?? []) {
    const report = buildProjectReport(project, 1);
    projectReports.push(report);
    if (!projectsByDomain.has(project.domainUuid)) projectsByDomain.set(project.domainUuid, []);
    projectsByDomain.get(project.domainUuid).push({ project, report });
  }

  const domainReports = [];
  for (const domain of snap.domains ?? []) {
    const initialStocks = new Map((domain.stocks ?? []).map((stock) => [stock.resourceId, Number(stock.amount ?? 0)]));
    const stocks = new Map(initialStocks);
    const flowDeltas = new Map();
    const flowReports = [];
    const persistedFlowIds = new Set((domain.flows ?? []).map((flow) => flow.localId));
    const upkeepInfo = calculateDomainUpkeep({ domainData: domain, catalog: snap.catalog });

    // 1) Fluxos persistentes + sustento.
    for (const flow of [...(domain.flows ?? []), ...upkeepInfo.syntheticFlows]) {
      if (!flow.active) continue;
      const { deltaAmount, nextCarry } = calculateExactFlowAdvance({
        ratePerPeriod: Number(flow.amount ?? 0),
        periodTicks: Math.max(1, Number(flow.periodTicks ?? 1)),
        deltaTicks: 1,
        initialCarry: Number(flow.carry ?? 0)
      });
      const delta = (flow.direction ?? "inflow") === "outflow" ? -deltaAmount : deltaAmount;
      stocks.set(flow.resourceId, (stocks.get(flow.resourceId) ?? 0) + delta);
      flowDeltas.set(flow.resourceId, (flowDeltas.get(flow.resourceId) ?? 0) + delta);
      if (persistedFlowIds.has(flow.localId)) {
        flowReports.push({
          localId: flow.localId,
          resourceId: flow.resourceId,
          initialCarry: Number(flow.carry ?? 0),
          projectedCarry: nextCarry,
          delta
        });
      }
    }

    // 2) Acordos ativos.
    for (const agreement of domain.agreements ?? []) {
      if (agreement.status !== "active") continue;
      for (const transfer of agreement.transfers ?? []) {
        const amount = Math.max(0, Number(transfer.amountPerTick ?? 0));
        if (!amount) continue;
        const delta = transfer.direction === "receive" ? amount : -amount;
        stocks.set(transfer.resourceId, (stocks.get(transfer.resourceId) ?? 0) + delta);
        flowDeltas.set(transfer.resourceId, (flowDeltas.get(transfer.resourceId) ?? 0) + delta);
      }
    }

    // 3) Alocação de manutenção por prioridade. Produção só ocorre depois que
    // todas as alocações foram decididas, evitando circularidade no mesmo tick.
    const relatedMap = new Map([
      ...(structuresByDomain.get(domain.uuid)?.entries?.() ?? []),
      ...(structuresByDomain.get(domain.entityId)?.entries?.() ?? [])
    ]);
    const related = [...relatedMap.values()].sort((a, b) =>
      Number(b.maintenancePriority ?? 50) - Number(a.maintenancePriority ?? 50)
      || String(a.entityId ?? a.uuid).localeCompare(String(b.entityId ?? b.uuid))
    );
    const structureReports = [];

    for (const structure of related) {
      const active = ["operational", "damaged"].includes(structure.status);
      const efficiency = structureConditionEfficiency(structure);
      const workforce = workforceCoverage(domain, structure);
      const resourceServiceRatioBps = active ? maintenanceServiceBps(structure, stocks, catalogMap) : 0;
      const serviceRatioBps = active ? Math.min(resourceServiceRatioBps, workforce.ratioBps) : 0;
      const maintenance = [];
      let projectedCondition = Number(structure.condition ?? 100);
      let projectedStatus = structure.status;

      if (active) {
        for (const entry of structure.maintenance ?? []) {
          const required = Math.max(0, Number(entry.amount ?? 0));
          if (!required) continue;
          const served = Math.floor((required * serviceRatioBps) / 10_000);
          stocks.set(entry.resourceId, (stocks.get(entry.resourceId) ?? 0) - served);
          flowDeltas.set(entry.resourceId, (flowDeltas.get(entry.resourceId) ?? 0) - served);
          maintenance.push({
            resourceId: entry.resourceId,
            perTick: required,
            required,
            served,
            missing: Math.max(0, required - served),
            delta: served
          });
        }

        if (serviceRatioBps < 10_000) {
          const loss = Math.max(1, Math.ceil((10_000 - serviceRatioBps) / 2_000));
          projectedCondition = Math.max(0, projectedCondition - loss);
          projectedStatus = projectedCondition <= 0 ? "disabled" : "damaged";
          alerts.push({
            type: "structureMaintenanceRisk",
            domainUuid: domain.uuid,
            domainName: domain.name,
            structureUuid: structure.uuid,
            structureEntityId: structure.entityId,
            structureName: structure.name,
            serviceRatioBps,
            resourceServiceRatioBps,
            workforceRatioBps: workforce.ratioBps,
            workforceRequired: workforce.required,
            workforceAssigned: workforce.assigned,
            conditionLoss: loss,
            message: `Serviço de '${structure.name}' foi atendido em ${Math.floor(serviceRatioBps / 100)}% (recursos ${Math.floor(resourceServiceRatioBps / 100)}%, workforce ${Math.floor(workforce.ratioBps / 100)}%); condição -${loss}.`
          });
        }
      }

      structureReports.push({
        uuid: structure.uuid,
        entityId: structure.entityId,
        name: structure.name,
        status: structure.status,
        projectedStatus,
        condition: Number(structure.condition ?? 100),
        projectedCondition,
        maintenancePriority: Number(structure.maintenancePriority ?? 50),
        workforceRequired: workforce.required,
        workforceAssigned: workforce.assigned,
        workforceRatioBps: workforce.ratioBps,
        resourceServiceRatioBps,
        efficiency,
        active,
        serviceRatioBps,
        maintenance,
        production: []
      });
    }

    // Produção após a alocação de manutenção.
    for (const report of structureReports) {
      if (!report.active) continue;
      const source = related.find((entry) => (entry.entityId ?? entry.uuid) === (report.entityId ?? report.uuid));
      for (const entry of source?.production ?? []) {
        const nominal = Math.max(0, Number(entry.amount ?? 0));
        const produced = Math.floor((nominal * report.efficiency * report.serviceRatioBps) / 1_000_000);
        if (produced > 0) {
          stocks.set(entry.resourceId, (stocks.get(entry.resourceId) ?? 0) + produced);
          flowDeltas.set(entry.resourceId, (flowDeltas.get(entry.resourceId) ?? 0) + produced);
        }
        report.production.push({
          resourceId: entry.resourceId,
          nominalPerTick: nominal,
          perTick: produced,
          delta: produced
        });
      }
    }

    // 4) Settlement de Projects depois da economia operacional do tick.
    const relatedProjects = projectsByDomain.get(domain.uuid) ?? [];
    const paidProjectCosts = new Map();
    for (const { project, report } of relatedProjects) {
      const settlement = findAffordableProjectProjection(project, 1, stocks, catalogMap);
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
        report.projectedBlockedReason = report.projectedStatus === "blocked" ? (project.blockedReason ?? null) : null;
      }
      for (const [resourceId, due] of aggregateDue(report.costs)) {
        stocks.set(resourceId, (stocks.get(resourceId) ?? 0) - due);
        paidProjectCosts.set(resourceId, (paidProjectCosts.get(resourceId) ?? 0) + due);
      }
    }

    const reservedMap = new Map();
    for (const { report } of relatedProjects) {
      for (const cost of report.costs ?? []) {
        if (cost.projectedReserved <= 0) continue;
        reservedMap.set(cost.resourceId, (reservedMap.get(cost.resourceId) ?? 0) + cost.projectedReserved);
      }
    }

    // 5) Capacidade de armazenamento e thresholds estratégicos.
    const policies = policyMapForDomain(domain);
    const overflowMap = new Map();
    for (const [resourceId, policy] of policies.entries()) {
      const capacity = Math.max(0, Number(policy.storageCapacity ?? 0));
      if (!capacity) continue;
      const current = Number(stocks.get(resourceId) ?? 0);
      if (current <= capacity) continue;
      const overflow = current - capacity;
      stocks.set(resourceId, capacity);
      overflowMap.set(resourceId, overflow);
      alerts.push({
        type: "storageOverflow",
        domainUuid: domain.uuid,
        domainName: domain.name,
        resourceId,
        overflow,
        message: `Capacidade de armazenamento de '${catalogMap.get(resourceId)?.name ?? resourceId}' excedida; ${overflow} unidade(s) foram perdidas.`
      });
    }

    const allResourceIds = new Set([
      ...initialStocks.keys(), ...stocks.keys(), ...flowDeltas.keys(), ...reservedMap.keys(), ...paidProjectCosts.keys(), ...policies.keys()
    ]);
    const resources = [];
    let civilCrisis = false;
    for (const resourceId of allResourceIds) {
      const definition = catalogMap.get(resourceId) ?? { id: resourceId, name: resourceId, precision: 0, allowNegative: false };
      const initialStock = initialStocks.get(resourceId) ?? 0;
      const projectedStock = stocks.get(resourceId) ?? 0;
      const projectedReserved = reservedMap.get(resourceId) ?? 0;
      const projectedAvailable = projectedStock - projectedReserved;
      const dueNow = paidProjectCosts.get(resourceId) ?? 0;
      const shortfall = !definition.allowNegative && projectedStock < 0;
      const overReserved = !definition.allowNegative && projectedReserved > Math.max(0, projectedStock);
      const policy = policies.get(resourceId) ?? { criticalFloor: 0, reserveTarget: 0, storageCapacity: 0 };
      const effectiveAvailable = definition.allowNegative ? projectedAvailable : Math.max(0, projectedAvailable);
      const critical = Number(policy.criticalFloor ?? 0) > 0 && effectiveAvailable <= Number(policy.criticalFloor ?? 0);
      const belowReserve = Number(policy.reserveTarget ?? 0) > 0 && effectiveAvailable < Number(policy.reserveTarget ?? 0);
      const overflow = overflowMap.get(resourceId) ?? 0;

      if (shortfall) {
        let sustenance = false;
        if (resourceId === upkeepInfo.foodResId && upkeepInfo.rawFoodUnits > 0) {
          sustenance = true;
          civilCrisis = true;
          alerts.push({ type: "famine", domainUuid: domain.uuid, domainName: domain.name, resourceId, resourceName: definition.name, message: `Crise de Alimentos: '${domain.name}' não cobre o consumo do tick.` });
        }
        if (resourceId === upkeepInfo.waterResId && upkeepInfo.rawWaterUnits > 0) {
          sustenance = true;
          civilCrisis = true;
          alerts.push({ type: "drought", domainUuid: domain.uuid, domainName: domain.name, resourceId, resourceName: definition.name, message: `Crise Hídrica: '${domain.name}' não cobre o consumo do tick.` });
        }
        if (!sustenance) alerts.push({ type: "shortfall", domainUuid: domain.uuid, domainName: domain.name, resourceId, resourceName: definition.name, message: `Estoque de '${definition.name}' entrou em déficit.` });
      }
      if (overReserved && !shortfall) {
        alerts.push({ type: "overReserved", domainUuid: domain.uuid, domainName: domain.name, resourceId, resourceName: definition.name, message: `Reservas de '${definition.name}' excedem o estoque projetado.` });
      }
      if (critical && !shortfall) {
        alerts.push({ type: "criticalFloor", domainUuid: domain.uuid, domainName: domain.name, resourceId, resourceName: definition.name, message: `'${definition.name}' atingiu o piso crítico (${policy.criticalFloor}).` });
      } else if (belowReserve && !shortfall) {
        alerts.push({ type: "reserveTarget", domainUuid: domain.uuid, domainName: domain.name, resourceId, resourceName: definition.name, message: `'${definition.name}' está abaixo da reserva-alvo (${policy.reserveTarget}).` });
      }

      resources.push({
        resourceId,
        resourceName: definition.name,
        unit: definition.unit,
        precision: definition.precision,
        allowNegative: definition.allowNegative,
        initialStock,
        projectedStock,
        netDelta: projectedStock - initialStock,
        flowDelta: flowDeltas.get(resourceId) ?? 0,
        projectCostDelta: -dueNow,
        projectedReserved,
        projectedAvailable,
        dueNow,
        shortfall,
        overReserved,
        policy: {
          criticalFloor: Number(policy.criticalFloor ?? 0),
          reserveTarget: Number(policy.reserveTarget ?? 0),
          storageCapacity: Number(policy.storageCapacity ?? 0)
        },
        critical,
        belowReserve,
        storageOverflow: overflow
      });
    }

    const populationBefore = domain.population ?? { morale: 60, groups: [] };
    const moraleLoss = civilCrisis ? 5 : 0;
    const populationReport = {
      initialMorale: Math.max(0, Math.min(100, Number(populationBefore.morale ?? 60))),
      projectedMorale: Math.max(0, Math.min(100, Number(populationBefore.morale ?? 60) - moraleLoss)),
      civilCrisis,
      moraleLoss,
      groups: (populationBefore.groups ?? []).map((group) => ({
        localId: group.localId,
        status: group.status ?? "active",
        initialMorale: Math.max(0, Math.min(100, Number(group.morale ?? 60))),
        projectedMorale: group.status === "active"
          ? Math.max(0, Math.min(100, Number(group.morale ?? 60) - moraleLoss))
          : Math.max(0, Math.min(100, Number(group.morale ?? 60)))
      }))
    };

    domainReports.push({
      uuid: domain.uuid,
      entityId: domain.entityId ?? null,
      name: domain.name,
      resources,
      flows: flowReports,
      structures: structureReports,
      population: populationReport
    });
  }

  // 6) Agreements independentes são liquidados ao final do tick. Eles movem
  // estoque entre Domains de forma conservativa e só afetam o serviço interno
  // do tick seguinte.
  const agreementReports = settleStandaloneAgreements({
    snapshot: snap,
    domainReports,
    catalogMap,
    alerts
  });

  const blockedProjectIds = new Set(projectReports.filter((project) => project.wouldBlock).map((project) => project.uuid));
  const milestones = findMilestones({ snapshot: snap, deltaTicks: 1 })
    .filter((milestone) => !milestone.projectUuid || !blockedProjectIds.has(milestone.projectUuid));

  return {
    deltaTicks: 1,
    timestamp: Date.now(),
    currentTick: Math.max(0, Number(snap.currentTick ?? 0)) + 1,
    domains: domainReports,
    projects: projectReports,
    agreements: agreementReports,
    milestones,
    alerts
  };
}

function applyStepToWorkingSnapshot(snapshot, report) {
  const next = clone(snapshot);
  const domainReportMap = new Map((report.domains ?? []).map((entry) => [entry.uuid, entry]));

  next.domains = (next.domains ?? []).map((domain) => {
    const projection = domainReportMap.get(domain.uuid);
    if (!projection) return domain;
    domain.stocks = projection.resources.map((resource) => ({
      resourceId: resource.resourceId,
      amount: resource.allowNegative ? resource.projectedStock : Math.max(0, resource.projectedStock)
    }));
    const flowMap = new Map((projection.flows ?? []).map((flow) => [flow.localId, flow]));
    domain.flows = (domain.flows ?? []).map((flow) => ({ ...flow, carry: flowMap.get(flow.localId)?.projectedCarry ?? flow.carry }));

    if (projection.population) {
      domain.population ??= { total: 0, countMode: "direct", morale: 60, groups: [], workforce: { allocations: [] } };
      domain.population.morale = projection.population.projectedMorale;
      const groupMorale = new Map((projection.population.groups ?? []).map((group) => [group.localId, group.projectedMorale]));
      domain.population.groups = (domain.population.groups ?? []).map((group) => ({
        ...group,
        morale: groupMorale.has(group.localId) ? groupMorale.get(group.localId) : group.morale
      }));
    }

    const shortfallIds = new Set(projection.resources.filter((resource) => resource.shortfall).map((resource) => resource.resourceId));
    domain.agreements = (domain.agreements ?? []).map((agreement) => {
      if (agreement.status !== "active") return agreement;
      const breached = (agreement.transfers ?? []).some((transfer) => transfer.direction === "send" && shortfallIds.has(transfer.resourceId));
      if (breached) return { ...agreement, status: "breached" };
      if (typeof agreement.remainingTicks === "number" && agreement.remainingTicks > 0) {
        const remainingTicks = Math.max(0, agreement.remainingTicks - 1);
        return { ...agreement, remainingTicks, status: remainingTicks === 0 ? "terminated" : agreement.status };
      }
      return agreement;
    });
    return domain;
  });

  const agreementMap = new Map((report.agreements ?? []).map((entry) => [entry.entityId ?? entry.uuid, entry]));
  next.agreements = (next.agreements ?? []).map((agreement) => {
    const projection = agreementMap.get(agreement.entityId ?? agreement.uuid);
    if (!projection) return agreement;
    const transferMap = new Map((projection.transfers ?? []).map((entry) => [entry.localId, entry]));
    return {
      ...agreement,
      status: projection.projectedStatus,
      transfers: (agreement.transfers ?? []).map((transfer) => ({
        ...transfer,
        carry: transferMap.get(transfer.localId)?.projectedCarry ?? transfer.carry
      }))
    };
  });
  next.currentTick = Math.max(0, Number(report.currentTick ?? next.currentTick ?? 0));

  const projectMap = new Map((report.projects ?? []).map((entry) => [entry.uuid, entry]));
  next.projects = (next.projects ?? []).map((project) => {
    const projection = projectMap.get(project.uuid);
    if (!projection) return project;
    const costMap = new Map((projection.costs ?? []).map((cost) => [cost.localId, cost]));
    return {
      ...project,
      status: projection.projectedStatus,
      blockedReason: projection.projectedBlockedReason ?? "",
      work: { ...project.work, completed: projection.projectedCompleted, carry: projection.projectedCarry },
      costs: (project.costs ?? []).map((cost) => ({ ...cost, consumedAmount: costMap.get(cost.localId)?.projectedConsumed ?? cost.consumedAmount }))
    };
  });

  const structureProjectionMap = new Map();
  for (const domain of report.domains ?? []) {
    for (const structure of domain.structures ?? []) structureProjectionMap.set(structure.entityId ?? structure.uuid, structure);
  }
  next.structures = (next.structures ?? []).map((structure) => {
    const projection = structureProjectionMap.get(structure.entityId ?? structure.uuid);
    if (!projection) return structure;
    return { ...structure, status: projection.projectedStatus, condition: projection.projectedCondition };
  });

  const completedKeys = new Set();
  for (const project of report.projects ?? []) {
    if (!project.wouldComplete) continue;
    if (project.uuid) completedKeys.add(project.uuid);
    if (project.entityId) completedKeys.add(project.entityId);
  }
  next.structures = next.structures.map((structure) => {
    if (structure.status !== "planned" || !structure.activeProject) return structure;
    if (!completedKeys.has(structure.activeProject.uuid) && !completedKeys.has(structure.activeProject.entityId)) return structure;
    return { ...structure, status: "operational", activeProject: null };
  });

  return next;
}

function sumField(reports, selector) {
  return reports.reduce((total, report) => total + Number(selector(report) ?? 0), 0);
}

function aggregateAlerts(stepReports) {
  const map = new Map();
  stepReports.forEach((report, index) => {
    const tick = index + 1;
    for (const alert of report.alerts ?? []) {
      const key = [alert.type, alert.domainUuid, alert.projectUuid, alert.structureEntityId, alert.agreementEntityId ?? alert.agreementUuid, alert.resourceId].join("|");
      const existing = map.get(key);
      if (existing) {
        existing.occurrences += 1;
        existing.lastTick = tick;
        if (!existing.occurrenceTicks.includes(tick)) existing.occurrenceTicks.push(tick);
      } else {
        map.set(key, {
          ...alert,
          occurrences: 1,
          firstTick: tick,
          lastTick: tick,
          occurrenceTicks: [tick]
        });
      }
    }
  });
  return [...map.values()];
}

function aggregateReports({ original, finalSnapshot, stepReports, ticks }) {
  const first = stepReports[0];
  const last = stepReports.at(-1);
  const domains = [];

  for (const originalDomain of original.domains ?? []) {
    const firstDomain = first.domains.find((entry) => entry.uuid === originalDomain.uuid);
    const lastDomain = last.domains.find((entry) => entry.uuid === originalDomain.uuid);
    if (!lastDomain) continue;
    const resourceIds = new Set(stepReports.flatMap((step) =>
      (step.domains.find((entry) => entry.uuid === originalDomain.uuid)?.resources ?? []).map((resource) => resource.resourceId)
    ));
    const resources = [...resourceIds].map((resourceId) => {
      const perStep = stepReports.map((step) => step.domains.find((entry) => entry.uuid === originalDomain.uuid)?.resources.find((resource) => resource.resourceId === resourceId)).filter(Boolean);
      const initial = firstDomain?.resources.find((resource) => resource.resourceId === resourceId)?.initialStock
        ?? originalDomain.stocks?.find((stock) => stock.resourceId === resourceId)?.amount ?? 0;
      const final = perStep.at(-1);
      return {
        ...final,
        initialStock: initial,
        netDelta: final.projectedStock - initial,
        flowDelta: sumField(perStep, (entry) => entry.flowDelta),
        projectCostDelta: sumField(perStep, (entry) => entry.projectCostDelta),
        dueNow: sumField(perStep, (entry) => entry.dueNow),
        shortfall: perStep.some((entry) => entry.shortfall),
        overReserved: perStep.some((entry) => entry.overReserved),
        critical: perStep.some((entry) => entry.critical),
        belowReserve: perStep.some((entry) => entry.belowReserve),
        storageOverflow: sumField(perStep, (entry) => entry.storageOverflow)
      };
    });

    const flowIds = new Set(stepReports.flatMap((step) =>
      (step.domains.find((entry) => entry.uuid === originalDomain.uuid)?.flows ?? []).map((flow) => flow.localId)
    ));
    const flows = [...flowIds].map((localId) => {
      const perStep = stepReports.map((step) => step.domains.find((entry) => entry.uuid === originalDomain.uuid)?.flows.find((flow) => flow.localId === localId)).filter(Boolean);
      return { ...perStep.at(-1), initialCarry: perStep[0].initialCarry, delta: sumField(perStep, (entry) => entry.delta) };
    });

    const originalStructures = (original.structures ?? []).filter((structure) =>
      structure.domain?.uuid === originalDomain.uuid || structure.domain?.entityId === originalDomain.entityId
    );
    const finalStructures = (finalSnapshot.structures ?? []).filter((structure) =>
      structure.domain?.uuid === originalDomain.uuid || structure.domain?.entityId === originalDomain.entityId
    );
    const structures = finalStructures.map((finalStructure) => {
      const key = finalStructure.entityId ?? finalStructure.uuid;
      const initialStructure = originalStructures.find((entry) => (entry.entityId ?? entry.uuid) === key) ?? finalStructure;
      const perStep = stepReports.map((step) => step.domains.find((entry) => entry.uuid === originalDomain.uuid)?.structures.find((entry) => (entry.entityId ?? entry.uuid) === key)).filter(Boolean);
      const lastStructure = perStep.at(-1) ?? {};
      const resourceIds = new Set(perStep.flatMap((entry) => (entry.maintenance ?? []).map((item) => item.resourceId)));
      const maintenance = [...resourceIds].map((resourceId) => {
        const values = perStep.flatMap((entry) => (entry.maintenance ?? []).filter((item) => item.resourceId === resourceId));
        const required = sumField(values, (item) => item.required ?? item.perTick);
        const served = sumField(values, (item) => item.served ?? item.delta);
        return { resourceId, perTick: values.at(-1)?.perTick ?? 0, required, served, missing: Math.max(0, required - served), delta: served };
      });
      const productionIds = new Set(perStep.flatMap((entry) => (entry.production ?? []).map((item) => item.resourceId)));
      const production = [...productionIds].map((resourceId) => {
        const values = perStep.flatMap((entry) => (entry.production ?? []).filter((item) => item.resourceId === resourceId));
        const delta = sumField(values, (item) => item.delta);
        return { resourceId, nominalPerTick: values.at(-1)?.nominalPerTick ?? 0, perTick: values.at(-1)?.perTick ?? 0, delta };
      });
      return {
        ...lastStructure,
        uuid: finalStructure.uuid,
        entityId: finalStructure.entityId,
        name: finalStructure.name,
        status: initialStructure.status,
        projectedStatus: finalStructure.status,
        condition: Number(initialStructure.condition ?? 100),
        projectedCondition: Number(finalStructure.condition ?? 100),
        active: ["operational", "damaged"].includes(initialStructure.status),
        commissioned: initialStructure.status === "planned" && finalStructure.status !== "planned" && !finalStructure.activeProject,
        projectedActiveProject: clone(finalStructure.activeProject ?? null),
        serviceShortfallTicks: perStep.filter((entry) => entry.active && entry.serviceRatioBps < 10_000).length,
        maintenance,
        production
      };
    });

    const finalDomain = finalSnapshot.domains.find((entry) => entry.uuid === originalDomain.uuid) ?? originalDomain;
    domains.push({
      ...lastDomain,
      resources,
      flows,
      structures,
      agreements: clone(finalDomain.agreements ?? [])
    });
  }

  const projects = (original.projects ?? []).map((initialProject) => {
    const perStep = stepReports.map((step) => step.projects.find((entry) => entry.uuid === initialProject.uuid)).filter(Boolean);
    const finalProject = finalSnapshot.projects.find((entry) => entry.uuid === initialProject.uuid) ?? initialProject;
    const lastProject = perStep.at(-1) ?? buildProjectReport(initialProject, 0);
    const costIds = new Set((initialProject.costs ?? []).map((cost) => cost.localId));
    const costs = [...costIds].map((localId) => {
      const values = perStep.map((entry) => entry.costs.find((cost) => cost.localId === localId)).filter(Boolean);
      const initialCost = initialProject.costs.find((cost) => cost.localId === localId);
      const finalCost = finalProject.costs.find((cost) => cost.localId === localId) ?? initialCost;
      return {
        ...values.at(-1),
        localId,
        initialConsumed: Number(initialCost?.consumedAmount ?? 0),
        projectedConsumed: Number(finalCost?.consumedAmount ?? 0),
        dueNow: sumField(values, (entry) => entry.dueNow),
        remaining: Math.max(0, Number(initialCost?.amount ?? 0) - Number(finalCost?.consumedAmount ?? 0))
      };
    });
    return {
      ...lastProject,
      initialStatus: initialProject.status,
      initialBlockedReason: initialProject.blockedReason ?? null,
      projectedStatus: finalProject.status,
      projectedBlockedReason: finalProject.blockedReason ?? null,
      initialCompleted: Number(initialProject.work?.completed ?? 0),
      projectedCompleted: Number(finalProject.work?.completed ?? 0),
      initialCarry: Number(initialProject.work?.carry ?? 0),
      projectedCarry: Number(finalProject.work?.carry ?? 0),
      progressPercent: Math.min(100, Math.floor((Number(finalProject.work?.completed ?? 0) * 100) / Math.max(1, Number(finalProject.work?.required ?? 100)))),
      wouldComplete: perStep.some((entry) => entry.wouldComplete),
      wouldBlock: perStep.some((entry) => entry.wouldBlock),
      blockReason: [...perStep].reverse().find((entry) => entry.blockReason)?.blockReason ?? null,
      costs
    };
  });

  const agreements = (original.agreements ?? []).map((initialAgreement) => {
    const key = initialAgreement.entityId ?? initialAgreement.uuid;
    const perStep = stepReports
      .map((step) => (step.agreements ?? []).find((entry) => (entry.entityId ?? entry.uuid) === key))
      .filter(Boolean);
    const finalAgreement = (finalSnapshot.agreements ?? []).find((entry) => (entry.entityId ?? entry.uuid) === key) ?? initialAgreement;
    const transferIds = new Set((initialAgreement.transfers ?? []).map((transfer) => transfer.localId));
    const transfers = [...transferIds].map((localId) => {
      const initialTransfer = (initialAgreement.transfers ?? []).find((entry) => entry.localId === localId);
      const finalTransfer = (finalAgreement.transfers ?? []).find((entry) => entry.localId === localId) ?? initialTransfer;
      const values = perStep.map((entry) => (entry.transfers ?? []).find((transfer) => transfer.localId === localId)).filter(Boolean);
      return {
        localId,
        resourceId: initialTransfer?.resourceId ?? finalTransfer?.resourceId,
        fromDomain: clone(initialTransfer?.fromDomain ?? finalTransfer?.fromDomain ?? null),
        toDomain: clone(initialTransfer?.toDomain ?? finalTransfer?.toDomain ?? null),
        amount: Number(initialTransfer?.amount ?? finalTransfer?.amount ?? 0),
        periodTicks: Math.max(1, Number(initialTransfer?.periodTicks ?? finalTransfer?.periodTicks ?? 1)),
        initialCarry: Number(initialTransfer?.carry ?? 0),
        projectedCarry: Number(finalTransfer?.carry ?? 0),
        due: sumField(values, (entry) => entry.due),
        transferred: sumField(values, (entry) => entry.transferred),
        shortfall: sumField(values, (entry) => entry.shortfall),
        overflow: sumField(values, (entry) => entry.overflow)
      };
    });
    return {
      entityId: initialAgreement.entityId ?? null,
      uuid: initialAgreement.uuid,
      name: initialAgreement.name,
      type: initialAgreement.type,
      startTick: initialAgreement.startTick ?? null,
      endTick: initialAgreement.endTick ?? null,
      initialStatus: initialAgreement.status,
      projectedStatus: finalAgreement.status,
      wouldBreach: perStep.some((entry) => entry.projectedStatus === "breached"),
      expiredDuringAdvance: initialAgreement.status !== "expired" && finalAgreement.status === "expired",
      transfers
    };
  });

  const milestoneMap = new Map();
  stepReports.forEach((step, index) => {
    for (const milestone of step.milestones ?? []) {
      const adjusted = { ...milestone, tick: index + 1 };
      milestoneMap.set(`${milestone.kind}|${milestone.projectUuid ?? ""}|${milestone.domainUuid ?? ""}`, adjusted);
    }
  });

  return {
    deltaTicks: ticks,
    timestamp: Date.now(),
    currentTick: Math.max(0, Number(finalSnapshot.currentTick ?? original.currentTick ?? 0)),
    domains,
    projects,
    agreements,
    milestones: [...milestoneMap.values()].sort((a, b) => a.tick - b.tick),
    alerts: aggregateAlerts(stepReports)
  };
}

/**
 * Executa preview determinístico do avanço temporal.
 */
export function simulateAdvance({ snapshot, deltaTicks = 1 }) {
  const ticks = Math.max(1, Math.floor(Number(deltaTicks) || 1));
  const original = clone(snapshot);
  let working = clone(snapshot);
  const stepReports = [];
  for (let tick = 0; tick < ticks; tick++) {
    const step = simulateOneTick(working);
    stepReports.push(step);
    working = applyStepToWorkingSnapshot(working, step);
  }
  return aggregateReports({ original, finalSnapshot: working, stepReports, ticks });
}
