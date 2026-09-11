import { MODULE_ID } from "../core/constants.js";
import { registerSettings } from "../core/settings.js";

export async function initModule() {
  registerSettings();

  if (globalThis.game?.keybindings?.register) {
    game.keybindings.register(MODULE_ID, "openDomainManager", {
      name: "Abrir Domain Manager",
      hint: "Abre ou foca o Strategic Operations System",
      editable: [
        { key: "KeyD", modifiers: ["Alt"] },
        { key: "KeyD", modifiers: ["Shift"] }
      ],
      onDown: () => {
        import("../ui/app.js").then((module) => module.openDomainManager());
        return true;
      },
      restricted: false,
      precedence: globalThis.CONST?.KEYBINDING_PRECEDENCE?.NORMAL ?? 0
    });
  }

  console.info(`[${MODULE_ID}] init`);
}
