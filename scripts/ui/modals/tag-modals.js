/**
 * TagModals — Manipuladores de Tags de Domínio e Notificações/Alertas Táticos
 */

import { MODULE_ID, RECORD_TYPES } from "../../core/constants.js";
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

export class TagModals {
  /* --- Tags --- */
  static async removeTag(app, event, target) {
    if (!game.user?.isGM || !app.selectedDomainUuid) return;
    const tagToRemove = target?.dataset?.tag;
    if (!tagToRemove) return;

    try {
      tacticalAudio.playPinClick(300);
      const doc = recordIndex.get(RECORD_TYPES.DOMAIN, app.selectedDomainUuid);
      const record = decodeRecord(doc);
      const data = foundry.utils.deepClone(record.data);
      if (Array.isArray(data.identity?.tags)) {
        data.identity.tags = data.identity.tags.filter((t) => t !== tagToRemove);
        await updateRecord({
          uuid: app.selectedDomainUuid,
          recordType: RECORD_TYPES.DOMAIN,
          data
        });
        ui.notifications?.info(`Tag #${tagToRemove} removida!`);
        app.render();
      }
    } catch (err) {
      ui.notifications?.error(err.message || "Erro ao remover tag.");
    }
  }

  static openAddTagModal(app) {
    if (!game.user?.isGM || !app.selectedDomainUuid) return;
    tacticalAudio.playPinClick(640);
    app._closeAllModals?.() ?? TagModals.closeAllModals(app);
    app.isTagModalOpen = true;
    app.render();
  }

  static cancelTagModal(app) {
    tacticalAudio.playPinClick(380);
    app.isTagModalOpen = false;
    app.render();
  }

  static async submitAddTag(app) {
    if (!game.user?.isGM || !app.selectedDomainUuid) return;
    const form = app.element?.querySelector(".dm-dialog-card");
    const newTagsRaw = form?.querySelector("#dm-new-tag-input")?.value || "";
    const newTags = newTagsRaw.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);

    if (newTags.length === 0) {
      ui.notifications?.warn("Digite ao menos uma tag.");
      return;
    }

    app.isTagModalOpen = false;

    try {
      tacticalAudio.playDataPulse();
      const doc = recordIndex.get(RECORD_TYPES.DOMAIN, app.selectedDomainUuid);
      const record = decodeRecord(doc);
      const data = foundry.utils.deepClone(record.data);
      if (!Array.isArray(data.identity.tags)) data.identity.tags = [];
      for (const t of newTags) {
        if (!data.identity.tags.includes(t)) data.identity.tags.push(t);
      }
      await updateRecord({
        uuid: app.selectedDomainUuid,
        recordType: RECORD_TYPES.DOMAIN,
        data
      });
      ui.notifications?.info("Tags adicionadas com sucesso!");
      app.render();
    } catch (err) {
      ui.notifications?.error(err.message || "Erro ao adicionar tags.");
    }
  }

  /* --- Notificações --- */
  static openAddNotificationModal(app) {
    if (!game.user?.isGM) return;
    tacticalAudio.playPinClick(640);
    app._closeAllModals?.() ?? TagModals.closeAllModals(app);
    app.isNotificationModalOpen = true;
    app.render();
  }

  static cancelNotificationModal(app) {
    tacticalAudio.playPinClick(380);
    app.isNotificationModalOpen = false;
    app.render();
  }

  static async submitNotification(app) {
    if (!game.user?.isGM || !app.selectedDomainUuid) return;
    const title = app.element?.querySelector("#dm-notif-title")?.value?.trim();
    const message = app.element?.querySelector("#dm-notif-message")?.value?.trim() || "";
    const severity = app.element?.querySelector("#dm-notif-severity")?.value || "info";
    const targetTab = app.element?.querySelector("#dm-notif-target-tab")?.value || "overview";

    if (!title) {
      ui.notifications?.warn("Informe o título da notificação.");
      return;
    }

    try {
      tacticalAudio.playDataPulse();
      const doc = recordIndex.get(RECORD_TYPES.DOMAIN, app.selectedDomainUuid);
      const record = decodeRecord(doc);
      const data = foundry.utils.deepClone(record.data);
      if (!Array.isArray(data.notifications)) data.notifications = [];

      data.notifications.unshift({
        localId: `notif_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        title,
        message,
        category: "gm",
        severity,
        targetTab,
        timestamp: Date.now(),
        dismissed: false,
        readByUserIds: []
      });

      await updateRecord({
        uuid: app.selectedDomainUuid,
        recordType: RECORD_TYPES.DOMAIN,
        data
      });

      app.isNotificationModalOpen = false;
      ui.notifications?.info("Notificação publicada com sucesso!");
      app.render();
    } catch (err) {
      ui.notifications?.error(err.message || "Erro ao publicar notificação.");
    }
  }

  static async dismissNotification(app, event, target) {
    if (!app.selectedDomainUuid) return;
    const localId = getActionAttr(target, "local-id");
    if (!localId) return;

    try {
      tacticalAudio.playPinClick(400);
      if (game.user.isGM) {
        const doc = recordIndex.get(RECORD_TYPES.DOMAIN, app.selectedDomainUuid);
        const record = decodeRecord(doc);
        const data = foundry.utils.deepClone(record.data);
        if (Array.isArray(data.notifications)) {
          const notif = data.notifications.find((n) => n.localId === localId);
          if (notif) {
            if (!Array.isArray(notif.readByUserIds)) notif.readByUserIds = [];
            const userId = game.user?.id || "unknown";
            if (!notif.readByUserIds.includes(userId)) notif.readByUserIds.push(userId);
            await updateRecord({
              uuid: app.selectedDomainUuid,
              recordType: RECORD_TYPES.DOMAIN,
              data
            });
          }
        }
      } else {
        const existing = game.user.getFlag ? (game.user.getFlag(MODULE_ID, "readNotificationIds") || []) : [];
        if (!existing.includes(localId)) {
          await game.user.setFlag(MODULE_ID, "readNotificationIds", [...existing, localId]);
        }
      }

      ui.notifications?.info("Notificação marcada como vista.");
      app.render();
    } catch (err) {
      ui.notifications?.error(err.message || "Erro ao dispensar notificação.");
    }
  }

  static async dismissAllNotifications(app) {
    if (!app.selectedDomainUuid) return;
    try {
      tacticalAudio.playPinClick(400);
      const doc = recordIndex.get(RECORD_TYPES.DOMAIN, app.selectedDomainUuid);
      const record = decodeRecord(doc);
      const data = foundry.utils.deepClone(record.data);
      if (!Array.isArray(data.notifications) || !data.notifications.length) return;

      const userId = game.user?.id || "unknown";
      let count = 0;
      for (const n of data.notifications) {
        if (!Array.isArray(n.readByUserIds)) n.readByUserIds = [];
        if (!n.readByUserIds.includes(userId)) {
          n.readByUserIds.push(userId);
          count++;
        }
      }

      if (count > 0) {
        await updateRecord({
          uuid: app.selectedDomainUuid,
          recordType: RECORD_TYPES.DOMAIN,
          data
        });
        ui.notifications?.info(`${count} notificação(ões) marcada(s) como lida(s).`);
        app.render();
      }
    } catch (err) {
      ui.notifications?.error(err.message || "Erro ao dispensar notificações.");
    }
  }

  static async deleteNotification(app, event, target) {
    if (!game.user?.isGM || !app.selectedDomainUuid) return;
    const localId = getActionAttr(target, "local-id");
    if (!localId) return;

    try {
      tacticalAudio.playPinClick(300);
      const doc = recordIndex.get(RECORD_TYPES.DOMAIN, app.selectedDomainUuid);
      const record = decodeRecord(doc);
      const data = foundry.utils.deepClone(record.data);
      if (!Array.isArray(data.notifications)) return;

      data.notifications = data.notifications.filter((n) => n.localId !== localId);
      await updateRecord({
        uuid: app.selectedDomainUuid,
        recordType: RECORD_TYPES.DOMAIN,
        data
      });

      ui.notifications?.info("Notificação excluída.");
      app.render();
    } catch (err) {
      ui.notifications?.error(err.message || "Erro ao excluir notificação.");
    }
  }

  static toggleNotificationsHistory(app) {
    tacticalAudio.playRelayClick();
    app.showNotificationsHistory = !app.showNotificationsHistory;
    app.render();
  }

  static closeAllModals(app) {
    app.isTagModalOpen = false;
    app.isNotificationModalOpen = false;
  }
}
