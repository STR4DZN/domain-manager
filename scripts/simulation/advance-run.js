/**
 * Bloco 8 — Advance Run: Motor de Execução Temporal com Commit Real no Mundo.
 * Aplica as mutações determinísticas calculadas pelo kernel de simulação.
 */

import { MODULE_ID, RECORD_TYPES } from "../core/constants.js";
import { recordIndex } from "../data/record-index.js";
import { decodeRecord } from "../models/record-codec.js";
import { updateRecordsBatch } from "../data/journal-store.js";
import { getResourceCatalogSetting, getSecondsPerTickSetting } from "../core/settings.js";
import { buildSimulationSnapshot } from "./snapshot.js";
import { simulateAdvance } from "./simulate.js";

import { syncWorldTimeAdvance } from "../integration/timekeeping.js";
import { transactionQueue } from "../authority/transaction-queue.js";
import { assertPrimaryActiveGM } from "../authority/primary-gm.js";

/**
 * Executa o avanço temporal real e persiste as mudanças nos JournalEntries.
 * @param {Object} options
 * @param {number} options.deltaTicks - Quantidade de ticks a avançar (inteiro positivo >= 1)
 * @returns {Promise<Object>} Resultado do avanço { success, report, updatedDomains, updatedProjects, timekeeping }
 */
export async function executeAdvanceRun({ deltaTicks = 1, fromWorldTimeHook = false } = {}) {
  assertPrimaryActiveGM();

  return transactionQueue.enqueue(
    "simulation:world",
    () => performAdvanceRun({ deltaTicks, fromWorldTimeHook }),
    { callerUserId: game.user.id }
  );
}

async function performAdvanceRun({ deltaTicks = 1, fromWorldTimeHook = false } = {}) {

  const ticks = Math.max(1, Math.floor(Number(deltaTicks) || 1));

  // 1. Obter snapshot atual e simular
  const domainDocs = recordIndex.list(RECORD_TYPES.DOMAIN);
  const projectDocs = recordIndex.list(RECORD_TYPES.PROJECT);
  const structureDocs = recordIndex.list(RECORD_TYPES.STRUCTURE);
  const agreementDocs = recordIndex.list(RECORD_TYPES.AGREEMENT);
  const domains = domainDocs.map(decodeRecord);
  const projects = projectDocs.map(decodeRecord);
  const structures = structureDocs.map(decodeRecord);
  const agreements = agreementDocs.map(decodeRecord);
  const catalog = getResourceCatalogSetting();
  const secondsPerTick = getSecondsPerTickSetting();
  const observedWorldTick = Math.max(0, Math.floor(Number(globalThis.game?.time?.worldTime ?? 0) / secondsPerTick));
  // Quando o avanço veio do hook, o WorldTime já está no instante final; o
  // snapshot precisa começar antes dos ticks que estamos prestes a aplicar.
  const currentTick = fromWorldTimeHook
    ? Math.max(0, observedWorldTick - ticks)
    : observedWorldTick;

  const snapshot = buildSimulationSnapshot({ domains, projects, structures, agreements, catalog, currentTick });
  const report = simulateAdvance({ snapshot, deltaTicks: ticks });

  const updatedDomains = [];
  const updatedProjects = [];
  const updatedStructures = [];
  const updatedAgreements = [];
  const batchUpdates = [];
  const rollbackUpdates = [];

  const completedProjectKeys = new Set();
  for (const projectReport of report.projects ?? []) {
    if (!projectReport.wouldComplete) continue;
    if (projectReport.uuid) completedProjectKeys.add(projectReport.uuid);
    if (projectReport.entityId) completedProjectKeys.add(projectReport.entityId);
  }
  const commissioningStructures = structures.filter((structure) => {
    if (structure.data.status !== "planned" || !structure.data.activeProject) return false;
    return completedProjectKeys.has(structure.data.activeProject.uuid)
      || completedProjectKeys.has(structure.data.activeProject.entityId);
  });
  const commissioningByDomain = new Map();
  for (const structure of commissioningStructures) {
    for (const key of [structure.data.domain?.uuid, structure.data.domain?.entityId]) {
      if (!key) continue;
      let list = commissioningByDomain.get(key);
      if (!list) { list = []; commissioningByDomain.set(key, list); }
      if (!list.some((entry) => entry.uuid === structure.uuid)) list.push(structure);
    }
  }

  // 2. Preparar mutações nos Domínios (Estoques e decaimento de Condições)
  for (const domReport of report.domains) {
    const doc = recordIndex.get(RECORD_TYPES.DOMAIN, domReport.uuid);
    if (!doc) continue;

    const decoded = decodeRecord(doc);
    const domainDataBefore = foundry.utils.deepClone(decoded.data);
    const domainData = foundry.utils.deepClone(decoded.data);

    if (!domainData.economy) domainData.economy = { stocks: [], flows: [] };

    // Atualizar estoques com os valores projetados (clampando em 0 caso allowNegative seja false)
    const newStocks = domReport.resources.map((r) => {
      const finalAmount = (!r.allowNegative && r.projectedStock < 0) ? 0 : r.projectedStock;
      return {
        resourceId: r.resourceId,
        amount: finalAmount
      };
    });
    domainData.economy.stocks = newStocks;

    // Persistir o carry dos fluxos reais do Domain. Fluxos sintéticos de upkeep
    // não aparecem em domReport.flows e, portanto, nunca poluem o documento.
    if (Array.isArray(domainData.economy.flows) && Array.isArray(domReport.flows)) {
      const flowReportMap = new Map(domReport.flows.map((flow) => [flow.localId, flow]));
      domainData.economy.flows = domainData.economy.flows.map((flow) => {
        const flowReport = flowReportMap.get(flow.localId);
        return flowReport
          ? { ...flow, carry: flowReport.projectedCarry }
          : flow;
      });
    }

    // Impacto civil projetado pelo kernel. assignment/quality permanecem campos
    // semânticos de organização e nunca mais são usados como acumuladores de crise.
    if (domReport.population && domainData.population) {
      domainData.population.morale = Number(domReport.population.projectedMorale ?? domainData.population.morale ?? 60);
      const moraleByGroup = new Map((domReport.population.groups ?? []).map((group) => [group.localId, group.projectedMorale]));
      domainData.population.groups = (domainData.population.groups ?? []).map((group) => ({
        ...group,
        morale: moraleByGroup.has(group.localId) ? moraleByGroup.get(group.localId) : group.morale
      }));
    }

    const shortageAlerts = (report.alerts ?? []).filter((alert) =>
      alert.domainUuid === domReport.uuid && ["famine", "drought"].includes(alert.type)
    );
    // Comida e água podem falhar no mesmo tick. Consequências civis são aplicadas
    // uma vez por tick afetado, não uma vez por recurso em falta.
    const shortageTicks = new Set();
    for (const alert of shortageAlerts) {
      const ticksForAlert = Array.isArray(alert.occurrenceTicks) && alert.occurrenceTicks.length
        ? alert.occurrenceTicks
        : [Number(alert.lastTick ?? alert.firstTick ?? 0)].filter((tick) => tick > 0);
      for (const tick of ticksForAlert) shortageTicks.add(Number(tick));
    }
    const shortageOccurrences = shortageTicks.size;
    const lastShortageTick = shortageTicks.size ? Math.max(...shortageTicks) : 0;
    const hasFoodShortfall = shortageAlerts.some((alert) => alert.type === "famine");
    const hasWaterShortfall = shortageAlerts.some((alert) => alert.type === "drought");

    let famineRefreshedThisRun = false;

    if (hasFoodShortfall || hasWaterShortfall) {
      if (!Array.isArray(domainData.conditions)) domainData.conditions = [];
      const remainingAfterLastShortage = Math.max(0, ticks - lastShortageTick);
      const projectedDuration = Math.max(0, 3 - remainingAfterLastShortage);
      const existingFamine = domainData.conditions.find((c) => c.localId === "cond_famine");
      if (existingFamine) {
        existingFamine.durationTicks = projectedDuration;
        existingFamine.active = projectedDuration > 0;
        existingFamine.severity = "severe";
      } else if (projectedDuration > 0) {
        domainData.conditions.push({
          localId: "cond_famine",
          name: "Escassez & Fome",
          severity: "severe",
          durationTicks: projectedDuration,
          active: true,
          description: `A base ${decoded.document.name} sofre com desabastecimento de provisões básicas. Agitação elevada e segurança comprometida.`
        });
      }
      famineRefreshedThisRun = true;

      if (!Array.isArray(domainData.history)) domainData.history = [];
      domainData.history.push({
        localId: `famine_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        title: "Crise de Desabastecimento",
        category: "crisis",
        summary: `A população de ${decoded.document.name} sofreu com falta de recursos vitais em ${shortageOccurrences} tick(s) deste ciclo.`,
        details: "Estoques de sustento insuficientes reduziram a moral civil e elevaram o risco operacional.",
        timestamp: Date.now()
      });
    }

    // Condições preexistentes decaem pelo intervalo inteiro; a condição de fome
    // refrescada já foi posicionada em relação ao último tick crítico.
    if (Array.isArray(domainData.conditions)) {
      domainData.conditions = domainData.conditions
        .map((cond) => {
          if (famineRefreshedThisRun && cond.localId === "cond_famine") return cond;
          if (typeof cond.durationTicks === "number" && cond.durationTicks > 0) {
            const remaining = Math.max(0, cond.durationTicks - ticks);
            return { ...cond, durationTicks: remaining, active: remaining > 0 };
          }
          return cond;
        })
        .filter((cond) => cond.active !== false || cond.durationTicks === null);
    }

    // Agreements são estado temporal calculado no kernel. Persistir a projeção
    // final em vez de recalcular duração/breach fora da simulação.
    if (Array.isArray(domReport.agreements)) {
      domainData.agreements = foundry.utils.deepClone(domReport.agreements);
    }

    // Registro Histórico Automático do Avanço (Bloco 12)
    if (!Array.isArray(domainData.history)) domainData.history = [];
    const completedProjectsInDom = (report.projects ?? []).filter(
      (p) => p.domainUuid === domReport.uuid && p.wouldComplete === true
    );
    const commissionedStructuresInDom = [
      ...(commissioningByDomain.get(domReport.uuid) ?? []),
      ...(commissioningByDomain.get(decoded.data.entityId) ?? [])
    ].filter((entry, index, array) => array.findIndex((candidate) => candidate.uuid === entry.uuid) === index);

    // 1. Registro do Avanço Temporal
    const summaryParts = [`Avanço de ${ticks} tick(s)`];
    if (completedProjectsInDom.length) {
      summaryParts.push(`${completedProjectsInDom.length} projeto(s) concluído(s)`);
    }
    if (commissionedStructuresInDom.length) {
      summaryParts.push(`${commissionedStructuresInDom.length} estrutura(s) comissionada(s)`);
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
        details: `O projeto atingiu a meta de trabalho necessária e seus custos finais foram liquidados.`,
        significance: "major",
        visibility: "all"
      });
    }

    for (const structure of commissionedStructuresInDom) {
      domainData.history.push({
        localId: `hist_structure_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        timestamp: Date.now(),
        tick: ticks,
        title: `Estrutura Comissionada: ${structure.document.name}`,
        category: "structure",
        summary: `${structure.document.name} entrou em operação após a conclusão do projeto vinculado.`,
        details: `O ativo físico foi transferido do estado planned para operational.`,
        significance: "major",
        visibility: "all"
      });
    }

    // 3. Registro de Escassez Crítica de Recursos
    for (const r of domReport.resources) {
      if (!r.allowNegative && r.shortfall) {
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

    // 4. Emissão de Notificações Automáticas para a Visão Geral
    if (!Array.isArray(domainData.notifications)) domainData.notifications = [];

    for (const p of completedProjectsInDom) {
      domainData.notifications.unshift({
        localId: `notif_proj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        title: `Obra Concluída: ${p.name || "Obra"}`,
        message: `A construção do projeto '${p.name || "Obra"}' foi finalizada com sucesso (100%)!`,
        category: "obra",
        severity: "success",
        targetTab: "projects",
        timestamp: Date.now(),
        dismissed: false,
        readByUserIds: []
      });
    }

    for (const structure of commissionedStructuresInDom) {
      domainData.notifications.unshift({
        localId: `notif_structure_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        title: `Estrutura Operacional: ${structure.document.name}`,
        message: `${structure.document.name} foi comissionada e agora participa da infraestrutura da base.`,
        category: "structure",
        severity: "success",
        targetTab: "structures",
        timestamp: Date.now(),
        dismissed: false,
        readByUserIds: []
      });
    }

    for (const r of domReport.resources) {
      if (!r.allowNegative && r.shortfall) {
        domainData.notifications.unshift({
          localId: `notif_shortfall_${Date.now().toString(36)}_${r.resourceId}`,
          title: `Escassez Crítica: ${r.resourceName || r.resourceId}!`,
          message: `O estoque de ${r.resourceName || r.resourceId} esgotou durante o ciclo e gerou déficit de abastecimento.`,
          category: "crise",
          severity: "critical",
          targetTab: "economy",
          timestamp: Date.now(),
          dismissed: false,
          readByUserIds: []
        });
      }
    }

    batchUpdates.push({
      uuid: domReport.uuid,
      recordType: RECORD_TYPES.DOMAIN,
      data: domainData
    });
    rollbackUpdates.push({
      uuid: domReport.uuid,
      recordType: RECORD_TYPES.DOMAIN,
      data: domainDataBefore
    });
    updatedDomains.push(domReport.uuid);
  }

  // 3. Aplicar mutações nos Projetos (Trabalho, Carry, Status e Custos)
  for (const projReport of report.projects) {
    const doc = recordIndex.get(RECORD_TYPES.PROJECT, projReport.uuid);
    if (!doc) continue;

    const decoded = decodeRecord(doc);
    const projDataBefore = foundry.utils.deepClone(decoded.data);
    const projData = foundry.utils.deepClone(decoded.data);

    projData.status = projReport.projectedStatus;
    projData.blockedReason = projReport.projectedBlockedReason ?? "";
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

    batchUpdates.push({
      uuid: projReport.uuid,
      recordType: RECORD_TYPES.PROJECT,
      data: projData
    });
    rollbackUpdates.push({
      uuid: projReport.uuid,
      recordType: RECORD_TYPES.PROJECT,
      data: projDataBefore
    });
    updatedProjects.push(projReport.uuid);
  }

  // 4. Persistir a projeção final de todas as Structures afetadas. Isso inclui
  // comissionamento e degradação causada por manutenção insuficiente.
  const projectedStructureMap = new Map();
  for (const domainReport of report.domains ?? []) {
    for (const projected of domainReport.structures ?? []) {
      projectedStructureMap.set(projected.entityId ?? projected.uuid, projected);
    }
  }
  for (const structure of structures) {
    const projected = projectedStructureMap.get(structure.data.entityId ?? structure.uuid);
    if (!projected) continue;
    const dataBefore = foundry.utils.deepClone(structure.data);
    const data = foundry.utils.deepClone(structure.data);
    data.status = projected.projectedStatus ?? data.status;
    data.condition = Number(projected.projectedCondition ?? data.condition ?? 100);
    if (projected.projectedActiveProject !== undefined) {
      data.activeProject = foundry.utils.deepClone(projected.projectedActiveProject);
    } else if (projected.commissioned) {
      data.activeProject = null;
    }
    const changed = data.status !== dataBefore.status
      || data.condition !== dataBefore.condition
      || JSON.stringify(data.activeProject ?? null) !== JSON.stringify(dataBefore.activeProject ?? null);
    if (!changed) continue;
    batchUpdates.push({ uuid: structure.uuid, recordType: RECORD_TYPES.STRUCTURE, data });
    rollbackUpdates.push({ uuid: structure.uuid, recordType: RECORD_TYPES.STRUCTURE, data: dataBefore });
    updatedStructures.push(structure.uuid);
  }

  // 5. Persistir Agreements independentes a partir da projeção do kernel.
  // Status temporal e carry pertencem ao mesmo batch econômico para impedir
  // que uma transferência seja aplicada sem atualizar o tratado (ou vice-versa).
  for (const agreementReport of report.agreements ?? []) {
    const doc = agreementReport.uuid
      ? recordIndex.get(RECORD_TYPES.AGREEMENT, agreementReport.uuid)
      : recordIndex.getByEntityId(agreementReport.entityId);
    if (!doc) continue;
    const decoded = decodeRecord(doc);
    const dataBefore = foundry.utils.deepClone(decoded.data);
    const data = foundry.utils.deepClone(decoded.data);
    data.status = agreementReport.projectedStatus ?? data.status;
    const transferMap = new Map((agreementReport.transfers ?? []).map((entry) => [entry.localId, entry]));
    data.transfers = (data.transfers ?? []).map((transfer) => ({
      ...transfer,
      carry: transferMap.get(transfer.localId)?.projectedCarry ?? transfer.carry
    }));
    const changed = data.status !== dataBefore.status
      || JSON.stringify(data.transfers ?? []) !== JSON.stringify(dataBefore.transfers ?? []);
    if (!changed) continue;
    batchUpdates.push({ uuid: doc.uuid, recordType: RECORD_TYPES.AGREEMENT, data });
    rollbackUpdates.push({ uuid: doc.uuid, recordType: RECORD_TYPES.AGREEMENT, data: dataBefore });
    updatedAgreements.push(doc.uuid);
  }

  // 6. Persistir Domains + Projects + Structures + Agreements em um único batch. Se o provider falhar
  // depois de aplicar apenas parte da operação, tentamos compensar o conjunto.
  try {
    await updateRecordsBatch(batchUpdates);
  } catch (error) {
    try {
      await updateRecordsBatch(rollbackUpdates);
    } catch (rollbackError) {
      console.error(`[${MODULE_ID}] Rollback do avanço temporal falhou:`, rollbackError);
    }
    throw error;
  }

  // 7. Sincronizar com Simple Timekeeping e Foundry Core World Time (apenas se não veio do próprio hook)
  const timeResult = fromWorldTimeHook
    ? { advanced: false, deltaSeconds: 0 }
    : await syncWorldTimeAdvance({ deltaTicks: ticks });

  // 8. Notificar Hooks do Foundry
  Hooks.callAll(`${MODULE_ID}.advanceRun`, {
    deltaTicks: ticks,
    report,
    updatedDomains,
    updatedProjects,
    updatedStructures,
    updatedAgreements,
    timekeeping: timeResult,
    fromWorldTimeHook
  });

  return {
    success: true,
    deltaTicks: ticks,
    report,
    updatedDomains,
    updatedProjects,
    updatedStructures,
    updatedAgreements,
    timekeeping: timeResult
  };
}
