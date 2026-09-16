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
const economyActions = fs.readFileSync(path.join(root, "scripts/features/economy/actions.js"), "utf8");

test("Strategic Economy UI usa ledger consolidado e não o ledger legado", () => {
  assert.match(shell, /buildStrategicDomainLedger/);
  assert.doesNotMatch(shell, /\bbuildDomainLedger\s*\(/);
  for (const marker of ["reserveTargetDisplay", "storageCapacityDisplay", "autonomyLabel", "policyState", "contributionCount"]) {
    assert.ok(shell.includes(marker), `campo estratégico ausente: ${marker}`);
  }
});

test("Strategic Economy expõe matriz operacional de oito canais e policy console", () => {
  for (const label of ["RECURSO", "ESTOQUE", "DISPONÍVEL", "SALDO/T", "RESERVA", "CAPACIDADE", "AUTONOMIA", "ESTADO"]) {
    assert.ok(template.includes(`<span>${label}</span>`), `coluna econômica ausente: ${label}`);
  }
  for (const action of ["openEconomyConfig", "closeEconomyConfig", "submitEconomyConfig"]) {
    assert.match(template, new RegExp(`data-action=["']${action}["']`), `template sem ${action}`);
    assert.match(shell, new RegExp(`${action}:\\s*DomainManagerShellApp\\.`), `action não registrada: ${action}`);
  }
  assert.ok(template.includes("dm-economy-policy-matrix"));
  assert.ok(template.includes("dm-sustenance-policy"));
});

test("Strategic Economy muta configuração exclusivamente pelo Command Kernel", () => {
  assert.match(shell, /COMMAND_TYPES\.ECONOMY_CONFIGURE/);
  const start = shell.indexOf("static async onSubmitEconomyConfig");
  assert.ok(start >= 0, "handler submitEconomyConfig ausente");
  const tail = shell.slice(start, shell.indexOf("static ", start + 10) > start ? shell.indexOf("static ", start + 10) : undefined);
  assert.equal(/JournalEntry\.(?:create|updateDocuments)|\.document\.update\(/.test(tail), false,
    "UI econômica não pode persistir Journal diretamente");
});

test("Strategic Economy possui linguagem visual própria e responsiva", () => {
  for (const selector of [
    ".dm-resource-matrix-live--strategic",
    ".dm-resource-line--strategic",
    ".dm-logistics-legend"
  ]) assert.ok(viewsCss.includes(selector), `selector econômico ausente: ${selector}`);
  for (const selector of [
    ".dm-economy-dialog",
    ".dm-economy-policy-matrix",
    ".dm-sustenance-policy"
  ]) assert.ok(dialogsCss.includes(selector), `selector de policy console ausente: ${selector}`);
  assert.match(viewsCss, /@media\(max-width:1120px\)/);
});

test("fluxos recorrentes possuem CRUD completo e confirmação explícita na interface", () => {
  for (const action of [
    "openEconomyFlowEditor",
    "closeEconomyFlowEditor",
    "submitEconomyFlowEditor",
    "removeEconomyFlow",
    "cancelRemoveEconomyFlow",
    "confirmRemoveEconomyFlow"
  ]) {
    assert.match(template, new RegExp(`data-action=["']${action}["']`), `template sem ${action}`);
    assert.match(shell, new RegExp(`${action}:\\s*DomainManagerShellApp\\.`), `action não registrada: ${action}`);
  }
  for (const marker of [
    "dm-economy-flow-board",
    "dm-economy-flow-form",
    "pendingEconomyFlowRemoval",
    "expectedModifiedTime",
    "ECONOMY_FLOW_UPSERT",
    "ECONOMY_FLOW_REMOVE"
  ]) assert.ok(`${template}\n${shell}`.includes(marker), `fluxos econômicos sem ${marker}`);
});

test("fluxos recorrentes são legíveis e viram cards na largura compacta", () => {
  for (const selector of [
    ".dm-economy-flow-board",
    ".dm-economy-flow-row",
    ".dm-economy-flow-row__actions"
  ]) assert.ok(viewsCss.includes(selector), `selector de fluxo ausente: ${selector}`);
  assert.match(viewsCss, /@container dm-window \(max-width:900px\)[\s\S]*\.dm-economy-flow-board__head\{display:none\}/);
  assert.ok(dialogsCss.includes(".dm-economy-flow-note"));
});

test("wrappers econômicos legados não mantêm caminho de escrita paralelo", () => {
  assert.doesNotMatch(economyActions, /\b(?:createRecord|updateRecord|deleteRecord|updateRecordsBatch)\b/);
  assert.match(economyActions, /COMMAND_TYPES\.ECONOMY_FLOW_UPSERT/);
  assert.match(economyActions, /COMMAND_TYPES\.ECONOMY_FLOW_REMOVE/);
});
