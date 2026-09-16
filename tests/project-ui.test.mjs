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
  assert.match(template, /DETALHES DO PROJETO/);
  assert.match(template, /PROGRESSO/);
  assert.match(template, /PLANO DE CUSTOS/);
  assert.match(template, /ESTRUTURAS VINCULADAS/);
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
  assert.match(template, /A SIMULAÇÃO CONTROLA A CONCLUSÃO/);
  assert.doesNotMatch(template, /data-action="[^"]*(?:completeProject|complete-project)[^"]*"/i);
});

test("plano de custos fica atrás de editor dedicado e guardrail de progresso", () => {
  assert.match(template, /id="dm-project-cost-form"/);
  assert.match(template, /data-action="openProjectCostEditor"/);
  assert.match(template, /data-action="removeProjectCost"/);
  assert.match(template, /O plano de custos pode ser alterado apenas antes do primeiro progresso\./);
  assert.match(shell, /Number\(project\.data\.work\?\.completed \?\? 0\) > 0/);
});

test("remoção de custo exige confirmação explícita e preserva a revisão aberta", () => {
  for (const action of ["removeProjectCost", "cancelRemoveProjectCost", "confirmRemoveProjectCost"]) {
    assert.match(template, new RegExp(`data-action=["']${action}["']`), `template sem action ${action}`);
    assert.match(shell, new RegExp(`${action}:\\s*DomainManagerShellApp\\.`), `DEFAULT_OPTIONS sem ${action}`);
  }
  assert.match(template, /dm-project-cost-remove-dialog/);
  assert.match(template, /CONFIRMAÇÃO NECESSÁRIA/);
  assert.match(shell, /pendingProjectCostRemoval\s*=\s*\{/);
  assert.match(shell, /expectedModifiedTime,\s*localId/);
});

test("edição e custos de Project enviam controle de concorrência", () => {
  assert.ok((template.match(/name="expectedModifiedTime"/g) ?? []).length >= 2);
  assert.match(shell, /expectedModifiedTime:\s*record\.document\?\._stats\?\.modifiedTime/);
  assert.match(shell, /payload\.expectedModifiedTime\s*=\s*Number\(data\.get\("expectedModifiedTime"\)\)/);
  assert.match(shell, /PROJECT_COST_UPSERT[\s\S]{0,500}expectedModifiedTime:/);
});

test("Projects Advanced dev.138 preserva schema 9", () => {
  const constants = fs.readFileSync(path.join(root, "scripts/core/constants.js"), "utf8");
  assert.match(constants, /SCHEMA_VERSION\s*=\s*9/);
});

test("Project legacy actions não mantêm write path ou hard-delete direto", () => {
  const actions = fs.readFileSync(path.join(root, "scripts/features/projects/actions.js"), "utf8");
  for (const forbidden of ["createRecord", "updateRecord", "updateRecordsBatch", "record.document.delete", "transactionQueue", "dispatchAuthoritativeCommand"]) {
    assert.ok(!actions.includes(forbidden), `projects/actions.js ainda contém write path legado: ${forbidden}`);
  }
  assert.match(actions, /executeCommandAuthoritatively/, "wrappers precisam atravessar a ponte local/socket da autoridade");
  for (const commandType of ["PROJECT_CREATE", "PROJECT_UPDATE", "PROJECT_COST_UPSERT", "PROJECT_COST_REMOVE"]) {
    assert.match(actions, new RegExp(`COMMAND_TYPES\\.${commandType}`), `wrapper não delega ${commandType}`);
  }
});
