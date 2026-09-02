import { RECORD_TYPES } from "../../core/constants.js";
import { recordIndex } from "../../data/record-index.js";
import { decodeRecord } from "../../models/record-codec.js";

export function canViewRequestDocument(document, user = game.user) {
  if (!document || !user) return false;
  return user.isGM || document.testUserPermission(
    user,
    CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER
  );
}

export function listVisibleRequestRecords(user = game.user) {
  return recordIndex
    .list(RECORD_TYPES.REQUEST)
    .filter((document) => canViewRequestDocument(document, user))
    .map(decodeRecord);
}
