import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const shell = fs.readFileSync(new URL("../scripts/ui/shell-app.js", import.meta.url), "utf8");
const template = fs.readFileSync(new URL("../templates/app-shell.hbs", import.meta.url), "utf8");
const dialogs = fs.readFileSync(new URL("../styles/app/dialogs.css", import.meta.url), "utf8");

test("UI registra um diálogo único para transições terminais", () => {
  for (const token of [
    "pendingTerminalTransition",
    "closeTerminalTransition: DomainManagerShellApp.onCloseTerminalTransition",
    "confirmTerminalTransition: DomainManagerShellApp.onConfirmTerminalTransition",
    "static onCloseTerminalTransition()",
    "static async onConfirmTerminalTransition()"
  ]) assert.match(shell, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  assert.match(template, /dm-terminal-transition-title/);
  assert.match(template, /role="dialog" aria-modal="true"/);
  assert.match(template, /data-action="closeTerminalTransition"/);
  assert.match(template, /data-action="confirmTerminalTransition"/);
  assert.match(template, /Consequências desta alteração/);
});

test("Person, Squad e Structure encaminham estados terminais para confirmação", () => {
  assert.match(shell, /\["dead", "retired"\]\.includes\(common\.status\)/);
  assert.match(shell, /administrationPayload\.status === "disbanded"/);
  assert.match(shell, /\["destroyed", "decommissioned"\]\.includes\(payload\.status\)/);
  assert.match(shell, /confirmTerminalTransition: true/);
  assert.match(shell, /game\.user\.isGM \|\| value !== "disbanded"/);
  assert.match(shell, /if \(squad\.status === "disbanded"\) return false/);
});

test("diálogo terminal preserva legibilidade e se reorganiza em largura compacta", () => {
  assert.match(dialogs, /\.dm-terminal-transition-dialog/);
  assert.match(dialogs, /\.dm-terminal-transition-effects/);
  assert.match(dialogs, /font-size:12px/);
  assert.match(dialogs, /@container dm-window \(max-width:560px\)[^{]*\{[^}]*\.dm-terminal-transition-dialog/);
  assert.match(dialogs, /\.dm-terminal-transition-telemetry\{grid-template-columns:1fr\}/);
});
