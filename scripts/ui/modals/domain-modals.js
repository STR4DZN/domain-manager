/**
 * DomainDialogs — Manipuladores de Diálogos e Ações de Domínios
 * Criação, Edição, Exclusão, Galeria e Condições.
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

export class DomainDialogs {
  static openCreateDomain(app) {
    if (!game.user?.isGM) return;
    tacticalAudio.playPinClick(720);
    app.isCreatingDomain = true;
    app.render();
  }

  static cancelCreateDomain(app) {
    tacticalAudio.playPinClick(400);
    app.isCreatingDomain = false;
    app.render();
  }

  static async submitCreateDomain(app) {
    if (!game.user?.isGM) return;
    const form = app.element?.querySelector(".dm-dialog-card");
    const name = form?.querySelector("#dm-new-domain-name")?.value?.trim() || "Nova Base";
    const category = form?.querySelector("#dm-new-domain-category")?.value?.trim() || "settlement";
    const nature = form?.querySelector("#dm-new-domain-nature")?.value || "physical";
    const tagsRaw = form?.querySelector("#dm-new-domain-tags")?.value || "";
    const crestImg = form?.querySelector("#dm-new-domain-crest")?.value?.trim() || "";
    const description = form?.querySelector("#dm-new-domain-description")?.value || "";
    const parentUuid = form?.querySelector("#dm-new-domain-parent")?.value || null;

    const controllerCheckboxes = form?.querySelectorAll(".dm-create-domain-controller:checked");
    const controllerIds = Array.from(controllerCheckboxes || []).map((cb) => cb.value);

    const tags = tagsRaw.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);

    try {
      const { createDomainAction } = await import("../../features/domains/actions.js");
      const doc = await createDomainAction({
        name,
        category,
        nature,
        tags,
        description,
        controllerIds,
        locatedInUuid: parentUuid,
        administrativeParentUuid: parentUuid
      });

      if (doc?.uuid) {
        const imageFit = form?.querySelector("#dm-new-domain-image-fit")?.value || "cover";
        const imageHeight = Number(form?.querySelector("#dm-new-domain-image-height")?.value) || 200;
        const imagePosX = form?.querySelector("#dm-new-domain-image-pos-x")?.value != null ? Number(form.querySelector("#dm-new-domain-image-pos-x").value) : 50;
        const imagePosY = form?.querySelector("#dm-new-domain-image-pos-y")?.value != null ? Number(form.querySelector("#dm-new-domain-image-pos-y").value) : 50;
        const imageZoom = form?.querySelector("#dm-new-domain-image-zoom")?.value != null ? Number(form.querySelector("#dm-new-domain-image-zoom").value) : 100;

        if (crestImg) {
          const createdDoc = recordIndex.get(RECORD_TYPES.DOMAIN, doc.uuid);
          if (createdDoc) {
            const dec = decodeRecord(createdDoc);
            const data = foundry.utils.deepClone(dec.data);
            data.identity.crestMedia = { path: crestImg };
            data.visuals = {
              ...(data.visuals || {}),
              crestImg,
              image: crestImg,
              imageFit,
              imageHeight,
              imagePosX,
              imagePosY,
              imageZoom,
              imagePosition: "center",
              gallery: [crestImg]
            };
            await updateRecord({ uuid: doc.uuid, recordType: RECORD_TYPES.DOMAIN, data });
            app.activeGalleryImage = crestImg;
          }
        }

        tacticalAudio.playDataPulse();
        app.selectedDomainUuid = doc.uuid;
        app.isCreatingDomain = false;
        ui.notifications?.info(`Domínio "${name}" criado com sucesso!`);
        app.render();
      }
    } catch (err) {
      tacticalAudio.playAlertBeep();
      ui.notifications?.error(err.message || "Erro ao criar domínio.");
    }
  }

  static openEditDomain(app) {
    if (!game.user?.isGM || !app.selectedDomainUuid) return;
    tacticalAudio.playPinClick(720);
    app.isEditingDomain = true;
    app.render();
  }

  static cancelEditDomain(app) {
    tacticalAudio.playPinClick(400);
    app.isEditingDomain = false;
    app.render();
  }

  static async submitEditDomain(app) {
    if (!game.user?.isGM || !app.selectedDomainUuid) return;
    const name = app.element?.querySelector("#dm-edit-domain-name")?.value?.trim();
    const category = app.element?.querySelector("#dm-edit-domain-category")?.value?.trim() || "territory";
    const nature = app.element?.querySelector("#dm-edit-domain-nature")?.value || "physical";
    const crestImg = app.element?.querySelector("#dm-edit-domain-crest")?.value?.trim() || "";
    const imageFit = app.element?.querySelector("#dm-edit-domain-image-fit")?.value || "cover";
    const imageHeight = Number(app.element?.querySelector("#dm-edit-domain-image-height")?.value) || 200;
    const imagePosX = app.element?.querySelector("#dm-edit-domain-image-pos-x")?.value != null ? Number(app.element.querySelector("#dm-edit-domain-image-pos-x").value) : 50;
    const imagePosY = app.element?.querySelector("#dm-edit-domain-image-pos-y")?.value != null ? Number(app.element.querySelector("#dm-edit-domain-image-pos-y").value) : 50;
    const imageZoom = app.element?.querySelector("#dm-edit-domain-image-zoom")?.value != null ? Number(app.element.querySelector("#dm-edit-domain-image-zoom").value) : 100;
    const imagePosition = "center";
    const tagsRaw = app.element?.querySelector("#dm-edit-domain-tags")?.value || "";
    const description = app.element?.querySelector("#dm-edit-domain-description")?.value || "";
    const sustenanceEnabled = app.element?.querySelector("#dm-edit-domain-sustenance-enabled")?.value !== "false";
    const foodPer100 = Number(app.element?.querySelector("#dm-edit-domain-food-rate")?.value) || 1.0;
    const waterPer100 = Number(app.element?.querySelector("#dm-edit-domain-water-rate")?.value) || 1.0;
    const guardUpkeep = Number(app.element?.querySelector("#dm-edit-domain-guard-upkeep")?.value) || 1.0;
    let parentUuid = app.element?.querySelector("#dm-edit-domain-parent")?.value || null;
    if (parentUuid === app.selectedDomainUuid) {
      parentUuid = null;
    }
    const defenseScore = Number(app.element?.querySelector("#dm-edit-domain-defense")?.value) || 10;
    const guardCount = Number(app.element?.querySelector("#dm-edit-domain-guards")?.value) || 0;

    const controllerCheckboxes = app.element?.querySelectorAll(".dm-edit-domain-controller:checked");
    const controllers = Array.from(controllerCheckboxes || []).map((cb) => cb.value);

    if (!name) {
      ui.notifications?.warn("O nome do domínio não pode ser vazio.");
      return;
    }

    const tags = tagsRaw.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);

    try {
      const doc = recordIndex.get(RECORD_TYPES.DOMAIN, app.selectedDomainUuid);
      if (!doc) throw new Error("Domínio não encontrado no índice.");
      const record = decodeRecord(doc);
      const data = foundry.utils.deepClone(record.data);

      data.identity = {
        ...data.identity,
        category,
        nature,
        tags,
        description,
        crestMedia: crestImg ? { path: crestImg } : null
      };
      data.visuals = {
        ...(data.visuals || {}),
        crestImg,
        image: crestImg,
        imageFit,
        imageHeight,
        imagePosX,
        imagePosY,
        imageZoom,
        imagePosition
      };
      data.economy = data.economy || {};
      data.economy.sustenanceSettings = {
        enabled: sustenanceEnabled,
        foodPer100,
        waterPer100,
        guardUpkeep
      };
      data.hierarchy = {
        ...data.hierarchy,
        locatedInUuid: parentUuid,
        administrativeParentUuid: parentUuid
      };
      data.security = {
        ...data.security,
        defenseScore,
        defenseRating: defenseScore,
        guardCount
      };
      data.governance = {
        ...data.governance,
        controllers
      };

      await updateRecord({
        uuid: app.selectedDomainUuid,
        recordType: RECORD_TYPES.DOMAIN,
        name,
        data,
        controllerIds: controllers
      });

      tacticalAudio.playDataPulse();
      app.activeGalleryImage = crestImg;
      app.isEditingDomain = false;
      ui.notifications?.info(`Domínio "${name}" atualizado com sucesso!`);
      app.render();
    } catch (err) {
      tacticalAudio.playAlertBeep();
      ui.notifications?.error(err.message || "Erro ao editar domínio.");
    }
  }

  static openDeleteDomainModal(app) {
    if (!game.user?.isGM || !app.selectedDomainUuid) return;
    tacticalAudio.playAlertBeep();
    app.isDeletingDomain = true;
    app.render();
  }

  static cancelDeleteDomainModal(app) {
    tacticalAudio.playPinClick(400);
    app.isDeletingDomain = false;
    app.render();
  }

  static async confirmDeleteDomain(app) {
    if (!game.user?.isGM || !app.selectedDomainUuid) return;
    const targetUuid = app.selectedDomainUuid;
    app.isDeletingDomain = false;

    try {
      const { deleteDomainAction } = await import("../../features/domains/actions.js");
      await deleteDomainAction({ domainUuid: targetUuid });
      tacticalAudio.playRelayClick(false);
      app.selectedDomainUuid = null;
      ui.notifications?.info("Domínio excluído com sucesso!");
      app.render();
    } catch (err) {
      tacticalAudio.playAlertBeep();
      ui.notifications?.error(err.message || "Erro ao excluir domínio.");
    }
  }

  static async addGalleryImage(app) {
    if (!game.user?.isGM || !app.selectedDomainUuid) return;
    const input = app.element?.querySelector("#dm-new-gallery-image-url");
    const url = input?.value?.trim();
    if (!url) return;

    const doc = recordIndex.get(RECORD_TYPES.DOMAIN, app.selectedDomainUuid);
    if (!doc) return;
    const record = decodeRecord(doc);
    const data = foundry.utils.deepClone(record.data);
    data.visuals = data.visuals || {};
    data.visuals.gallery = data.visuals.gallery || [];
    if (!data.visuals.gallery.includes(url)) {
      data.visuals.gallery.push(url);
      await updateRecord({ uuid: app.selectedDomainUuid, recordType: RECORD_TYPES.DOMAIN, data });
      tacticalAudio.playDataPulse();
      app.activeGalleryImage = url;
      app.render();
    }
  }

  static async removeGalleryImage(app, event, target) {
    if (!game.user?.isGM || !app.selectedDomainUuid) return;
    const url = getActionAttr(target, "url");
    if (!url) return;

    const doc = recordIndex.get(RECORD_TYPES.DOMAIN, app.selectedDomainUuid);
    if (!doc) return;
    const record = decodeRecord(doc);
    const data = foundry.utils.deepClone(record.data);
    data.visuals = data.visuals || {};
    data.visuals.gallery = (data.visuals.gallery || []).filter((u) => u !== url);
    await updateRecord({ uuid: app.selectedDomainUuid, recordType: RECORD_TYPES.DOMAIN, data });
    tacticalAudio.playRelayClick(false);
    if (app.activeGalleryImage === url) {
      app.activeGalleryImage = data.visuals.gallery[0] || data.visuals.crestImg || null;
    }
    app.render();
  }

  static selectGalleryImage(app, event, target) {
    const url = getActionAttr(target, "url");
    if (url) {
      tacticalAudio.playTargetLock();
      app.activeGalleryImage = url;
      app.render();
    }
  }

  static async deleteCondition(app, event, target) {
    if (!game.user?.isGM || !app.selectedDomainUuid) return;
    const id = getActionAttr(target, "id");
    if (!id) return;

    const doc = recordIndex.get(RECORD_TYPES.DOMAIN, app.selectedDomainUuid);
    if (!doc) return;
    const record = decodeRecord(doc);
    const data = foundry.utils.deepClone(record.data);
    data.conditions = (data.conditions || []).filter((c) => c.id !== id);
    await updateRecord({ uuid: app.selectedDomainUuid, recordType: RECORD_TYPES.DOMAIN, data });
    tacticalAudio.playRelayClick(false);
    ui.notifications?.info("Condição tática removida.");
    app.render();
  }
}
