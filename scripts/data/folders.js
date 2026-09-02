import {
  MODULE_ID,
  SETTINGS
} from "../core/constants.js";

const FOLDER_NAME = "Domínios // Dados";

function isDataFolder(folder) {
  return folder?.type === "JournalEntry"
    && folder.getFlag(MODULE_ID, "dataFolder") === true;
}

export async function ensureDataFolder() {
  if (!game.user.isGM) return null;

  const storedId = game.settings.get(
    MODULE_ID,
    SETTINGS.DATA_FOLDER_ID
  );
  const stored = storedId
    ? game.folders.get(storedId)
    : null;

  if (stored?.type === "JournalEntry") return stored;

  const existing = game.folders.find(isDataFolder);

  if (existing) {
    await game.settings.set(
      MODULE_ID,
      SETTINGS.DATA_FOLDER_ID,
      existing.id
    );
    return existing;
  }

  const created = await Folder.create({
    name: FOLDER_NAME,
    type: "JournalEntry",
    sorting: "a",
    flags: {
      [MODULE_ID]: {
        dataFolder: true
      }
    }
  });

  await game.settings.set(
    MODULE_ID,
    SETTINGS.DATA_FOLDER_ID,
    created.id
  );

  return created;
}
