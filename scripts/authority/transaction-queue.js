import { ModuleError, ERROR_CODES } from "../core/errors.js";
import { assertPrimaryActiveGM } from "./primary-gm.js";

/**
 * Fila transacional e Mutex para serialização de operações concorrentes no GM (Bloco 18).
 * Garante que múltiplas solicitações de jogadores ou mutações simultâneas
 * sejam processadas estritamente em ordem FIFO sem Race Conditions em JournalEntries.
 */
export class TransactionQueue {
  #queue = [];
  #isProcessing = false;
  #lockMap = new Map(); // Mutex por UUID de documento

  /**
   * Enfileira uma transação para execução serializada sob autoridade do GM.
   * @template T
   * @param {string} resourceKey - Chave de bloqueio (ex: uuid do domínio ou 'global')
   * @param {() => Promise<T>} operation - Função assíncrona da mutação
   * @param {Object} options
   * @param {string} options.callerUserId - ID do usuário solicitante
   * @returns {Promise<T>}
   */
  async enqueue(resourceKey, operation, { callerUserId = null } = {}) {
    // Toda mutação serializada passa pela mesma autoridade. Isso impede dois
    // clientes GM de manterem filas locais independentes para o mesmo mundo.
    assertPrimaryActiveGM();

    return new Promise((resolve, reject) => {
      this.#queue.push({
        resourceKey,
        operation,
        callerUserId,
        resolve,
        reject
      });

      this.#processNext();
    });
  }

  async #processNext() {
    if (this.#isProcessing || this.#queue.length === 0) {
      return;
    }

    this.#isProcessing = true;
    const task = this.#queue.shift();

    try {
      // Bloqueia a chave de recurso
      while (this.#lockMap.get(task.resourceKey)) {
        await new Promise((r) => setTimeout(r, 10));
      }

      this.#lockMap.set(task.resourceKey, true);

      // Executa a operação atômica
      const result = await task.operation();
      task.resolve(result);
    } catch (err) {
      console.error(`[DomainManager] Erro na fila transacional (key=${task.resourceKey}):`, err);
      task.reject(err);
    } finally {
      this.#lockMap.delete(task.resourceKey);
      this.#isProcessing = false;
      this.#processNext();
    }
  }

  /**
   * Valida permissão do usuário de origem.
   * @param {string} userId - ID do usuário
   * @param {string} requiredLevel - 'GM' | 'OWNER' | 'OBSERVER'
   * @param {Object} document - Documento do Foundry
   */
  validatePermission(userId, requiredLevel = "OWNER", document = null) {
    const user = game.users.get(userId);
    if (!user) {
      throw new ModuleError(ERROR_CODES.PERMISSION, `Usuário não encontrado: ${userId}`);
    }

    if (user.isGM) return true;

    if (requiredLevel === "GM") {
      throw new ModuleError(ERROR_CODES.PERMISSION, "Esta ação é restrita exclusivamente ao Mestre.");
    }

    if (document) {
      const minLevel = CONST.DOCUMENT_OWNERSHIP_LEVELS[requiredLevel] ?? CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
      const hasPerm = document.testUserPermission(user, minLevel);
      if (!hasPerm) {
        throw new ModuleError(ERROR_CODES.PERMISSION, `Usuário ${user.name} não possui permissão ${requiredLevel} no documento.`);
      }
    }

    return true;
  }
}

export const transactionQueue = new TransactionQueue();
