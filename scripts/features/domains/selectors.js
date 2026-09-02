import { RECORD_TYPES } from "../../core/constants.js";
import { recordIndex } from "../../data/record-index.js";
import { decodeRecord } from "../../models/record-codec.js";

export function canViewDomainDocument(document, user = game.user) {
  if (!document || !user) return false;
  return user.isGM || document.testUserPermission(
    user,
    CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER
  );
}

export function listVisibleDomainRecords(user = game.user) {
  return recordIndex
    .list(RECORD_TYPES.DOMAIN)
    .filter((document) => canViewDomainDocument(document, user))
    .map(decodeRecord);
}

export function listControlledDomainRecords(user = game.user) {
  return listVisibleDomainRecords(user).filter((record) =>
    user.isGM
    || record.data.governance.controllers.includes(user.id)
  );
}

export function getVisibleDomainRecord(uuid, user = game.user) {
  const document = recordIndex.get(RECORD_TYPES.DOMAIN, uuid);
  if (!canViewDomainDocument(document, user)) return null;
  return decodeRecord(document);
}
