import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolutePath) : [absolutePath];
  });
}

const allFiles = walk(ROOT);
const javascriptFiles = allFiles.filter((file) => file.endsWith(".js"));

test("manifesto carrega apenas o shell visual novo", () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(ROOT, "module.json"), "utf8")
  );

  assert.deepEqual(manifest.esmodules, ["scripts/main.js"]);
  assert.deepEqual(manifest.styles, ["styles/shell.css"]);
  assert.equal(manifest.version, "0.1.0-dev.99");
});

test("interface antiga não está presente", () => {
  const forbidden = [
    "templates/app.hbs",
    "styles/domain-manager.css",
    "scripts/ui/dialog-manager.js",
    "scripts/ui/dialogs",
    "scripts/ui/canvas",
    "scripts/features/dashboard",
    "scripts/ui/domain-actions.js",
    "scripts/ui/economy-actions.js",
    "scripts/ui/people-actions.js",
    "scripts/ui/project-actions.js",
    "scripts/ui/mission-actions.js",
    "scripts/ui/request-actions.js"
  ];

  for (const relativePath of forbidden) {
    assert.equal(
      fs.existsSync(path.join(ROOT, relativePath)),
      false,
      `${relativePath} deveria ter sido removido`
    );
  }
});

test("todo import relativo aponta para um arquivo existente", () => {
  const patterns = [
    /\bfrom\s+["'](\.{1,2}\/[^"']+)["']/g,
    /\bimport\s*\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g,
    /\bimport\s+["'](\.{1,2}\/[^"']+)["']/g
  ];

  for (const file of javascriptFiles) {
    const source = fs.readFileSync(file, "utf8");
    for (const pattern of patterns) {
      for (const match of source.matchAll(pattern)) {
        const target = path.resolve(path.dirname(file), match[1]);
        assert.equal(
          fs.existsSync(target),
          true,
          `${path.relative(ROOT, file)} importa arquivo ausente: ${match[1]}`
        );
      }
    }
  }
});

test("núcleo e features não dependem da camada ui", () => {
  const protectedRoots = [
    "scripts/authority/",
    "scripts/core/",
    "scripts/data/",
    "scripts/features/",
    "scripts/integration/",
    "scripts/models/",
    "scripts/simulation/"
  ];

  for (const file of javascriptFiles) {
    const relativePath = path.relative(ROOT, file).replaceAll("\\", "/");
    if (!protectedRoots.some((prefix) => relativePath.startsWith(prefix))) {
      continue;
    }

    const source = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(
      source,
      /(?:from\s+|import\s*\()["'][^"']*\/ui\//,
      `${relativePath} não pode importar ui/`
    );
  }
});

test("fachada mantém o contrato público", () => {
  const source = fs.readFileSync(
    path.join(ROOT, "scripts/ui/app.js"),
    "utf8"
  );
  const publicFunctions = [
    "getDomainManagerApp",
    "openDomainManager",
    "openDomain",
    "openDashboard",
    "openMyDomain",
    "openAdvanceRun",
    "openSimulationPreview",
    "rollDomainEvent",
    "openHelp",
    "invalidateDomainManager"
  ];

  for (const functionName of publicFunctions) {
    assert.match(
      source,
      new RegExp(`export function ${functionName}\\b`),
      `export ausente: ${functionName}`
    );
  }
});
