import { ERROR_CODES, ModuleError } from "../core/errors.js";

/**
 * Retorna o GM ativo escolhido pelo Foundry como autoridade primária.
 * O uso de uma única autoridade evita que múltiplos clientes GM executem
 * o mesmo avanço temporal ou outra mutação global simultaneamente.
 */
export function getPrimaryActiveGM() {
  return globalThis.game?.users?.activeGM ?? null;
}

export function isPrimaryActiveGM(user = globalThis.game?.user) {
  const primary = getPrimaryActiveGM();
  return Boolean(user?.isGM && primary && user.id === primary.id);
}

export function assertPrimaryActiveGM(user = globalThis.game?.user) {
  if (!user?.isGM) {
    throw new ModuleError(
      ERROR_CODES.PERMISSION,
      "A operação exige autoridade de Mestre (GM)."
    );
  }

  const primary = getPrimaryActiveGM();
  if (!primary) {
    throw new ModuleError(
      ERROR_CODES.AUTHORITY_UNAVAILABLE,
      "Nenhum Mestre ativo está disponível como autoridade primária."
    );
  }

  if (primary.id !== user.id) {
    throw new ModuleError(
      ERROR_CODES.AUTHORITY_UNAVAILABLE,
      `Esta operação deve ser executada pelo Mestre primário ativo (${primary.name ?? primary.id}).`
    );
  }

  return primary;
}
