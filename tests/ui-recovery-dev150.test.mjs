import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const template = fs.readFileSync(path.join(root, "templates/app-shell.hbs"), "utf8");
const shell = fs.readFileSync(path.join(root, "scripts/ui/shell-app.js"), "utf8");
const nav = fs.readFileSync(path.join(root, "scripts/ui/navigation.js"), "utf8");
const recovery = fs.readFileSync(path.join(root, "styles/app/recovery.css"), "utf8");
const build = fs.readFileSync(path.join(root, "scripts/build-css.js"), "utf8");
const media = fs.readFileSync(path.join(root, "scripts/features/domains/media.js"), "utf8");

function visibleText(source) {
  return [...source.replace(/\{\{[^{}]*\}\}/g, "").matchAll(/>([^<>]+)</g)]
    .map((match) => match[1].replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

test("dev.150 carrega a recuperação visual depois da camada de usabilidade", () => {
  const usability = build.indexOf('"styles/app/usability.css"');
  const recoveryIndex = build.indexOf('"styles/app/recovery.css"');
  assert.ok(usability >= 0 && recoveryIndex > usability);
});

test("navegação principal e workspaces são legíveis em português", () => {
  for (const label of ["Comando", "Domínios", "Operações", "Sistema", "Visão geral", "Solicitações", "Infraestrutura", "Recursos", "Projetos", "Missões", "Forças", "Defesa", "População", "Pessoas", "Inteligência", "Território", "Relações"]) {
    assert.ok(nav.includes(`label: "${label}"`), `rótulo ausente: ${label}`);
  }
  assert.equal(nav.includes('label: "Requests"'), false);
  assert.equal(nav.includes('label: "Operations"'), false);
});

test("Pessoas volta a ser uma página operacional com retrato, lista, detalhe e edição", () => {
  for (const marker of [
    "dm-people-layout", "dm-people-directory", "dm-person-list-row", "dm-person-profile",
    'data-action="selectPerson"', 'data-action="openPersonEditor"', 'data-action="browseImageField"',
    'name="portrait"', 'name="actorUuid"', 'name="squadEntityId"'
  ]) assert.ok(template.includes(marker), `recuperação de Pessoas ausente: ${marker}`);
  assert.ok(recovery.includes(".dm-people-layout"));
  assert.ok(recovery.includes(".dm-person-profile__portrait"));
});

test("aparência do domínio recupera FilePicker e todos os campos visuais existentes", () => {
  for (const action of ["openDomainMedia", "closeDomainMedia", "browseImageField", "submitDomainMedia"]) {
    assert.match(shell, new RegExp(`${action}:\\s*DomainManagerShellApp\\.`));
    assert.match(template, new RegExp(`data-action=["']${action}["']`));
  }
  for (const field of ["visuals.bannerImg", "visuals.crestImg", "visuals.image", "visuals.imageFit", "visuals.imageHeight", "visuals.imagePosX", "visuals.imagePosY", "visuals.imageZoom", "visuals.themeColorHex"]) {
    assert.ok(media.includes(`"${field}"`) || shell.includes(`"${field}"`), `campo visual ausente: ${field}`);
  }
  assert.ok(template.includes("dm-domain-hero"));
  assert.ok(template.includes("dm-domain-toolbar__crest"));
});

test("responsividade reorganiza a aplicação em vez de encolher o conteúdo", () => {
  assert.match(recovery, /@container dm-window \(max-width:1360px\)/);
  assert.match(recovery, /@container dm-window \(max-width:1180px\)/);
  assert.match(recovery, /@container dm-window \(max-width:820px\)/);
  assert.match(recovery, /@container dm-window \(max-width:560px\)/);
  assert.match(recovery, /grid-template-columns:1fr;grid-template-rows:auto minmax\(0,1fr\)/);
  assert.match(recovery, /\.dm-nav-workspace\.is-active\{display:flex!important\}/);
  assert.match(recovery, /\.dm-nav-workspace__children,\.dm-nav-workspace\.is-active \.dm-nav-workspace__children\{display:flex/);
  assert.match(recovery, /\.dm-resource-matrix-live,.dm-project-board,.dm-request-board/);
  assert.match(recovery, /overflow:auto/);
});

test("camada recuperada remove telemetria decorativa e mantém texto operacional grande", () => {
  for (const marker of ["dm-network-canvas__rings", "dm-network-axis", "dm-network-core", "--level:", "dm-scope-line"]) assert.equal(template.includes(marker), false);
  assert.match(recovery, /--dm-text-base:15px/);
  assert.match(recovery, /--dm-hit:44px/);
  assert.match(recovery, /\.dm-view-header h2[^\n]*font-size:30px/);
});

test("navegação compacta usa seletor de área e não comprime palavras", () => {
  assert.ok(template.includes("data-workspace-select"));
  assert.match(recovery, /\.dm-nav-workspace-picker\{height:42px/);
  assert.match(recovery, /overflow-wrap:normal!important/);
  assert.match(recovery, /\.dm-nav-workspace\.is-active\{display:flex!important\}/);
});

test("textos estáticos principais não reintroduzem terminologia inglesa de produto", () => {
  const text = visibleText(template);
  for (const forbidden of [
    "PROJECT DOSSIER", "REQUEST DOSSIER", "INTELLIGENCE DOSSIER", "CONFIGURE DEFENSE",
    "STRATEGIC ECONOMY", "WORKFORCE MATRIX", "NEW PERSON", "NEW NODE", "MISSION CONTROL",
    "RESOURCE POLICY", "SUSTENANCE POLICY", "INFRASTRUCTURE CONTROL"
  ]) assert.equal(text.includes(forbidden), false, `termo inglês visível: ${forbidden}`);
});


test("mensagens e chrome recuperados não exibem os termos ingleses que quebraram a experiência", () => {
  const text = visibleText(template);
  for (const forbidden of ["DOMAIN KERNEL", "Operational State", "Resource Channels", "Live Alerts", "Territory Control", "Domain Registry", "Operations Network", "Force Network", "New Cohort", "Sync Cohort"]) {
    assert.equal(text.includes(forbidden), false, `chrome inglês visível: ${forbidden}`);
  }
  for (const forbidden of ["Workforce matrix sincronizada.", "Falha ao salvar cohort.", "Falha ao salvar Person.", "Infrastructure Control", "Diplomatic link sincronizado.", "Diplomatic link removido.", '"Reserved" : "Progressive"']) {
    assert.equal(shell.includes(forbidden), false, `mensagem/label inglês remanescente: ${forbidden}`);
  }
});
