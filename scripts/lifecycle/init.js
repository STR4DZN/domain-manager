import { MODULE_ID } from "../core/constants.js";
import { registerSettings } from "../core/settings.js";

export async function initModule() {
  registerSettings();

  const loadFn = globalThis.foundry?.applications?.handlebars?.loadTemplates ?? globalThis.loadTemplates;
  if (typeof loadFn === "function") {
    try {
      await loadFn([
        `modules/${MODULE_ID}/templates/parts/rail.hbs`,
        `modules/${MODULE_ID}/templates/parts/sidebar.hbs`,
        `modules/${MODULE_ID}/templates/parts/workspace-header.hbs`,
        `modules/${MODULE_ID}/templates/parts/overview-cards.hbs`,
        `modules/${MODULE_ID}/templates/parts/workspace-content.hbs`,
        `modules/${MODULE_ID}/templates/parts/footer.hbs`
      ]);
    } catch (err) {
      console.warn(`[${MODULE_ID}] Aviso ao pré-carregar templates parciais:`, err);
    }
  }

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
