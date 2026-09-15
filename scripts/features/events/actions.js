import { executeCommandAuthoritatively } from "../../authority/execute.js";
import { COMMAND_TYPES, RECORD_TYPES } from "../../core/constants.js";
import { getResourceCatalogSetting } from "../../core/settings.js";
import { recordIndex } from "../../data/record-index.js";
import { getRecord } from "../../data/journal-store.js";
import { decodeRecord } from "../../models/record-codec.js";
import { calculateDomainRisks } from "../risks/rules.js";
import { rollDomainEvent } from "./roller.js";

function assertGM() {
  if (!game.user.isGM) {
    throw new Error("Apenas o Mestre pode rolar e aplicar eventos.");
  }
}

function domainReference(uuid) {
  return { recordType: RECORD_TYPES.DOMAIN, uuid, entityId: null };
}

function operationId(value = null) {
  return String(value ?? "").trim() || null;
}

/** Rola um evento e retorna dados puros para a futura interface apresentar. */
export function rollEventForDomain({
  domainUuid = null,
  category = null,
  randomFn = Math.random
} = {}) {
  assertGM();

  const document = domainUuid
    ? recordIndex.get(RECORD_TYPES.DOMAIN, domainUuid)
    : recordIndex.list(RECORD_TYPES.DOMAIN)[0];

  if (!document) throw new Error("Nenhum domínio disponível para o evento.");

  const domain = decodeRecord(document);
  const catalog = getResourceCatalogSetting();
  const risks = calculateDomainRisks(domain.data, catalog);
  const event = rollDomainEvent({
    domain: domain.data,
    category,
    risks,
    randomFn
  });

  return { domain, event, risks, catalog };
}

/** Aplica um resultado já escolhido sem criar dialogs ou depender do DOM. */
export async function executeApplyEventOutcome({
  domainUuid,
  event,
  outcomeIndex = 0,
  postToChat = true,
  expectedModifiedTime = null,
  operationId: requestedOperationId = null
} = {}) {
  const domain = await getRecord(domainUuid);
  await executeCommandAuthoritatively({
    commandType: COMMAND_TYPES.DOMAIN_EVENT_APPLY,
    operationId: operationId(requestedOperationId),
    payload: {
      domain: domainReference(domainUuid),
      expectedModifiedTime: expectedModifiedTime
        ?? domain.document?._stats?.modifiedTime,
      event,
      outcomeIndex,
      postToChat
    }
  });
  return getRecord(domainUuid);
}

/**
 * Rola e aplica um evento diretamente, registrando nas crônicas e enviando ao chat.
 */
export async function executeRollAndApplyEvent({
  domainUuid = null,
  category = null,
  outcomeIndex = 0,
  postToChat = true,
  operationId: requestedOperationId = null
} = {}) {
  assertGM();
  const { domain, event } = rollEventForDomain({ domainUuid, category });
  return executeApplyEventOutcome({
    domainUuid: domain.document.uuid,
    event,
    outcomeIndex,
    postToChat,
    expectedModifiedTime: domain.document?._stats?.modifiedTime,
    operationId: requestedOperationId
  });
}
