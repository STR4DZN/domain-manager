import { MODULE_TITLE } from "../core/constants.js";
import { openDomainManager } from "./app.js";

let hookRegistered = false;

/** Registra uma única ferramenta oficial no controle de Tokens. */
export function registerSceneControlHook() {
  if (hookRegistered) return;
  hookRegistered = true;

  Hooks.on("getSceneControlButtons", (controls) => {
    if (!controls) return;

    const tokenControl = Array.isArray(controls)
      ? controls.find((control) => control.name === "token")
      : controls.tokens ?? controls.token;

    if (!tokenControl) return;

    const tool = {
      name: "domain-manager",
      title: MODULE_TITLE,
      icon: "fas fa-sitemap",
      order: Array.isArray(tokenControl.tools)
        ? tokenControl.tools.length
        : Object.keys(tokenControl.tools ?? {}).length,
      visible: true,
      button: true,
      onChange: openDomainManager
    };

    if (Array.isArray(tokenControl.tools)) {
      if (!tokenControl.tools.some((item) => item.name === tool.name)) {
        tokenControl.tools.unshift(tool);
      }
      return;
    }

    if (tokenControl.tools && typeof tokenControl.tools === "object") {
      tokenControl.tools[tool.name] ??= tool;
    }
  });
}
