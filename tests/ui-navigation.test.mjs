import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDomainNavigation,
  buildGlobalNavigation,
  normalizeViewForDomain
} from "../scripts/ui/navigation.js";

const squadDomain = {
  management: {
    capabilities: {
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
    }
  }
};

test("Squad não recebe módulos estratégicos desativados", () => {
  const ids = buildDomainNavigation(squadDomain).map((item) => item.id);
  assert.deepEqual(ids, ["overview", "economy", "people", "squads", "missions", "intel", "history"]);
});

test("view indisponível cai para overview", () => {
  assert.equal(normalizeViewForDomain(squadDomain, "diplomacy"), "overview");
  assert.equal(normalizeViewForDomain(squadDomain, "missions"), "missions");
});

test("System é visível apenas para GM", () => {
  assert.equal(buildGlobalNavigation({ isGM: false }).some((item) => item.id === "system"), false);
  assert.equal(buildGlobalNavigation({ isGM: true }).some((item) => item.id === "system"), true);
});
