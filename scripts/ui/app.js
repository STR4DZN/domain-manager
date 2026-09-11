import { RECORD_TYPES } from "../core/constants.js";
import { recordIndex } from "../data/record-index.js";
import { decodeRecord } from "../models/record-codec.js";
import { DomainManagerShellApp, SHELL_SECTIONS } from "./shell-app.js";

export { DomainManagerShellApp as DomainManagerApp };

let application = null;
let invalidationScheduled = false;

function isApplicationOpen(app) {
  return Boolean(app?.rendered && app?.element?.isConnected);
}

function getOrCreateApplication() {
  if (!application || !isApplicationOpen(application)) application = new DomainManagerShellApp();
  return application;
}

async function renderRoute({ section = null, domainUuid = undefined } = {}) {
  const app = getOrCreateApplication();
  app.setRoute({ section, domainUuid });
  try {
    return await app.render({ force: true, focus: true });
  } catch (error) {
    console.error("Domain Manager | Falha ao abrir o app:", error);
    application = null;
    globalThis.ui?.notifications?.error?.(`Falha ao abrir Domain Manager: ${error.message}`);
    return null;
  }
}

export function getDomainManagerApp() {
  return getOrCreateApplication();
}

export function openDomainManager() {
  return renderRoute({ section: SHELL_SECTIONS.DASHBOARD });
}

export function openDomain(uuid) {
  return renderRoute({ section: "overview", domainUuid: uuid ?? null });
}

export function openDashboard() {
  return renderRoute({ section: SHELL_SECTIONS.DASHBOARD });
}

export function openMyDomain() {
  const domains = recordIndex.list(RECORD_TYPES.DOMAIN).map(decodeRecord).filter(Boolean);
  const controlled = domains.find((domain) => domain.data?.governance?.controllers?.includes(game.user.id));
  const fallback = domains.find((domain) => game.user.isGM || domain.document.testUserPermission(
    game.user,
    CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER
  ));
  return renderRoute({ section: "overview", domainUuid: controlled?.uuid ?? fallback?.uuid ?? null });
}

export function openAdvanceRun() {
  return renderRoute({ section: SHELL_SECTIONS.SYSTEM });
}

export function openSimulationPreview() {
  return renderRoute({ section: SHELL_SECTIONS.SYSTEM });
}

export function rollDomainEvent(uuid = null) {
  return renderRoute({ section: SHELL_SECTIONS.OPERATIONS, domainUuid: uuid });
}

export function openHelp() {
  return renderRoute({ section: SHELL_SECTIONS.SYSTEM });
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
