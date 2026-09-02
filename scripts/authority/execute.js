import { ModuleError, ERROR_CODES } from "../core/errors.js";
import { getAuthoritySocket } from "./socket.js";

export async function pingAuthority() {
  const socket = getAuthoritySocket();

  if (!socket) {
    throw new ModuleError(
      ERROR_CODES.AUTHORITY_UNAVAILABLE,
      "socketlib ainda não está pronto."
    );
  }

  if (game.user.isGM) {
    return {
      ok: true,
      executedBy: game.user.id,
      callerUserId: game.user.id
    };
  }

  return socket.executeAsGM("authority.ping");
}
export async function createRequestAuthoritatively(
  payload
) {
  const socket = getAuthoritySocket();

  if (!socket) {
    throw new ModuleError(
      ERROR_CODES.AUTHORITY_UNAVAILABLE,
      "A autoridade do módulo ainda não está pronta."
    );
  }

  const withOperationId = {
    ...payload,
    operationId:
      payload.operationId
      || foundry.utils.randomID()
  };

  if (game.user.isGM) {
    const {
      performCreateRequest
    } = await import(
      "../features/requests/actions.js"
    );

    return performCreateRequest(
      withOperationId,
      game.user.id
    );
  }

  if (!game.users.activeGM) {
    throw new ModuleError(
      ERROR_CODES.AUTHORITY_UNAVAILABLE,
      "Nenhum Mestre ativo está disponível para receber esta solicitação."
    );
  }

  try {
    return await socket.executeAsGM(
      "request.create",
      withOperationId
    );
  } catch (error) {
    console.error(
      "[domain-manager] request.create falhou no GM remoto:",
      error
    );

    throw new ModuleError(
      ERROR_CODES.SYSTEM,
      "O Mestre foi encontrado, mas ocorreu um erro ao registrar a solicitação. Verifique o console do GM.",
      { cause: error }
    );
  }
}
