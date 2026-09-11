import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function listFiles(directory) {
  const output = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...listFiles(fullPath));
    else if (/\.(?:js|mjs)$/.test(entry.name)) output.push(fullPath);
  }
  return output;
}

function resolveLocalImport(fromFile, specifier, known) {
  if (!specifier.startsWith(".")) return null;
  const base = path.resolve(path.dirname(fromFile), specifier);
  for (const candidate of [base, `${base}.js`, `${base}.mjs`, path.join(base, "index.js"), path.join(base, "index.mjs")]) {
    if (known.has(candidate)) return candidate;
  }
  return null;
}

test("grafo de imports estáticos não possui ciclos ESM de inicialização", () => {
  const files = listFiles(root).filter((file) => !file.includes(`${path.sep}node_modules${path.sep}`));
  const known = new Set(files.map((file) => path.resolve(file)));
  const graph = new Map(files.map((file) => [path.resolve(file), new Set()]));
  const staticImport = /(?:^|\n)\s*(?:import\s+(?!\()[^'\"]*?(?:\s+from\s+)?|export\s+[^'\"]*?\s+from\s+)["']([^"']+)["']/gm;

  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(staticImport)) {
      const target = resolveLocalImport(file, match[1], known);
      if (target) graph.get(path.resolve(file)).add(target);
    }
  }

  const state = new Map();
  const stack = [];
  const cycles = [];
  function visit(node) {
    state.set(node, 1); stack.push(node);
    for (const next of graph.get(node) ?? []) {
      if (!state.has(next)) visit(next);
      else if (state.get(next) === 1) {
        const start = stack.indexOf(next);
        cycles.push([...stack.slice(start), next].map((file) => path.relative(root, file)));
      }
    }
    stack.pop(); state.set(node, 2);
  }
  for (const node of graph.keys()) if (!state.has(node)) visit(node);

  assert.deepEqual(cycles, [], cycles.map((cycle) => cycle.join(" -> ")).join("\n"));
});
