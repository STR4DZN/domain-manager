import { getSecondsPerTickSetting, getSyncTimekeepingSetting } from "../core/settings.js";

export const SIMPLE_TIMEKEEPING_ID = "simple-timekeeping";

export function isSimpleTimekeepingActive() {
  return Boolean(globalThis.game?.modules?.get(SIMPLE_TIMEKEEPING_ID)?.active);
}

export function getTimekeepingStatus() {
  const isSimpleActive = isSimpleTimekeepingActive();
  const secondsPerTick = getSecondsPerTickSetting();
  const syncEnabled = getSyncTimekeepingSetting();
  
  let label = "1 dia (86.400s)";
  if (secondsPerTick === 3600) label = "1 hora (3.600s)";
  else if (secondsPerTick === 86400) label = "1 dia (86.400s)";
  else if (secondsPerTick === 604800) label = "1 semana (604.800s)";
  else if (secondsPerTick === 60) label = "1 minuto (60s)";
  else label = String(secondsPerTick) + "s";
  
  return {
    isSimpleActive,
    secondsPerTick,
    syncEnabled,
    tickDurationLabel: label
  };
}

let isDomainManagerAdvancingTime = false;
let accumulatedSeconds = 0;
let isAdvancingFromHook = false;

export async function syncWorldTimeAdvance({ deltaTicks = 1 } = {}) {
  const syncEnabled = getSyncTimekeepingSetting();
  if (!syncEnabled) {
    return { advanced: false, deltaSeconds: 0 };
  }
  
  const ticks = Math.max(1, Math.floor(Number(deltaTicks) || 1));
  const secondsPerTick = getSecondsPerTickSetting();
  const deltaSeconds = ticks * secondsPerTick;
  
  if (deltaSeconds <= 0) {
    return { advanced: false, deltaSeconds: 0 };
  }

  isDomainManagerAdvancingTime = true;
  
  try {
    const simpleTimekeepingApi = globalThis.ui?.simpleTimekeeping
      || globalThis.game?.modules?.get(SIMPLE_TIMEKEEPING_ID)?.api
      || globalThis.SimpleTimekeeping;

    if (simpleTimekeepingApi && typeof simpleTimekeepingApi.advanceTime === "function") {
      await simpleTimekeepingApi.advanceTime(deltaSeconds);
    } else if (globalThis.game?.time?.advance && typeof globalThis.game.time.advance === "function") {
      await globalThis.game.time.advance(deltaSeconds);
    }
  } catch (err) {
    console.warn("DomainManager | Aviso ao sincronizar tempo com o mundo:", err);
  } finally {
    setTimeout(() => {
      isDomainManagerAdvancingTime = false;
    }, 150);
  }
  
  return { advanced: true, deltaSeconds };
}

/**
 * Registra o hook do Foundry para escutar avanços de tempo feitos pelo Simple Timekeeping ou pelo Foundry.
 */
export function registerTimekeepingHooks() {
  Hooks.on("updateWorldTime", async (worldTime, delta) => {
    // Apenas o GM ativo deve executar mutações no mundo
    if (!globalThis.game?.user?.isGM) return;
    if (!getSyncTimekeepingSetting()) return;
    if (isDomainManagerAdvancingTime || isAdvancingFromHook) return;

    const deltaSecs = Number(delta) || 0;
    if (deltaSecs <= 0) return;

    const secondsPerTick = getSecondsPerTickSetting();
    accumulatedSeconds += deltaSecs;

    if (accumulatedSeconds >= secondsPerTick) {
      const ticksToAdvance = Math.floor(accumulatedSeconds / secondsPerTick);
      accumulatedSeconds = accumulatedSeconds % secondsPerTick;

      isAdvancingFromHook = true;
      try {
        const { executeAdvanceRun } = await import("../simulation/advance-run.js");
        await executeAdvanceRun({ deltaTicks: ticksToAdvance, fromWorldTimeHook: true });
        console.info(`[domain-manager] Avanço automático via WorldTime/SimpleTimekeeping: +${ticksToAdvance} tick(s) (+${deltaSecs}s)`);
      } catch (err) {
        console.error("DomainManager | Erro no avanço automático via updateWorldTime:", err);
      } finally {
        isAdvancingFromHook = false;
      }
    }
  });
}

