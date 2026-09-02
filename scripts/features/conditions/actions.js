import { RECORD_TYPES } from "../../core/constants.js";
import { recordIndex } from "../../data/record-index.js";
import { updateRecord } from "../../data/journal-store.js";
import { decodeRecord } from "../../models/record-codec.js";
import {
  addDomainCondition,
  removeDomainCondition,
  updateDomainCondition
} from "./rules.js";

function loadDomain(domainUuid) {
  if (!game.user.isGM) {
    throw new Error("Apenas o Mestre pode alterar condições.");
  }

  const document = recordIndex.get(RECORD_TYPES.DOMAIN, domainUuid);
  if (!document) throw new Error(`Domínio '${domainUuid}' não encontrado.`);
  return decodeRecord(document);
}

async function persistConditions(domainUuid, data) {
  return updateRecord({
    uuid: domainUuid,
    recordType: RECORD_TYPES.DOMAIN,
    data
  });
}

export async function createDomainConditionAction({
  domainUuid,
  condition
}) {
  const domain = loadDomain(domainUuid);
  return persistConditions(
    domainUuid,
    addDomainCondition(domain.data, condition)
  );
}

export async function updateDomainConditionAction({
  domainUuid,
  localId,
  patch
}) {
  const domain = loadDomain(domainUuid);
  return persistConditions(
    domainUuid,
    updateDomainCondition(domain.data, localId, patch)
  );
}

export async function removeDomainConditionAction({ domainUuid, localId }) {
  const domain = loadDomain(domainUuid);
  return persistConditions(
    domainUuid,
    removeDomainCondition(domain.data, localId)
  );
}

export async function toggleDomainConditionAction({ domainUuid, localId }) {
  const domain = loadDomain(domainUuid);
  const condition = domain.data.conditions.find(
    (item) => item.localId === localId
  );
  if (!condition) throw new Error(`Condição '${localId}' não encontrada.`);

  return persistConditions(
    domainUuid,
    updateDomainCondition(domain.data, localId, {
      active: !condition.active
    })
  );
}
