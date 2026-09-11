import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const shell = fs.readFileSync(path.join(root, "scripts/ui/shell-app.js"), "utf8");
const template = fs.readFileSync(path.join(root, "templates/app-shell.hbs"), "utf8");
const views = fs.readFileSync(path.join(root, "styles/app/views.css"), "utf8");

function projectViewBlock() {
  const start = template.indexOf("{{#if view.projects}}");
  const end = template.indexOf("{{#if view.squads}}", start);
  assert.ok(start >= 0 && end > start, "bloco Projects não localizado");
  return template.slice(start, end);
}

test("Projects Advanced usa master-detail selecionável e inspector contextual", () => {
  const block = projectViewBlock();
  assert.match(block, /data-action="selectProject"/);
  assert.match(block, /data-project-uuid="\{\{uuid\}\}"/);
  assert.match(template, /PROJECT DOSSIER/);
  assert.match(template, /EXECUTION VECTOR/);
  assert.match(template, /COST PLAN/);
  assert.match(template, /LINKED ASSETS/);
  assert.match(views, /\.dm-project-row\.is-selected/);
  assert.match(views, /\.dm-project-inspector__costs/);
});

test("Projects Advanced despacha todas as mutações pelo Command Kernel", () => {
  assert.match(shell, /COMMAND_TYPES\.PROJECT_CREATE/);
  assert.match(shell, /COMMAND_TYPES\.PROJECT_UPDATE/);
  assert.match(shell, /COMMAND_TYPES\.PROJECT_COST_UPSERT/);
  assert.match(shell, /COMMAND_TYPES\.PROJECT_COST_REMOVE/);
  assert.doesNotMatch(shell, /from "\.\.\/features\/projects\/actions\.js"/);
  assert.match(shell, /executeCommandAuthoritatively/);
});

test("UI não expõe conclusão manual de Project", () => {
  const block = projectViewBlock();
  assert.doesNotMatch(block, /completeProject|complete-project|COMPLETE PROJECT|CONCLUIR PROJECT/i);
  assert.match(template, /SIMULATION OWNS COMPLETION/);
  assert.doesNotMatch(template, /data-action="[^"]*(?:completeProject|complete-project)[^"]*"/i);
});

test("plano de custos fica atrás de editor dedicado e guardrail de progresso", () => {
  assert.match(template, /id="dm-project-cost-form"/);
  assert.match(template, /data-action="openProjectCostEditor"/);
  assert.match(template, /data-action="removeProjectCost"/);
  assert.match(template, /COST PLAN IMMUTABILITY/);
  assert.match(shell, /Number\(project\.data\.work\?\.completed \?\? 0\) > 0/);
});

test("Projects Advanced dev.138 preserva schema 9", () => {
  const constants = fs.readFileSync(path.join(root, "scripts/core/constants.js"), "utf8");
  assert.match(constants, /SCHEMA_VERSION\s*=\s*9/);
});

test("Project legacy actions não mantêm write path ou hard-delete direto", () => {
  const actions = fs.readFileSync(path.join(root, "scripts/features/projects/actions.js"), "utf8");
  for (const forbidden of ["createRecord", "updateRecord", "updateRecordsBatch", "record.document.delete", "transactionQueue"]) {
    assert.ok(!actions.includes(forbidden), `projects/actions.js ainda contém write path legado: ${forbidden}`);
  }
  for (const commandType of ["PROJECT_CREATE", "PROJECT_UPDATE", "PROJECT_COST_UPSERT", "PROJECT_COST_REMOVE"]) {
    assert.match(actions, new RegExp(`COMMAND_TYPES\\.${commandType}`), `wrapper não delega ${commandType}`);
  }
});
