import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const template = fs.readFileSync(new URL("../templates/app-shell.hbs", import.meta.url), "utf8");
const shell = fs.readFileSync(new URL("../scripts/ui/shell-app.js", import.meta.url), "utf8");
const viewsCss = fs.readFileSync(new URL("../styles/app/views.css", import.meta.url), "utf8");
const { calculateDomainRisks } = await import("../scripts/features/risks/rules.js");

test("Defense Grid expõe estado efetivo, riscos e Command Console", () => {
  for (const token of [
    "CONFIGURAR DEFESA",
    "RISCOS",
    "RISCO DE ESCASSEZ",
    "RISCO DE INSTABILIDADE",
    'id="dm-security-form"',
    'name="defenseRating"',
    'name="guardCount"',
    'name="fortifications"'
  ]) assert.equal(template.includes(token), true, `Defense UI ausente: ${token}`);
  assert.equal(viewsCss.includes(".dm-defense-risk-board"), true);
  assert.equal(viewsCss.includes(".dm-defense-console-note"), true);
});

test("Defense UI muta somente via security.configure", () => {
  assert.equal(shell.includes("COMMAND_TYPES.SECURITY_CONFIGURE"), true);
  assert.equal(shell.includes("calculateDomainRisks"), true);
  const handler = shell.slice(shell.indexOf("static async onSubmitSecurityEditor"), shell.indexOf("static onOpenEconomyConfig"));
  assert.equal(handler.includes("executeCommandAuthoritatively"), true);
  assert.equal(handler.includes("updateRecord("), false);
  assert.equal(handler.includes("effectiveDefense:"), false, "UI não deve enviar estado derivado ao command");
  assert.equal(handler.includes("scarcityRisk:"), false, "UI não deve enviar risco derivado ao command");
  assert.equal(handler.includes("unrestRisk:"), false, "UI não deve enviar risco derivado ao command");
});

test("risco/defesa permanecem cálculo puro derivado dos dados existentes", () => {
  const risks = calculateDomainRisks({
    economy: { stocks: [], flows: [] },
    population: { total: 100 },
    security: { defenseRating: 20, guardCount: 10, fortifications: ["Wall", "Point Defense"] },
    conditions: []
  }, []);
  assert.equal(risks.security.defenseRating, 20);
  assert.equal(risks.security.guardCount, 10);
  assert.equal(risks.security.effectiveDefense, 45);
  assert.equal(risks.security.level, "medium");
  assert.equal(risks.scarcityRisk.percent, 0);
  assert.equal(risks.unrestRisk.percent, 0);
});
