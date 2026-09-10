/**
 * EconomyDialogs — Manipuladores de Diálogos e Ações da Economia
 * Estoques, Fluxos Recorrentes, Sustento e Manutenção.
 */

import { RECORD_TYPES } from "../../core/constants.js";
import { recordIndex } from "../../data/record-index.js";
import { decodeRecord } from "../../models/record-codec.js";
import { updateRecord } from "../../data/journal-store.js";
import { getResourceCatalogSetting } from "../../core/settings.js";
import { tacticalAudio } from "../audio/tactical-audio.js";

function getActionAttr(target, name) {
  if (!target) return null;
  const camelName = name.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
  if (target.dataset && target.dataset[camelName] != null) return target.dataset[camelName];
  const attr = target.getAttribute?.(`data-${name}`);
  if (attr != null) return attr;
  const closest = target.closest?.(`[data-${name}]`);
  return closest?.getAttribute?.(`data-${name}`) ?? null;
}

export class EconomyModals {
  static openUpkeepModal(app) {
    if (!game.user?.isGM || !app.selectedDomainUuid) return;
    tacticalAudio.playPinClick(720);
    app.isUpkeepModalOpen = true;
    app.render();
  }

  static cancelUpkeepModal(app) {
    tacticalAudio.playPinClick(400);
    app.isUpkeepModalOpen = false;
    app.render();
  }

  static async submitUpkeep(app) {
    if (!game.user?.isGM || !app.selectedDomainUuid) return;
    const form = app.element?.querySelector(".dm-dialog-card");
    const enabled = form?.querySelector("#dm-upkeep-enabled")?.value !== "false";
    const foodPer100 = Number(form?.querySelector("#dm-upkeep-food-rate")?.value) || 1.0;
    const waterPer100 = Number(form?.querySelector("#dm-upkeep-water-rate")?.value) || 1.0;
    const guardUpkeep = Number(form?.querySelector("#dm-upkeep-guard-rate")?.value) || 1.0;

    app.isUpkeepModalOpen = false;

    try {
      const doc = recordIndex.get(RECORD_TYPES.DOMAIN, app.selectedDomainUuid);
      const record = decodeRecord(doc);
      const data = foundry.utils.deepClone(record.data);
      if (!data.economy) data.economy = {};
      data.economy.sustenanceSettings = {
        enabled,
        foodPer100,
        waterPer100,
        guardUpkeep
      };
      await updateRecord({
        uuid: app.selectedDomainUuid,
        recordType: RECORD_TYPES.DOMAIN,
        data
      });
      tacticalAudio.playDataPulse();
      ui.notifications?.info("Configurações de sustento populacional salvas!");
      app.render();
    } catch (err) {
      tacticalAudio.playAlertBeep();
      ui.notifications?.error(err.message || "Erro ao salvar configurações de sustento.");
    }
  }

  static openAddStockModal(app) {
    if (!game.user?.isGM || !app.selectedDomainUuid) return;
    tacticalAudio.playPinClick(720);
    app.isStockModalOpen = true;
    app.render();
  }

  static cancelStockModal(app) {
    tacticalAudio.playPinClick(400);
    app.isStockModalOpen = false;
    app.render();
  }

  static async submitStock(app) {
    if (!game.user?.isGM || !app.selectedDomainUuid) return;
    const form = app.element?.querySelector(".dm-dialog-card");
    let resourceId = form?.querySelector("#dm-stock-resource-select")?.value;
    const customId = form?.querySelector("#dm-stock-resource-custom")?.value?.trim()?.toLowerCase();
    const customName = form?.querySelector("#dm-stock-resource-name")?.value?.trim();
    if (customId) resourceId = customId;
    const amount = Number(form?.querySelector("#dm-stock-amount")?.value) || 0;

    if (!resourceId) {
      ui.notifications?.warn("Selecione ou digite um recurso válido.");
      return;
    }

    app.isStockModalOpen = false;

    try {
      const { upsertResourceDefinitionAction } = await import("../../features/economy/actions.js");
      await upsertResourceDefinitionAction({
        originalId: resourceId,
        name: customName || resourceId.toUpperCase(),
        precision: 2,
        allowNegative: false
      });

      const doc = recordIndex.get(RECORD_TYPES.DOMAIN, app.selectedDomainUuid);
      const record = decodeRecord(doc);
      const data = foundry.utils.deepClone(record.data);
      if (!data.economy) data.economy = {};
      if (!Array.isArray(data.economy.stocks)) data.economy.stocks = [];

      const existingIndex = data.economy.stocks.findIndex((s) => s.resourceId === resourceId);
      const newStock = {
        resourceId,
        amount: Math.round(amount * 100),
        reserved: 0
      };

      if (existingIndex >= 0) {
        data.economy.stocks[existingIndex].amount = newStock.amount;
      } else {
        data.economy.stocks.push(newStock);
      }

      await updateRecord({
        uuid: app.selectedDomainUuid,
        recordType: RECORD_TYPES.DOMAIN,
        data
      });

      tacticalAudio.playDataPulse();
      ui.notifications?.info(`Recurso ${resourceId.toUpperCase()} salvo com saldo ${amount}!`);
      app.render();
    } catch (err) {
      tacticalAudio.playAlertBeep();
      ui.notifications?.error(err.message || "Erro ao salvar estoque.");
    }
  }

  static openEditStockModal(app, event, target) {
    if (!game.user?.isGM || !app.selectedDomainUuid) return;
    const resourceId = getActionAttr(target, "resource-id");
    if (!resourceId) return;
    tacticalAudio.playPinClick(720);
    app.editingStockResourceId = resourceId;
    app.isEditingStockModal = true;
    app.render();
  }

  static cancelEditStockModal(app) {
    tacticalAudio.playPinClick(400);
    app.isEditingStockModal = false;
    app.editingStockResourceId = null;
    app.render();
  }

  static async submitEditStock(app) {
    if (!game.user?.isGM || !app.selectedDomainUuid || !app.editingStockResourceId) return;
    const resourceId = app.editingStockResourceId;
    const amount = Number(app.element?.querySelector("#dm-edit-stock-amount")?.value) || 0;
    const reserved = Number(app.element?.querySelector("#dm-edit-stock-reserved")?.value) || 0;

    app.isEditingStockModal = false;
    app.editingStockResourceId = null;

    try {
      const doc = recordIndex.get(RECORD_TYPES.DOMAIN, app.selectedDomainUuid);
      const record = decodeRecord(doc);
      const data = foundry.utils.deepClone(record.data);
      if (!data.economy) data.economy = {};
      if (!Array.isArray(data.economy.stocks)) data.economy.stocks = [];

      const catalog = (typeof getResourceCatalogSetting === "function" ? getResourceCatalogSetting() : null) || { resources: [] };
      const resDef = catalog.resources?.find((r) => r.id === resourceId) || { precision: 0 };
      const scale = 10 ** (resDef.precision || 0);

      const targetStock = data.economy.stocks.find((s) => s.resourceId === resourceId);
      if (targetStock) {
        targetStock.amount = Math.round(amount * scale);
        targetStock.reserved = Math.round(reserved * scale);
      } else {
        data.economy.stocks.push({
          resourceId,
          amount: Math.round(amount * scale),
          reserved: Math.round(reserved * scale)
        });
      }

      await updateRecord({
        uuid: app.selectedDomainUuid,
        recordType: RECORD_TYPES.DOMAIN,
        data
      });
      tacticalAudio.playDataPulse();
      ui.notifications?.info(`Estoque de ${resourceId.toUpperCase()} atualizado!`);
      app.render();
    } catch (err) {
      tacticalAudio.playAlertBeep();
      ui.notifications?.error(err.message || "Erro ao editar estoque.");
    }
  }

  static async deleteStock(app, event, target) {
    if (!game.user?.isGM || !app.selectedDomainUuid) return;
    const resourceId = getActionAttr(target, "resource-id");
    if (!resourceId) return;

    try {
      const { removeResourceDefinitionAction } = await import("../../features/economy/actions.js");
      await removeResourceDefinitionAction(resourceId);

      const allDomains = recordIndex.list(RECORD_TYPES.DOMAIN);
      for (const doc of allDomains) {
        const dec = decodeRecord(doc);
        const data = foundry.utils.deepClone(dec.data);
        let modified = false;
        if (data.economy?.stocks?.some((s) => s.resourceId === resourceId)) {
          data.economy.stocks = data.economy.stocks.filter((s) => s.resourceId !== resourceId);
          modified = true;
        }
        if (data.economy?.flows?.some((f) => f.resourceId === resourceId)) {
          data.economy.flows = data.economy.flows.filter((f) => f.resourceId !== resourceId);
          modified = true;
        }
        if (modified) {
          await updateRecord({
            uuid: doc.uuid,
            recordType: RECORD_TYPES.DOMAIN,
            data
          });
        }
      }

      tacticalAudio.playRelayClick(false);
      ui.notifications?.info(`Recurso "${resourceId.toUpperCase()}" excluído permanentemente do sistema!`);
      app.render();
    } catch (err) {
      tacticalAudio.playAlertBeep();
      ui.notifications?.error(err.message || "Erro ao excluir recurso.");
    }
  }

  static openAddFlowModal(app) {
    if (!game.user?.isGM || !app.selectedDomainUuid) return;
    tacticalAudio.playPinClick(720);
    app.isFlowModalOpen = true;
    app.render();
  }

  static cancelFlowModal(app) {
    tacticalAudio.playPinClick(400);
    app.isFlowModalOpen = false;
    app.render();
  }

  static async submitFlow(app) {
    if (!game.user?.isGM || !app.selectedDomainUuid) return;
    const form = app.element?.querySelector(".dm-dialog-card");
    const name = form?.querySelector("#dm-flow-name")?.value?.trim() || "Fluxo Geral";
    const resourceId = form?.querySelector("#dm-flow-resource")?.value || "credits";
    const direction = form?.querySelector("#dm-flow-direction")?.value || "inflow";
    const amount = Number(form?.querySelector("#dm-flow-amount")?.value) || 0;
    const category = form?.querySelector("#dm-flow-category")?.value?.trim() || "comércio";

    app.isFlowModalOpen = false;

    try {
      const { upsertDomainFlowAction } = await import("../../features/economy/actions.js");
      await upsertDomainFlowAction({
        domainUuid: app.selectedDomainUuid,
        name,
        resourceId,
        direction,
        displayAmount: String(amount),
        periodTicks: 1,
        category,
        source: "Manual GM",
        active: true
      });
      tacticalAudio.playDataPulse();
      ui.notifications?.info(`Fluxo "${name}" adicionado com sucesso!`);
      app.render();
    } catch (err) {
      tacticalAudio.playAlertBeep();
      ui.notifications?.error(err.message || "Erro ao adicionar fluxo.");
    }
  }

  static openEditFlowModal(app, event, target) {
    if (!game.user?.isGM || !app.selectedDomainUuid) return;
    const localId = getActionAttr(target, "local-id");
    if (!localId) return;
    tacticalAudio.playPinClick(720);
    app.editingFlowLocalId = localId;
    app.isEditingFlowModal = true;
    app.render();
  }

  static cancelEditFlowModal(app) {
    tacticalAudio.playPinClick(400);
    app.isEditingFlowModal = false;
    app.editingFlowLocalId = null;
    app.render();
  }

  static async submitEditFlow(app) {
    if (!game.user?.isGM || !app.selectedDomainUuid || !app.editingFlowLocalId) return;
    const name = app.element?.querySelector("#dm-edit-flow-name")?.value?.trim() || "Fluxo Econômico";
    const direction = app.element?.querySelector("#dm-edit-flow-direction")?.value || "inflow";
    const resourceId = app.element?.querySelector("#dm-edit-flow-resource")?.value || "credits";
    const amount = Number(app.element?.querySelector("#dm-edit-flow-amount")?.value) || 0;
    const periodTicks = Number(app.element?.querySelector("#dm-edit-flow-period")?.value) || 1;
    const category = app.element?.querySelector("#dm-edit-flow-category")?.value?.trim() || "geral";
    const active = app.element?.querySelector("#dm-edit-flow-active")?.value !== "false";

    const localId = app.editingFlowLocalId;
    app.isEditingFlowModal = false;
    app.editingFlowLocalId = null;

    if (localId.startsWith("upkeep-")) {
      try {
        const doc = recordIndex.get(RECORD_TYPES.DOMAIN, app.selectedDomainUuid);
        const record = decodeRecord(doc);
        const data = foundry.utils.deepClone(record.data);
        if (!data.economy) data.economy = {};
        data.economy.sustenanceSettings = data.economy.sustenanceSettings || { enabled: true, foodPer100: 1.0, waterPer100: 1.0, guardUpkeep: 1.0 };

        const groups = data.population?.groups ?? data.people?.groups ?? [];
        const totalPop = groups.reduce((acc, g) => acc + (Number(g.count || g.population) || 0), 0) || 100;

        if (localId === "upkeep-food") {
          data.economy.sustenanceSettings.foodPer100 = active ? Math.max(0, (amount / totalPop) * 100) : 0;
          ui.notifications?.info(`Consumo de comida atualizado para ${data.economy.sustenanceSettings.foodPer100.toFixed(2)} por 100 hab/tick!`);
        } else if (localId === "upkeep-water") {
          data.economy.sustenanceSettings.waterPer100 = active ? Math.max(0, (amount / totalPop) * 100) : 0;
          ui.notifications?.info(`Consumo de água atualizado para ${data.economy.sustenanceSettings.waterPer100.toFixed(2)} por 100 hab/tick!`);
        } else if (localId === "upkeep-guards") {
          const guards = data.security?.guardCount || 1;
          data.economy.sustenanceSettings.guardUpkeep = active ? Math.max(0, amount / guards) : 0;
          ui.notifications?.info(`Manutenção da guarda atualizada para ${data.economy.sustenanceSettings.guardUpkeep.toFixed(2)}/guarda!`);
        }

        await updateRecord({
          uuid: app.selectedDomainUuid,
          recordType: RECORD_TYPES.DOMAIN,
          data
        });
        tacticalAudio.playDataPulse();
        app.render();
        return;
      } catch (err) {
        tacticalAudio.playAlertBeep();
        ui.notifications?.error(err.message || "Erro ao salvar taxa de sustento.");
        return;
      }
    }

    try {
      const { upsertDomainFlowAction } = await import("../../features/economy/actions.js");
      await upsertDomainFlowAction({
        domainUuid: app.selectedDomainUuid,
        localId,
        name,
        resourceId,
        direction,
        displayAmount: String(amount),
        periodTicks: Math.max(1, periodTicks),
        category,
        active
      });
      tacticalAudio.playDataPulse();
      ui.notifications?.info(`Fluxo "${name}" atualizado com sucesso!`);
      app.render();
    } catch (err) {
      tacticalAudio.playAlertBeep();
      ui.notifications?.error(err.message || "Erro ao editar fluxo.");
    }
  }

  static async deleteFlow(app, event, target) {
    if (!game.user?.isGM || !app.selectedDomainUuid) return;
    const localId = getActionAttr(target, "local-id");
    if (!localId) return;

    if (localId.startsWith("upkeep-")) {
      try {
        const doc = recordIndex.get(RECORD_TYPES.DOMAIN, app.selectedDomainUuid);
        const record = decodeRecord(doc);
        const data = foundry.utils.deepClone(record.data);
        if (!data.economy) data.economy = {};
        data.economy.sustenanceSettings = data.economy.sustenanceSettings || { enabled: true, foodPer100: 1.0, waterPer100: 1.0, guardUpkeep: 1.0 };

        if (localId === "upkeep-food") {
          data.economy.sustenanceSettings.foodPer100 = 0;
          ui.notifications?.info("Consumo de alimentos da população desativado!");
        } else if (localId === "upkeep-water") {
          data.economy.sustenanceSettings.waterPer100 = 0;
          ui.notifications?.info("Consumo de água da população desativado!");
        } else if (localId === "upkeep-guards") {
          data.economy.sustenanceSettings.guardUpkeep = 0;
          ui.notifications?.info("Manutenção da guarda desativada!");
        }

        await updateRecord({
          uuid: app.selectedDomainUuid,
          recordType: RECORD_TYPES.DOMAIN,
          data
        });
        tacticalAudio.playRelayClick(false);
        app.render();
        return;
      } catch (err) {
        tacticalAudio.playAlertBeep();
        ui.notifications?.error(err.message || "Erro ao desativar consumo populacional.");
        return;
      }
    }

    try {
      const { removeDomainFlowAction } = await import("../../features/economy/actions.js");
      await removeDomainFlowAction({
        domainUuid: app.selectedDomainUuid,
        localId
      });
      tacticalAudio.playRelayClick(false);
      ui.notifications?.info("Fluxo removido com sucesso!");
      app.render();
    } catch (err) {
      tacticalAudio.playAlertBeep();
      ui.notifications?.error(err.message || "Erro ao remover fluxo.");
    }
  }
}

export { EconomyModals as EconomyDialogs };
