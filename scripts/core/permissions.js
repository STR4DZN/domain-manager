/** Module write access is reserved for Foundry's GM and Assistant roles. */
export function isModuleManager(user = globalThis.game?.user) {
  if (!user) return false;
  if (user.isGM) return true;
  const assistantRole = Number(globalThis.CONST?.USER_ROLES?.ASSISTANT ?? 3);
  return Number.isFinite(assistantRole) && Number(user.role) >= assistantRole;
}
