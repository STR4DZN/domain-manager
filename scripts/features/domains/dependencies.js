import { RECORD_TYPES } from "../../core/constants.js";
import { recordIndex } from "../../data/record-index.js";
import { decodeRecord } from "../../models/record-codec.js";

const GROUPS = Object.freeze([
  { key: "hierarchy", label: "Hierarquia de domínios", view: "domains" },
  { key: "projects", label: "Projetos", view: "projects" },
  { key: "structures", label: "Estruturas", view: "structures" },
  { key: "missions", label: "Missões", view: "missions" },
  { key: "requests", label: "Solicitações", view: "requests" },
  { key: "squads", label: "Forças", view: "squads" },
  { key: "people", label: "Pessoas", view: "people" },
  { key: "agreements", label: "Acordos", view: "diplomacy" },
  { key: "relations", label: "Relações diplomáticas", view: "diplomacy" },
  { key: "territory", label: "Controle territorial", view: "territory" },
  { key: "intel", label: "Inteligência", view: "intel" }
]);

function referenceMatchesDomain(reference, domain) {
  if (!reference || !domain) return false;
  if (typeof reference === "string") {
    return reference === domain.uuid || reference === domain.data.entityId;
  }
  return reference.uuid === domain.uuid || reference.entityId === domain.data.entityId;
}

function itemFor(record, detail, localId = "") {
  return {
    id: `${record.uuid}:${localId || detail}`,
    uuid: record.uuid,
    entityId: record.data.entityId,
    recordType: record.recordType,
    name: record.document.name,
    detail
  };
}

export function buildDomainDependencyReport(domain) {
  if (!domain?.uuid || domain.recordType !== RECORD_TYPES.DOMAIN) {
    throw new TypeError("buildDomainDependencyReport exige um Domain decodificado.");
  }

  const found = new Map(GROUPS.map(({ key }) => [key, new Map()]));
  const add = (key, record, detail, localId = "") => {
    const item = itemFor(record, detail, localId);
    found.get(key).set(item.id, item);
  };

  for (const document of recordIndex.list(RECORD_TYPES.DOMAIN)) {
    if (document.uuid === domain.uuid) continue;
    const record = decodeRecord(document);
    if (!record) continue;

    if (record.data.hierarchy?.locatedInUuid === domain.uuid) {
      add("hierarchy", record, "Localizado neste domínio", "located-in");
    }
    if (record.data.hierarchy?.administrativeParentUuid === domain.uuid) {
      add("hierarchy", record, "Administrado por este domínio", "administrative-parent");
    }

    for (const relation of record.data.relations ?? []) {
      if (relation.targetDomainUuid === domain.uuid || referenceMatchesDomain(relation.target, domain)) {
        add("relations", record, "Relação aponta para este domínio", relation.localId);
      }
    }
    for (const agreement of record.data.agreements ?? []) {
      if (agreement.targetDomainUuid === domain.uuid) {
        add("agreements", record, "Acordo legado aponta para este domínio", agreement.localId);
      }
    }
    if (referenceMatchesDomain(record.data.territory?.controller, domain)) {
      add("territory", record, "Controlador territorial", "territory-controller");
    }
    for (const influence of record.data.territory?.influence ?? []) {
      if (referenceMatchesDomain(influence.domain, domain)) {
        add("territory", record, "Influência territorial", influence.localId);
      }
    }
    for (const intel of record.data.intel ?? []) {
      if (referenceMatchesDomain(intel.targetDomain, domain)) {
        add("intel", record, "Informação aponta para este domínio", intel.localId);
      }
    }
  }

  for (const document of recordIndex.list(RECORD_TYPES.PROJECT)) {
    const record = decodeRecord(document);
    if (record?.data.domainUuid === domain.uuid) add("projects", record, "Projeto deste domínio");
  }
  for (const document of recordIndex.list(RECORD_TYPES.STRUCTURE)) {
    const record = decodeRecord(document);
    if (record && referenceMatchesDomain(record.data.domain, domain)) add("structures", record, "Estrutura deste domínio");
  }
  for (const document of recordIndex.list(RECORD_TYPES.MISSION)) {
    const record = decodeRecord(document);
    if (!record) continue;
    if (record.data.primaryDomainUuid === domain.uuid) add("missions", record, "Domínio principal da missão", "primary");
    if ((record.data.relatedDomainUuids ?? []).includes(domain.uuid)) add("missions", record, "Domínio relacionado à missão", "related");
  }
  for (const document of recordIndex.list(RECORD_TYPES.REQUEST)) {
    const record = decodeRecord(document);
    if (!record) continue;
    if (record.data.primaryDomainUuid === domain.uuid) add("requests", record, "Domínio principal da solicitação", "primary");
    if ((record.data.relatedDomainUuids ?? []).includes(domain.uuid)) add("requests", record, "Domínio relacionado à solicitação", "related");
  }
  for (const document of recordIndex.list(RECORD_TYPES.SQUAD)) {
    const record = decodeRecord(document);
    if (record && referenceMatchesDomain(record.data.parentDomain, domain)) add("squads", record, "Força vinculada ao domínio");
  }
  for (const document of recordIndex.list(RECORD_TYPES.PERSON)) {
    const record = decodeRecord(document);
    if (!record) continue;
    if (referenceMatchesDomain(record.data.primaryDomain, domain)) add("people", record, "Domínio principal da pessoa", "primary");
    if (referenceMatchesDomain(record.data.currentLocation, domain)) add("people", record, "Localização atual da pessoa", "location");
  }
  for (const document of recordIndex.list(RECORD_TYPES.AGREEMENT)) {
    const record = decodeRecord(document);
    if (!record) continue;
    const isParty = (record.data.parties ?? []).some((party) => referenceMatchesDomain(party, domain));
    const isTransferEndpoint = (record.data.transfers ?? []).some((transfer) =>
      referenceMatchesDomain(transfer.fromDomain, domain) || referenceMatchesDomain(transfer.toDomain, domain)
    );
    if (isParty || isTransferEndpoint) add("agreements", record, isParty ? "Parte do acordo" : "Origem ou destino de transferência");
  }

  const groups = GROUPS.map((definition) => {
    const items = [...found.get(definition.key).values()];
    return { ...definition, count: items.length, items };
  }).filter((group) => group.count > 0);
  const total = groups.reduce((sum, group) => sum + group.count, 0);

  return {
    domain: {
      uuid: domain.uuid,
      entityId: domain.data.entityId,
      name: domain.document.name,
      expectedModifiedTime: domain.document._stats?.modifiedTime ?? null
    },
    groups,
    total,
    blocked: total > 0
  };
}

