import test from "node:test";
import assert from "node:assert/strict";

import {
  capabilityDefaultsForPreset,
  hasCapability,
  normalizeCapabilities,
  normalizeManagementConfig
} from "../scripts/core/management-contracts.js";
import { CAPABILITY_KEYS } from "../scripts/core/constants.js";

test("preset base habilita todas as capabilities conhecidas", () => {
  const config = normalizeManagementConfig({ preset: "base" });
  assert.equal(config.preset, "base");
  for (const key of CAPABILITY_KEYS) {
    assert.equal(config.capabilities[key], true, key);
  }
});

test("preset squad reduz complexidade sem remover economy/missions/squads/intel", () => {
  const config = normalizeManagementConfig({ preset: "squad" });
  assert.equal(config.capabilities.economy, true);
  assert.equal(config.capabilities.missions, true);
  assert.equal(config.capabilities.people, true);
  assert.equal(config.capabilities.squads, true);
  assert.equal(config.capabilities.intel, true);
  assert.equal(config.capabilities.population, false);
  assert.equal(config.capabilities.structures, false);
  assert.equal(config.capabilities.diplomacy, false);
  assert.equal(config.capabilities.territory, false);
});

test("capabilities explícitas são a fonte de verdade sobre o preset", () => {
  const config = normalizeManagementConfig({
    preset: "outpost",
    capabilities: {
      diplomacy: true,
      population: false
    }
  });
  assert.equal(config.preset, "outpost");
  assert.equal(config.capabilities.diplomacy, true);
  assert.equal(config.capabilities.population, false);
  assert.equal(config.capabilities.structures, true);
});

test("management rejeita preset/capability desconhecidos e valores não booleanos", () => {
  assert.throws(() => normalizeManagementConfig({ preset: "mega-base" }), /preset inválido/i);
  assert.throws(() => normalizeCapabilities({ magic: true }), /desconhecida/i);
  assert.throws(() => normalizeCapabilities({ economy: "yes" }), /booleana/i);
});

test("hasCapability só retorna true para capability declarada e habilitada", () => {
  const domain = { management: normalizeManagementConfig({ preset: "squad" }) };
  assert.equal(hasCapability(domain, "economy"), true);
  assert.equal(hasCapability(domain, "population"), false);
  assert.equal(hasCapability(domain, "unknown"), false);
});

test("capabilityDefaultsForPreset devolve cópia independente", () => {
  const first = capabilityDefaultsForPreset("base");
  first.economy = false;
  const second = capabilityDefaultsForPreset("base");
  assert.equal(second.economy, true);
});
