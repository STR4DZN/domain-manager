import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const template = fs.readFileSync(path.join(root, "templates/app-shell.hbs"), "utf8");
const shell = fs.readFileSync(path.join(root, "scripts/ui/shell-app.js"), "utf8");
const views = fs.readFileSync(path.join(root, "styles/app/views.css"), "utf8");
const dialogs = fs.readFileSync(path.join(root, "styles/app/dialogs.css"), "utf8");

const actionsBlock = shell.match(/actions:\s*\{([\s\S]*?)\n\s*\}\n\s*\};/)?.[1] ?? "";

test("Territory usa estado real e não coordenadas cenográficas", () => {
  for (const marker of ["dm-territory-summary", "dm-territory-influence", "dm-territory-hierarchy", "territory.controlDisplay", "territory.strategicValueDisplay"]) {
    assert.ok(template.includes(marker), `Territory real ausente: ${marker}`);
  }
  assert.equal(template.includes("LAT 00.000"), false);
  assert.equal(template.includes("dm-map-orbit"), false);
  assert.equal(views.includes(".dm-territory-scope"), false);
});

test("Diplomacy usa worklist métrica e Agreements independentes", () => {
  for (const marker of ["dm-relation-board", "dm-relation-row", "dm-diplomacy-grid", "dm-treaty-channel", "dm-treaty-row", "trustDisplay", "tensionDisplay"]) {
    assert.ok(template.includes(marker), `Diplomacy product layer ausente: ${marker}`);
  }
  assert.equal(template.includes("dm-relations-map"), false);
  assert.equal(views.includes(".dm-relations-layout"), false);
});

test("Intel usa worklist/master-detail e não card gallery", () => {
  for (const marker of ["dm-intel-board", "dm-intel-row", "DETALHES DA INFORMAÇÃO", "selectedIntel", "dm-intel-inspector__facts"]) {
    assert.ok(template.includes(marker), `Intel master-detail ausente: ${marker}`);
  }
  assert.equal(template.includes("dm-intel-card"), false);
  assert.equal(views.includes(".dm-intel-grid"), false);
});

test("Intel expõe telemetria de cobertura derivada sem inventar conteúdo cenográfico", () => {
  for (const marker of ["dm-intel-overview", "intelStats.visible", "intelStats.confirmed", "intelStats.restricted", "intelStats.revealed"]) {
    assert.ok(template.includes(marker) || shell.includes(marker), `telemetria de Intel ausente: ${marker}`);
  }
  for (const derivation of [
    'entry.credibility === "confirmed"',
    'entry.visibility === "gm_only"',
    'entry.revealed || entry.visibility === "public"'
  ]) {
    assert.ok(shell.includes(derivation), `derivação real de Intel ausente: ${derivation}`);
  }
});

test("Strategic intelligence UI grava apenas pelo Command Kernel", () => {
  for (const action of [
    "submitTerritoryEditor", "submitRelationEditor", "removeRelation", "submitAgreementCreate",
    "setAgreementStatus", "submitIntelEditor", "removeIntel", "revealIntel"
  ]) {
    assert.ok(actionsBlock.includes(action), `action não registrada: ${action}`);
  }
  for (const command of [
    "COMMAND_TYPES.TERRITORY_CONFIGURE", "COMMAND_TYPES.RELATION_UPSERT", "COMMAND_TYPES.RELATION_REMOVE",
    "COMMAND_TYPES.AGREEMENT_CREATE", "COMMAND_TYPES.AGREEMENT_STATUS", "COMMAND_TYPES.INTEL_UPSERT",
    "COMMAND_TYPES.INTEL_REMOVE", "COMMAND_TYPES.INTEL_REVEAL"
  ]) {
    assert.ok(shell.includes(command), `command autoritativo ausente: ${command}`);
  }
  assert.equal(/updateRecord\s*\(/.test(shell), false, "UI não pode persistir Journal diretamente");
});

test("Relations, Agreements e Intel usam revisão e confirmação antes de ações críticas", () => {
  for (const action of [
    "cancelRemoveRelation", "confirmRemoveRelation", "cancelAgreementStatus", "confirmAgreementStatus",
    "cancelIntelAction", "confirmIntelAction"
  ]) {
    assert.ok(actionsBlock.includes(action), `action de confirmação não registrada: ${action}`);
    assert.match(template, new RegExp(`data-action=["']${action}["']`), `template sem action ${action}`);
  }
  assert.match(template, /id="dm-relation-form"[\s\S]{0,900}name="expectedModifiedTime"/);
  assert.match(template, /id="dm-intel-form"[\s\S]{0,900}name="expectedModifiedTime"/);
  assert.match(shell, /RELATION_REMOVE[\s\S]{0,400}expectedModifiedTime:/);
  assert.match(shell, /AGREEMENT_STATUS[\s\S]{0,400}expectedModifiedTime:/);
  assert.match(shell, /INTEL_(?:REMOVE|REVEAL)[\s\S]{0,500}expectedModifiedTime:/);
  assert.equal(template.includes('name="revealed"'), false, "Intel não pode ser publicada por checkbox no editor");
});

test("template não mantém miras, radares ou ondas decorativas residuais", () => {
  for (const marker of ["dm-inspector-radar", "dm-person-inspector__wave", "dm-registry-scope__reticle", "dm-binary-strip", "dm-logistics-paths"]) {
    assert.equal(template.includes(marker), false, `ornamento residual no DOM: ${marker}`);
  }
});

test("confirmações críticas respondem à largura real do módulo sem expandir a grade", () => {
  assert.match(dialogs, /\.dm-project-cost-remove-dialog\{[^}]*grid-template-columns:minmax\(0,1fr\)/);
  assert.match(dialogs, /\.dm-project-cost-remove-dialog \.dm-system-dialog__body\{[^}]*grid-template-columns:minmax\(0,1fr\)/);
  assert.match(dialogs, /@container dm-window \(max-width:560px\)\{\.dm-project-cost-remove-summary\{grid-template-columns:1fr\}/);
});

test("schema mostrado na UI vem da constante real do runtime", () => {
  assert.ok(shell.includes("SCHEMA_VERSION"));
  assert.ok(template.includes("SCHEMA {{schemaVersion}}"));
  assert.equal(template.includes("SCHEMA 6"), false);
});
