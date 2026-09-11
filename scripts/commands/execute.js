import { ERROR_CODES, ModuleError } from "../core/errors.js";
import { transactionManager } from "../authority/transaction-manager.js";
import { getCommandDefinition } from "./registry.js";

export function normalizeCommandEnvelope(envelope = {}, { callerUserId = null } = {}) {
  const commandType = String(envelope.commandType ?? "").trim();
  const operationId = String(envelope.operationId ?? "").trim();
  const caller = String(callerUserId ?? envelope.callerUserId ?? "").trim();

  if (!commandType) throw new ModuleError(ERROR_CODES.VALIDATION, "commandType é obrigatório.");
  if (!operationId) throw new ModuleError(ERROR_CODES.VALIDATION, "operationId é obrigatório.");
  if (!caller) throw new ModuleError(ERROR_CODES.PERMISSION, "callerUserId é obrigatório.");

  const definition = getCommandDefinition(commandType);
  if (!definition) throw new ModuleError(ERROR_CODES.VALIDATION, `Comando desconhecido: ${commandType}`);

  return {
    commandType,
    operationId,
    callerUserId: caller,
    payload: structuredClone(envelope.payload ?? {})
  };
}

export async function dispatchAuthoritativeCommand(envelope, { callerUserId = null } = {}) {
  const normalized = normalizeCommandEnvelope(envelope, { callerUserId });
  const definition = getCommandDefinition(normalized.commandType);
  const resourceKeys = definition.resourceKeys?.(normalized.payload) ?? ["global"];

  return transactionManager.execute({
    operationId: normalized.operationId,
    commandType: normalized.commandType,
    callerUserId: normalized.callerUserId,
    payload: normalized.payload,
    resourceKeys
  }, () => definition.execute(normalized));
}
