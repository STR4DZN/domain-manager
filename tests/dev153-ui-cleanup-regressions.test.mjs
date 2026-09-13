import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const recovery = fs.readFileSync(path.join(root, "styles/app/recovery.css"), "utf8");
const template = fs.readFileSync(path.join(root, "templates/app-shell.hbs"), "utf8");

test("dev.153 remove desenhos decorativos de inteligência e território", () => {
  assert.doesNotMatch(template, /dm-intel-overview[\s\S]*?<i aria-hidden="true">/);
  assert.doesNotMatch(template, /<div class="dm-territory-core"[^\n]*<i><\/i>/);
  assert.match(template, /INFLUÊNCIA REGISTRADA/);
  assert.match(recovery, /\.dm-territory-core>i\{display:none!important\}/);
});

test("dev.153 inteligência usa tabela legível de cinco colunas e cartões responsivos", () => {
  assert.match(template, /<header><span>INFORMAÇÃO<\/span><span>CATEGORIA<\/span><span>ALVO<\/span><span>CREDIBILIDADE<\/span><span>VISIBILIDADE<\/span><\/header>/);
  assert.doesNotMatch(template, /<span>FONTE<\/span><\/header>/);
  assert.match(template, /data-label="Categoria"/);
  assert.match(recovery, /\.dm-intel-board>header,\.dm-intel-row\{[\s\S]*grid-template-columns:minmax\(230px,1\.55fr\)[\s\S]*repeat\(2,minmax\(0,1fr\)\)/);
});

test("dev.153 não expõe ids técnicos no editor/lista de influência", () => {
  assert.doesNotMatch(template, /\{\{domainEntityId\}\}/);
  assert.doesNotMatch(template, /\{\{entityId\}\}<\/small><\/span><input type="number" min="0" max="100" name="influence:/);
  assert.match(template, /INFLUÊNCIA EXTERNA/);
  assert.match(recovery, /\.dm-territory-form-grid label strong\{font-size:12px!important/);
});

test("dev.153 elimina barra horizontal do estado vazio de grupos", () => {
  assert.match(template, /dm-cohort-table \{\{#unless populationGroups\.length\}\}is-empty/);
  assert.match(recovery, /\.dm-cohort-table\.is-empty\{overflow:hidden!important\}/);
  assert.match(recovery, /@container dm-window \(max-width:820px\)[\s\S]*?\.dm-cohort-row\{[\s\S]*?min-width:0!important/);
});

test("dev.153 alinha ações e políticas sem texto HUD minúsculo", () => {
  assert.match(recovery, /\.dm-system-dialog__footer::before\{display:none!important\}/);
  assert.match(recovery, /\.dm-view-code\{min-height:44px/);
  assert.match(recovery, /\.dm-economy-policy-matrix__head\{min-height:40px;font-size:10px!important/);
  assert.match(recovery, /\.dm-economy-policy-matrix__head,\.dm-economy-policy-matrix__row\{[\s\S]*min-width:0!important/);
});
