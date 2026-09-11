import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const manifest = JSON.parse(fs.readFileSync(path.join(root, "module.json"), "utf8"));
const constants = fs.readFileSync(path.join(root, "scripts/core/constants.js"), "utf8");
const match = constants.match(/export const MODULE_VERSION = "([^"]+)";/);

test("release metadata mantém package, manifest, runtime e download na mesma versão", () => {
  assert.ok(match, "MODULE_VERSION não encontrado");
  assert.equal(pkg.version, manifest.version);
  assert.equal(match[1], manifest.version);
  assert.match(manifest.download, new RegExp(`/v${manifest.version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/domain-manager-v${manifest.version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.zip$`));
});
