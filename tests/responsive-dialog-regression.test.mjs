import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const recoveryCss = fs.readFileSync(new URL("../styles/app/recovery.css", import.meta.url), "utf8");
const dialogsCss = fs.readFileSync(new URL("../styles/app/dialogs.css", import.meta.url), "utf8");
const bundleCss = fs.readFileSync(new URL("../styles/shell.css", import.meta.url), "utf8");

function normalizeCss(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*([{}:;,>(])\s*/g, "$1")
    .replace(/\s*\)/g, ")")
    .trim();
}

function containerBlocksAt(css, width) {
  const blocks = [];
  const opening = new RegExp(
    `@container\\s+dm-window\\s*\\(\\s*max-width\\s*:\\s*${width}px\\s*\\)\\s*\\{`,
    "g"
  );

  for (let match = opening.exec(css); match; match = opening.exec(css)) {
    let depth = 1;
    let cursor = opening.lastIndex;
    for (; cursor < css.length && depth > 0; cursor += 1) {
      if (css[cursor] === "{") depth += 1;
      else if (css[cursor] === "}") depth -= 1;
    }
    assert.equal(depth, 0, `@container dm-window ${width}px sem fechamento`);
    blocks.push(css.slice(match.index, cursor));
    opening.lastIndex = cursor;
  }

  return blocks;
}

function narrowDialogBlock(css, label) {
  const block = containerBlocksAt(css, 560)
    .map(normalizeCss)
    .find((candidate) => candidate.includes(".dm-system-dialog__telemetry{display:none}"));
  assert.ok(block, `${label}: bloco compacto que oculta a telemetria não encontrado`);
  return block;
}

function declarationsFor(css, selector, label) {
  const normalized = normalizeCss(css);
  const marker = `${selector}{`;
  const start = normalized.indexOf(marker);
  assert.notEqual(start, -1, `${label}: regra ${selector} não encontrada`);
  const declarationsStart = start + marker.length;
  const end = normalized.indexOf("}", declarationsStart);
  assert.notEqual(end, -1, `${label}: regra ${selector} sem fechamento`);
  return normalized.slice(declarationsStart, end);
}

function assertCompactDialogContract(css, label) {
  const compact = narrowDialogBlock(css, label);
  assert.match(
    compact,
    /\.dm-system-dialog:has\(>\.dm-system-dialog__telemetry\)\{grid-template-rows:auto minmax\(0,1fr\) auto(?:;|\})/,
    `${label}: dialog com telemetria oculta deve manter somente cabeçalho, corpo e rodapé`
  );
  assert.match(
    compact,
    /\.dm-economy-flow-dialog \.dm-system-dialog__footer\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)(?:;|\})/,
    `${label}: rodapé de fluxo deve preservar duas colunas`
  );
  assert.match(
    compact,
    /\.dm-economy-flow-note\{display:block;min-height:max-content(?:;|\})/,
    `${label}: nota econômica deve virar bloco no modo compacto`
  );
  assert.match(
    compact,
    /\.dm-economy-flow-note>i\{display:none(?:;|\})/,
    `${label}: ícone da nota econômica deve desaparecer no modo compacto`
  );
}

function assertFlowFooterContract(css, label) {
  const responsive = containerBlocksAt(css, 760).map(normalizeCss).join(" ");
  assert.match(
    responsive,
    /\.dm-economy-flow-dialog \.dm-system-dialog__footer \.dm-action-button:last-child\{grid-column:1\/-1(?:;|\})/,
    `${label}: ação principal deve ocupar a largura total da segunda linha`
  );
}

function assertFlowBodyContract(css, label) {
  const declarations = declarationsFor(
    css,
    ".dm-economy-flow-dialog .dm-system-dialog__body",
    label
  );
  assert.match(declarations, /(?:^|;)align-content:start(?:;|$)/);
  assert.match(declarations, /(?:^|;)grid-auto-rows:max-content(?:;|$)/);
}

test("diálogos compactos preservam o layout responsivo da correção visual", () => {
  assertCompactDialogContract(recoveryCss, "CSS-fonte");
  assertFlowBodyContract(dialogsCss, "CSS-fonte");
  assertFlowFooterContract(fs.readFileSync(new URL("../styles/app/usability.css", import.meta.url), "utf8"), "CSS-fonte");
});

test("bundle mantém a proteção responsiva dos diálogos", () => {
  assertCompactDialogContract(bundleCss, "bundle");
  assertFlowBodyContract(bundleCss, "bundle");
  assertFlowFooterContract(bundleCss, "bundle");
});
