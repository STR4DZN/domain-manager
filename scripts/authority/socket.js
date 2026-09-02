import { MODULE_ID } from "../core/constants.js";
import { performCreateRequest } from "../features/requests/actions.js";

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

  if (!userId) {
    throw new Error(
      "socketlib não informou o usuário de origem."
    );
  }

  const result = await performCreateRequest(
    payload,
    userId
  );

  console.info(
    `[${MODULE_ID}] Request recebida via socket | caller=${userId} | uuid=${result.uuid} | duplicate=${result.duplicate}`
  );

  return result;
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

  console.info(`[${MODULE_ID}] socketlib registrado.`);
  return moduleSocket;
}

export function getAuthoritySocket() {
  return moduleSocket;
}

export function isAuthorityReady() {
  return Boolean(moduleSocket);
}
