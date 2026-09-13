import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const template = fs.readFileSync(path.join(root, "templates/app-shell.hbs"), "utf8");
const baseCss = fs.readFileSync(path.join(root, "styles/app/base.css"), "utf8");
const navCss = fs.readFileSync(path.join(root, "styles/app/navigation.css"), "utf8");
const viewsCss = fs.readFileSync(path.join(root, "styles/app/views.css"), "utf8");
const usabilityCss = fs.readFileSync(path.join(root, "styles/app/usability.css"), "utf8");
const recoveryCss = fs.readFileSync(path.join(root, "styles/app/recovery.css"), "utf8");

test("Presentation Reset remove a anatomia antiga de rail + entity deck + tab bar", () => {
  for (const legacy of ["dm-command-rail", "dm-entity-deck", "dm-domain-tabs", "dm-domain-tab"]) {
    assert.equal(template.includes(legacy), false, `estrutura antiga ainda presente: ${legacy}`);
  }
});

test("Presentation Reset v4 usa shell de app com sidebar única, workspace e inspector", () => {
  for (const marker of ["dm-app-sidebar", "dm-app-topbar", "dm-app-workarea", "dm-stage", "dm-inspector", "dm-app-statusbar"]) {
    assert.ok(template.includes(marker), `marker novo ausente: ${marker}`);
  }
  for (const selector of [".dm-app-sidebar", ".dm-app-topbar", ".dm-inspector", ".dm-app-statusbar"]) {
    assert.ok(navCss.includes(selector), `selector novo ausente: ${selector}`);
  }
  for (const obsolete of ["dm-workspace-dock", "dm-context-console", "dm-subsystem-strip", "dm-command-header"]) {
    assert.equal(template.includes(obsolete), false, `anatomia intermediária ainda presente: ${obsolete}`);
  }
});

test("Command view usa worklist e contagens reais sem canvas cenográfico", () => {
  for (const marker of ["dm-command-grid", "dm-command-domains", "dm-command-domain-row", "dm-command-stats", "dm-command-activity"]) {
    assert.ok(template.includes(marker), `estrutura de comando ausente: ${marker}`);
  }
  for (const obsolete of ["dm-network-canvas__rings", "dm-network-axis", "dm-network-core", "--level:", "dm-scope-line"]) {
    assert.equal(template.includes(obsolete), false, `decoração/falso indicador ainda presente: ${obsolete}`);
  }
  for (const selector of [".dm-command-grid", ".dm-command-domain-row", ".dm-command-stats", ".dm-command-activity"]) {
    assert.ok(viewsCss.includes(selector), `estrutura visual de comando ausente: ${selector}`);
  }
});

test("novo shell prioriza arquitetura de aplicativo e workspaces assimétricos", () => {
  assert.ok(baseCss.includes("grid-template-columns:var(--dm-sidebar-width) minmax(0,1fr)"));
  assert.ok(baseCss.includes("grid-template-columns:minmax(0,1fr) var(--dm-inspector-width)"));
  assert.ok(viewsCss.includes(".dm-overview-grid"));
  assert.ok(viewsCss.includes(".dm-economy-scope"));
  assert.ok(viewsCss.includes(".dm-diplomacy-grid"));
});

test("Presentation Reset não deixa fósseis da anatomia antiga em template, styles ou shell", () => {
  const shell = fs.readFileSync(path.join(root, "scripts/ui/shell-app.js"), "utf8");
  const presentation = `${template}\n${baseCss}\n${navCss}\n${viewsCss}\n${shell}`;
  for (const legacy of ["dm-command-rail", "dm-entity-deck", "dm-domain-tabs", "dm-domain-tab", "dm-stat-grid--five", "dm-workspace-dock", "dm-context-console", "dm-subsystem-strip", "dm-command-header", "dm-person-card", "dm-person-dossier", "dm-people-workbench", "dm-project-node", "dm-project-pipeline"]) {
    assert.equal(presentation.includes(legacy), false, `fóssil visual antigo encontrado: ${legacy}`);
  }
});

test("Presentation Reset não reintroduz animação decorativa infinita", () => {
  const componentCss = fs.readFileSync(path.join(root, "styles/app/components.css"), "utf8");
  const dialogCss = fs.readFileSync(path.join(root, "styles/app/dialogs.css"), "utf8");
  const allCss = `${baseCss}\n${navCss}\n${viewsCss}\n${componentCss}\n${dialogCss}`;
  assert.equal(/animation\s*:[^;]*infinite/i.test(allCss), false);
});

test("command consoles usam a mesma linguagem do app e não dialogs genéricos", () => {
  const dialogCss = fs.readFileSync(path.join(root, "styles/app/dialogs.css"), "utf8");
  for (const marker of [".dm-modal-layer", ".dm-system-dialog::before", ".dm-system-dialog__telemetry", ".dm-resource-matrix"]) {
    assert.ok(dialogCss.includes(marker), `console visual ausente: ${marker}`);
  }
  assert.ok(dialogCss.includes("COMMAND CONSOLE"));
});

test("dialogs sem telemetria mantêm o rodapé de ação dentro da janela", () => {
  const dialogCss = fs.readFileSync(path.join(root, "styles/app/dialogs.css"), "utf8");
  assert.ok(dialogCss.includes("grid-template-rows:auto minmax(0,1fr) auto"));
  assert.ok(dialogCss.includes(".dm-system-dialog:has(>.dm-system-dialog__telemetry){grid-template-rows:auto auto minmax(0,1fr) auto}"));
});

test("worklist de comando vira cartão compacto sem largura mínima no móvel", () => {
  assert.ok(viewsCss.includes(".dm-command-domain-head{display:none}"));
  assert.ok(viewsCss.includes(".dm-command-domain-row{min-width:0;grid-template-columns:minmax(0,1fr) auto"));
});



test("Pessoas usa diretório master-detail explícito em vez de card grid ou inspector obrigatório", () => {
  for (const marker of ["dm-people-layout", "dm-people-directory", "dm-person-list-row", "dm-person-profile", "dm-person-profile__portrait"]) {
    assert.ok(template.includes(marker), `estrutura Pessoas ausente: ${marker}`);
  }
  for (const selector of [".dm-people-layout", ".dm-people-directory", ".dm-person-list-row", ".dm-person-profile"]) {
    assert.ok(recoveryCss.includes(selector), `selector de recuperação ausente: ${selector}`);
  }
  assert.equal(template.includes("dm-person-card"), false);
  assert.ok(recoveryCss.includes('.dm-active-view--people .dm-inspector'));
});

test("shell abre em canvas realista e responde à largura real da janela", () => {
  const shell = fs.readFileSync(path.join(root, "scripts/ui/shell-app.js"), "utf8");
  assert.ok(shell.includes("position: { width: 1280, height: 760 }"));
  assert.ok(usabilityCss.includes("min-width:320px!important"));
  assert.ok(usabilityCss.includes("container-type:inline-size"));
  assert.ok(usabilityCss.includes("@container dm-window (max-width:720px)"));
});
