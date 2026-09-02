import {
  MODULE_ID,
  RECORD_TYPES
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

export function readyModule() {
  if (!isAuthorityReady() && globalThis.socketlib) {
    registerAuthoritySocket();
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
