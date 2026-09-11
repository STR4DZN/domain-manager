import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const usability = read("styles/app/usability.css");
const bundle = read("styles/shell.css");
const buildCss = read("scripts/build-css.js");
const shellApp = read("scripts/ui/shell-app.js");

test("dev.149 carrega a camada de usabilidade por último", () => {
  assert.ok(buildCss.includes('"styles/app/usability.css"'));
  assert.ok(buildCss.indexOf('"styles/app/usability.css"') > buildCss.indexOf('"styles/app/dialogs.css"'));
  assert.ok(bundle.lastIndexOf("DEV.149 // UI USABILITY + RESPONSIVE RESCUE") > bundle.indexOf("styles/app/dialogs.css"));
});

test("janela deixa de exigir desktop grande e responde ao tamanho real do app", () => {
  assert.match(usability, /min-width:320px!important/);
  assert.match(usability, /min-height:300px!important/);
  assert.match(usability, /container-name:dm-window/);
  assert.match(usability, /container-type:inline-size/);
  for (const breakpoint of ["1360px", "1120px", "900px", "720px", "520px", "380px"]) {
    assert.ok(usability.includes(`@container dm-window (max-width:${breakpoint})`), `breakpoint ausente: ${breakpoint}`);
  }
});

test("workspace vence o inspector e mantém contexto acessível por drawer", () => {
  const compact = usability.slice(usability.indexOf("@container dm-window (max-width:1360px)"));
  assert.ok(compact.includes(".dm-app-workarea{grid-template-columns:minmax(0,1fr);position:relative;overflow:hidden}"));
  assert.ok(compact.includes(".dm-inspector-toggle{display:flex}"));
  assert.ok(compact.includes("position:absolute;z-index:30;right:0;top:0;bottom:0"));
  assert.ok(compact.includes(".dm-os.is-inspector-open .dm-inspector{transform:translateX(0);pointer-events:auto}"));
});

test("navegação se transforma em rail horizontal em janela estreita", () => {
  const narrow = usability.slice(usability.indexOf("@container dm-window (max-width:720px)"));
  assert.ok(narrow.includes(".dm-os{grid-template-columns:1fr;grid-template-rows:auto minmax(0,1fr)}"));
  assert.ok(narrow.includes(".dm-app-nav{grid-column:1/-1;display:flex"));
  assert.ok(narrow.includes(".dm-nav-workspace__head{display:none}"));
  assert.ok(narrow.includes(".dm-nav-workspace__children,.dm-nav-workspace.is-active .dm-nav-workspace__children{display:flex"));
});

test("escala de leitura e hit targets não usam microtexto como padrão", () => {
  for (const token of ["--dm-text-xs:11px", "--dm-text-sm:13px", "--dm-text-base:14px", "--dm-hit:40px"]) {
    assert.ok(usability.includes(token), `token ausente: ${token}`);
  }
  assert.match(usability, /\.dm-action-button\{min-height:40px/);
  assert.match(usability, /\.dm-command-search\{height:40px/);
  assert.match(usability, /\.dm-view-header p\{[^}]*font-size:var\(--dm-text-base\)/);
});

test("janelas pequenas removem chrome redundante em vez de encolher texto", () => {
  const laptop = usability.slice(usability.indexOf("@container dm-window (max-width:1120px)"));
  assert.ok(laptop.includes(".dm-domain-toolbar__signals{display:none}"));
  assert.ok(usability.includes('.dm-os[data-dm-height="short"] .dm-app-statusbar{display:none}'));
  assert.ok(usability.includes("@container dm-window (max-width:380px)"));
  assert.ok(usability.includes(".dm-inspector{width:100%}"));
});

test("movimento ambiental é desativado e o default de janela é mais realista", () => {
  assert.ok(usability.includes(".dm-os *{animation:none!important;scroll-behavior:auto!important}"));
  assert.ok(shellApp.includes("position: { width: 1280, height: 760 }"));
});

test("altura real da janela também dirige a densidade da shell", () => {
  assert.ok(shellApp.includes("ResizeObserver"));
  assert.ok(shellApp.includes('root.dataset.dmHeight = height <= 540 ? "short"'));
  assert.ok(usability.includes('.dm-os[data-dm-height="short"]'));
  assert.ok(usability.includes('.dm-os[data-dm-height="compact"]'));
});

test("drawer contextual possui ação explícita e pode ser fechado por Escape", () => {
  assert.ok(shellApp.includes("toggleInspector: DomainManagerShellApp.onToggleInspector"));
  assert.ok(shellApp.includes("static onToggleInspector()"));
  assert.ok(shellApp.includes('event.key === "Escape" && this.isInspectorOpen'));
});
