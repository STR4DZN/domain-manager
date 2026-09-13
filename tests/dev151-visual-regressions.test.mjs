import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const recovery = fs.readFileSync(path.join(root, "styles/app/recovery.css"), "utf8");
const shell = fs.readFileSync(path.join(root, "scripts/ui/shell-app.js"), "utf8");
const template = fs.readFileSync(path.join(root, "templates/app-shell.hbs"), "utf8");

test("dev.151 não força altura global em botões de linhas/listas", () => {
  assert.doesNotMatch(recovery, /:is\(button,input,select,textarea\):not\(\[type="checkbox"\]\)/);
  assert.match(recovery, /:is\(input,select,textarea\):not\(\[type="checkbox"\]\)/);
});

test("dev.151 mantém diálogos opacos mesmo após remover background-image", () => {
  assert.match(recovery, /\.dm-system-dialog\{[^}]*background-color:#071015!important/);
});

test("dev.151 reorganiza Inteligência e Sistema sem itens implícitos ou colunas vazias", () => {
  assert.match(recovery, /\.dm-intel-overview\{grid-template-columns:repeat\(4,minmax\(120px,1fr\)\) minmax\(140px,\.72fr\)/);
  assert.match(recovery, /\.dm-core-diagram\{[^}]*display:block/);
  assert.match(recovery, /\.dm-core-readouts\{[^}]*display:grid/);
});

test("dev.151 restaura estados vazios legíveis de Alertas e Defesa", () => {
  assert.match(recovery, /\.dm-nominal-stamp\{[^}]*min-height:92px!important/s);
  assert.match(recovery, /\.dm-defense-ring\{display:flex!important/);
  assert.match(recovery, /\.dm-defense-layers>\.dm-empty-signal\{[^}]*display:flex!important/s);
});

test("dev.151 apresenta perfil e estado do domínio com labels de UI", () => {
  assert.match(shell, /presetLabel: managementPresetLabel/);
  assert.match(shell, /stateLabel: stateLabel/);
  assert.match(template, /\{\{presetLabel\}\}/);
  assert.match(template, /\{\{stateLabel\}\}/);
});
