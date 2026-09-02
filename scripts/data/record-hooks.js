import { recordIndex } from "./record-index.js";
import { isModuleRecord } from "../models/record-codec.js";

let hooksRegistered = false;

/**
 * Mantém o índice em memória sincronizado com os Journal Entries do módulo.
 * A camada visual pode fornecer um callback sem ser importada por data/.
 */
export function registerRecordIndexHooks({ onChange = null } = {}) {
  if (hooksRegistered) return;
  hooksRegistered = true;

  const notify = () => {
    if (typeof onChange === "function") onChange();
  };

  Hooks.on("createJournalEntry", (document) => {
    if (!isModuleRecord(document)) return;
    recordIndex.upsert(document);
    notify();
  });

  Hooks.on("updateJournalEntry", (document) => {
    if (!isModuleRecord(document)) return;
    recordIndex.upsert(document);
    notify();
  });

  Hooks.on("deleteJournalEntry", (document) => {
    if (!isModuleRecord(document)) return;
    recordIndex.remove(document);
    notify();
  });
}
