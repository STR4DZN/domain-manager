import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const shell = fs.readFileSync(path.join(root, "scripts/ui/shell-app.js"), "utf8");
const template = fs.readFileSync(path.join(root, "templates/app-shell.hbs"), "utf8");
const model = fs.readFileSync(path.join(root, "scripts/models/request-model.js"), "utf8");

function position(fragment) {
  const index = template.indexOf(fragment);
  assert.notEqual(index, -1, `fragmento ausente: ${fragment}`);
  return index;
}

test("dev.152 torna a personalização do Domain visível junto do seletor de perfil", () => {
  const preset = position('data-domain-preset');
  const capabilities = position('dm-capability-config');
  const description = template.indexOf('name="description"', capabilities);
  assert.notEqual(description, -1, "descrição do Domain ausente após capabilities");
  assert.ok(preset < capabilities, "áreas personalizáveis devem vir depois do perfil");
  assert.ok(capabilities < description, "áreas personalizáveis não podem ficar enterradas no fim do diálogo");
  assert.match(shell, /custom: "Personalizado — escolher áreas"/);
  assert.match(shell, /if \(domainPreset\.value === "custom"\)[\s\S]*?return;/);
  assert.match(shell, /if \(domainPreset\.value !== "custom"\) domainPreset\.value = "custom"/);
});

test("dev.152 oferece nome real para Request personalizada em criação e revisão", () => {
  assert.equal((template.match(/name="customTypeLabel"/g) ?? []).length, 2);
  assert.equal((template.match(/data-request-type-select/g) ?? []).length, 2);
  assert.match(shell, /custom: "Personalizada — definir tipo"/);
  assert.match(shell, /requestTypeLabel\(record\.data\.type, record\.data\.customTypeLabel\)/);
  assert.match(shell, /Informe o nome do tipo personalizado da solicitação/);
  assert.match(model, /customTypeLabel: new StringField/);
});
