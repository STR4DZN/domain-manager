import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDomainNavigation,
  buildGlobalNavigation,
  buildWorkspaceNavigation,
  resolveWorkspaceForView,
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
  assert.deepEqual(ids, ["overview", "requests", "conditions", "history", "economy", "missions", "squads", "people", "intel"]);
});

test("view indisponível cai para overview", () => {
  assert.equal(normalizeViewForDomain(squadDomain, "diplomacy"), "overview");
  assert.equal(normalizeViewForDomain(squadDomain, "missions"), "missions");
});

test("System é visível apenas para GM", () => {
  assert.equal(buildGlobalNavigation({ isGM: false }).some((item) => item.id === "system"), false);
  assert.equal(buildGlobalNavigation({ isGM: true }).some((item) => item.id === "system"), true);
});


test("workspaces agrupam views disponíveis sem ressuscitar capabilities desativadas", () => {
  const workspaces = buildWorkspaceNavigation(squadDomain, { activeView: "missions" });
  assert.deepEqual(workspaces.map((item) => item.id), ["command", "base", "operations", "civil", "intel"]);
  assert.deepEqual(workspaces.find((item) => item.id === "base").children.map((item) => item.id), ["economy"]);
  assert.deepEqual(workspaces.find((item) => item.id === "operations").children.map((item) => item.id), ["missions", "squads"]);
  assert.equal(workspaces.find((item) => item.id === "operations").active, true);
});

test("cada view resolve para um workspace sem depender de tabs horizontais", () => {
  assert.equal(resolveWorkspaceForView("overview"), "command");
  assert.equal(resolveWorkspaceForView("requests"), "command");
  assert.equal(resolveWorkspaceForView("conditions"), "command");
  assert.equal(resolveWorkspaceForView("structures"), "base");
  assert.equal(resolveWorkspaceForView("missions"), "operations");
  assert.equal(resolveWorkspaceForView("people"), "civil");
  assert.equal(resolveWorkspaceForView("territory"), "intel");
});
