/**
 * DiplomacyModals — Manipuladores de Tratados, Pactos e Relações Bilaterais
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

export class DiplomacyModals {
  static openAddRelationModal(app) {
    if (!game.user.isGM || !app.selectedDomainUuid) return;
    tacticalAudio.playPinClick(640);
    app._closeAllModals?.() ?? DiplomacyModals.closeAllModals(app);
    app.isRelationModalOpen = true;
    app.render();
  }

  static cancelRelationModal(app) {
    tacticalAudio.playPinClick(380);
    app.isRelationModalOpen = false;
    app.render();
  }

  static async submitRelation(app) {
    if (!game.user.isGM || !app.selectedDomainUuid) return;
    const form = app.element?.querySelector(".dm-dialog-card");
    const targetDomainUuid = form?.querySelector("#dm-relation-target")?.value;
    const posture = form?.querySelector("#dm-relation-posture")?.value || "neutral";
    const notes = form?.querySelector("#dm-relation-notes")?.value || "";

    if (!targetDomainUuid) {
      ui.notifications?.warn("Selecione um domínio alvo para a relação diplomática.");
      return;
    }

    app.isRelationModalOpen = false;

    try {
      tacticalAudio.playDataPulse();
      const { addRelation } = await import("../../features/relations/actions.js");
      await addRelation({
        domainUuid: app.selectedDomainUuid,
        targetDomainUuid,
        posture,
        notes
      });
      ui.notifications?.info("Relação diplomática atualizada com sucesso!");
      app.render();
    } catch (err) {
      ui.notifications?.error(err.message || "Erro ao atualizar diplomacia.");
    }
  }

  static openEditRelationModal(app, event, target) {
    if (!game.user.isGM || !app.selectedDomainUuid) return;
    const targetUuid = getActionAttr(target, "target-uuid");
    if (!targetUuid) return;
    tacticalAudio.playPinClick(640);
    app._closeAllModals?.() ?? DiplomacyModals.closeAllModals(app);
    app.isEditingRelationModal = true;
    app.editingRelationTargetUuid = targetUuid;
    app.render();
  }

  static cancelEditRelationModal(app) {
    tacticalAudio.playPinClick(380);
    app.isEditingRelationModal = false;
    app.editingRelationTargetUuid = null;
    app.render();
  }

  static async submitEditRelation(app) {
    if (!game.user.isGM || !app.selectedDomainUuid || !app.editingRelationTargetUuid) return;
    const form = app.element?.querySelector(".dm-dialog-card");
    const posture = form?.querySelector("#dm-edit-relation-posture")?.value || "neutral";
    const notes = form?.querySelector("#dm-edit-relation-notes")?.value || "";

    const targetDomainUuid = app.editingRelationTargetUuid;
    app.isEditingRelationModal = false;
    app.editingRelationTargetUuid = null;

    try {
      tacticalAudio.playDataPulse();
      const doc = recordIndex.get(RECORD_TYPES.DOMAIN, app.selectedDomainUuid);
      const record = decodeRecord(doc);
      const data = foundry.utils.deepClone(record.data);
      if (Array.isArray(data.relations)) {
        const rel = data.relations.find((r) => r.targetDomainUuid === targetDomainUuid);
        if (rel) {
          rel.posture = posture;
          rel.notes = notes;
        } else {
          data.relations.push({ targetDomainUuid, posture, notes });
        }
        await updateRecord({
          uuid: app.selectedDomainUuid,
          recordType: RECORD_TYPES.DOMAIN,
          data
        });
        ui.notifications?.info("Relação diplomática atualizada com sucesso!");
        app.render();
      }
    } catch (err) {
      ui.notifications?.error(err.message || "Erro ao atualizar relação diplomática.");
    }
  }

  static async deleteRelation(app, event, target) {
    if (!game.user.isGM || !app.selectedDomainUuid) return;
    const targetUuid = getActionAttr(target, "target-uuid");
    if (!targetUuid) return;

    try {
      tacticalAudio.playPinClick(300);
      const doc = recordIndex.get(RECORD_TYPES.DOMAIN, app.selectedDomainUuid);
      const record = decodeRecord(doc);
      const data = foundry.utils.deepClone(record.data);
      if (Array.isArray(data.relations)) {
        data.relations = data.relations.filter((r) => r.targetDomainUuid !== targetUuid);
        await updateRecord({
          uuid: app.selectedDomainUuid,
          recordType: RECORD_TYPES.DOMAIN,
          data
        });
        ui.notifications?.info("Relação diplomática removida!");
        app.render();
      }
    } catch (err) {
      ui.notifications?.error(err.message || "Erro ao remover relação diplomática.");
    }
  }

  static closeAllModals(app) {
    app.isRelationModalOpen = false;
    app.isEditingRelationModal = false;
    app.editingRelationTargetUuid = null;
  }
}
