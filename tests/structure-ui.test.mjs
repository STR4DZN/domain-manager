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

const actions = [
  "openCreateStructure",
  "cancelCreateStructure",
  "submitCreateStructure",
  "openStructureControl",
  "closeStructureControl",
  "submitStructureControl"
];

test("Infrastructure Control expõe lifecycle de criação e controle na ApplicationV2", () => {
  for (const action of actions) {
    assert.match(template, new RegExp(`data-action=["']${action}["']`), `template sem action ${action}`);
    assert.match(shell, new RegExp(`${action}:\\s*DomainManagerShellApp\\.`), `DEFAULT_OPTIONS sem action ${action}`);
  }
});

test("Infrastructure Control usa somente command kernel para mutações de Structure", () => {
  for (const type of ["STRUCTURE_BEGIN_CONSTRUCTION", "STRUCTURE_CREATE", "STRUCTURE_ADMIN_UPDATE", "STRUCTURE_PATCH"]) {
    assert.match(shell, new RegExp(`COMMAND_TYPES\\.${type}`), `command type ausente: ${type}`);
  }

  const start = shell.indexOf("static onOpenCreateStructure");
  const end = shell.indexOf("static async onAdvanceTicks", start);
  assert.ok(start >= 0 && end > start);
  const structureHandlers = shell.slice(start, end);
  assert.equal(/JournalEntry\.(?:create|updateDocuments)|\.document\.update\(/.test(structureHandlers), false,
    "UI de Structure não pode persistir Journal diretamente");
});

test("Infrastructure Control possui linguagem visual própria e matriz econômica", () => {
  for (const selector of [
    ".dm-infra-bus",
    ".dm-infrastructure-grid",
    ".dm-infrastructure-card",
    ".dm-infrastructure-vectors",
    ".dm-construction-link"
  ]) assert.ok(viewsCss.includes(selector), `selector ausente: ${selector}`);

  for (const selector of [
    ".dm-structure-dialog",
    ".dm-infra-project-config",
    ".dm-resource-matrix",
    ".dm-resource-matrix__row"
  ]) assert.ok(dialogsCss.includes(selector), `selector ausente: ${selector}`);
});

test("Infrastructure Control comunica vínculo Project e vetores por tick", () => {
  assert.match(template, /BASE \/\/ INFRAESTRUTURA/);
  assert.match(template, /PROJETO VINCULADO/);
  assert.match(template, /MANUTENÇÃO \/ T/);
  assert.match(template, /PRODUÇÃO \/ T/);
  assert.match(template, /VÍNCULO COM PROJETO/);
  assert.match(template, /activeProject|project\.progressDisplay|project\.statusLabel/);
});

test("controle de Structure envia revisão e mantém comissionamento sob a simulação", () => {
  assert.match(template, /id="dm-structure-control-form"[\s\S]*?name="expectedModifiedTime"/);
  assert.match(shell, /expectedModifiedTime:\s*record\.document\?\._stats\?\.modifiedTime/);
  assert.match(shell, /STRUCTURE_ADMIN_UPDATE[\s\S]{0,400}expectedModifiedTime:/);
  assert.match(shell, /STRUCTURE_PATCH[\s\S]{0,300}expectedModifiedTime:/);
  assert.match(template, /A estrutura permanece planejada até o projeto ser concluído\./);
});

test("prioridade de manutenção é editável e não pode ser redefinida silenciosamente", () => {
  assert.ok((template.match(/name="maintenancePriority"/g) ?? []).length >= 2);
  assert.match(shell, /maintenancePriority:\s*Number\(record\.data\.maintenancePriority \?\? 50\)/);
  assert.ok((shell.match(/maintenancePriority:\s*Number\(data\.get\("maintenancePriority"\)/g) ?? []).length >= 2);
});
