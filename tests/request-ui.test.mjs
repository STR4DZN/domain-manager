import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const template = fs.readFileSync(new URL("../templates/app-shell.hbs", import.meta.url), "utf8");
const shell = fs.readFileSync(new URL("../scripts/ui/shell-app.js", import.meta.url), "utf8");
const nav = fs.readFileSync(new URL("../scripts/ui/navigation.js", import.meta.url), "utf8");
const viewsCss = fs.readFileSync(new URL("../styles/app/views.css", import.meta.url), "utf8");

test("Requests é ferramenta do workspace Command com queue, dossier e dois consoles", () => {
  for (const token of [
    'id: "requests", label: "Solicitações"',
    'preferred: ["overview", "requests", "history"]'
  ]) assert.equal(nav.includes(token), true, `navegação ausente: ${token}`);
  for (const token of [
    "GESTÃO // SOLICITAÇÕES",
    "dm-request-board",
    "DETALHES DA SOLICITAÇÃO",
    'id="dm-request-create-form"',
    'id="dm-request-review-form"',
    'data-action="selectRequest"',
    'data-action="openRequestCreate"',
    'data-action="openRequestReview"',
    'data-action="createMissionFromRequest"',
    "CRIAR MISSÃO",
    'data-action="withdrawRequest"',
    "RETIRAR SOLICITAÇÃO",
    'data-action="fulfillRequest"',
    "MARCAR COMO CUMPRIDA"
  ]) assert.equal(template.includes(token), true, `Request UI ausente: ${token}`);
  assert.equal(viewsCss.includes(".dm-request-board"), true);
  assert.equal(viewsCss.includes(".dm-request-inspector__facts"), true);
});

test("shell filtra ownership de Request antes de decode/render", () => {
  const relatedStart = shell.indexOf("function domainRelatedRecords");
  const relatedEnd = shell.indexOf("function buildLegacyPeople", relatedStart);
  const block = shell.slice(relatedStart, relatedEnd);
  assert.equal(block.includes("recordIndex.requestsForDomain(domain.uuid).filter((document) => canViewDocument(document))"), true);
  assert.equal(block.includes("requests: decode(recordIndex.requestsForDomain(domain.uuid))"), false);
});

test("Request UI usa somente Command Kernel para create/review", () => {
  const start = shell.indexOf("static onSelectRequest");
  const end = shell.indexOf("static onSelectProject", start);
  const block = shell.slice(start, end);
  assert.equal(block.includes("COMMAND_TYPES.REQUEST_CREATE"), true);
  assert.equal(block.includes("COMMAND_TYPES.REQUEST_REVIEW"), true);
  assert.equal(block.includes("COMMAND_TYPES.REQUEST_CREATE_MISSION"), true);
  assert.equal(block.includes("COMMAND_TYPES.REQUEST_WITHDRAW"), true);
  assert.equal(block.includes("COMMAND_TYPES.REQUEST_FULFILL"), true);
  assert.equal(block.includes("executeCommandAuthoritatively"), true);
  assert.equal(block.includes("updateRecord("), false);
  assert.equal(block.includes("createRecord("), false);
});

test("UI não promete fulfillment automático", () => {
  assert.equal(template.includes("não há conclusão automática nesta etapa"), true);
  assert.equal(template.includes("não cria missão, projeto ou acordo automaticamente"), true);
});


test("Mission só é oferecida como materialização explícita de Request aprovada/roteada", () => {
  assert.equal(shell.includes('status === "approved"'), true);
  assert.equal(shell.includes('handling === "mission"'), true);
  assert.equal(shell.includes('!record.data.resultUuid'), true);
  assert.equal(template.includes('data-action="createMissionFromRequest"'), true);
});


test("lifecycle UI só oferece withdraw ao solicitante e fulfill quando há evidência", () => {
  assert.equal(shell.includes('game.user.uuid === record.data.requesterUserUuid'), true);
  assert.equal(shell.includes('["submitted", "under-review", "needs-changes"].includes(status)'), true);
  assert.equal(shell.includes('handling === "immediate"'), true);
  assert.equal(shell.includes('linkedMission?.data.status === "resolved"'), true);
  assert.equal(template.includes('data-action="withdrawRequest"'), true);
  assert.equal(template.includes('data-action="fulfillRequest"'), true);
  assert.equal(template.includes("ESTADO DA MISSÃO"), true);
});


test("review congela após materialização de resultado", () => {
  assert.equal(shell.includes("REQUEST_REVIEW_STATUSES.includes(status) && !record.data.resultUuid"), true);
});


test("legacy actions não mantêm autoridade paralela", () => {
  const actions = fs.readFileSync(new URL("../scripts/features/requests/actions.js", import.meta.url), "utf8");
  assert.equal(actions.includes("dispatchAuthoritativeCommand"), true);
  assert.equal(actions.includes("COMMAND_TYPES.REQUEST_CREATE"), true);
  assert.equal(actions.includes("COMMAND_TYPES.REQUEST_REVIEW"), true);
  assert.equal(actions.includes("createRecord"), false);
  assert.equal(actions.includes("updateRecord"), false);
  assert.equal(actions.includes("transactionQueue"), false);
});
