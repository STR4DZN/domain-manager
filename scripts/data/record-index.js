import { MODULE_ID, RECORD_TYPES } from "../core/constants.js";
import {
  decodeRecord,
  isModuleRecord
} from "../models/record-codec.js";

function addToSetMap(map, key, uuid) {
  if (!key) return;

  let set = map.get(key);
  if (!set) {
    set = new Set();
    map.set(key, set);
  }

  set.add(uuid);
}

function removeUuidFromSetMap(map, uuid) {
  for (const [key, set] of map) {
    set.delete(uuid);
    if (!set.size) map.delete(key);
  }
}

export class RecordIndex {
  #byType = new Map();
  #domainsByAdministrativeParent = new Map();
  #domainsByLocation = new Map();
  #projectsByDomain = new Map();
  #missionsByDomain = new Map();
  #requestsByDomain = new Map();
  #domainsByController = new Map();
  #domainsByTag = new Map();

  rebuild() {
    this.#byType.clear();
    this.#domainsByAdministrativeParent.clear();
    this.#domainsByLocation.clear();
    this.#projectsByDomain.clear();
    this.#missionsByDomain.clear();
    this.#requestsByDomain.clear();
    this.#domainsByController.clear();
    this.#domainsByTag.clear();

    if (globalThis.game?.journal) {
      for (const document of game.journal) {
        this.upsert(document);
      }
    }
  }

  upsert(document) {
    if (!isModuleRecord(document)) return;

    const recordType = document.getFlag(MODULE_ID, "recordType");
    let typeMap = this.#byType.get(recordType);

    if (!typeMap) {
      typeMap = new Map();
      this.#byType.set(recordType, typeMap);
    }

    typeMap.set(document.uuid, document);
    const record = decodeRecord(document);
    if (!record) return;

    if (recordType === RECORD_TYPES.DOMAIN) {
      removeUuidFromSetMap(this.#domainsByAdministrativeParent, document.uuid);
      removeUuidFromSetMap(this.#domainsByLocation, document.uuid);
      removeUuidFromSetMap(this.#domainsByController, document.uuid);
      removeUuidFromSetMap(this.#domainsByTag, document.uuid);

      addToSetMap(
        this.#domainsByAdministrativeParent,
        record.data.hierarchy?.administrativeParentUuid,
        document.uuid
      );
      addToSetMap(
        this.#domainsByLocation,
        record.data.hierarchy?.locatedInUuid,
        document.uuid
      );

      const controllers = record.data.governance?.controllers ?? [];
      for (const ctrl of controllers) {
        addToSetMap(this.#domainsByController, ctrl, document.uuid);
      }

      const tags = record.data.identity?.tags ?? [];
      for (const tag of tags) {
        addToSetMap(this.#domainsByTag, tag.toLowerCase(), document.uuid);
      }
    } else if (recordType === RECORD_TYPES.PROJECT) {
      removeUuidFromSetMap(this.#projectsByDomain, document.uuid);
      addToSetMap(this.#projectsByDomain, record.data.domainUuid, document.uuid);
    } else if (recordType === RECORD_TYPES.MISSION) {
      removeUuidFromSetMap(this.#missionsByDomain, document.uuid);
      addToSetMap(this.#missionsByDomain, record.data.primaryDomainUuid, document.uuid);
      for (const relatedDomainUuid of record.data.relatedDomainUuids ?? []) {
        addToSetMap(this.#missionsByDomain, relatedDomainUuid, document.uuid);
      }
    } else if (recordType === RECORD_TYPES.REQUEST) {
      removeUuidFromSetMap(this.#requestsByDomain, document.uuid);
      addToSetMap(this.#requestsByDomain, record.data.primaryDomainUuid, document.uuid);
    }
  }

  remove(documentOrUuid) {
    const uuid = typeof documentOrUuid === "string" ? documentOrUuid : documentOrUuid?.uuid;
    if (!uuid) return;

    for (const typeMap of this.#byType.values()) {
      typeMap.delete(uuid);
    }

    removeUuidFromSetMap(this.#domainsByAdministrativeParent, uuid);
    removeUuidFromSetMap(this.#domainsByLocation, uuid);
    removeUuidFromSetMap(this.#projectsByDomain, uuid);
    removeUuidFromSetMap(this.#missionsByDomain, uuid);
    removeUuidFromSetMap(this.#requestsByDomain, uuid);
    removeUuidFromSetMap(this.#domainsByController, uuid);
    removeUuidFromSetMap(this.#domainsByTag, uuid);
  }

  get(recordType, uuid) {
    return this.#byType.get(recordType)?.get(uuid) ?? null;
  }

  list(recordType) {
    return Array.from(
      this.#byType.get(recordType)?.values() ?? []
    );
  }

  count(recordType) {
    return this.#byType.get(recordType)?.size ?? 0;
  }

  administrativeChildren(uuid) {
    return Array.from(
      this.#domainsByAdministrativeParent.get(uuid) ?? []
    )
      .map((childUuid) => this.get(RECORD_TYPES.DOMAIN, childUuid))
      .filter(Boolean);
  }

  locatedChildren(uuid) {
    return Array.from(
      this.#domainsByLocation.get(uuid) ?? []
    )
      .map((childUuid) => this.get(RECORD_TYPES.DOMAIN, childUuid))
      .filter(Boolean);
  }

  projectsForDomain(domainUuid) {
    return Array.from(this.#projectsByDomain.get(domainUuid) ?? [])
      .map((uuid) => this.get(RECORD_TYPES.PROJECT, uuid))
      .filter(Boolean);
  }

  missionsForDomain(domainUuid) {
    return Array.from(this.#missionsByDomain.get(domainUuid) ?? [])
      .map((uuid) => this.get(RECORD_TYPES.MISSION, uuid))
      .filter(Boolean);
  }

  requestsForDomain(domainUuid) {
    return Array.from(this.#requestsByDomain.get(domainUuid) ?? [])
      .map((uuid) => this.get(RECORD_TYPES.REQUEST, uuid))
      .filter(Boolean);
  }

  domainsForController(userId) {
    return Array.from(this.#domainsByController.get(userId) ?? [])
      .map((uuid) => this.get(RECORD_TYPES.DOMAIN, uuid))
      .filter(Boolean);
  }

  domainsWithTag(tag) {
    return Array.from(this.#domainsByTag.get(tag.toLowerCase()) ?? [])
      .map((uuid) => this.get(RECORD_TYPES.DOMAIN, uuid))
      .filter(Boolean);
  }
}

export const recordIndex = new RecordIndex();
