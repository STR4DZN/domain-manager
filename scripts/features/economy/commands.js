import { EVENT_TYPES, RECORD_TYPES } from "../../core/constants.js";
import { ERROR_CODES, ModuleError } from "../../core/errors.js";
import { getResourceCatalogSetting, setResourceCatalogSetting } from "../../core/settings.js";
import { updateRecord } from "../../data/journal-store.js";
import { recordIndex } from "../../data/record-index.js";
import { decodeRecord } from "../../models/record-codec.js";
import {
  normalizeEconomyConfigurePayload,
  normalizeResourceCatalogRemovePayload,
  normalizeResourceCatalogUpsertPayload
} from "./contracts.js";
import { buildResourceDependencyReport } from "./catalog-dependencies.js";
import { upsertResourceInCatalog } from "./rules.js";

function resolveDomain(reference) {
  const byEntityId = reference.entityId ? recordIndex.getByEntityId(reference.entityId) : null;
  const byUuid = reference.uuid ? recordIndex.get(RECORD_TYPES.DOMAIN, reference.uuid) : null;
  if (byEntityId && byUuid && byEntityId.uuid !== byUuid.uuid) {
    throw new ModuleError(ERROR_CODES.CONFLICT, "A referência econômica aponta para Domains diferentes.");
  }
  const document = byEntityId ?? byUuid;
  if (!document) throw new ModuleError(ERROR_CODES.NOT_FOUND, "Domain econômico não encontrado.");
  const record = decodeRecord(document);
  if (record.recordType !== RECORD_TYPES.DOMAIN) throw new ModuleError(ERROR_CODES.VALIDATION, "O registro econômico não é um Domain.");
  return record;
}

function assertGM(callerUserId) {
  const caller = game.users.get(callerUserId);
  if (!caller?.isGM) throw new ModuleError(ERROR_CODES.PERMISSION, "Somente GM pode alterar política/estoque estratégico diretamente.");
}

function assertExpectedRevision(current, expected, message) {
  if (expected === null || expected === undefined) return;
  if (current !== expected) throw new ModuleError(ERROR_CODES.CONFLICT, message);
}

function catalogVersion(catalog) {
  return Math.max(1, Number(catalog?.version ?? 1));
}

export async function executeEconomyConfigure({ payload, callerUserId }) {
  assertGM(callerUserId);
  const catalog = getResourceCatalogSetting();
  const normalized = normalizeEconomyConfigurePayload(payload, catalog);
  const domain = resolveDomain(normalized.domain);
  assertExpectedRevision(
    domain.document?._stats?.modifiedTime ?? null,
    normalized.expectedModifiedTime,
    "O Domain mudou enquanto as políticas de recursos estavam abertas. Reabra o formulário antes de salvar."
  );
  const before = foundry.utils.deepClone(domain.data);
  const data = foundry.utils.deepClone(domain.data);
  data.economy ??= { stocks: [], flows: [], resourcePolicies: [] };

  if (normalized.stocks) data.economy.stocks = normalized.stocks;
  if (normalized.resourcePolicies) data.economy.resourcePolicies = normalized.resourcePolicies;
  if (normalized.sustenanceSettings) data.economy.sustenanceSettings = normalized.sustenanceSettings;

  const updated = await updateRecord({
    uuid: domain.uuid,
    recordType: RECORD_TYPES.DOMAIN,
    name: domain.document.name,
    data,
    controllerIds: domain.data.governance?.controllers ?? []
  });

  return {
    result: {
      uuid: updated.uuid,
      entityId: updated.data.entityId,
      policies: updated.data.economy?.resourcePolicies ?? []
    },
    entities: [domain.data.entityId],
    events: [{
      type: EVENT_TYPES.ECONOMY_CONFIGURED,
      entities: [domain.data.entityId],
      payload: { entityId: domain.data.entityId }
    }],
    rollback: () => updateRecord({
      uuid: domain.uuid,
      recordType: RECORD_TYPES.DOMAIN,
      name: domain.document.name,
      data: before,
      controllerIds: domain.data.governance?.controllers ?? []
    })
  };
}

export async function executeResourceCatalogUpsert({ payload, callerUserId }) {
  assertGM(callerUserId);
  const normalized = normalizeResourceCatalogUpsertPayload(payload);
  const before = getResourceCatalogSetting();
  assertExpectedRevision(
    catalogVersion(before),
    normalized.expectedCatalogVersion,
    "O catálogo de recursos mudou enquanto o editor estava aberto. Reabra o catálogo antes de salvar."
  );

  const existing = normalized.originalId
    ? (before.resources ?? []).find((resource) => resource.id === normalized.originalId)
    : null;
  if (normalized.originalId && !existing) {
    throw new ModuleError(ERROR_CODES.NOT_FOUND, "O recurso que seria editado não existe mais.");
  }
  if (existing && existing.precision !== normalized.definition.precision) {
    const dependencies = buildResourceDependencyReport(existing.id);
    if (dependencies.total) {
      throw new ModuleError(
        ERROR_CODES.CONFLICT,
        "A precisão de um recurso em uso não pode ser alterada, pois isso mudaria o significado dos valores já armazenados."
      );
    }
  }

  const next = upsertResourceInCatalog(before, normalized.definition, { originalId: normalized.originalId });
  await setResourceCatalogSetting(next);
  const saved = next.resources.find((resource) => resource.id === normalized.definition.id);
  return {
    result: { resource: saved, catalogVersion: next.version },
    entities: [`resource:${saved.id}`],
    events: [{
      type: EVENT_TYPES.RESOURCE_CATALOG_UPDATED,
      entities: [`resource:${saved.id}`],
      payload: { resourceId: saved.id, catalogVersion: next.version }
    }],
    rollback: () => setResourceCatalogSetting(before)
  };
}

export async function executeResourceCatalogRemove({ payload, callerUserId }) {
  assertGM(callerUserId);
  const normalized = normalizeResourceCatalogRemovePayload(payload);
  const before = getResourceCatalogSetting();
  assertExpectedRevision(
    catalogVersion(before),
    normalized.expectedCatalogVersion,
    "O catálogo de recursos mudou enquanto a confirmação estava aberta. Reabra o catálogo antes de remover."
  );
  const existing = (before.resources ?? []).find((resource) => resource.id === normalized.resourceId);
  if (!existing) throw new ModuleError(ERROR_CODES.NOT_FOUND, "O recurso que seria removido não existe mais.");

  const dependencies = buildResourceDependencyReport(existing.id);
  if (dependencies.total) {
    throw new ModuleError(
      ERROR_CODES.CONFLICT,
      `${existing.name} ainda é usado por ${dependencies.total} registro(s) e não pode ser removido.`
    );
  }

  const next = {
    version: catalogVersion(before) + 1,
    resources: (before.resources ?? []).filter((resource) => resource.id !== existing.id)
  };
  await setResourceCatalogSetting(next);
  return {
    result: { resourceId: existing.id, catalogVersion: next.version },
    entities: [`resource:${existing.id}`],
    events: [{
      type: EVENT_TYPES.RESOURCE_CATALOG_REMOVED,
      entities: [`resource:${existing.id}`],
      payload: { resourceId: existing.id, catalogVersion: next.version }
    }],
    rollback: () => setResourceCatalogSetting(before)
  };
}
