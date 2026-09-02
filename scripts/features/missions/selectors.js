import {
  RECORD_TYPES
} from "../../core/constants.js";
import {
  listRecordDocuments
} from "../../data/journal-store.js";
import {
  decodeRecord
} from "../../models/record-codec.js";

function canView(
  document,
  user = game.user
) {
  return user.isGM
    || document.testUserPermission(
      user,
      CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER
    );
}

export function listMissionRecords(
  user = game.user
) {
  return listRecordDocuments(
    RECORD_TYPES.MISSION
  )
    .filter(
      (document) => canView(document, user)
    )
    .map(decodeRecord);
}

export function listDomainMissionRecords(
  domainUuid,
  user = game.user
) {
  return listMissionRecords(user)
    .filter(
      (record) =>
        record.data.primaryDomainUuid === domainUuid
        || record.data.relatedDomainUuids.includes(
          domainUuid
        )
    );
}

export function findMissionByOrigin(
  originKind,
  originUuid
) {
  return listRecordDocuments(
    RECORD_TYPES.MISSION
  )
    .map(decodeRecord)
    .find(
      (record) =>
        record.data.origin.kind === originKind
        && record.data.origin.uuid === originUuid
    ) ?? null;
}
