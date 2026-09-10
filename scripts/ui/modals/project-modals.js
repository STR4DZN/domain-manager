/**
 * ProjectDialogs — Manipuladores de Diálogos e Ações de Obras/Projetos
 * Criação, Edição com Image Studio, Evolução de Tiers e Exclusão.
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

export class ProjectModals {
  static openAddProjectModal(app) {
    if (!game.user?.isGM || !app.selectedDomainUuid) return;
    tacticalAudio.playPinClick(720);
    app.isProjectModalOpen = true;
    app.render();
  }

  static cancelProjectModal(app) {
    tacticalAudio.playPinClick(400);
    app.isProjectModalOpen = false;
    app.render();
  }

  static async submitProject(app) {
    if (!game.user?.isGM || !app.selectedDomainUuid) return;
    const name = app.element?.querySelector("#dm-project-name")?.value?.trim() || "Nova Obra";
    const category = app.element?.querySelector("#dm-project-category")?.value || "infraestrutura";
    const tier = Number(app.element?.querySelector("#dm-project-tier")?.value) || 1;
    const workRequired = Number(app.element?.querySelector("#dm-project-work")?.value) || 100;
    const rateAmount = Number(app.element?.querySelector("#dm-project-rate")?.value) || 10;
    const description = app.element?.querySelector("#dm-project-desc")?.value?.trim() || "";
    const image = app.element?.querySelector("#dm-project-img")?.value?.trim() || "";
    const imageFit = app.element?.querySelector("#dm-project-img-fit")?.value || "cover";
    const imageHeight = Number(app.element?.querySelector("#dm-project-img-height")?.value) || 180;
    const imagePosX = Number(app.element?.querySelector("#dm-project-img-pos-x")?.value) ?? 50;
    const imagePosY = Number(app.element?.querySelector("#dm-project-img-pos-y")?.value) ?? 50;
    const imageZoom = Number(app.element?.querySelector("#dm-project-img-zoom")?.value) ?? 100;

    const defenseBonus = Number(app.element?.querySelector("#dm-project-mod-def")?.value) || 0;
    const incomeBonus = Number(app.element?.querySelector("#dm-project-mod-income")?.value) || 0;
    const unrestReduction = Number(app.element?.querySelector("#dm-project-mod-unrest")?.value) || 0;
    const populationBonus = Number(app.element?.querySelector("#dm-project-mod-pop")?.value) || 0;

    app.isProjectModalOpen = false;

    try {
      const { createProjectAction } = await import("../../features/projects/actions.js");
      const doc = await createProjectAction({
        domainUuid: app.selectedDomainUuid,
        name,
        category,
        description,
        workRequired,
        rateAmount,
        periodTicks: 1,
        status: "active"
      });

      if (doc?.uuid) {
        const projectRecord = recordIndex.get(RECORD_TYPES.PROJECT, doc.uuid);
        if (projectRecord) {
          const dec = decodeRecord(projectRecord);
          const data = foundry.utils.deepClone(dec.data);
          data.tier = tier;
          data.image = image;
          data.imageFit = imageFit;
          data.imageHeight = imageHeight;
          data.imagePosX = imagePosX;
          data.imagePosY = imagePosY;
          data.imageZoom = imageZoom;
          data.modifiers = {
            defenseBonus,
            incomeBonus,
            unrestReduction,
            populationBonus
          };
          await updateRecord({ uuid: doc.uuid, recordType: RECORD_TYPES.PROJECT, data });
        }
      }

      tacticalAudio.playDataPulse();
      ui.notifications?.info(`Projeto "${name}" (Tier ${tier}) iniciado!`);
      app.render();
    } catch (err) {
      tacticalAudio.playAlertBeep();
      ui.notifications?.error(err.message || "Erro ao criar projeto.");
    }
  }

  static openEditProjectModal(app, event, target) {
    if (!game.user?.isGM) return;
    const projectUuid = getActionAttr(target, "uuid");
    if (!projectUuid) return;
    tacticalAudio.playPinClick(720);
    app.editingProjectUuid = projectUuid;
    app.isEditingProjectModal = true;
    app.render();
  }

  static cancelEditProjectModal(app) {
    tacticalAudio.playPinClick(400);
    app.isEditingProjectModal = false;
    app.editingProjectUuid = null;
    app.render();
  }

  static async submitEditProject(app) {
    if (!game.user?.isGM || !app.editingProjectUuid) return;
    const name = app.element?.querySelector("#dm-edit-proj-name")?.value?.trim() || "Obra";
    const category = app.element?.querySelector("#dm-edit-proj-category")?.value || "infraestrutura";
    const tier = Number(app.element?.querySelector("#dm-edit-proj-tier")?.value) || 1;
    const status = app.element?.querySelector("#dm-edit-proj-status")?.value || "active";
    const workRequired = Number(app.element?.querySelector("#dm-edit-proj-work")?.value) || 100;
    const workCompleted = Number(app.element?.querySelector("#dm-edit-proj-completed")?.value) || 0;
    const rateAmount = Number(app.element?.querySelector("#dm-edit-proj-rate")?.value) || 10;
    const image = app.element?.querySelector("#dm-edit-proj-img")?.value?.trim() || "";
    const imageFit = app.element?.querySelector("#dm-edit-proj-image-fit")?.value || "cover";
    const imageHeight = Number(app.element?.querySelector("#dm-edit-proj-image-height")?.value) || 180;
    const imagePosX = Number(app.element?.querySelector("#dm-edit-proj-image-pos-x")?.value) ?? 50;
    const imagePosY = Number(app.element?.querySelector("#dm-edit-proj-image-pos-y")?.value) ?? 50;
    const imageZoom = Number(app.element?.querySelector("#dm-edit-proj-image-zoom")?.value) ?? 100;
    const description = app.element?.querySelector("#dm-edit-proj-desc")?.value?.trim() || "";

    const defenseBonus = Number(app.element?.querySelector("#dm-edit-proj-mod-def")?.value) || 0;
    const incomeBonus = Number(app.element?.querySelector("#dm-edit-proj-mod-income")?.value) || 0;
    const unrestReduction = Number(app.element?.querySelector("#dm-edit-proj-mod-unrest")?.value) || 0;
    const populationBonus = Number(app.element?.querySelector("#dm-edit-proj-mod-pop")?.value) || 0;

    const targetUuid = app.editingProjectUuid;
    app.isEditingProjectModal = false;
    app.editingProjectUuid = null;

    try {
      const doc = recordIndex.get(RECORD_TYPES.PROJECT, targetUuid);
      if (!doc) throw new Error("Projeto não encontrado.");
      const dec = decodeRecord(doc);
      const data = foundry.utils.deepClone(dec.data);

      data.category = category;
      data.tier = tier;
      data.status = status;
      data.description = description;
      data.image = image;
      data.imageFit = imageFit;
      data.imageHeight = imageHeight;
      data.imagePosX = imagePosX;
      data.imagePosY = imagePosY;
      data.imageZoom = imageZoom;
      data.work = {
        required: workRequired,
        completed: Math.min(workRequired, workCompleted)
      };
      data.rate = {
        amount: rateAmount
      };
      data.modifiers = {
        defenseBonus,
        incomeBonus,
        unrestReduction,
        populationBonus
      };

      await updateRecord({
        uuid: targetUuid,
        recordType: RECORD_TYPES.PROJECT,
        name,
        data
      });

      tacticalAudio.playDataPulse();
      ui.notifications?.info(`Projeto "${name}" atualizado!`);
      app.render();
    } catch (err) {
      tacticalAudio.playAlertBeep();
      ui.notifications?.error(err.message || "Erro ao editar projeto.");
    }
  }

  static async evolveProject(app, event, target) {
    if (!game.user?.isGM) return;
    const projectUuid = target?.dataset?.uuid || getActionAttr(target, "uuid");
    if (!projectUuid) return;

    try {
      const doc = recordIndex.get(RECORD_TYPES.PROJECT, projectUuid);
      if (!doc) return;
      const dec = decodeRecord(doc);
      const data = foundry.utils.deepClone(dec.data);

      const oldTier = Number(data.tier) || 1;
      const newTier = oldTier + 1;
      const newWorkRequired = Math.round((data.work?.required || 100) * 1.5);

      data.tier = newTier;
      data.status = "active";
      data.work = {
        required: newWorkRequired,
        completed: 0
      };

      if (data.modifiers) {
        data.modifiers.defenseBonus = Math.round((data.modifiers.defenseBonus || 0) * 1.5);
        data.modifiers.incomeBonus = Math.round((data.modifiers.incomeBonus || 0) * 1.5);
        data.modifiers.unrestReduction = Math.round((data.modifiers.unrestReduction || 0) + 1);
        data.modifiers.populationBonus = Math.round((data.modifiers.populationBonus || 0) * 1.5);
      }

      await updateRecord({
        uuid: projectUuid,
        recordType: RECORD_TYPES.PROJECT,
        data
      });

      if (app.selectedDomainUuid) {
        const { addHistoryEvent } = await import("../../features/history/actions.js");
        await addHistoryEvent({
          domainUuid: app.selectedDomainUuid,
          title: `Evolução de Obra: ${doc.name} (Tier ${newTier})`,
          category: "project",
          summary: `A obra evoluiu para o Tier ${newTier}, ampliando os modificadores do território.`,
          details: `Construção expandida para o Tier ${newTier} com meta de ${newWorkRequired} de trabalho.`
        });
      }

      tacticalAudio.playTargetLock();
      ui.notifications?.info(`Obra "${doc.name}" evoluiu para o Tier ${newTier}!`);
      app.render();
    } catch (err) {
      tacticalAudio.playAlertBeep();
      ui.notifications?.error(err.message || "Erro ao evoluir obra.");
    }
  }

  static async deleteProject(app, event, target) {
    if (!game.user?.isGM) return;
    const projectUuid = getActionAttr(target, "uuid");
    if (!projectUuid) return;

    try {
      const { deleteProjectAction } = await import("../../features/projects/actions.js");
      await deleteProjectAction({ projectUuid });
      tacticalAudio.playRelayClick(false);
      ui.notifications?.info("Projeto removido!");
      app.render();
    } catch (err) {
      tacticalAudio.playAlertBeep();
      ui.notifications?.error(err.message || "Erro ao excluir projeto.");
    }
  }
}

export { ProjectModals as ProjectDialogs };

