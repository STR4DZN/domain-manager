import { ModuleError, ERROR_CODES } from "../core/errors.js";
import { getAuthoritySocket } from "./socket.js";
import { dispatchAuthoritativeCommand } from "../commands/execute.js";
import { isPrimaryActiveGM } from "./primary-gm.js";

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
export async function createRequestAuthoritatively(payload) {
  return executeCommandAuthoritatively({
    commandType: "request.create",
    payload: {
      domain: payload.domain ?? {
        recordType: "domain",
        uuid: payload.primaryDomainUuid ?? null,
        entityId: payload.primaryDomainEntityId ?? null
      },
      type: payload.type,
      title: payload.title,
      intent: payload.intent,
      details: payload.details
    },
    operationId: payload.operationId || null
  });
}


export async function executeCommandAuthoritatively({
  commandType,
  payload = {},
  operationId = null
} = {}) {
  const socket = getAuthoritySocket();
  const envelope = {
    commandType,
    payload,
    operationId: operationId || foundry.utils.randomID()
  };

  if (isPrimaryActiveGM()) {
    return dispatchAuthoritativeCommand(envelope, { callerUserId: game.user.id });
  }

  if (!socket) {
    throw new ModuleError(
      ERROR_CODES.AUTHORITY_UNAVAILABLE,
      "A autoridade do módulo ainda não está pronta."
    );
  }
  if (!game.users.activeGM) {
    throw new ModuleError(
      ERROR_CODES.AUTHORITY_UNAVAILABLE,
      "Nenhum Mestre ativo está disponível para executar o comando."
    );
  }

  return socket.executeAsGM("command.execute", envelope);
}
