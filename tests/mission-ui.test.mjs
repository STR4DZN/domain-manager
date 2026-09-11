import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const template = fs.readFileSync(path.join(root, "templates/app-shell.hbs"), "utf8");
const shell = fs.readFileSync(path.join(root, "scripts/ui/shell-app.js"), "utf8");
const viewsCss = fs.readFileSync(path.join(root, "styles/app/views.css"), "utf8");
const dialogsCss = fs.readFileSync(path.join(root, "styles/app/dialogs.css"), "utf8");

const requiredMissionActions = [
  "openCreateMission",
  "cancelCreateMission",
  "submitCreateMission",
  "openMissionPrepare",
  "closeMissionPrepare",
  "submitMissionPrepare",
  "releaseMissionAssignment",
  "launchMission",
  "openMissionResolve",
  "closeMissionResolve",
  "submitMissionResolve"
];

test("Mission Control expõe todos os actions do lifecycle e todos estão registrados na ApplicationV2", () => {
  for (const action of requiredMissionActions) {
    assert.match(template, new RegExp(`data-action=["']${action}["']`), `template sem data-action=${action}`);
    assert.match(shell, new RegExp(`${action}:\\s*DomainManagerShellApp\\.`), `DEFAULT_OPTIONS sem action ${action}`);
  }
});

test("Mission Control chama exclusivamente os command types autoritativos para mutações operacionais", () => {
  for (const type of ["MISSION_CREATE", "MISSION_PREPARE", "MISSION_RELEASE", "MISSION_LAUNCH", "MISSION_RESOLVE"]) {
    assert.match(shell, new RegExp(`COMMAND_TYPES\\.${type}`));
  }
});

test("template Handlebars mantém blocos if/each balanceados", () => {
  const tokens = [...template.matchAll(/{{\s*(#(?:if|each|unless)|\/(?:if|each|unless)|else)\b[^}]*}}/g)].map((match) => match[1]);
  const stack = [];
  for (const token of tokens) {
    if (token === "#if" || token === "#each" || token === "#unless") stack.push(token.slice(1));
    else if (token.startsWith("/")) {
      const closing = token.slice(1);
      assert.equal(stack.pop(), closing, `bloco Handlebars fechado fora de ordem: ${closing}`);
    } else if (token === "else") {
      assert.ok(stack.length > 0, "{{else}} fora de bloco");
    }
  }
  assert.deepEqual(stack, []);
});

test("Mission Control possui linguagem visual própria para cards, preparação e after-action", () => {
  for (const selector of [
    ".dm-mission-card",
    ".dm-target-reticle",
    ".dm-mission-telemetry",
    ".dm-mission-ready-unit",
    ".dm-mission-outcome"
  ]) assert.ok(viewsCss.includes(selector), `selector ausente: ${selector}`);
  for (const selector of [
    ".dm-mission-resource-form",
    ".dm-system-dialog--mission-resolve",
    ".dm-resolution-unit",
    ".dm-resolution-objective"
  ]) assert.ok(dialogsCss.includes(selector), `selector ausente: ${selector}`);
});

test("Mission legacy actions não mantêm persistência/autoridade paralela", () => {
  const actions = fs.readFileSync(path.join(root, "scripts/features/missions/actions.js"), "utf8");
  for (const forbidden of ["createRecord", "updateRecord", "updateRecordsBatch", "transactionQueue"]) {
    assert.ok(!actions.includes(forbidden), `actions.js ainda contém write path legado: ${forbidden}`);
  }
  for (const command of ["MISSION_CREATE", "MISSION_UPDATE", "MISSION_OBJECTIVE_UPSERT", "MISSION_OBJECTIVE_REMOVE"]) {
    assert.match(actions, new RegExp(`COMMAND_TYPES\\.${command}`), `wrapper não delega ${command}`);
  }
});
