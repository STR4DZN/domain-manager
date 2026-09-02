import { ModuleError, ERROR_CODES } from "../../core/errors.js";

export function normalizeControllerIds(controllerIds) {
  return Array.from(new Set((controllerIds ?? []).filter(Boolean)));
}

export function normalizeTags(tags) {
  if (Array.isArray(tags)) {
    return Array.from(new Set(
      tags.map((tag) => String(tag).trim()).filter(Boolean)
    ));
  }

  return Array.from(new Set(
    String(tags ?? "")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean)
  ));
}

export function canControlDomain(user, domainData) {
  if (user?.isGM) return true;
  return domainData?.governance?.controllers?.includes(user?.id) === true;
}

export function assertCanControlDomain(user, domainData) {
  if (canControlDomain(user, domainData)) return;

  throw new ModuleError(
    ERROR_CODES.PERMISSION,
    "Este usuário não é controlador deste Domínio."
  );
}

export function normalizeDomainDraft({
  description = "",
  category = "Base",
  nature = "physical",
  state = "active",
  tags = [],
  controllers = [],
  locatedInUuid = null,
  administrativeParentUuid = null,
  population = null,
  economy = null,
  existingData = null
}) {
  const base = existingData && typeof existingData === "object"
    ? structuredClone(existingData)
    : {};
  const sourcePopulation = population ?? base.population;
  const sourceEconomy = economy ?? base.economy;
  const cleanDescription = String(description ?? "").trim();
  const cleanCategory = String(category ?? "").trim();

  if (!cleanCategory) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      "A categoria do Domain é obrigatória."
    );
  }

  if (cleanDescription.length > 12000) {
    throw new ModuleError(
      ERROR_CODES.VALIDATION,
      "A descrição não pode exceder 12000 caracteres."
    );
  }

  return {
    ...base,
    description: cleanDescription,
    identity: {
      ...(base.identity ?? {}),
      category: cleanCategory,
      nature,
      state,
      tags: normalizeTags(tags)
    },
    hierarchy: {
      ...(base.hierarchy ?? {}),
      locatedInUuid: locatedInUuid || null,
      administrativeParentUuid: administrativeParentUuid || null
    },

    population: {
      total: Number.isInteger(sourcePopulation?.total) ? sourcePopulation.total : 0,
      countMode: sourcePopulation?.countMode || "direct",
      groups: Array.isArray(sourcePopulation?.groups) ? structuredClone(sourcePopulation.groups) : [],
      notables: Array.isArray(sourcePopulation?.notables) ? structuredClone(sourcePopulation.notables) : []
    },

    economy: {
      stocks: Array.isArray(sourceEconomy?.stocks)
        ? structuredClone(sourceEconomy.stocks)
        : [],
      flows: Array.isArray(sourceEconomy?.flows)
        ? structuredClone(sourceEconomy.flows)
        : []
    },

    governance: {
      ...(base.governance ?? {}),
      controllers: normalizeControllerIds(controllers)
    }
  };
}
