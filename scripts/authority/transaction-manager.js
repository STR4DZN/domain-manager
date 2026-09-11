import { EVENT_TYPES } from "../core/constants.js";
import { domainEventBus } from "../core/event-bus.js";
import { ERROR_CODES, ModuleError } from "../core/errors.js";
import { assertPrimaryActiveGM } from "./primary-gm.js";
import { transactionQueue } from "./transaction-queue.js";
import {
  appendOperationReceipt,
  assertReceiptMatches,
  commandFingerprint,
  findOperationReceipt,
  getOperationLedgerSetting,
  setOperationLedgerSetting
} from "./idempotency-store.js";

function serializableClone(value) {
  if (value === undefined) return null;
  return JSON.parse(JSON.stringify(value));
}

export class TransactionManager {
  constructor({
    queue = transactionQueue,
    readLedger = getOperationLedgerSetting,
    writeLedger = setOperationLedgerSetting,
    eventBus = domainEventBus,
    authorityCheck = assertPrimaryActiveGM
  } = {}) {
    this.queue = queue;
    this.readLedger = readLedger;
    this.writeLedger = writeLedger;
    this.eventBus = eventBus;
    this.authorityCheck = authorityCheck;
  }

  async execute({
    operationId,
    commandType,
    callerUserId,
    payload = {},
    resourceKeys = []
  }, operation) {
    this.authorityCheck();

    const opId = String(operationId ?? "").trim();
    const type = String(commandType ?? "").trim();
    const caller = String(callerUserId ?? "").trim();
    if (!opId || !type || !caller) {
      throw new ModuleError(ERROR_CODES.VALIDATION, "Transação exige operationId, commandType e callerUserId.");
    }
    if (typeof operation !== "function") {
      throw new ModuleError(ERROR_CODES.VALIDATION, "Transação exige uma operação executável.");
    }

    const fingerprint = commandFingerprint({ commandType: type, callerUserId: caller, payload });
    const lockKey = `command:${[...new Set(resourceKeys.map(String))].sort().join("|") || "global"}`;

    return this.queue.enqueue(lockKey, async () => {
      const ledger = this.readLedger();
      const existing = findOperationReceipt(ledger, opId);
      if (existing) {
        assertReceiptMatches(existing, { commandType: type, callerUserId: caller, fingerprint });
        return {
          ...serializableClone(existing.result),
          operationId: opId,
          duplicate: true
        };
      }

      const execution = await operation();
      const result = serializableClone(execution?.result ?? execution ?? {});
      const events = Array.isArray(execution?.events) ? execution.events : [];
      const receipt = {
        operationId: opId,
        commandType: type,
        callerUserId: caller,
        fingerprint,
        completedAt: Date.now(),
        result
      };

      // O estado da operação e sua receipt precisam caminhar juntos. Handlers que
      // persistem estado podem fornecer rollback compensatório para o caso raro de
      // a escrita do ledger falhar depois do commit do Foundry.
      try {
        await this.writeLedger(appendOperationReceipt(ledger, receipt));
      } catch (error) {
        if (typeof execution?.rollback === "function") {
          try {
            await execution.rollback();
          } catch (rollbackError) {
            console.error("[DomainManager] Falha no rollback após erro de idempotency ledger:", rollbackError);
          }
        }
        throw error;
      }

      // A receipt é persistida antes de eventos serem publicados. Subscribers são
      // observadores e não invalidam um comando já commitado.
      for (const event of events) {
        await this.eventBus.publish({
          ...event,
          operationId: event.operationId ?? opId,
          actorUserId: event.actorUserId ?? caller
        });
      }
      await this.eventBus.publish({
        type: EVENT_TYPES.COMMAND_COMPLETED,
        operationId: opId,
        actorUserId: caller,
        entities: execution?.entities ?? [],
        payload: { commandType: type }
      });

      return {
        ...result,
        operationId: opId,
        duplicate: false
      };
    }, { callerUserId: caller });
  }
}

export const transactionManager = new TransactionManager();
