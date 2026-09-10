import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Mocks para simular o ambiente Foundry VTT no Node.js
if (!globalThis.foundry) {
  globalThis.foundry = {
    abstract: {
      DataModel: class {
        constructor(data = {}) { Object.assign(this, data); }
        validate() { return true; }
        toObject() { return structuredClone(this); }
      }
    },
    data: {
      fields: {
        StringField: class { constructor(o) { Object.assign(this, o); } },
        NumberField: class { constructor(o) { Object.assign(this, o); } },
        BooleanField: class { constructor(o) { Object.assign(this, o); } },
        ArrayField: class { constructor(f, o) { this.element = f; Object.assign(this, o); } },
        SchemaField: class { constructor(f, o) { this.fields = f; Object.assign(this, o); } },
        ObjectField: class { constructor(o) { Object.assign(this, o); } }
      }
    },
    applications: {
      api: {
        ApplicationV2: class {},
        HandlebarsApplicationMixin: (Base) => class extends Base {}
      }
    },
    utils: {
      deepClone: (val) => structuredClone(val),
      randomID: () => Math.random().toString(36).substring(2, 18)
    }
  };
}

if (!globalThis.game) {
  globalThis.game = {
    user: { id: "gm_user", name: "Game Master", isGM: true },
    version: "13.0.0",
    settings: { get: () => null, register: () => {} }
  };
}

if (!globalThis.ui) {
  globalThis.ui = {
    notifications: {
      info: () => {},
      warn: () => {},
      error: () => {}
    }
  };
}

test("Arquitetura de Apresentação: Sintetizador Procedural de Áudio Tático (Web Audio API)", async () => {
  const { TacticalAudioEngine, tacticalAudio } = await import("../scripts/ui/audio/tactical-audio.js");

  assert.ok(TacticalAudioEngine, "TacticalAudioEngine deve ser exportado");
  assert.ok(tacticalAudio, "Instância singleton tacticalAudio deve ser exportada");
  assert.strictEqual(typeof tacticalAudio.playRelayClick, "function");
  assert.strictEqual(typeof tacticalAudio.playPinClick, "function");
  assert.strictEqual(typeof tacticalAudio.playTargetLock, "function");
  assert.strictEqual(typeof tacticalAudio.playDataPulse, "function");
  assert.strictEqual(typeof tacticalAudio.playAlertBeep, "function");
  assert.strictEqual(typeof tacticalAudio.toggleMute, "function");

  // Validar independência de arquivos de áudio externos
  const audioSource = fs.readFileSync(path.join(ROOT, "scripts/ui/audio/tactical-audio.js"), "utf8");
  assert.strictEqual(audioSource.includes(".mp3"), false, "Audio procedural não deve referenciar .mp3");
  assert.strictEqual(audioSource.includes(".wav"), false, "Audio procedural não deve referenciar .wav");
  assert.strictEqual(audioSource.includes(".ogg"), false, "Audio procedural não deve referenciar .ogg");

  // Validar comutador de mute
  const initialState = tacticalAudio.isEnabled;
  const toggled = tacticalAudio.toggleMute();
  assert.strictEqual(toggled, !initialState);
  tacticalAudio.setMuted(!initialState);
  assert.strictEqual(tacticalAudio.isEnabled, initialState);
});

test("Arquitetura de Apresentação: Renderizador Procedural de Telemetria e Radar Orbital (Canvas 2D)", async () => {
  const { TelemetryCanvasController } = await import("../scripts/ui/components/telemetry-canvas.js");

  assert.ok(TelemetryCanvasController, "TelemetryCanvasController deve ser exportado");

  // Simular mock de canvas 2D
  let cancelCalled = false;
  let animCount = 0;
  const mockCanvas = {
    width: 300,
    height: 200,
    getBoundingClientRect: () => ({ width: 300, height: 200 }),
    getContext: () => ({
      clearRect: () => {},
      save: () => {},
      restore: () => {},
      beginPath: () => {},
      closePath: () => {},
      arc: () => {},
      stroke: () => {},
      fill: () => {},
      moveTo: () => {},
      lineTo: () => {},
      strokeRect: () => {},
      fillRect: () => {},
      fillText: () => {},
      measureText: () => ({ width: 40 }),
      createLinearGradient: () => ({ addColorStop: () => {} }),
      createRadialGradient: () => ({ addColorStop: () => {} }),
      setLineDash: () => {},
      setTransform: () => {},
      strokeStyle: "",
      fillStyle: "",
      lineWidth: 1
    })
  };

  const controller = new TelemetryCanvasController(mockCanvas);
  assert.strictEqual(controller.isRunning, false);
  assert.ok(Array.isArray(controller.contourPoints), "Deve conter pontos de contorno topográfico");
  assert.ok(Array.isArray(controller.vectorPulses), "Deve conter vetores de pulsos");

  // Ciclo de vida: stop e destroy sem vazamento de memória
  controller.start();
  controller.stop();
  assert.strictEqual(controller.isRunning, false);
  controller.destroy();
  assert.strictEqual(controller.canvas, null);
  assert.strictEqual(controller.ctx, null);
});

test("Arquitetura de Apresentação: Estúdio de Imagem Universal", async () => {
  const { ImageStudioController } = await import("../scripts/ui/components/image-studio.js");

  assert.ok(ImageStudioController, "ImageStudioController deve ser exportado");
  assert.strictEqual(typeof ImageStudioController.extractImageStudioParams, "function");
  assert.strictEqual(typeof ImageStudioController.buildImageStudioStyle, "function");

  const style = ImageStudioController.buildImageStudioStyle({
    fit: "contain",
    height: 180,
    posX: 60,
    posY: 40,
    zoom: 120
  });

  assert.ok(style.includes("object-fit: contain"), "Deve incluir object-fit contain");
  assert.ok(style.includes("height: 180px"), "Deve incluir height 180px");
  assert.ok(style.includes("object-position: 60% 40%"), "Deve incluir object-position 60% 40%");
  assert.ok(style.includes("transform: scale(1.2)"), "Deve incluir scale 1.2 para zoom 120%");
});

test("Arquitetura de Apresentação: Módulos de Diálogos/Modais Desacoplados (scripts/ui/modals/)", async () => {
  const modalFiles = [
    "scripts/ui/modals/domain-modals.js",
    "scripts/ui/modals/economy-modals.js",
    "scripts/ui/modals/project-modals.js",
    "scripts/ui/modals/people-modals.js",
    "scripts/ui/modals/diplomacy-modals.js",
    "scripts/ui/modals/intel-modals.js",
    "scripts/ui/modals/history-modals.js",
    "scripts/ui/modals/simulation-modals.js",
    "scripts/ui/modals/tag-modals.js"
  ];

  for (const f of modalFiles) {
    assert.strictEqual(fs.existsSync(path.join(ROOT, f)), true, `Arquivo de modal ausente: ${f}`);
  }

  const { DomainDialogs } = await import("../scripts/ui/modals/domain-modals.js");
  const { EconomyModals } = await import("../scripts/ui/modals/economy-modals.js");
  const { ProjectModals } = await import("../scripts/ui/modals/project-modals.js");
  const { PeopleModals } = await import("../scripts/ui/modals/people-modals.js");
  const { DiplomacyModals } = await import("../scripts/ui/modals/diplomacy-modals.js");
  const { IntelModals } = await import("../scripts/ui/modals/intel-modals.js");
  const { HistoryModals } = await import("../scripts/ui/modals/history-modals.js");
  const { SimulationModals } = await import("../scripts/ui/modals/simulation-modals.js");
  const { TagModals } = await import("../scripts/ui/modals/tag-modals.js");

  assert.ok(DomainDialogs, "DomainDialogs deve ser exportado");
  assert.ok(EconomyModals, "EconomyModals deve ser exportado");
  assert.ok(ProjectModals, "ProjectModals deve ser exportado");
  assert.ok(PeopleModals, "PeopleModals deve ser exportado");
  assert.ok(DiplomacyModals, "DiplomacyModals deve ser exportado");
  assert.ok(IntelModals, "IntelModals deve ser exportado");
  assert.ok(HistoryModals, "HistoryModals deve ser exportado");
  assert.ok(SimulationModals, "SimulationModals deve ser exportado");
  assert.ok(TagModals, "TagModals deve ser exportado");
});

test("Arquitetura de Apresentação: Controladores Modulares de Visualização (scripts/ui/views/)", async () => {
  const viewFiles = [
    "scripts/ui/views/overview-view.js",
    "scripts/ui/views/economy-view.js",
    "scripts/ui/views/projects-view.js",
    "scripts/ui/views/people-view.js",
    "scripts/ui/views/diplomacy-view.js",
    "scripts/ui/views/intel-view.js",
    "scripts/ui/views/history-view.js"
  ];

  for (const f of viewFiles) {
    assert.strictEqual(fs.existsSync(path.join(ROOT, f)), true, `Arquivo de view ausente: ${f}`);
  }

  const { OverviewView } = await import("../scripts/ui/views/overview-view.js");
  const { EconomyView } = await import("../scripts/ui/views/economy-view.js");
  const { ProjectsView } = await import("../scripts/ui/views/projects-view.js");
  const { PeopleView } = await import("../scripts/ui/views/people-view.js");
  const { DiplomacyView } = await import("../scripts/ui/views/diplomacy-view.js");
  const { IntelView } = await import("../scripts/ui/views/intel-view.js");
  const { HistoryView } = await import("../scripts/ui/views/history-view.js");

  // 1. OverviewView prepareContext
  const overviewCtx = OverviewView.prepareContext({
    selectedRecord: { data: {} },
    selectedDomain: { name: "Base Alpha", categoryLabel: "Território" },
    metrics: { treasuryTotal: "100", netRate: "+5 /tick", effectiveDefense: 10, populationTotal: 500 },
    domainProjects: [{ name: "Muralha", isCompleted: false }],
    notables: [{ name: "Comandante Rex" }],
    activeConditions: []
  });
  assert.strictEqual(overviewCtx.hasDomain, true);
  assert.strictEqual(overviewCtx.kpis.length, 4, "OverviewView deve fornecer 4 KPIs táticos");
  assert.strictEqual(overviewCtx.topProjects.length, 1);
  assert.strictEqual(overviewCtx.topNotables.length, 1);

  // 2. EconomyView prepareContext
  const economyCtx = EconomyView.prepareContext({
    domainStocks: [{ resourceId: "gold", availableDisplay: "500" }],
    domainFlows: [{ isInflow: true, active: true, amountPerTickFormatted: "10,00" }],
    upkeepSettings: { enabled: true },
    catalog: { resources: [] }
  });
  assert.strictEqual(economyCtx.stocks.length, 1);
  assert.strictEqual(economyCtx.flows.length, 1);
  assert.strictEqual(economyCtx.isFiscalSurplus, true);

  // 3. ProjectsView prepareContext
  const projectsCtx = ProjectsView.prepareContext({
    domainProjects: [
      { name: "Silo", isCompleted: true, modifiers: { defenseBonus: 5 } },
      { name: "Quartel", isCompleted: false, progressPercent: 40 }
    ]
  });
  assert.strictEqual(projectsCtx.activeCount, 1);
  assert.strictEqual(projectsCtx.completedCount, 1);
  assert.strictEqual(projectsCtx.totalBonuses.defense, 5);

  // 4. PeopleView prepareContext
  const peopleCtx = PeopleView.prepareContext({
    notables: [{ localId: "not_1", name: "Dra. Ellen" }],
    groups: [{ name: "Trabalhadores", count: 200 }],
    metrics: { populationTotal: 200, unrestRiskPercent: 5 },
    activeNotableDossierLocalId: "not_1"
  });
  assert.strictEqual(peopleCtx.notableCount, 1);
  assert.strictEqual(peopleCtx.hasActiveDossier, true);
  assert.strictEqual(peopleCtx.activeDossierNotable.name, "Dra. Ellen");

  // 5. DiplomacyView prepareContext
  const diplomacyCtx = DiplomacyView.prepareContext({
    relations: [{ posture: "allied" }, { posture: "friendly" }],
    agreements: []
  });
  assert.strictEqual(diplomacyCtx.totalRelations, 2);
  assert.strictEqual(diplomacyCtx.alliedCount, 1);

  // 6. IntelView prepareContext
  const intelCtx = IntelView.prepareContext({
    intelList: [{ category: "secret" }, { category: "rumor" }],
    user: { isGM: true }
  });
  assert.strictEqual(intelCtx.secretCount, 1);
  assert.strictEqual(intelCtx.rumorCount, 1);
  assert.strictEqual(intelCtx.canEdit, true);

  // 7. HistoryView prepareContext
  const historyCtx = HistoryView.prepareContext({
    fullHistory: [{ title: "Fundação" }, { title: "Tratado" }],
    user: { isGM: true }
  });
  assert.strictEqual(historyCtx.totalEntries, 2);
  assert.strictEqual(historyCtx.canEdit, true);
});

test("Arquitetura de Apresentação: Estilos Táticos e Radar Orbital em styles/views/overview.css", async () => {
  const overviewCss = fs.readFileSync(path.join(ROOT, "styles/views/overview.css"), "utf8");
  assert.ok(overviewCss.includes(".dm-orbital-radar-container"), "overview.css deve conter .dm-orbital-radar-container");
  assert.ok(overviewCss.includes("#dm-orbital-radar-canvas"), "overview.css deve conter #dm-orbital-radar-canvas");
  assert.ok(overviewCss.includes(".dm-radar-overlay-badge"), "overview.css deve conter .dm-radar-overlay-badge");
  assert.ok(overviewCss.includes(".dm-radar-overlay-coords"), "overview.css deve conter .dm-radar-overlay-coords");

  // Validar compilação automática no bundle styles/shell.css
  const shellCss = fs.readFileSync(path.join(ROOT, "styles/shell.css"), "utf8");
  assert.ok(shellCss.includes(".dm-orbital-radar-container"), "shell.css compilado deve conter o container do radar orbital");
});
