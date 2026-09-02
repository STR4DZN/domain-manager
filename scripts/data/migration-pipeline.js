import { MODULE_ID, RECORD_TYPES } from "../core/constants.js";
import { decodeRecord, isModuleRecord } from "../models/record-codec.js";

export const CURRENT_SCHEMA_VERSION = 1;

/**
 * Pipeline de Migração Automática e Incremental de Esquema (Bloco 21).
 * Implementa salvaguardas rigorosas contra perda acidental de dados (accidental-data-loss-prevention),
 * com snapshots de pré-migração e rollback transacional caso ocorra qualquer erro de integridade.
 */
export class MigrationPipeline {
  /**
   * Executa a rotina de migração em todos os JournalEntries do módulo.
   * @param {Object} options
   * @param {boolean} options.dryRun - Se true, apenas simula a migração sem persistir
   * @returns {Promise<{ migratedCount: number, errors: Array, success: boolean }>}
   */
  async runMigration({ dryRun = false } = {}) {
    if (!game.user.isGM) {
      return { migratedCount: 0, errors: [], success: true };
    }

    const journalEntries = Array.from(game.journal ?? []).filter(isModuleRecord);
    const backupSnapshot = new Map(); // uuid -> flags backup
    const errors = [];
    let migratedCount = 0;

    console.info(`[${MODULE_ID}] Iniciando pipeline de migração (documentos encontrados: ${journalEntries.length})...`);

    // Fase 1: Snapshot de Segurança (Prevenção de Perda de Dados)
    for (const doc of journalEntries) {
      backupSnapshot.set(doc.uuid, foundry.utils.deepClone(doc.flags?.[MODULE_ID] ?? {}));
    }

    try {
      // Fase 2: Migrações Incrementais
      for (const doc of journalEntries) {
        const flagData = doc.flags?.[MODULE_ID];
        if (!flagData) continue;

        const currentVersion = flagData.schemaVersion || 0;
        if (currentVersion < CURRENT_SCHEMA_VERSION) {
          const migratedFlags = this.migrateDocumentFlags(flagData, currentVersion);
          migratedCount++;

          if (!dryRun) {
            await doc.update({
              [`flags.${MODULE_ID}`]: migratedFlags
            });
          }
        }
      }

      console.info(`[${MODULE_ID}] Migração concluída com sucesso (${migratedCount} documentos atualizados).`);
      return { migratedCount, errors: [], success: true };
    } catch (err) {
      console.error(`[${MODULE_ID}] ERRO CRÍTICO DURANTE A MIGRAÇÃO. Executando Rollback de Emergência...`, err);
      errors.push(err);

      // Fase 3: Rollback Seguro
      if (!dryRun) {
        for (const [uuid, originalFlags] of backupSnapshot) {
          try {
            const doc = await fromUuid(uuid);
            if (doc) {
              await doc.update({
                [`flags.${MODULE_ID}`]: originalFlags
              });
            }
          } catch (rollbackErr) {
            console.error(`[${MODULE_ID}] Falha ao restaurar documento ${uuid} no rollback:`, rollbackErr);
          }
        }
      }

      return { migratedCount: 0, errors, success: false };
    }
  }

  /**
   * Transforma as flags de um documento através de versões incrementais.
   * @param {Object} flagData
   * @param {number} fromVersion
   * @returns {Object}
   */
  migrateDocumentFlags(flagData, fromVersion) {
    let result = foundry.utils.deepClone(flagData);

    if (fromVersion < 1) {
      result = this.#migrateToV1(result);
    }

    result.schemaVersion = CURRENT_SCHEMA_VERSION;
    return result;
  }

  #migrateToV1(flagData) {
    const data = flagData.data || {};

    if (flagData.recordType === RECORD_TYPES.DOMAIN) {
      // Garante presença de visuals
      data.visuals = data.visuals || {
        bannerImg: "icons/svg/village.svg",
        crestImg: "icons/svg/shield.svg",
        themeColorHex: "#f59e0b"
      };

      // Garante integridade de arrays
      data.identity = data.identity || { name: "Domínio", nature: "settlement", state: "active", tags: [] };
      data.hierarchy = data.hierarchy || { locatedInUuid: null, administrativeParentUuid: null };
      data.population = data.population || { total: 0, countMode: "direct", groups: [], notables: [] };
      data.economy = data.economy || { stocks: [], flows: [] };
      data.governance = data.governance || { controllers: [] };
      data.conditions = data.conditions || [];
      data.relations = data.relations || [];
      data.history = data.history || [];
      data.intel = data.intel || [];
    }

    return {
      ...flagData,
      data
    };
  }
}

export const migrationPipeline = new MigrationPipeline();
