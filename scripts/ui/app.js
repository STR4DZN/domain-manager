import { RECORD_TYPES } from "../core/constants.js";
import { recordIndex } from "../data/record-index.js";
import { decodeRecord } from "../models/record-codec.js";
import {
  DomainManagerShellApp,
  SHELL_SECTIONS
} from "./shell-app.js";

export { DomainManagerShellApp as DomainManagerApp };

let application = null;
let invalidationScheduled = false;

function isApplicationOpen(app) {
  return Boolean(app?.rendered && app?.element?.isConnected);
}

function getOrCreateApplication() {
  if (!application || !isApplicationOpen(application)) {
    application = new DomainManagerShellApp();
  }

  return application;
}

async function renderRoute({ section = null, domainUuid = undefined } = {}) {
  const isAlreadyOpen = isApplicationOpen(application);
  const app = getOrCreateApplication();
  if (!isAlreadyOpen) {
    app.shouldPlayBootWelcome = true;
  }
  app.setRoute({ section, domainUuid });

  try {
    return await app.render({ force: true, focus: true });
  } catch (error) {
    console.error("Domain Manager | Falha ao abrir o shell:", error);
    application = null;
    globalThis.ui?.notifications?.error?.(
      `Falha ao abrir Domain Manager: ${error.message}`
    );
    return null;
  }
}

export function getDomainManagerApp() {
  return getOrCreateApplication();
}

export function openDomainManager() {
  return renderRoute();
}

export function openDomain(uuid) {
  return renderRoute({
    section: SHELL_SECTIONS.DOMAINS,
    domainUuid: uuid ?? null
  });
}

export function openDashboard() {
  return renderRoute({ section: SHELL_SECTIONS.DASHBOARD });
}

export function openMyDomain() {
  const domains = recordIndex
    .list(RECORD_TYPES.DOMAIN)
    .map(decodeRecord);

  const controlledDomain = domains.find((domain) =>
    domain.data?.governance?.controllers?.includes(game.user.id)
  );

  const visibleFallback = domains.find((domain) =>
    game.user.isGM
    || domain.document.testUserPermission(
      game.user,
      CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER
    )
  );

  return renderRoute({
    section: SHELL_SECTIONS.DOMAINS,
    domainUuid: controlledDomain?.uuid ?? visibleFallback?.uuid ?? null
  });
}

export function openAdvanceRun() {
  return renderRoute({ section: SHELL_SECTIONS.ADVANCE });
}

export function openSimulationPreview() {
  return renderRoute({ section: SHELL_SECTIONS.SIMULATION });
}

export function rollDomainEvent(uuid = null) {
  return renderRoute({
    section: SHELL_SECTIONS.EVENTS,
    domainUuid: uuid
  });
}

export function openHelp() {
  return renderRoute({ section: SHELL_SECTIONS.HELP });
}

export function invalidateDomainManager() {
  if (!isApplicationOpen(application) || invalidationScheduled) return;

  invalidationScheduled = true;
  queueMicrotask(() => {
    invalidationScheduled = false;
    if (!isApplicationOpen(application)) return;
    application.render({ parts: ["main"] });
  });
}
