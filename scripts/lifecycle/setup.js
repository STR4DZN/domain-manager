import { MODULE_ID } from "../core/constants.js";

export function setupModule() {
  const socketlibActive = game.modules.get("socketlib")?.active === true;

  if (!socketlibActive) {
    console.error(
      `[${MODULE_ID}] Dependência obrigatória socketlib não está ativa.`
    );
    return;
  }

  console.info(`[${MODULE_ID}] setup | socketlib ativo: ${socketlibActive}`);
}
