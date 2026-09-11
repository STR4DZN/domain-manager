import {
  CAPABILITY_KEYS,
  COMMAND_TYPES,
  MANAGEMENT_PRESETS,
  MODULE_ID,
  RECORD_TYPES,
  SCHEMA_VERSION
} from "../core/constants.js";
import { recordIndex } from "../data/record-index.js";
import { registerRecordIndexHooks } from "../data/record-hooks.js";
import {
  invalidateDomainManager,
  openAdvanceRun,
  openDashboard,
  openDomain,
  openDomainManager,
  openHelp,
  openMyDomain,
  openSimulationPreview,
  rollDomainEvent
} from "../ui/app.js";
import {
  isAuthorityReady,
  registerAuthoritySocket
} from "../authority/socket.js";
import { registerTimekeepingHooks } from "../integration/timekeeping.js";
import { migrationPipeline } from "../data/migration-pipeline.js";
import { isPrimaryActiveGM } from "../authority/primary-gm.js";
import { executeCommandAuthoritatively } from "../authority/execute.js";


function hasStaleModuleRecords() {
  return Array.from(globalThis.game?.journal ?? []).some((document) => {
    const recordType = document.getFlag?.(MODULE_ID, "recordType");
    if (!recordType) return false;
    return Number(document.getFlag?.(MODULE_ID, "schemaVersion") ?? 0) !== SCHEMA_VERSION;
  });
}

async function waitForPrimaryMigration({ attempts = 150, delayMs = 100 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (!hasStaleModuleRecords()) return true;
    if (!globalThis.game?.users?.activeGM) return false;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return !hasStaleModuleRecords();
}

export async function readyModule() {
  if (!isAuthorityReady() && globalThis.socketlib) {
    registerAuthoritySocket();
  }

  // Apenas o GM primário migra. Todos os demais clientes aguardam o schema
  // corrente antes de decodificar os records, evitando corrida de startup.
  if (isPrimaryActiveGM()) {
    const migration = await migrationPipeline.runMigration();
    if (!migration.success) {
      console.error(`[${MODULE_ID}] Migração falhou; índice não será reconstruído para evitar operar sobre dados inconsistentes.`, migration.errors);
      return;
    }
  } else if (hasStaleModuleRecords()) {
    const ready = await waitForPrimaryMigration();
    if (!ready) {
      console.error(`[${MODULE_ID}] Registros aguardam migração, mas a autoridade primária não concluiu o schema ${SCHEMA_VERSION}.`);
      return;
    }
  }

  recordIndex.rebuild();
  registerRecordIndexHooks({ onChange: invalidateDomainManager });
  Hooks.on(
    "domain-manager.resourceCatalogChanged",
    invalidateDomainManager
  );
  registerTimekeepingHooks();

  const module = game.modules.get(MODULE_ID);

  if (module) {
    module.api = Object.freeze({
      contracts: Object.freeze({
        schemaVersion: SCHEMA_VERSION,
        recordTypes: Object.freeze({ ...RECORD_TYPES }),
        capabilities: Object.freeze([...CAPABILITY_KEYS]),
        managementPresets: Object.freeze([...MANAGEMENT_PRESETS]),
        commandTypes: Object.freeze({ ...COMMAND_TYPES })
      }),
      executeCommand: executeCommandAuthoritatively,
      open: openDomainManager,
      openDomainManager,
      openDomain,
      openDashboard,
      openMyDomain,
      openAdvanceRun,
      openSimulationPreview,
      rollDomainEvent,
      openHelp,
      get status() {
        return Object.freeze({
          authorityReady: isAuthorityReady(),
          indexedDomains: recordIndex.count(RECORD_TYPES.DOMAIN),
          indexedRequests: recordIndex.count(RECORD_TYPES.REQUEST),
          indexedMissions: recordIndex.count(RECORD_TYPES.MISSION),
          indexedProjects: recordIndex.count(RECORD_TYPES.PROJECT),
          indexedSquads: recordIndex.count(RECORD_TYPES.SQUAD),
          indexedPeople: recordIndex.count(RECORD_TYPES.PERSON),
          indexedStructures: recordIndex.count(RECORD_TYPES.STRUCTURE),
          indexedAgreements: recordIndex.count(RECORD_TYPES.AGREEMENT),
          activeGMId: game.users.activeGM?.id ?? null,
          socketRegistered:
            globalThis.socketlib?.modules?.has?.(MODULE_ID) ?? false,
          version: module.version
        });
      }
    });

    globalThis.DomainManager = module.api;
    game.domainManager = module.api;
  }

  console.info(
    `[${MODULE_ID}] ready | Domains: ${recordIndex.count(RECORD_TYPES.DOMAIN)} | authority: ${isAuthorityReady()}`
  );
}
