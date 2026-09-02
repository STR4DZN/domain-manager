import { RECORD_TYPES } from "../../core/constants.js";
import { recordIndex } from "../../data/record-index.js";
import { decodeRecord } from "../../models/record-codec.js";
import { deriveProjectReservations } from "./rules.js";

function canView(document, user=game.user) {
  return user.isGM || document.testUserPermission(user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER);
}

export function listDomainProjectRecords(domainUuid, user=game.user) {
  return recordIndex.list(RECORD_TYPES.PROJECT)
    .filter((document) => canView(document, user))
    .map((document) => decodeRecord(document))
    .filter((record) => record.data.domainUuid === domainUuid);
}

export function buildDomainProjectReservations(domainUuid, user=game.user, {excludeProjectUuid=null}={}) {
  return listDomainProjectRecords(domainUuid, user)
    .filter((record) => record.uuid !== excludeProjectUuid)
    .flatMap((record) => deriveProjectReservations(record.data, {projectUuid:record.uuid, projectName:record.document.name}));
}
