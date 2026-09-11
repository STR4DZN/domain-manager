import { MODULE_ID, SETTINGS } from "../core/constants.js";
import { ERROR_CODES, ModuleError } from "../core/errors.js";

export const OPERATION_LEDGER_VERSION = 1;
export const MAX_OPERATION_RECEIPTS = 500;

export function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

export function fnv1a32(value) {
  let hash = 0x811c9dc5;
  const text = String(value ?? "");
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function commandFingerprint({ commandType, callerUserId, payload }) {
  return fnv1a32(stableStringify({
    commandType: String(commandType ?? ""),
    callerUserId: String(callerUserId ?? ""),
    payload: payload ?? null
  }));
}

export function normalizeOperationLedger(ledger = null) {
  const source = ledger && typeof ledger === "object" ? ledger : {};
  return {
    version: OPERATION_LEDGER_VERSION,
    receipts: Array.isArray(source.receipts)
      ? source.receipts.filter((entry) => entry && typeof entry === "object")
      : []
  };
}

export function findOperationReceipt(ledger, operationId) {
  const id = String(operationId ?? "").trim();
  if (!id) return null;
  return normalizeOperationLedger(ledger).receipts.find((entry) => entry.operationId === id) ?? null;
}

export function assertReceiptMatches(receipt, { commandType, callerUserId, fingerprint }) {
  if (!receipt) return true;
  if (
    receipt.commandType !== commandType
    || receipt.callerUserId !== callerUserId
    || receipt.fingerprint !== fingerprint
  ) {
    throw new ModuleError(
      ERROR_CODES.CONFLICT,
      `operationId '${receipt.operationId}' já foi usado com outro comando, usuário ou payload.`
    );
  }
  return true;
}

export function appendOperationReceipt(ledger, receipt, { maxReceipts = MAX_OPERATION_RECEIPTS } = {}) {
  const normalized = normalizeOperationLedger(ledger);
  const existing = findOperationReceipt(normalized, receipt.operationId);
  if (existing) {
    assertReceiptMatches(existing, receipt);
    return normalized;
  }

  const receipts = [...normalized.receipts, structuredClone(receipt)];
  const limit = Math.max(1, Math.floor(Number(maxReceipts) || MAX_OPERATION_RECEIPTS));
  return {
    version: OPERATION_LEDGER_VERSION,
    receipts: receipts.slice(Math.max(0, receipts.length - limit))
  };
}

export function getOperationLedgerSetting() {
  return normalizeOperationLedger(game.settings.get(MODULE_ID, SETTINGS.OPERATION_LEDGER));
}

export async function setOperationLedgerSetting(ledger) {
  return game.settings.set(MODULE_ID, SETTINGS.OPERATION_LEDGER, normalizeOperationLedger(ledger));
}
