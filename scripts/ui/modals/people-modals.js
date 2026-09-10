/**
 * PeopleModals — Manipuladores de População, Grupos, Notáveis e Bio-Monitor
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

export class PeopleModals {
  static openAddNotableModal(app) {
    if (!game.user.isGM || !app.selectedDomainUuid) return;
    tacticalAudio.playPinClick(640);
    app._closeAllModals?.() ?? PeopleModals.closeAllModals(app);
    app.isNotableModalOpen = true;
    app.render();
  }

  static cancelNotableModal(app) {
    tacticalAudio.playPinClick(380);
    app.isNotableModalOpen = false;
    app.render();
  }

  static async submitNotable(app) {
    if (!game.user.isGM || !app.selectedDomainUuid) return;
    const name = app.element?.querySelector("#dm-notable-name")?.value?.trim();
    const role = app.element?.querySelector("#dm-notable-role")?.value?.trim() || "Conselheiro";
    const title = app.element?.querySelector("#dm-notable-title")?.value?.trim() || "";
    const portrait = app.element?.querySelector("#dm-notable-portrait")?.value?.trim() || "";
    const imageFit = app.element?.querySelector("#dm-notable-portrait-fit")?.value || "cover";
    const imageShape = app.element?.querySelector("#dm-notable-portrait-shape")?.value || "square";
    const imagePosX = Number(app.element?.querySelector("#dm-notable-portrait-pos-x")?.value) ?? 50;
    const imagePosY = Number(app.element?.querySelector("#dm-notable-portrait-pos-y")?.value) ?? 50;
    const imageZoom = Number(app.element?.querySelector("#dm-notable-portrait-zoom")?.value) ?? 100;
    const loyalty = app.element?.querySelector("#dm-notable-loyalty")?.value || "Alta";
    const status = app.element?.querySelector("#dm-notable-status")?.value || "active";

    if (!name) {
      ui.notifications?.warn("O nome do notável é obrigatório.");
      return;
    }

    app.isNotableModalOpen = false;

    try {
      tacticalAudio.playDataPulse();
      const { upsertNotableAction } = await import("../../features/people/actions.js");
      await upsertNotableAction({
        domainUuid: app.selectedDomainUuid,
        name,
        role,
        title,
        portrait,
        assignment: loyalty,
        status
      });

      const doc = recordIndex.get(RECORD_TYPES.DOMAIN, app.selectedDomainUuid);
      if (doc) {
        const dec = decodeRecord(doc);
        const data = foundry.utils.deepClone(dec.data);
        const list = data.population?.notables ?? data.people?.notables ?? [];
        const created = list.find((n) => n.name === name);
        if (created) {
          created.imageFit = imageFit;
          created.imageShape = imageShape;
          created.imagePosX = imagePosX;
          created.imagePosY = imagePosY;
          created.imageZoom = imageZoom;
          await updateRecord({ uuid: app.selectedDomainUuid, recordType: RECORD_TYPES.DOMAIN, data });
        }
      }
      ui.notifications?.info(`Notável "${name}" registrado com sucesso!`);
      app.render();
    } catch (err) {
      ui.notifications?.error(err.message || "Erro ao adicionar notável.");
    }
  }

  static openEditNotableModal(app, event, target) {
    if (!game.user.isGM || !app.selectedDomainUuid) return;
    const localId = getActionAttr(target, "local-id");
    if (!localId) return;
    tacticalAudio.playPinClick(640);
    app._closeAllModals?.() ?? PeopleModals.closeAllModals(app);
    app.isEditingNotableModal = true;
    app.editingNotableLocalId = localId;
    app.render();
  }

  static cancelEditNotableModal(app) {
    tacticalAudio.playPinClick(380);
    app.isEditingNotableModal = false;
    app.editingNotableLocalId = null;
    app.render();
  }

  static async submitEditNotable(app) {
    if (!game.user.isGM || !app.selectedDomainUuid || !app.editingNotableLocalId) return;
    const name = app.element?.querySelector("#dm-edit-notable-name")?.value?.trim();
    const role = app.element?.querySelector("#dm-edit-notable-role")?.value?.trim() || "Conselheiro";
    const title = app.element?.querySelector("#dm-edit-notable-title")?.value?.trim() || "";
    const portrait = app.element?.querySelector("#dm-edit-notable-portrait")?.value?.trim() || "";
    const imageFit = app.element?.querySelector("#dm-edit-notable-portrait-fit")?.value || "cover";
    const imageShape = app.element?.querySelector("#dm-edit-notable-portrait-shape")?.value || "square";
    const imagePosX = Number(app.element?.querySelector("#dm-edit-notable-portrait-pos-x")?.value) ?? 50;
    const imagePosY = Number(app.element?.querySelector("#dm-edit-notable-portrait-pos-y")?.value) ?? 50;
    const imageZoom = Number(app.element?.querySelector("#dm-edit-notable-portrait-zoom")?.value) ?? 100;
    const loyalty = app.element?.querySelector("#dm-edit-notable-loyalty")?.value || "Alta";
    const status = app.element?.querySelector("#dm-edit-notable-status")?.value || "active";

    if (!name) {
      ui.notifications?.warn("O nome do notável é obrigatório.");
      return;
    }

    const localId = app.editingNotableLocalId;
    app.isEditingNotableModal = false;
    app.editingNotableLocalId = null;

    try {
      tacticalAudio.playDataPulse();
      const { upsertNotableAction } = await import("../../features/people/actions.js");
      await upsertNotableAction({
        domainUuid: app.selectedDomainUuid,
        localId,
        name,
        role,
        title,
        portrait,
        assignment: loyalty,
        status
      });
      const doc = recordIndex.get(RECORD_TYPES.DOMAIN, app.selectedDomainUuid);
      if (doc) {
        const dec = decodeRecord(doc);
        const data = foundry.utils.deepClone(dec.data);
        const list = data.population?.notables ?? data.people?.notables ?? [];
        const targetNotable = list.find((n) => n.localId === localId);
        if (targetNotable) {
          targetNotable.imageFit = imageFit;
          targetNotable.imageShape = imageShape;
          targetNotable.imagePosX = imagePosX;
          targetNotable.imagePosY = imagePosY;
          targetNotable.imageZoom = imageZoom;
          await updateRecord({ uuid: app.selectedDomainUuid, recordType: RECORD_TYPES.DOMAIN, data });
        }
      }
      ui.notifications?.info(`Notável "${name}" atualizado com sucesso!`);
      app.render();
    } catch (err) {
      ui.notifications?.error(err.message || "Erro ao atualizar notável.");
    }
  }

  static async deleteNotable(app, event, target) {
    if (!game.user.isGM || !app.selectedDomainUuid) return;
    const localId = getActionAttr(target, "local-id");
    if (!localId) return;

    try {
      tacticalAudio.playPinClick(300);
      const { removeNotableAction } = await import("../../features/people/actions.js");
      await removeNotableAction({
        domainUuid: app.selectedDomainUuid,
        localId
      });
      ui.notifications?.info("Notável removido!");
      app.render();
    } catch (err) {
      ui.notifications?.error(err.message || "Erro ao remover notável.");
    }
  }

  /* --- Grupos Populacionais --- */
  static openAddGroupModal(app) {
    if (!game.user.isGM || !app.selectedDomainUuid) return;
    tacticalAudio.playPinClick(640);
    app._closeAllModals?.() ?? PeopleModals.closeAllModals(app);
    app.isGroupModalOpen = true;
    app.render();
  }

  static cancelGroupModal(app) {
    tacticalAudio.playPinClick(380);
    app.isGroupModalOpen = false;
    app.render();
  }

  static async submitGroup(app) {
    if (!game.user.isGM || !app.selectedDomainUuid) return;
    const form = app.element?.querySelector(".dm-dialog-card");
    const name = form?.querySelector("#dm-group-name")?.value?.trim();
    const count = Number(form?.querySelector("#dm-group-count")?.value) || 100;
    const happiness = form?.querySelector("#dm-group-happiness")?.value || "Estável";
    let unrestScore = Number(form?.querySelector("#dm-group-unrest")?.value);

    if (isNaN(unrestScore)) {
      if (happiness === "Muito Alta") unrestScore = 0;
      else if (happiness === "Estável") unrestScore = 2;
      else if (happiness === "Insatisfeito") unrestScore = 6;
      else if (happiness === "Rebelde") unrestScore = 9;
      else unrestScore = 2;
    }

    if (!name) {
      ui.notifications?.warn("O nome do grupo é obrigatório.");
      return;
    }

    app.isGroupModalOpen = false;

    try {
      tacticalAudio.playDataPulse();
      const { upsertGroupAction } = await import("../../features/people/actions.js");
      await upsertGroupAction({
        domainUuid: app.selectedDomainUuid,
        name,
        count,
        includedInTotal: true,
        quality: happiness,
        status: "active",
        assignment: String(unrestScore)
      });
      ui.notifications?.info(`Grupo "${name}" adicionado com agitação calculada!`);
      app.render();
    } catch (err) {
      ui.notifications?.error(err.message || "Erro ao adicionar grupo.");
    }
  }

  static openEditGroupModal(app, event, target) {
    if (!game.user.isGM || !app.selectedDomainUuid) return;
    const localId = getActionAttr(target, "local-id");
    if (!localId) return;
    tacticalAudio.playPinClick(640);
    app._closeAllModals?.() ?? PeopleModals.closeAllModals(app);
    app.isEditingGroupModal = true;
    app.editingGroupLocalId = localId;
    app.render();
  }

  static cancelEditGroupModal(app) {
    tacticalAudio.playPinClick(380);
    app.isEditingGroupModal = false;
    app.editingGroupLocalId = null;
    app.render();
  }

  static async submitEditGroup(app) {
    if (!game.user.isGM || !app.selectedDomainUuid || !app.editingGroupLocalId) return;
    const form = app.element?.querySelector(".dm-dialog-card");
    const name = form?.querySelector("#dm-edit-group-name")?.value?.trim();
    const count = Number(form?.querySelector("#dm-edit-group-count")?.value) || 100;
    const happiness = form?.querySelector("#dm-edit-group-happiness")?.value || "Estável";
    let unrestScore = Number(form?.querySelector("#dm-edit-group-unrest")?.value);

    if (isNaN(unrestScore)) {
      if (happiness === "Muito Alta") unrestScore = 0;
      else if (happiness === "Estável") unrestScore = 2;
      else if (happiness === "Insatisfeito") unrestScore = 6;
      else if (happiness === "Rebelde") unrestScore = 9;
      else unrestScore = 2;
    }

    if (!name) {
      ui.notifications?.warn("O nome do grupo é obrigatório.");
      return;
    }

    const localId = app.editingGroupLocalId;
    app.isEditingGroupModal = false;
    app.editingGroupLocalId = null;

    try {
      tacticalAudio.playDataPulse();
      const { upsertGroupAction } = await import("../../features/people/actions.js");
      await upsertGroupAction({
        domainUuid: app.selectedDomainUuid,
        localId,
        name,
        count,
        includedInTotal: true,
        quality: happiness,
        status: "active",
        assignment: String(unrestScore)
      });
      ui.notifications?.info(`Grupo "${name}" atualizado!`);
      app.render();
    } catch (err) {
      ui.notifications?.error(err.message || "Erro ao atualizar grupo.");
    }
  }

  static async deleteGroup(app, event, target) {
    if (!game.user.isGM || !app.selectedDomainUuid) return;
    const localId = getActionAttr(target, "local-id");
    if (!localId) return;

    try {
      tacticalAudio.playPinClick(300);
      const { removeGroupAction } = await import("../../features/people/actions.js");
      await removeGroupAction({
        domainUuid: app.selectedDomainUuid,
        localId
      });
      ui.notifications?.info("Grupo populacional removido!");
      app.render();
    } catch (err) {
      ui.notifications?.error(err.message || "Erro ao remover grupo.");
    }
  }

  /* --- Dossiê Tático & Bio-Monitor --- */
  static openNotableDossier(app, event, target) {
    app._shouldAnimateNextRender = true;
    const localId = getActionAttr(target, "local-id");
    if (!localId) return;
    tacticalAudio.playTargetLock();
    app.activeNotableDossierLocalId = localId;
    app.selectedDossierSkillId = null;
    app.render();
  }

  static closeNotableDossier(app) {
    app._shouldAnimateNextRender = true;
    tacticalAudio.playRelayClick();
    app.activeNotableDossierLocalId = null;
    app.selectedDossierSkillId = null;
    app.render();
  }

  static selectDossierSkill(app, event, target) {
    const skillId = getActionAttr(target, "skill-id");
    if (skillId) {
      tacticalAudio.playPinClick(800);
      app.selectedDossierSkillId = skillId;
      app.render();
    }
  }

  static openEditNotableStatsModal(app) {
    if (!game.user.isGM) return;
    tacticalAudio.playPinClick(720);
    app._closeAllModals?.() ?? PeopleModals.closeAllModals(app);
    app.isEditingNotableStatsModal = true;
    app.render();
  }

  static cancelNotableStatsModal(app) {
    tacticalAudio.playPinClick(380);
    app.isEditingNotableStatsModal = false;
    app.render();
  }

  static async submitNotableStats(app) {
    if (!game.user.isGM || !app.selectedDomainUuid || !app.activeNotableDossierLocalId) return;

    const name = app.element?.querySelector("#dm-dossier-edit-name")?.value?.trim();
    const role = app.element?.querySelector("#dm-dossier-edit-role")?.value?.trim() || "Conselheiro";
    const specialization = app.element?.querySelector("#dm-dossier-edit-spec")?.value?.trim() || "";
    const status = app.element?.querySelector("#dm-dossier-edit-status")?.value || "active";
    const loyalty = app.element?.querySelector("#dm-dossier-edit-loyalty")?.value?.trim() || "Alta";
    const missions = Math.max(0, Number(app.element?.querySelector("#dm-dossier-edit-missions")?.value) || 0);

    const combat = Math.max(0, Math.min(20, Number(app.element?.querySelector("#dm-stat-combat")?.value) || 10));
    const stealth = Math.max(0, Math.min(20, Number(app.element?.querySelector("#dm-stat-stealth")?.value) || 10));
    const cunning = Math.max(0, Math.min(20, Number(app.element?.querySelector("#dm-stat-cunning")?.value) || 10));
    const diplomacy = Math.max(0, Math.min(20, Number(app.element?.querySelector("#dm-stat-diplomacy")?.value) || 10));
    const technique = Math.max(0, Math.min(20, Number(app.element?.querySelector("#dm-stat-technique")?.value) || 10));
    const survival = Math.max(0, Math.min(20, Number(app.element?.querySelector("#dm-stat-survival")?.value) || 10));

    try {
      tacticalAudio.playDataPulse();
      const doc = recordIndex.get(RECORD_TYPES.DOMAIN, app.selectedDomainUuid);
      const record = decodeRecord(doc);
      const data = foundry.utils.deepClone(record.data);
      const notables = data.population?.notables ?? data.people?.notables ?? [];
      const not = notables.find((n) => n.localId === app.activeNotableDossierLocalId);
      if (!not) return;

      if (name) not.name = name;
      not.role = role;
      not.specialization = specialization;
      not.title = specialization;
      not.status = status;
      not.loyalty = loyalty;
      not.assignment = loyalty;
      not.missionsCompletedCount = missions;
      not.attributes = { combat, stealth, cunning, diplomacy, technique, survival };

      await updateRecord({ uuid: app.selectedDomainUuid, recordType: RECORD_TYPES.DOMAIN, data });

      app.isEditingNotableStatsModal = false;
      ui.notifications?.info(`Bio-Monitor e Atributos de ${not.name} calibrados com sucesso!`);
      app.render();
    } catch (err) {
      ui.notifications?.error(err.message || "Erro ao calibrar atributos do notável.");
    }
  }

  static closeAllModals(app) {
    app.isNotableModalOpen = false;
    app.isEditingNotableModal = false;
    app.editingNotableLocalId = null;
    app.isGroupModalOpen = false;
    app.isEditingGroupModal = false;
    app.editingGroupLocalId = null;
    app.isEditingNotableStatsModal = false;
  }
}
