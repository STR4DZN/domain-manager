import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const template = fs.readFileSync(new URL("../templates/app-shell.hbs", import.meta.url), "utf8");
const recovery = fs.readFileSync(new URL("../styles/app/recovery.css", import.meta.url), "utf8");
const views = fs.readFileSync(new URL("../styles/app/views.css", import.meta.url), "utf8");
const dialogs = fs.readFileSync(new URL("../styles/app/dialogs.css", import.meta.url), "utf8");
const shell = fs.readFileSync(new URL("../scripts/ui/shell-app.js", import.meta.url), "utf8");

test("regra global de altura não comprime botões que funcionam como linhas ou cartões", () => {
  assert.equal(recovery.includes(":is(button,input,select,textarea):not([type=\"checkbox\"]):not([type=\"radio\"]){min-height:42px}"), false);
  assert.match(recovery, /:is\(input,select,textarea\).*min-height:42px/);
});

test("diálogos mantêm superfície opaca e rodapé sem microtexto decorativo", () => {
  assert.match(recovery, /\.dm-system-dialog\{background:#071015!important/);
  assert.match(dialogs, /\.dm-system-dialog__footer::before\{display:none\}/);
});

test("Inteligência não renderiza onda falsa nem coluna Fonte duplicada", () => {
  const intel = template.slice(template.indexOf("dm-intel-overview"), template.indexOf("{{#if view.territory}}"));
  assert.equal(intel.includes("aria-hidden=\"true\""), false);
  assert.equal(intel.includes("<span>FONTE</span>"), false);
  assert.match(intel, /data-label="Credibilidade"/);
  assert.match(views, /\.dm-intel-row>span\[data-label\]::before/);
});

test("Território apresenta valores e contexto humano sem retícula ou ID técnico", () => {
  const territory = template.slice(template.indexOf("{{#if view.territory}}"), template.indexOf("{{#if view.diplomacy}}"));
  assert.equal(territory.includes("dm-territory-core"), false);
  assert.equal(territory.includes("domainEntityId"), false);
  assert.equal(territory.includes("dm-meter"), false);
  assert.match(territory, /contextLabel/);
  assert.match(shell, /Domínio atual.*Influência externa/);
});

test("Personalizado expõe controles reais para domínio e solicitação", () => {
  assert.match(template, /Personalização das áreas/);
  assert.match(template, /data-custom-request-type/);
  assert.match(template, /Nome do tipo personalizado/);
  assert.match(shell, /customTypeLabel/);
});

test("População e Recursos possuem reorganização responsiva sem tabela mínima no estado vazio", () => {
  assert.match(template, /dm-cohort-table[\s\S]*\{\{#if populationGroups\}\}/);
  assert.match(recovery, /\.dm-cohort-table>\.dm-empty\{min-width:0\}/);
  assert.match(recovery, /\.dm-resource-line--strategic\{min-width:0!important/);
});
