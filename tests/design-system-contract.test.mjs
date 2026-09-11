import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const tokens = read("styles/app/tokens.css");
const components = read("styles/app/components.css");
const dialogs = read("styles/app/dialogs.css");
const base = read("styles/app/base.css");
const template = read("templates/app-shell.hbs");

const requiredTokens = [
  "--dm-surface-0", "--dm-surface-1", "--dm-surface-2", "--dm-text", "--dm-muted",
  "--dm-amber", "--dm-teal", "--dm-cyan", "--dm-red", "--dm-warning",
  "--dm-radius", "--dm-sidebar-width", "--dm-inspector-width", "--dm-font", "--dm-font-mono"
];

const requiredComponents = [
  ".dm-action-button", ".dm-icon-button", ".dm-chip", ".dm-meter", ".dm-list-row",
  ".dm-data-row", ".dm-empty", ".dm-panel", ".dm-status-pip"
];

test("design system possui tokens semânticos estáveis para surfaces, estado, layout e tipografia", () => {
  for (const token of requiredTokens) assert.ok(tokens.includes(token), `token ausente: ${token}`);
});

test("design system possui componentes-base reutilizáveis e command consoles integrados", () => {
  for (const selector of requiredComponents) assert.ok(components.includes(selector), `componente ausente: ${selector}`);
  for (const selector of [".dm-system-dialog", ".dm-field", ".dm-resource-matrix"]) {
    assert.ok(dialogs.includes(selector), `componente de console ausente: ${selector}`);
  }
});

test("arquitetura responsiva prioriza workspace e remove inspector antes de recriar navegação", () => {
  assert.ok(base.includes("@media(max-width:1100px)"));
  assert.ok(base.includes(".dm-inspector{display:none}"));
  for (const forbidden of ["dm-entity-deck", "dm-domain-tabs", "dm-workspace-dock"]) {
    assert.equal(`${base}\n${template}`.includes(forbidden), false, `fallback legado reintroduzido: ${forbidden}`);
  }
});

test("design system respeita reduced-motion e não possui animação infinita decorativa", () => {
  assert.ok(base.includes("prefers-reduced-motion"));
  assert.ok(dialogs.includes("prefers-reduced-motion"));
  const all = `${tokens}\n${components}\n${dialogs}\n${base}`;
  assert.equal(/animation\s*:[^;]*infinite/i.test(all), false);
});
