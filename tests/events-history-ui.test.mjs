import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { listVisibleHistoryEvents } from "../scripts/features/history/rules.js";

const shell = readFileSync(new URL("../scripts/ui/shell-app.js", import.meta.url), "utf8");
const template = readFileSync(new URL("../templates/app-shell.hbs", import.meta.url), "utf8");
const viewsCss = readFileSync(new URL("../styles/app/views.css", import.meta.url), "utf8");
const dialogsCss = readFileSync(new URL("../styles/app/dialogs.css", import.meta.url), "utf8");
const usabilityCss = readFileSync(new URL("../styles/app/usability.css", import.meta.url), "utf8");
const bundle = readFileSync(new URL("../styles/shell.css", import.meta.url), "utf8");

function between(source, startToken, endToken) {
  const start = source.indexOf(startToken);
  const end = source.indexOf(endToken, start + startToken.length);
  assert.ok(start >= 0, `Trecho inicial ausente: ${startToken}`);
  assert.ok(end > start, `Trecho final ausente: ${endToken}`);
  return source.slice(start, end);
}

test("History filtra gm_only antes de montar o contexto do jogador", () => {
  const history = [
    { localId: "old", timestamp: 10, visibility: "all" },
    { localId: "secret", timestamp: 30, visibility: "gm_only" },
    { localId: "new", timestamp: 20, visibility: "all" }
  ];

  assert.deepEqual(
    listVisibleHistoryEvents(history, { id: "P1", isGM: false }).map((entry) => entry.localId),
    ["new", "old"]
  );
  assert.deepEqual(
    listVisibleHistoryEvents(history, { id: "GM", isGM: true }).map((entry) => entry.localId),
    ["secret", "new", "old"]
  );
  assert.match(shell, /const history = listVisibleHistoryEvents\(selectedDomain\?\.data\?\.history \?\? \[\], game\.user\)/);
  assert.doesNotMatch(shell, /const history = \[\.\.\.\(selectedDomain\?\.data\?\.history/);
});

test("History renderiza summary/details e esconde toda mutação fora do bloco GM", () => {
  const historyView = between(template, "{{#if view.history}}", "{{/if}}\n      </div>");
  assert.match(historyView, /\{\{summaryText\}\}/);
  assert.match(historyView, /\{\{details\}\}/);
  assert.doesNotMatch(historyView, /\{\{description\}\}/);
  assert.match(historyView, /\{\{#if canManageHistory\}\}[\s\S]*data-action="openHistoryClear"[\s\S]*data-action="openHistoryEntry"[\s\S]*\{\{\/if\}\}/);
  assert.match(historyView, /\{\{#if \.\.\/canManageHistory\}\}[\s\S]*data-action="removeHistoryEntry"/);
  assert.match(shell, /canManageHistory: Boolean\(game\.user\.isGM && selectedDomain\)/);
});

test("Events e History usam wrappers autoritativos, revisão congelada e confirmações destrutivas", () => {
  for (const action of [
    "openHistoryEntry", "submitHistoryEntry", "removeHistoryEntry", "confirmRemoveHistoryEntry",
    "openHistoryClear", "confirmHistoryClear", "rollDomainEvent", "confirmDomainEvent"
  ]) {
    assert.match(template, new RegExp(`data-action="${action}"`), `Ação ausente no template: ${action}`);
    assert.match(shell, new RegExp(`${action}: DomainManagerShellApp\\.on`), `Handler ausente no mapa: ${action}`);
  }

  const handlers = shell.slice(shell.indexOf("static onOpenHistoryEntry"), shell.indexOf("static onSelectProject"));
  assert.match(handlers, /await addHistoryEvent\(/);
  assert.match(handlers, /await removeHistoryEvent\(/);
  assert.match(handlers, /await clearHistory\(/);
  assert.match(handlers, /rollEventForDomain\(/);
  assert.match(handlers, /await executeApplyEventOutcome\(/);
  assert.match(handlers, /expectedModifiedTime: pending\.expectedModifiedTime/);
  assert.match(handlers, /postToChat: data\.has\("postToChat"\)/);
  assert.doesNotMatch(handlers, /ChatMessage|updateRecord|updateEmbeddedDocuments/);
  assert.match(template, /id="dm-history-remove-title"/);
  assert.match(template, /id="dm-history-clear-title"/);
});

test("History mantém leitura e diálogos responsivos na fonte e no bundle distribuível", () => {
  for (const source of [viewsCss, bundle]) {
    assert.match(source, /\.dm-history-event-console\{[^}]*grid-template-columns:/);
    assert.match(source, /\.dm-history-stream strong\{[^}]*font-size:14px/);
    assert.match(source, /\.dm-history-stream p\{[^}]*font-size:12px/);
  }
  for (const source of [dialogsCss, bundle]) {
    assert.match(source, /\.dm-history-entry-dialog/);
    assert.match(source, /\.dm-domain-event-dialog__identity/);
    assert.match(source, /\.dm-domain-event-outcomes/);
  }
  for (const source of [usabilityCss, bundle]) {
    assert.match(source, /@container dm-window \(max-width:760px\)[\s\S]*\.dm-history-event-console\{grid-template-columns:1fr/);
    assert.match(source, /\.dm-history-stream article\{grid-template-columns:38px minmax\(0,1fr\)\}/);
  }
});
