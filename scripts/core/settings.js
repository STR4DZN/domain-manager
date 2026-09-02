import {
  MODULE_ID,
  SETTINGS
} from "./constants.js";

const DEFAULT_RESOURCE_CATALOG =
  Object.freeze({
    version: 1,
    resources: []
  });

export function registerSettings() {
  game.settings.register(
    MODULE_ID,
    SETTINGS.DATA_FOLDER_ID,
    {
      name: `${MODULE_ID}.dataFolderId`,
      scope: "world",
      config: false,
      type: String,
      default: ""
    }
  );

  game.settings.register(
    MODULE_ID,
    SETTINGS.RESOURCE_CATALOG,
    {
      name: "Catálogo de Recursos",
      hint: "Definições globais dos recursos usados pelos Domínios.",
      scope: "world",
      config: false,
      type: Object,
      default: DEFAULT_RESOURCE_CATALOG,

      onChange: () => {
        Hooks.callAll(
          `${MODULE_ID}.resourceCatalogChanged`
        );
      }
    }
  );

  game.settings.register(
    MODULE_ID,
    SETTINGS.SECONDS_PER_TICK,
    {
      name: "Segundos por Tick de Domínio",
      hint: "Duração no tempo do mundo correspondente a 1 tick de simulação (padrão: 86400s = 1 dia; 3600s = 1 hora).",
      scope: "world",
      config: true,
      type: Number,
      default: 86400
    }
  );

  game.settings.register(
    MODULE_ID,
    SETTINGS.SYNC_TIMEKEEPING,
    {
      name: "Sincronizar com Simple Timekeeping / Tempo do Mundo",
      hint: "Avança automaticamente o relógio e calendário do Simple Timekeeping / Foundry World Time ao avançar o tempo dos Domínios.",
      scope: "world",
      config: true,
      type: Boolean,
      default: true
    }
  );
}

export function getResourceCatalogSetting() {
  const value = game.settings.get(
    MODULE_ID,
    SETTINGS.RESOURCE_CATALOG
  );

  return foundry.utils.deepClone(
    value ?? DEFAULT_RESOURCE_CATALOG
  );
}

export async function setResourceCatalogSetting(
  catalog
) {
  return game.settings.set(
    MODULE_ID,
    SETTINGS.RESOURCE_CATALOG,
    foundry.utils.deepClone(catalog)
  );
}

export function getSecondsPerTickSetting() {
  try {
    const value = game.settings.get(MODULE_ID, SETTINGS.SECONDS_PER_TICK);
    return Math.max(1, Number(value) || 86400);
  } catch (_err) {
    return 86400;
  }
}

export function getSyncTimekeepingSetting() {
  try {
    return Boolean(game.settings.get(MODULE_ID, SETTINGS.SYNC_TIMEKEEPING));
  } catch (_err) {
    return true;
  }
}
