/**
 * SimulationModals — Manipuladores de Avanço Temporal, Rolagem de Eventos e Simulação
 */

import { tacticalAudio } from "../audio/tactical-audio.js";

export class SimulationModals {
  static openAdvanceModal(app) {
    if (!game.user?.isGM) {
      ui.notifications?.warn("Apenas o Mestre pode avançar o tempo.");
      return;
    }
    tacticalAudio.playPinClick(700);
    app._closeAllModals?.() ?? SimulationModals.closeAllModals(app);
    app.isAdvancingTimeModal = true;
    app.render();
  }

  static cancelAdvanceModal(app) {
    tacticalAudio.playPinClick(380);
    app.isAdvancingTimeModal = false;
    app.render();
  }

  static async quickAdvanceTicks(app, event, target) {
    if (!game.user?.isGM) return;
    const ticks = Number(target?.dataset?.ticks) || 1;
    app.advanceCustomTicks = ticks;
    await SimulationModals.submitAdvance(app);
  }

  static async submitAdvance(app) {
    if (!game.user?.isGM) return;
    const input = app.element?.querySelector("#dm-advance-ticks-input");
    const ticks = Math.max(1, Math.floor(Number(input ? input.value : app.advanceCustomTicks) || 1));
    app.isAdvancingTimeModal = false;

    try {
      tacticalAudio.playDataPulse();
      const { executeAdvanceRun } = await import("../../simulation/advance-run.js");
      await executeAdvanceRun({ deltaTicks: ticks });
      ui.notifications?.info(`Tempo avançado com sucesso: +${ticks} tick(s)!`);
      app.render();
    } catch (err) {
      ui.notifications?.error(err.message || "Erro ao avançar tempo.");
    }
  }

  static openEventModal(app) {
    if (!game.user?.isGM) {
      ui.notifications?.warn("Apenas o Mestre pode rolar eventos.");
      return;
    }
    if (!app.selectedDomainUuid) {
      ui.notifications?.warn("Selecione um domínio primeiro.");
      return;
    }
    tacticalAudio.playPinClick(720);
    app._closeAllModals?.() ?? SimulationModals.closeAllModals(app);
    app.isEventModalOpen = true;
    app.render();
  }

  static cancelEventModal(app) {
    tacticalAudio.playPinClick(380);
    app.isEventModalOpen = false;
    app.render();
  }

  static async submitCustomRollEvent(app) {
    if (!game.user?.isGM || !app.selectedDomainUuid) return;
    const form = app.element?.querySelector(".dm-dialog-card");
    const category = form?.querySelector("#dm-event-filter-category")?.value || null;
    app.isEventModalOpen = false;

    try {
      tacticalAudio.playDataPulse();
      const { executeRollAndApplyEvent } = await import("../../features/events/actions.js");
      await executeRollAndApplyEvent({
        domainUuid: app.selectedDomainUuid,
        category: category === "all" ? null : category
      });
      ui.notifications?.info("Evento rolado e publicado no chat!");
      app.render();
    } catch (err) {
      ui.notifications?.error(err.message || "Erro ao rolar evento.");
    }
  }

  static async submitAuthorEvent(app) {
    if (!game.user?.isGM || !app.selectedDomainUuid) return;
    const form = app.element?.querySelector(".dm-dialog-card");
    const title = form?.querySelector("#dm-author-event-title")?.value?.trim() || "Evento do Mestre";
    const description = form?.querySelector("#dm-author-event-desc")?.value?.trim() || "Um evento marcante alterou os rumos do território.";
    const outcomeLabel = form?.querySelector("#dm-author-event-outcome")?.value?.trim() || "Desfecho aplicado pelo Mestre";
    const stockBonusAmount = Number(form?.querySelector("#dm-author-event-stock")?.value) || 0;
    const conditionName = form?.querySelector("#dm-author-event-cond-name")?.value?.trim();
    const conditionTicks = Number(form?.querySelector("#dm-author-event-cond-ticks")?.value) || 3;
    const severity = form?.querySelector("#dm-author-event-severity")?.value || "neutral";

    app.isEventModalOpen = false;

    try {
      tacticalAudio.playDataPulse();
      const { executeApplyEventOutcome } = await import("../../features/events/actions.js");
      const customEvent = {
        id: `custom_${Date.now()}`,
        title,
        description,
        category: "custom",
        severity,
        outcomes: [
          {
            label: outcomeLabel,
            description: outcomeLabel,
            stockBonus: stockBonusAmount !== 0 ? { amount: stockBonusAmount * 100 } : null,
            condition: conditionName ? {
              name: conditionName,
              description: `Condição gerada por evento: ${title}`,
              durationTicks: conditionTicks
            } : null,
            chronicleTitle: title
          }
        ]
      };

      await executeApplyEventOutcome({
        domainUuid: app.selectedDomainUuid,
        event: customEvent,
        outcomeIndex: 0,
        postToChat: true
      });

      ui.notifications?.info(`Evento "${title}" aplicado com sucesso!`);
      app.render();
    } catch (err) {
      ui.notifications?.error(err.message || "Erro ao aplicar evento customizado.");
    }
  }

  static closeAllModals(app) {
    app.isAdvancingTimeModal = false;
    app.isEventModalOpen = false;
  }
}
