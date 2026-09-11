import { MODULE_ID, RECORD_TYPES, SCHEMA_VERSION } from "../core/constants.js";
import { isModuleRecord, normalizeRecordData } from "../models/record-codec.js";
import { buildEntityId } from "../core/entity-contracts.js";
import { normalizeManagementConfig } from "../core/management-contracts.js";
import { isPrimaryActiveGM } from "../authority/primary-gm.js";

export const CURRENT_SCHEMA_VERSION = SCHEMA_VERSION;

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
    if (!isPrimaryActiveGM()) {
      return { migratedCount: 0, errors: [], success: true, skipped: true };
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
          // Valida e normaliza antes de tocar no JournalEntry. Se uma migração
          // gerar dados incompatíveis com o DataModel atual, o pipeline aborta
          // e o rollback restaura o snapshot original.
          migratedFlags.data = normalizeRecordData(
            migratedFlags.recordType,
            migratedFlags.data
          );
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

    if (fromVersion < 2) {
      result = this.#migrateToV2(result);
    }

    if (fromVersion < 3) {
      result = this.#migrateToV3(result);
    }

    if (fromVersion < 4) {
      result = this.#migrateToV4(result);
    }

    if (fromVersion < 5) {
      result = this.#migrateToV5(result);
    }

    if (fromVersion < 6) {
      result = this.#migrateToV6(result);
    }

    if (fromVersion < 7) {
      result = this.#migrateToV7(result);
    }

    if (fromVersion < 8) {
      result = this.#migrateToV8(result);
    }

    if (fromVersion < 9) {
      result = this.#migrateToV9(result);
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
      data.description = String(data.description ?? "");
      data.identity = data.identity || { category: "Base", nature: "physical", state: "active", tags: [] };
      // Builds antigos usavam `settlement`, valor que não existe mais no enum atual.
      if (data.identity.nature === "settlement") data.identity.nature = "physical";
      data.identity.category = String(data.identity.category ?? data.identity.name ?? "Base").trim() || "Base";
      delete data.identity.name;
      data.hierarchy = data.hierarchy || { locatedInUuid: null, administrativeParentUuid: null };
      data.population = data.population || { total: 0, countMode: "direct", groups: [], notables: [] };
      data.economy = data.economy || { stocks: [], flows: [] };
      data.economy.stocks = Array.isArray(data.economy.stocks) ? data.economy.stocks : [];
      data.economy.flows = Array.isArray(data.economy.flows) ? data.economy.flows : [];
      data.governance = data.governance || { controllers: [] };
      data.conditions = data.conditions || [];
      data.security = data.security || { defenseRating: 0, guardCount: 0, fortifications: [] };
      data.relations = data.relations || [];
      data.agreements = data.agreements || [];
      data.history = data.history || [];
      data.intel = data.intel || [];
      data.notifications = data.notifications || [];
    }

    return {
      ...flagData,
      data
    };
  }

  #migrateToV2(flagData) {
    const data = flagData.data || {};

    if (flagData.recordType === RECORD_TYPES.DOMAIN) {
      data.identity = data.identity || {};
      if (data.identity.nature === "settlement") data.identity.nature = "physical";

      data.economy = data.economy || { stocks: [], flows: [] };
      data.economy.stocks = Array.isArray(data.economy.stocks) ? data.economy.stocks : [];
      data.economy.flows = (Array.isArray(data.economy.flows) ? data.economy.flows : [])
        .map((flow) => ({ ...flow, carry: Number(flow?.carry ?? 0) }));

      // Builds intermediários chegaram a persistir "crisis", enquanto o modelo
      // oficial aceita minor/moderate/severe.
      data.conditions = (Array.isArray(data.conditions) ? data.conditions : [])
        .map((condition) => condition?.severity === "crisis"
          ? { ...condition, severity: "severe" }
          : condition);
    }

    return {
      ...flagData,
      data
    };
  }
  #migrateToV3(flagData) {
    const data = flagData.data || {};
    const recordType = flagData.recordType;

    if (!data.entityId) {
      data.entityId = buildEntityId(recordType);
    }

    if (recordType === RECORD_TYPES.DOMAIN) {
      data.management = normalizeManagementConfig(data.management, {
        defaultPreset: "base"
      });
    }

    return {
      ...flagData,
      data
    };
  }

  #migrateToV4(flagData) {
    const data = flagData.data || {};

    if (flagData.recordType === RECORD_TYPES.DOMAIN) {
      data.history = (Array.isArray(data.history) ? data.history : []).map((event) => ({
        ...event,
        eventType: String(event?.eventType ?? ""),
        operationId: event?.operationId ?? null,
        actorUserId: event?.actorUserId ?? null,
        entityIds: Array.isArray(event?.entityIds) ? event.entityIds : [],
        metadata: Array.isArray(event?.metadata) ? event.metadata : []
      }));
    }

    return {
      ...flagData,
      data
    };
  }

  #migrateToV5(flagData) {
    const data = flagData.data || {};

    if (flagData.recordType === RECORD_TYPES.MISSION) {
      data.assignments = Array.isArray(data.assignments) ? data.assignments : [];
      data.startedAtWorldTime = Number.isFinite(data.startedAtWorldTime) ? data.startedAtWorldTime : null;
      data.resolvedAtWorldTime = Number.isFinite(data.resolvedAtWorldTime) ? data.resolvedAtWorldTime : null;
    }

    return {
      ...flagData,
      data
    };
  }

  #migrateToV6(flagData) {
    const data = flagData.data || {};

    if (flagData.recordType === RECORD_TYPES.STRUCTURE) {
      if (!("activeProject" in data)) data.activeProject = null;
    }

    flagData.data = data;
    flagData.schemaVersion = 6;
    return flagData;
  }

  #migrateToV7(flagData) {
    const data = flagData.data || {};

    if (flagData.recordType === RECORD_TYPES.DOMAIN) {
      data.economy = data.economy || { stocks: [], flows: [] };
      data.economy.resourcePolicies = Array.isArray(data.economy.resourcePolicies)
        ? data.economy.resourcePolicies
        : [];
    }

    if (flagData.recordType === RECORD_TYPES.STRUCTURE) {
      if (!Number.isInteger(data.maintenancePriority)) data.maintenancePriority = 50;
    }

    flagData.data = data;
    flagData.schemaVersion = 7;
    return flagData;
  }

  #migrateToV8(flagData) {
    const data = flagData.data || {};

    if (flagData.recordType === RECORD_TYPES.DOMAIN) {
      data.population = data.population || { total: 0, countMode: "direct", groups: [], notables: [] };
      data.population.morale = Number.isInteger(data.population.morale)
        ? Math.max(0, Math.min(100, data.population.morale))
        : 60;
      data.population.groups = (Array.isArray(data.population.groups) ? data.population.groups : []).map((group) => {
        const count = Number.isInteger(group?.count) && group.count >= 0 ? group.count : 0;
        const quality = String(group?.quality ?? "").trim();
        const qualityMorale = { "Muito Alta": 90, "Estável": 70, "Insatisfeito": 40, "Rebelde": 15 };
        const morale = Number.isInteger(group?.morale)
          ? Math.max(0, Math.min(100, group.morale))
          : (qualityMorale[quality] ?? data.population.morale);
        const workforceEligible = Number.isInteger(group?.workforceEligible)
          ? Math.max(0, Math.min(count, group.workforceEligible))
          : count;
        return { ...group, morale, workforceEligible };
      });
      data.population.workforce = data.population.workforce && typeof data.population.workforce === "object"
        ? data.population.workforce
        : {};
      data.population.workforce.allocations = Array.isArray(data.population.workforce.allocations)
        ? data.population.workforce.allocations
        : [];
    }

    if (flagData.recordType === RECORD_TYPES.STRUCTURE) {
      if (!Number.isInteger(data.workforceRequired) || data.workforceRequired < 0) data.workforceRequired = 0;
    }

    if (flagData.recordType === RECORD_TYPES.PERSON) {
      data.portrait = String(data.portrait ?? "");
      data.morale = Number.isInteger(data.morale) ? Math.max(0, Math.min(100, data.morale)) : 60;
      data.condition = Number.isInteger(data.condition) ? Math.max(0, Math.min(100, data.condition)) : 100;
    }

    flagData.data = data;
    flagData.schemaVersion = 8;
    return flagData;
  }

  #migrateToV9(flagData) {
    const data = flagData.data || {};

    if (flagData.recordType === RECORD_TYPES.DOMAIN) {
      data.territory = data.territory && typeof data.territory === "object"
        ? data.territory
        : {};
      data.territory.controlState = String(data.territory.controlState ?? "unknown");
      data.territory.controller = data.territory.controller ?? null;
      data.territory.control = Number.isInteger(data.territory.control)
        ? Math.max(0, Math.min(100, data.territory.control))
        : 0;
      data.territory.strategicValue = Number.isInteger(data.territory.strategicValue)
        ? Math.max(0, Math.min(100, data.territory.strategicValue))
        : 0;
      data.territory.influence = Array.isArray(data.territory.influence) ? data.territory.influence : [];
      data.territory.notes = String(data.territory.notes ?? "");

      data.relations = (Array.isArray(data.relations) ? data.relations : []).map((relation) => ({
        ...relation,
        target: relation?.target ?? (relation?.targetDomainUuid
          ? { recordType: RECORD_TYPES.DOMAIN, uuid: relation.targetDomainUuid, entityId: null }
          : null),
        score: Number.isInteger(relation?.score) ? Math.max(-100, Math.min(100, relation.score)) : 0,
        trust: Number.isInteger(relation?.trust) ? Math.max(0, Math.min(100, relation.trust)) : 50,
        tension: Number.isInteger(relation?.tension) ? Math.max(0, Math.min(100, relation.tension)) : 0
      }));

      data.intel = (Array.isArray(data.intel) ? data.intel : []).map((entry) => ({
        ...entry,
        targetDomain: entry?.targetDomain ?? null
      }));
    }

    flagData.data = data;
    flagData.schemaVersion = 9;
    return flagData;
  }

}

export const migrationPipeline = new MigrationPipeline();
