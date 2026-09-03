import {
  ECONOMY_LIMITS,
  FLOW_CATEGORIES,
  FLOW_DIRECTIONS
} from "../../core/constants.js";
import {
  assertPrecision,
  assertSafeMinorAmount
} from "../../core/numbers.js";
import {
  ERROR_CODES,
  ModuleError
} from "../../core/errors.js";

export function slugifyResourceId(name) {
  const slug = String(name ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!slug) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      "Não foi possível gerar um ID para o recurso."
    );
  }

  return slug;
}

export function normalizeResourceDefinition({
  id,
  name,
  unit = "",
  precision = 0,
  allowNegative = false
}) {
  const cleanName =
    String(name ?? "").trim();
  const cleanUnit =
    String(unit ?? "").trim();
  const cleanId =
    String(id ?? "").trim()
    || slugifyResourceId(cleanName);

  if (!cleanName) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      "O nome do recurso é obrigatório."
    );
  }

  if (
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(
      cleanId
    )
  ) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      "resourceId deve usar apenas letras minúsculas, números e hífens."
    );
  }

  try {
    assertPrecision(Number(precision));
  } catch (error) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      error.message,
      { cause: error }
    );
  }

  return {
    id: cleanId,
    name: cleanName,
    unit: cleanUnit,
    precision: Number(precision),
    allowNegative:
      Boolean(allowNegative)
  };
}

export function upsertResourceInCatalog(
  catalog,
  definition,
  {
    originalId = null
  } = {}
) {
  const normalized =
    normalizeResourceDefinition(definition);

  const resources = Array.isArray(
    catalog?.resources
  )
    ? structuredClone(catalog.resources)
    : [];

  if (
    originalId
    && normalized.id !== originalId
  ) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      "O ID de um recurso existente não pode ser alterado."
    );
  }

  const index = resources.findIndex(
    (entry) =>
      entry.id === (
        originalId
        || normalized.id
      )
  );

  if (index >= 0) {
    resources[index] = normalized;
  } else {
    if (
      resources.some(
        (entry) =>
          entry.id === normalized.id
      )
    ) {
      throw new ModuleError(
        ERROR_CODES.CONFLICT,
        `Já existe um recurso com ID '${normalized.id}'.`
      );
    }

    resources.push(normalized);
  }

  resources.sort(
    (a, b) =>
      a.name.localeCompare(b.name)
  );

  return {
    version: 1,
    resources
  };
}

export function resourceMap(catalog) {
  return new Map(
    (catalog?.resources ?? [])
      .map(
        (resource) => [
          resource.id,
          normalizeResourceDefinition(resource)
        ]
      )
  );
}

export function normalizeStockEntries(
  entries,
  catalog
) {
  const resources = resourceMap(catalog);
  const seen = new Set();
  const result = [];

  for (const entry of entries ?? []) {
    const resource =
      resources.get(entry.resourceId);

    if (!resource) {
      throw new ModuleError(
        ERROR_CODES.VALIDATION,
        `Recurso desconhecido: ${entry.resourceId}`
      );
    }

    if (seen.has(entry.resourceId)) {
      throw new ModuleError(
        ERROR_CODES.VALIDATION,
        `Estoque duplicado: ${entry.resourceId}`
      );
    }

    seen.add(entry.resourceId);

    try {
      assertSafeMinorAmount(entry.amount);
    } catch (error) {
      throw new ModuleError(
        ERROR_CODES.VALIDATION,
        error.message,
        { cause: error }
      );
    }

    if (
      entry.amount < 0
      && !resource.allowNegative
    ) {
      throw new ModuleError(
        ERROR_CODES.VALIDATION,
        `${resource.name} não permite estoque negativo.`
      );
    }

    result.push({
      resourceId: entry.resourceId,
      amount: entry.amount
    });
  }

  return result.sort(
    (a, b) =>
      a.resourceId.localeCompare(
        b.resourceId
      )
  );
}

export function normalizeFlow({
  localId,
  name,
  resourceId,
  direction,
  amount,
  periodTicks,
  category = "manual",
  source = "",
  active = true
}, catalog) {
  const resources = resourceMap(catalog);
  const cleanName =
    String(name ?? "").trim();

  if (!resources.has(resourceId)) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      `Recurso desconhecido: ${resourceId}`
    );
  }

  if (!cleanName) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      "O nome do fluxo é obrigatório."
    );
  }

  if (
    !FLOW_DIRECTIONS.includes(direction)
  ) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      `Direção inválida: ${direction}`
    );
  }

  const cleanCategory = String(category ?? "manual").trim() || "manual";

  try {
    assertSafeMinorAmount(amount);
  } catch (error) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      error.message,
      { cause: error }
    );
  }

  if (amount <= 0) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      "A quantidade do fluxo precisa ser maior que zero."
    );
  }

  if (
    !Number.isInteger(periodTicks)
    || periodTicks < 1
    || periodTicks
      > ECONOMY_LIMITS.MAX_PERIOD_TICKS
  ) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      `periodTicks precisa estar entre 1 e ${ECONOMY_LIMITS.MAX_PERIOD_TICKS}.`
    );
  }

  return {
    localId:
      String(localId ?? "").trim()
      || foundry.utils.randomID(),

    name: cleanName,
    resourceId,
    direction,
    amount,
    periodTicks,
    category: cleanCategory,
    source:
      String(source ?? "").trim(),
    active: Boolean(active)
  };
}

export function upsertFlow(
  flows,
  flow
) {
  const result =
    structuredClone(flows ?? []);

  const index = result.findIndex(
    (entry) =>
      entry.localId === flow.localId
  );

  if (index >= 0) {
    result[index] = flow;
  } else {
    result.push(flow);
  }

  return result;
}
