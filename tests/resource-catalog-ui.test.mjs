import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const template = fs.readFileSync(new URL("../templates/app-shell.hbs", import.meta.url), "utf8");
const shell = fs.readFileSync(new URL("../scripts/ui/shell-app.js", import.meta.url), "utf8");
const actions = fs.readFileSync(new URL("../scripts/features/economy/actions.js", import.meta.url), "utf8");
const dialogs = fs.readFileSync(new URL("../styles/app/dialogs.css", import.meta.url), "utf8");

test("Recursos expõe catálogo global e políticas como ações distintas", () => {
  assert.match(template, /data-action="openResourceCatalog"/);
  assert.match(template, /CATÁLOGO/);
  assert.match(template, /data-action="openEconomyConfig"[\s\S]*POLÍTICAS/);
  assert.match(template, /id="dm-resource-catalog-form"/);
});

test("catálogo possui CRUD completo, revisão capturada e confirmação de remoção", () => {
  for (const action of [
    "newResourceDefinition", "editResourceDefinition", "submitResourceDefinition",
    "removeResourceDefinition", "cancelRemoveResourceDefinition", "confirmRemoveResourceDefinition"
  ]) assert.match(template, new RegExp(`data-action="${action}"`));
  assert.match(template, /name="expectedCatalogVersion"/);
  assert.match(template, /REMOÇÃO BLOQUEADA/);
  assert.match(shell, /COMMAND_TYPES\.RESOURCE_CATALOG_UPSERT/);
  assert.match(shell, /COMMAND_TYPES\.RESOURCE_CATALOG_REMOVE/);
});

test("economia usa revisão congelada e wrappers legados delegam catálogo ao Command Kernel", () => {
  assert.match(template, /id="dm-economy-config-form"[\s\S]*name="expectedModifiedTime"/);
  assert.match(shell, /expectedModifiedTime: data\.get\("expectedModifiedTime"\)/);
  assert.match(actions, /COMMAND_TYPES\.RESOURCE_CATALOG_UPSERT/);
  assert.match(actions, /COMMAND_TYPES\.RESOURCE_CATALOG_REMOVE/);
  assert.equal(actions.includes("setResourceCatalogSetting"), false);
});

test("catálogo e matriz de recursos reorganizam conteúdo em larguras menores", () => {
  assert.match(dialogs, /\.dm-resource-catalog-workspace/);
  assert.match(dialogs, /@media\(max-width:900px\).*dm-resource-catalog-workspace\{grid-template-columns:1fr\}/s);
  assert.match(template, /data-label="Saldo por tick"/);
  assert.match(template, /data-label="Capacidade"/);
});
