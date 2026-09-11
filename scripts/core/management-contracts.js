import {
  CAPABILITY_KEYS,
  MANAGEMENT_PRESETS
} from "./constants.js";

const ALL_ENABLED = Object.freeze(
  Object.fromEntries(CAPABILITY_KEYS.map((key) => [key, true]))
);

const PRESET_CAPABILITIES = Object.freeze({
  squad: Object.freeze({
    economy: true,
    population: false,
    people: true,
    structures: false,
    projects: false,
    squads: true,
    missions: true,
    diplomacy: false,
    territory: false,
    intel: true,
    security: false
  }),
  outpost: Object.freeze({
    economy: true,
    population: true,
    people: true,
    structures: true,
    projects: true,
    squads: true,
    missions: true,
    diplomacy: false,
    territory: false,
    intel: true,
    security: true
  }),
  base: ALL_ENABLED,
  "strategic-organization": Object.freeze({
    economy: true,
    population: true,
    people: true,
    structures: false,
    projects: true,
    squads: true,
    missions: true,
    diplomacy: true,
    territory: true,
    intel: true,
    security: true
  }),
  custom: Object.freeze(
    Object.fromEntries(CAPABILITY_KEYS.map((key) => [key, false]))
  )
});

export function capabilityDefaultsForPreset(preset = "base") {
  if (!MANAGEMENT_PRESETS.includes(preset)) {
    throw new Error(`Management preset inválido: ${preset}`);
  }
  return structuredClone(PRESET_CAPABILITIES[preset]);
}

export function normalizeCapabilities(capabilities = {}, { preset = "base" } = {}) {
  const result = capabilityDefaultsForPreset(preset);
  const source = capabilities && typeof capabilities === "object"
    ? capabilities
    : {};

  for (const [key, value] of Object.entries(source)) {
    if (!CAPABILITY_KEYS.includes(key)) {
      throw new Error(`Capability desconhecida: ${key}`);
    }
    if (typeof value !== "boolean") {
      throw new Error(`Capability '${key}' precisa ser booleana.`);
    }
    result[key] = value;
  }

  return result;
}

export function normalizeManagementConfig(management = null, {
  defaultPreset = "base"
} = {}) {
  const source = management && typeof management === "object"
    ? management
    : {};
  const preset = String(source.preset ?? defaultPreset).trim();

  if (!MANAGEMENT_PRESETS.includes(preset)) {
    throw new Error(`Management preset inválido: ${preset}`);
  }

  return {
    preset,
    capabilities: normalizeCapabilities(source.capabilities, { preset })
  };
}

export function hasCapability(domainData, capability) {
  if (!CAPABILITY_KEYS.includes(capability)) return false;
  return domainData?.management?.capabilities?.[capability] === true;
}

export function getManagementPresetDefinition(preset) {
  return Object.freeze({
    preset,
    capabilities: capabilityDefaultsForPreset(preset)
  });
}
