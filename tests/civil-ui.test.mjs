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
  "cancelRemovePopulationGroup", "confirmRemovePopulationGroup",
  "openWorkforce", "closeWorkforce", "submitWorkforce"
];
const peopleActions = ["selectPerson", "openPersonEditor", "closePersonEditor", "submitPersonEditor"];

test("Civil Control expõe summary, cohorts e workforce matrix como ferramentas distintas", () => {
  for (const marker of [
    "dm-civil-overview",
    "dm-cohort-table",
    "dm-cohort-row",
    "dm-workforce-board",
    "ALOCAÇÃO DE TRABALHO",
    "Distribuição por Estrutura",
    "workforceCoverageDisplay"
  ]) assert.ok(template.includes(marker), `Civil Control sem ${marker}`);

  for (const label of ["POPULAÇÃO", "MORAL", "FORÇA DE TRABALHO", "ATRIBUÍDOS", "DISPONÍVEL"]) {
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

test("Population e Person enviam revisão e remoção de grupo exige confirmação", () => {
  for (const formId of ["dm-population-config-form", "dm-population-group-form", "dm-workforce-form", "dm-person-editor-form"]) {
    assert.match(template, new RegExp(`id=["']${formId}["'][\\s\\S]{0,500}name=["']expectedModifiedTime["']`), `${formId} sem revisão`);
  }
  for (const marker of ["pendingPopulationGroupRemoval", "cancelRemovePopulationGroup", "confirmRemovePopulationGroup"]) {
    assert.ok(template.includes(marker) || shell.includes(marker), `confirmação de grupo sem ${marker}`);
  }
  assert.match(shell, /POPULATION_GROUP_REMOVE[\s\S]{0,350}expectedModifiedTime:/);
  assert.match(shell, /PERSON_UPDATE[\s\S]{0,300}expectedModifiedTime:/);
});

test("Domain UI usa o Command Kernel e seleciona a Person criada pelo resultado achatado", () => {
  for (const type of ["DOMAIN_CREATE", "DOMAIN_UPDATE", "DOMAIN_MEDIA_UPDATE", "DOMAIN_DELETE"]) {
    assert.match(shell, new RegExp(`COMMAND_TYPES\\.${type}`), `command type ausente: ${type}`);
  }
  assert.equal(shell.includes("createDomainAction"), false);
  assert.equal(shell.includes("updateDomainMediaFields"), false);
  assert.match(shell, /selectedPersonUuid\s*=\s*result\?\.uuid/);
  assert.equal(shell.includes("result?.result?.uuid"), false);
});

test("exclusão de Domain expõe inventário de dependências e confirmação exata", () => {
  for (const action of ["openDeleteDomain", "cancelDeleteDomain", "submitDeleteDomain"]) {
    assert.match(template, new RegExp(`data-action=["']${action}["']`), `template sem action ${action}`);
    assert.match(shell, new RegExp(`${action}:\\s*DomainManagerShellApp\\.`), `DEFAULT_OPTIONS sem ${action}`);
  }
  assert.match(template, /dm-domain-dependency-list/);
  assert.match(template, /data-domain-delete-confirmation/);
  assert.match(template, /EXCLUSÃO BLOQUEADA/);
  assert.match(shell, /buildDomainDependencyReport/);
});

test("Domain possui editor completo para identidade, hierarquia, governança e capabilities", () => {
  for (const marker of [
    'data-action="openEditDomain"', 'name="state"', 'name="tags"', 'name="locatedInUuid"',
    'name="administrativeParentUuid"', 'name="controllerIds"', 'name="capabilities"', "data-domain-preset"
  ]) assert.ok(template.includes(marker), `editor de Domain sem ${marker}`);
  assert.match(shell, /expectedModifiedTime:/);
  assert.match(shell, /CAPABILITY_KEYS\.map/);
});

test("troca de Domain centraliza a limpeza de estado transitório", () => {
  assert.match(shell, /resetDomainScopedState\(\)\s*\{/);
  const resetStart = shell.indexOf("resetDomainScopedState() {");
  const resetEnd = shell.indexOf("\n  }", resetStart);
  const resetBlock = shell.slice(resetStart, resetEnd);
  for (const field of [
    "isPersonEditorOpen", "editingPersonUuid", "isDomainMediaOpen", "editingSquadUuid",
    "preparingMissionUuid", "editingStructureUuid", "editingProjectUuid", "reviewingRequestUuid",
    "editingPopulationGroupId", "editingRelationId", "isAgreementCreateOpen", "editingIntelId"
  ]) assert.match(resetBlock, new RegExp(`this\\.${field}\\s*=`), `reset sem ${field}`);
  assert.match(shell, /if \(uuid !== this\.selectedDomainUuid\) this\.resetDomainScopedState\(\)/);
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
    "dm-people-layout", "dm-person-list-row", "NOVA PESSOA", "selectPerson", "Moral", "Condição"
  ]) assert.ok(template.includes(marker), `Personnel sem ${marker}`);
  assert.match(template, /name="squadEntityId"/);
  assert.match(template, /name="actorUuid"/);
  assert.match(template, /name="portrait"/);
  assert.equal(template.includes("dm-person-inspector__wave"), false, "Personnel não deve renderizar onda decorativa falsa");
});

test("Structure consoles expõem workforceRequired para fechar o ciclo Civil → Infrastructure", () => {
  const occurrences = [...template.matchAll(/name="workforceRequired"/g)].length;
  assert.ok(occurrences >= 2, `esperava workforceRequired em create + admin, recebido ${occurrences}`);
  assert.match(shell, /workforceRequired:\s*Number\(data\.get\("workforceRequired"\)/);
});
