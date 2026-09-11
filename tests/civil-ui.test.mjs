import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const shell = fs.readFileSync(path.join(root, "scripts/ui/shell-app.js"), "utf8");
const template = fs.readFileSync(path.join(root, "templates/app-shell.hbs"), "utf8");
const viewsCss = fs.readFileSync(path.join(root, "styles/app/views.css"), "utf8");
const dialogsCss = fs.readFileSync(path.join(root, "styles/app/dialogs.css"), "utf8");

const populationActions = [
  "openPopulationConfig", "closePopulationConfig", "submitPopulationConfig",
  "openPopulationGroup", "closePopulationGroup", "submitPopulationGroup", "removePopulationGroup",
  "openWorkforce", "closeWorkforce", "submitWorkforce"
];
const peopleActions = ["selectPerson", "openPersonEditor", "closePersonEditor", "submitPersonEditor"];

test("Civil Control expõe summary, cohorts e workforce matrix como ferramentas distintas", () => {
  for (const marker of [
    "dm-civil-overview",
    "dm-cohort-table",
    "dm-cohort-row",
    "dm-workforce-board",
    "WORKFORCE MATRIX",
    "Structure Staffing",
    "workforceCoverageDisplay"
  ]) assert.ok(template.includes(marker), `Civil Control sem ${marker}`);

  for (const label of ["POPULATION", "MORALE", "WORKFORCE", "ASSIGNED", "AVAILABLE"]) {
    assert.ok(template.includes(`<small>${label}</small>`), `summary sem ${label}`);
  }
});

test("Civil Control e Personnel registram todas as actions na ApplicationV2", () => {
  for (const action of [...populationActions, ...peopleActions]) {
    assert.match(template, new RegExp(`data-action=["']${action}["']`), `template sem action ${action}`);
    assert.match(shell, new RegExp(`${action}:\\s*DomainManagerShellApp\\.`), `DEFAULT_OPTIONS sem ${action}`);
  }
});

test("Population/People UI muta somente pelo Command Kernel", () => {
  for (const type of [
    "POPULATION_CONFIGURE", "POPULATION_GROUP_UPSERT", "POPULATION_GROUP_REMOVE", "POPULATION_WORKFORCE_SET",
    "PERSON_CREATE", "PERSON_UPDATE"
  ]) assert.match(shell, new RegExp(`COMMAND_TYPES\\.${type}`), `command type ausente: ${type}`);

  const start = shell.indexOf("static onOpenPopulationConfig");
  const end = shell.indexOf("static onOpenCreateStructure", start);
  assert.ok(start >= 0 && end > start, "bloco de handlers Civil/People não localizado");
  const handlers = shell.slice(start, end);
  assert.equal(/JournalEntry\.(?:create|updateDocuments)|\.document\.update\(/.test(handlers), false,
    "Civil/People UI não pode persistir Journal diretamente");
});

test("Civil Control possui linguagem visual app-style e responsiva sem ressuscitar o layout legado", () => {
  for (const selector of [
    ".dm-civil-overview", ".dm-civil-control-grid", ".dm-cohort-table", ".dm-workforce-board", ".dm-workforce-row"
  ]) assert.ok(viewsCss.includes(selector), `selector Civil ausente: ${selector}`);
  for (const selector of [
    ".dm-civil-dialog", ".dm-workforce-dialog", ".dm-workforce-matrix", ".dm-person-dialog", ".dm-system-dialog--ultrawide"
  ]) assert.ok(dialogsCss.includes(selector), `selector dialog Civil ausente: ${selector}`);

  for (const legacy of [
    "dm-civil-layout", "dm-population-core", "dm-population-number", "dm-population-wave", "dm-group-index"
  ]) {
    assert.equal(template.includes(legacy), false, `template ressuscitou ${legacy}`);
    assert.equal(viewsCss.includes(`.${legacy}`), false, `CSS morto ressuscitou ${legacy}`);
  }
  assert.match(viewsCss, /@media\(max-width:1040px\)/);
});

test("Personnel continua master-detail e editor expõe estado sistêmico real", () => {
  for (const marker of [
    "dm-personnel-table", "dm-personnel-row", "NEW PERSON", "selectPerson", "MORALE", "CONDITION", "PERSON / V8"
  ]) assert.ok(template.includes(marker), `Personnel sem ${marker}`);
  assert.match(template, /name="squadEntityId"/);
  assert.match(template, /name="actorUuid"/);
  assert.match(template, /name="portrait"/);
});

test("Structure consoles expõem workforceRequired para fechar o ciclo Civil → Infrastructure", () => {
  const occurrences = [...template.matchAll(/name="workforceRequired"/g)].length;
  assert.ok(occurrences >= 2, `esperava workforceRequired em create + admin, recebido ${occurrences}`);
  assert.match(shell, /workforceRequired:\s*Number\(data\.get\("workforceRequired"\)/);
});
