import { MODULE_ID } from "../core/constants.js";
import { registerSettings } from "../core/settings.js";

export function initModule() {
  registerSettings();

  if (globalThis.game?.keybindings?.register) {
    game.keybindings.register(MODULE_ID, "openDomainManager", {
      name: "Abrir Gerenciador de Domínios",
      hint: "Abre ou foca a janela do Gerenciador de Domínios",
      editable: [
        { key: "KeyD", modifiers: ["Alt"] },
        { key: "KeyD", modifiers: ["Shift"] }
      ],
      onDown: () => {
        import("../ui/app.js").then((m) => m.openDomainManager());
        return true;
      },
      restricted: false,
      precedence: globalThis.CONST?.KEYBINDING_PRECEDENCE?.NORMAL ?? 0
    });
  }

  console.info(`[${MODULE_ID}] init`);
}
