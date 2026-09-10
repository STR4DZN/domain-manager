/**
 * HistoryModals — Manipuladores de Crônicas, Marcos e Histórico do Domínio
 */

import { RECORD_TYPES } from "../../core/constants.js";
import { recordIndex } from "../../data/record-index.js";
import { decodeRecord } from "../../models/record-codec.js";
import { updateRecord } from "../../data/journal-store.js";
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

export class HistoryModals {
  static openAddHistoryModal(app) {
    if (!game.user.isGM || !app.selectedDomainUuid) return;
    tacticalAudio.playPinClick(640);
    app._closeAllModals?.() ?? HistoryModals.closeAllModals(app);
    app.isHistoryModalOpen = true;
    app.render();
  }

  static cancelHistoryModal(app) {
    tacticalAudio.playPinClick(380);
    app.isHistoryModalOpen = false;
    app.render();
  }

  static async submitHistory(app) {
    if (!game.user.isGM || !app.selectedDomainUuid) return;
    const form = app.element?.querySelector(".dm-dialog-card");
    const title = form?.querySelector("#dm-history-title")?.value?.trim();
    const category = form?.querySelector("#dm-history-category")?.value || "story";
    const summary = form?.querySelector("#dm-history-summary")?.value?.trim() || "";
    const details = form?.querySelector("#dm-history-details")?.value?.trim() || "";

    if (!title) {
      ui.notifications?.warn("O título da crônica é obrigatório.");
      return;
    }

    app.isHistoryModalOpen = false;

    try {
      tacticalAudio.playDataPulse();
      const { addHistoryEvent } = await import("../../features/history/actions.js");
      await addHistoryEvent({
        domainUuid: app.selectedDomainUuid,
        title,
        category,
        summary,
        details
      });
      ui.notifications?.info(`Crônica "${title}" adicionada ao histórico!`);
      app.render();
    } catch (err) {
      ui.notifications?.error(err.message || "Erro ao adicionar crônica.");
    }
  }

  static openEditHistoryModal(app, event, target) {
    if (!game.user.isGM || !app.selectedDomainUuid) return;
    const rawIdx = getActionAttr(target, "index");
    const index = rawIdx != null ? Number(rawIdx) : null;
    if (index == null || isNaN(index)) return;
    tacticalAudio.playPinClick(640);
    app._closeAllModals?.() ?? HistoryModals.closeAllModals(app);
    app.isEditingHistoryModal = true;
    app.editingHistoryIndex = index;
    app.render();
  }

  static cancelEditHistoryModal(app) {
    tacticalAudio.playPinClick(380);
    app.isEditingHistoryModal = false;
    app.editingHistoryIndex = null;
    app.render();
  }

  static async submitEditHistory(app) {
    if (!game.user.isGM || !app.selectedDomainUuid || app.editingHistoryIndex == null) return;
    const form = app.element?.querySelector(".dm-dialog-card");
    const title = form?.querySelector("#dm-edit-history-title")?.value?.trim();
    const category = form?.querySelector("#dm-edit-history-category")?.value || "story";
    const summary = form?.querySelector("#dm-edit-history-summary")?.value?.trim() || "";
    const details = form?.querySelector("#dm-edit-history-details")?.value?.trim() || "";

    if (!title) {
      ui.notifications?.warn("O título da crônica é obrigatório.");
      return;
    }

    const index = app.editingHistoryIndex;
    app.isEditingHistoryModal = false;
    app.editingHistoryIndex = null;

    try {
      tacticalAudio.playDataPulse();
      const doc = recordIndex.get(RECORD_TYPES.DOMAIN, app.selectedDomainUuid);
      const record = decodeRecord(doc);
      const data = foundry.utils.deepClone(record.data);
      if (Array.isArray(data.history)) {
        const realIndex = data.history.length - 1 - index;
        if (realIndex >= 0 && realIndex < data.history.length) {
          data.history[realIndex].title = title;
          data.history[realIndex].category = category;
          data.history[realIndex].summary = summary;
          data.history[realIndex].details = details;
          await updateRecord({
            uuid: app.selectedDomainUuid,
            recordType: RECORD_TYPES.DOMAIN,
            data
          });
          ui.notifications?.info(`Crônica "${title}" atualizada!`);
          app.render();
        }
      }
    } catch (err) {
      ui.notifications?.error(err.message || "Erro ao atualizar crônica.");
    }
  }

  static async deleteHistory(app, event, target) {
    if (!game.user.isGM || !app.selectedDomainUuid) return;
    const rawIdx = getActionAttr(target, "index");
    const index = rawIdx != null ? Number(rawIdx) : null;
    if (index == null || isNaN(index)) return;

    try {
      tacticalAudio.playPinClick(300);
      const doc = recordIndex.get(RECORD_TYPES.DOMAIN, app.selectedDomainUuid);
      const record = decodeRecord(doc);
      const data = foundry.utils.deepClone(record.data);
      if (Array.isArray(data.history)) {
        const realIndex = data.history.length - 1 - index;
        if (realIndex >= 0 && realIndex < data.history.length) {
          data.history.splice(realIndex, 1);
          await updateRecord({
            uuid: app.selectedDomainUuid,
            recordType: RECORD_TYPES.DOMAIN,
            data
          });
          ui.notifications?.info("Registro histórico excluído.");
          app.render();
        }
      }
    } catch (err) {
      ui.notifications?.error(err.message || "Erro ao excluir histórico.");
    }
  }

  static closeAllModals(app) {
    app.isHistoryModalOpen = false;
    app.isEditingHistoryModal = false;
    app.editingHistoryIndex = null;
  }
}
