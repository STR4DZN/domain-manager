/**
 * IntelModals — Manipuladores de Dossiês Confidenciais, Rumores e Fatos
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

export class IntelModals {
  static openAddIntelModal(app) {
    if (!game.user.isGM || !app.selectedDomainUuid) return;
    tacticalAudio.playPinClick(640);
    app._closeAllModals?.() ?? IntelModals.closeAllModals(app);
    app.isIntelModalOpen = true;
    app.render();
  }

  static cancelIntelModal(app) {
    tacticalAudio.playPinClick(380);
    app.isIntelModalOpen = false;
    app.render();
  }

  static async submitIntel(app) {
    if (!game.user.isGM || !app.selectedDomainUuid) return;
    const form = app.element?.querySelector(".dm-dialog-card");
    const title = form?.querySelector("#dm-intel-title")?.value?.trim();
    const content = form?.querySelector("#dm-intel-content")?.value?.trim() || "";
    let category = form?.querySelector("#dm-intel-category")?.value || "secret";
    let credibility = form?.querySelector("#dm-intel-credibility")?.value || "confirmed";
    let visibility = form?.querySelector("#dm-intel-visibility")?.value || "gm_only";

    if (visibility === "gmOnly") visibility = "gm_only";
    if (credibility === "high") credibility = "likely";
    if (credibility === "medium") credibility = "doubtful";
    if (credibility === "low") credibility = "false";
    if (category === "conspiracy") category = "secret";

    if (!title) {
      ui.notifications?.warn("O título da informação é obrigatório.");
      return;
    }

    app.isIntelModalOpen = false;

    try {
      tacticalAudio.playDataPulse();
      const { addIntel } = await import("../../features/intel/actions.js");
      await addIntel({
        domainUuid: app.selectedDomainUuid,
        title,
        content,
        category,
        credibility,
        visibility
      });
      ui.notifications?.info(`Informe "${title}" registrado com sucesso!`);
      app.render();
    } catch (err) {
      ui.notifications?.error(err.message || "Erro ao adicionar intel.");
    }
  }

  static openEditIntelModal(app, event, target) {
    if (!game.user.isGM || !app.selectedDomainUuid) return;
    const localId = getActionAttr(target, "local-id");
    if (!localId) return;
    tacticalAudio.playPinClick(640);
    app._closeAllModals?.() ?? IntelModals.closeAllModals(app);
    app.isEditingIntelModal = true;
    app.editingIntelLocalId = localId;
    app.render();
  }

  static cancelEditIntelModal(app) {
    tacticalAudio.playPinClick(380);
    app.isEditingIntelModal = false;
    app.editingIntelLocalId = null;
    app.render();
  }

  static async submitEditIntel(app) {
    if (!game.user.isGM || !app.selectedDomainUuid || !app.editingIntelLocalId) return;
    const form = app.element?.querySelector(".dm-dialog-card");
    const title = form?.querySelector("#dm-edit-intel-title")?.value?.trim();
    const type = form?.querySelector("#dm-edit-intel-category")?.value || "secret";
    const credibility = form?.querySelector("#dm-edit-intel-credibility")?.value || "confirmed";
    const visibility = form?.querySelector("#dm-edit-intel-visibility")?.value || "gm_only";
    const content = form?.querySelector("#dm-edit-intel-content")?.value?.trim() || "";

    if (!title) {
      ui.notifications?.warn("O título do informe é obrigatório.");
      return;
    }

    const localId = app.editingIntelLocalId;
    app.isEditingIntelModal = false;
    app.editingIntelLocalId = null;

    try {
      tacticalAudio.playDataPulse();
      const doc = recordIndex.get(RECORD_TYPES.DOMAIN, app.selectedDomainUuid);
      const record = decodeRecord(doc);
      const data = foundry.utils.deepClone(record.data);
      const intelList = data.intel?.records || data.intel || [];
      const target = intelList.find((i) => i.localId === localId);
      if (target) {
        target.title = title;
        target.type = type;
        target.credibility = credibility;
        target.visibility = visibility;
        target.content = content;
        await updateRecord({
          uuid: app.selectedDomainUuid,
          recordType: RECORD_TYPES.DOMAIN,
          data
        });
        ui.notifications?.info(`Informe "${title}" atualizado com sucesso!`);
        app.render();
      }
    } catch (err) {
      ui.notifications?.error(err.message || "Erro ao atualizar informe.");
    }
  }

  static async deleteIntel(app, event, target) {
    if (!game.user.isGM || !app.selectedDomainUuid) return;
    const localId = getActionAttr(target, "local-id");
    if (!localId) return;

    try {
      tacticalAudio.playPinClick(300);
      const { removeIntel } = await import("../../features/intel/actions.js");
      await removeIntel({
        domainUuid: app.selectedDomainUuid,
        localId
      });
      ui.notifications?.info("Registro de intel removido!");
      app.render();
    } catch (err) {
      ui.notifications?.error(err.message || "Erro ao remover registro de intel.");
    }
  }

  static closeAllModals(app) {
    app.isIntelModalOpen = false;
    app.isEditingIntelModal = false;
    app.editingIntelLocalId = null;
  }
}
