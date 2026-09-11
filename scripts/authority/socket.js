import { MODULE_ID } from "../core/constants.js";
import { dispatchAuthoritativeCommand } from "../commands/execute.js";

let moduleSocket = null;

function callerUserId(context) {
  return context?.socketdata?.userId ?? null;
}

function remotePing() {
  return {
    ok: true,
    executedBy: game.user.id,
    callerUserId: callerUserId(this)
  };
}

async function remoteCreateRequest(payload) {
  const userId = callerUserId(this);
  if (!userId) throw new Error("socketlib não informou o usuário de origem.");

  // Compatibility endpoint for callers from builds before Request entered the
  // generic Command Kernel. New UI uses command.execute directly.
  return dispatchAuthoritativeCommand({
    commandType: "request.create",
    operationId: payload.operationId || foundry.utils.randomID(),
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
    }
  }, { callerUserId: userId });
}

async function remoteExecuteCommand(envelope) {
  const userId = callerUserId(this);
  if (!userId) {
    throw new Error("socketlib não informou o usuário de origem.");
  }
  return dispatchAuthoritativeCommand(envelope, { callerUserId: userId });
}

export function registerAuthoritySocket() {
  if (moduleSocket) return moduleSocket;

  if (!globalThis.socketlib) {
    console.warn(
      `[${MODULE_ID}] socketlib global ainda não está disponível.`
    );
    return null;
  }

  const module = game.modules.get(MODULE_ID);

  console.info(
    `[${MODULE_ID}] registrando socket | version=${module?.version} | socket=${module?.socket}`
  );

  moduleSocket = socketlib.registerModule(MODULE_ID);

  if (!moduleSocket) {
    console.error(
      `[${MODULE_ID}] socketlib.registerModule retornou undefined.`
    );
    return null;
  }

  moduleSocket.register("authority.ping", remotePing);
  moduleSocket.register(
    "request.create",
    remoteCreateRequest
  );
  moduleSocket.register(
    "command.execute",
    remoteExecuteCommand
  );

  console.info(`[${MODULE_ID}] socketlib registrado.`);
  return moduleSocket;
}

export function getAuthoritySocket() {
  return moduleSocket;
}

export function isAuthorityReady() {
  return Boolean(moduleSocket);
}
