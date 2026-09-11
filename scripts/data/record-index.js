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

function addReferenceToSetMap(map, reference, uuid) {
  if (!reference || typeof reference !== "object") return;
  addToSetMap(map, reference.uuid, uuid);
  addToSetMap(map, reference.entityId, uuid);
}

export class RecordIndex {
  #byType = new Map();
  #byEntityId = new Map();
  #entityIdByUuid = new Map();

  #domainsByAdministrativeParent = new Map();
  #domainsByLocation = new Map();
  #domainsByController = new Map();
  #domainsByTag = new Map();

  #projectsByDomain = new Map();
  #missionsByDomain = new Map();
  #requestsByDomain = new Map();
  #squadsByDomain = new Map();
  #peopleByDomain = new Map();
  #peopleBySquad = new Map();
  #structuresByDomain = new Map();
  #structuresByProject = new Map();
  #agreementsByDomain = new Map();

  rebuild() {
    this.#byType.clear();
    this.#byEntityId.clear();
    this.#entityIdByUuid.clear();
    this.#domainsByAdministrativeParent.clear();
    this.#domainsByLocation.clear();
    this.#domainsByController.clear();
    this.#domainsByTag.clear();
    this.#projectsByDomain.clear();
    this.#missionsByDomain.clear();
    this.#requestsByDomain.clear();
    this.#squadsByDomain.clear();
    this.#peopleByDomain.clear();
    this.#peopleBySquad.clear();
    this.#structuresByDomain.clear();
    this.#structuresByProject.clear();
    this.#agreementsByDomain.clear();

    if (globalThis.game?.journal) {
      for (const document of game.journal) {
        this.upsert(document);
      }
    }
  }

  upsert(document) {
    if (!isModuleRecord(document)) return;

    const recordType = document.getFlag(MODULE_ID, "recordType");
    const record = decodeRecord(document);
    if (!record) return;

    const previousEntityId = this.#entityIdByUuid.get(document.uuid);
    if (previousEntityId && previousEntityId !== record.data.entityId) {
      this.#byEntityId.delete(previousEntityId);
    }

    const collision = this.#byEntityId.get(record.data.entityId);
    if (collision && collision.uuid !== document.uuid) {
      throw new Error(
        `entityId duplicado '${record.data.entityId}' em ${collision.uuid} e ${document.uuid}.`
      );
    }

    let typeMap = this.#byType.get(recordType);
    if (!typeMap) {
      typeMap = new Map();
      this.#byType.set(recordType, typeMap);
    }

    typeMap.set(document.uuid, document);
    this.#byEntityId.set(record.data.entityId, document);
    this.#entityIdByUuid.set(document.uuid, record.data.entityId);

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

      for (const ctrl of record.data.governance?.controllers ?? []) {
        addToSetMap(this.#domainsByController, ctrl, document.uuid);
      }

      for (const tag of record.data.identity?.tags ?? []) {
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
    } else if (recordType === RECORD_TYPES.SQUAD) {
      removeUuidFromSetMap(this.#squadsByDomain, document.uuid);
      addReferenceToSetMap(this.#squadsByDomain, record.data.parentDomain, document.uuid);
    } else if (recordType === RECORD_TYPES.PERSON) {
      removeUuidFromSetMap(this.#peopleByDomain, document.uuid);
      removeUuidFromSetMap(this.#peopleBySquad, document.uuid);
      addReferenceToSetMap(this.#peopleByDomain, record.data.primaryDomain, document.uuid);
      addReferenceToSetMap(this.#peopleBySquad, record.data.squad, document.uuid);
    } else if (recordType === RECORD_TYPES.STRUCTURE) {
      removeUuidFromSetMap(this.#structuresByDomain, document.uuid);
      removeUuidFromSetMap(this.#structuresByProject, document.uuid);
      addReferenceToSetMap(this.#structuresByDomain, record.data.domain, document.uuid);
      addReferenceToSetMap(this.#structuresByProject, record.data.activeProject, document.uuid);
    } else if (recordType === RECORD_TYPES.AGREEMENT) {
      removeUuidFromSetMap(this.#agreementsByDomain, document.uuid);
      for (const domainReference of record.data.parties ?? []) {
        addReferenceToSetMap(this.#agreementsByDomain, domainReference, document.uuid);
      }
    }
  }

  remove(documentOrUuid) {
    const uuid = typeof documentOrUuid === "string" ? documentOrUuid : documentOrUuid?.uuid;
    if (!uuid) return;

    for (const typeMap of this.#byType.values()) {
      typeMap.delete(uuid);
    }

    const entityId = this.#entityIdByUuid.get(uuid);
    if (entityId) this.#byEntityId.delete(entityId);
    this.#entityIdByUuid.delete(uuid);

    removeUuidFromSetMap(this.#domainsByAdministrativeParent, uuid);
    removeUuidFromSetMap(this.#domainsByLocation, uuid);
    removeUuidFromSetMap(this.#projectsByDomain, uuid);
    removeUuidFromSetMap(this.#missionsByDomain, uuid);
    removeUuidFromSetMap(this.#requestsByDomain, uuid);
    removeUuidFromSetMap(this.#domainsByController, uuid);
    removeUuidFromSetMap(this.#domainsByTag, uuid);
    removeUuidFromSetMap(this.#squadsByDomain, uuid);
    removeUuidFromSetMap(this.#peopleByDomain, uuid);
    removeUuidFromSetMap(this.#peopleBySquad, uuid);
    removeUuidFromSetMap(this.#structuresByDomain, uuid);
    removeUuidFromSetMap(this.#structuresByProject, uuid);
    removeUuidFromSetMap(this.#agreementsByDomain, uuid);
  }

  get(recordType, uuid) {
    return this.#byType.get(recordType)?.get(uuid) ?? null;
  }

  getByEntityId(entityId) {
    return this.#byEntityId.get(entityId) ?? null;
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

  squadsForDomain(domainUuid) {
    return Array.from(this.#squadsByDomain.get(domainUuid) ?? [])
      .map((uuid) => this.get(RECORD_TYPES.SQUAD, uuid))
      .filter(Boolean);
  }

  peopleForDomain(domainUuid) {
    return Array.from(this.#peopleByDomain.get(domainUuid) ?? [])
      .map((uuid) => this.get(RECORD_TYPES.PERSON, uuid))
      .filter(Boolean);
  }

  peopleForSquad(squadUuid) {
    return Array.from(this.#peopleBySquad.get(squadUuid) ?? [])
      .map((uuid) => this.get(RECORD_TYPES.PERSON, uuid))
      .filter(Boolean);
  }

  structuresForDomain(domainUuid) {
    return Array.from(this.#structuresByDomain.get(domainUuid) ?? [])
      .map((uuid) => this.get(RECORD_TYPES.STRUCTURE, uuid))
      .filter(Boolean);
  }

  structuresForProject(projectKey) {
    return Array.from(this.#structuresByProject.get(projectKey) ?? [])
      .map((uuid) => this.get(RECORD_TYPES.STRUCTURE, uuid))
      .filter(Boolean);
  }

  agreementsForDomain(domainUuid) {
    return Array.from(this.#agreementsByDomain.get(domainUuid) ?? [])
      .map((uuid) => this.get(RECORD_TYPES.AGREEMENT, uuid))
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
