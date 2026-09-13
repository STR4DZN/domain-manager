import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const template = fs.readFileSync(new URL("../templates/app-shell.hbs", import.meta.url), "utf8");
const shell = fs.readFileSync(new URL("../scripts/ui/shell-app.js", import.meta.url), "utf8");
const nav = fs.readFileSync(new URL("../scripts/ui/navigation.js", import.meta.url), "utf8");
const viewsCss = fs.readFileSync(new URL("../styles/app/views.css", import.meta.url), "utf8");

test("Conditions possui console próprio no workspace de Gestão", () => {
  assert.equal(nav.includes('id: "conditions", label: "Condições"'), true);
  assert.equal(nav.includes('preferred: ["overview", "requests", "conditions", "history"]'), true);
  for (const token of [
    "GESTÃO // CONDIÇÕES",
    "dm-condition-summary",
    "dm-condition-board",
    'id="dm-condition-form"',
    'data-action="openConditionEditor"',
    'data-action="toggleCondition"',
    'data-action="removeCondition"',
    'data-action="confirmRemoveCondition"'
  ]) assert.equal(template.includes(token), true, `Condition UI ausente: ${token}`);
  assert.equal(viewsCss.includes(".dm-condition-board"), true);
  assert.equal(viewsCss.includes("@container dm-window"), true);
});

test("Overview e inspector exibem apenas condições ativas com o nome correto", () => {
  assert.equal(shell.includes("label: condition.name"), true);
  assert.equal(shell.includes("const activeConditions = conditions.filter"), true);
  assert.equal(template.includes("{{#each activeConditions}}"), true);
  assert.equal(template.includes("{{activeConditions.length}}"), true);
});

test("edição de Conditions usa Command Kernel, revisão e confirmação destrutiva", () => {
  const start = shell.indexOf("static onOpenConditionEditor");
  const end = shell.indexOf("static onSelectProject", start);
  const block = shell.slice(start, end);
  for (const type of ["CONDITION_CREATE", "CONDITION_UPDATE", "CONDITION_TOGGLE", "CONDITION_REMOVE"]) {
    assert.equal(block.includes(`COMMAND_TYPES.${type}`), true, `command ausente: ${type}`);
  }
  assert.equal(block.includes("executeCommandAuthoritatively"), true);
  assert.equal(block.includes("updateRecord("), false);
  assert.equal(template.includes('name="expectedModifiedTime" value="{{selectedDomain.expectedModifiedTime}}"'), true);
  assert.equal(template.includes("A remoção não pode ser desfeita."), true);
});

test("controles persistentes de Conditions permanecem exclusivos do GM", () => {
  assert.equal(shell.includes("canManageConditions: Boolean(game.user.isGM && selectedDomain)"), true);
  assert.equal(template.includes("{{#if canManageConditions}}"), true);
  assert.equal(shell.includes("if (!game.user.isGM || this.isConditionBusy"), true);
});
