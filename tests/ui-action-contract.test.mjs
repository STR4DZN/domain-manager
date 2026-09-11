import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "scripts/ui/shell-app.js"), "utf8");
const template = fs.readFileSync(path.join(root, "templates/app-shell.hbs"), "utf8");

function uniqueMatches(text, regex) {
  return [...new Set([...text.matchAll(regex)].map((match) => match[1]))].sort();
}

test("todo data-action do template possui handler registrado na ApplicationV2", () => {
  const templateActions = uniqueMatches(template, /data-action=["']([^"']+)["']/g);
  const optionsBlock = source.match(/actions:\s*\{([\s\S]*?)\n\s*\}\n\s*\};/);
  assert.ok(optionsBlock, "DEFAULT_OPTIONS.actions não localizado");
  const registered = uniqueMatches(optionsBlock[1], /^\s*([A-Za-z_$][\w$]*)\s*:/gm);
  const missing = templateActions.filter((action) => !registered.includes(action));
  assert.deepEqual(missing, [], `ações órfãs no template: ${missing.join(", ")}`);
});

test("todo handler registrado aponta para método estático existente", () => {
  const optionsBlock = source.match(/actions:\s*\{([\s\S]*?)\n\s*\}\n\s*\};/);
  assert.ok(optionsBlock);
  const methods = [...optionsBlock[1].matchAll(/:\s*DomainManagerShellApp\.([A-Za-z_$][\w$]*)/g)].map((match) => match[1]);
  const missing = methods.filter((method) => !new RegExp(`static\\s+async\\s+${method}\\b|static\\s+${method}\\b`).test(source));
  assert.deepEqual(missing, [], `handlers registrados sem implementação: ${missing.join(", ")}`);
});
