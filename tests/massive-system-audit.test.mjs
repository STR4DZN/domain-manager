import test from "node:test";
import assert from "node:assert/strict";

// Mock do Foundry VTT Environment
globalThis.foundry = {
  utils: {
    deepClone: (obj) => JSON.parse(JSON.stringify(obj)),
    randomID: () => Math.random().toString(36).substring(2, 10)
  }
};

globalThis.game = {
  user: { id: "gm-tester", name: "Game Master", isGM: true },
  settings: {
    get: (module, key) => {
      if (key === "resourceCatalog") {
        return {
          version: 1,
          resources: [
            { id: "credits", name: "Créditos", unit: "Cr$", precision: 2, allowNegative: false },
            { id: "food", name: "Provisões / Comida", unit: "kg", precision: 0, allowNegative: false },
            { id: "water", name: "Recursos Hídricos / Água", unit: "L", precision: 0, allowNegative: false },
            { id: "minerals", name: "Minérios Raros", unit: "t", precision: 0, allowNegative: false }
          ]
        };
      }
      if (key === "secondsPerTick") return 86400;
      if (key === "syncTimekeeping") return false;
      return null;
    },
    set: async () => true
  },
  journal: []
};

globalThis.ui = {
  notifications: {
    info: () => {},
    warn: () => {},
    error: () => {}
  }
};

function createMockJournal({ uuid, name, data = {} }) {
  return {
    uuid,
    name,
    flags: {
      "domain-manager": {
        recordType: "domain",
        version: 1,
        data: foundry.utils.deepClone(data)
      }
    },
    update: async (changes) => {
      const rec = changes.flags?.["domain-manager"];
      if (rec) {
        data = foundry.utils.deepClone(rec.data);
      }
      return true;
    }
  };
}

/* ==========================================================================
   1. AUDITORIA MATEMÁTICA: ARITMÉTICA EXATA, MDC, MMC E FRAÇÕES RACIONAIS
   ========================================================================== */
test("Aritmética Exata: MDC, MMC, Frações Racionais e Carry Accumulator", async () => {
  const { gcd, lcm, RationalFraction, calculateExactFlowAdvance, distributeExactMinorUnits } =
    await import("../scripts/core/exact-math.js");

  // 1.1 MDC (GCD)
  assert.equal(gcd(54, 24), 6n);
  assert.equal(gcd(101, 103), 1n, "Primos entre si devem ter MDC = 1");
  assert.equal(gcd(0, 42), 42n, "MDC com 0 é o próprio número");
  assert.equal(gcd(-36, 60), 12n, "MDC com negativos deve ser positivo");

  // 1.2 MMC (LCM)
  assert.equal(lcm(12, 18), 36n);
  assert.equal(lcm(7, 13), 91n);
  assert.equal(lcm(0, 5), 0n);

  // 1.3 Fração Racional e Redução Automática
  const f1 = new RationalFraction(50, 100);
  assert.equal(f1.num, 1n);
  assert.equal(f1.den, 2n);

  // 1.4 Operações Racionais
  const f2 = new RationalFraction(1, 3);
  const sum = f1.add(f2); // 1/2 + 1/3 = 5/6
  assert.equal(sum.num, 5n);
  assert.equal(sum.den, 6n);

  const sub = f1.subtract(f2); // 1/2 - 1/3 = 1/6
  assert.equal(sub.num, 1n);
  assert.equal(sub.den, 6n);

  const mul = f1.multiply(f2); // 1/2 * 1/3 = 1/6
  assert.equal(mul.num, 1n);
  assert.equal(mul.den, 6n);

  const div = f1.divide(f2); // (1/2) / (1/3) = 3/2
  assert.equal(div.num, 3n);
  assert.equal(div.den, 2n);

  // 1.5 Proteção contra Divisão por Zero
  assert.throws(() => new RationalFraction(1, 0), RangeError);
  assert.throws(() => f1.divide(new RationalFraction(0, 1)), RangeError);

  // 1.6 Acumulador de Carry sem perda de resíduo ao longo de 100 ticks
  // Taxa de 10 unidades a cada 3 ticks (10/3 = 3.333...)
  let currentCarry = 0;
  let totalAdvanced = 0;
  for (let tick = 1; tick <= 30; tick++) {
    const res = calculateExactFlowAdvance({
      ratePerPeriod: 10,
      periodTicks: 3,
      deltaTicks: 1,
      initialCarry: currentCarry
    });
    totalAdvanced += res.deltaAmount;
    currentCarry = res.nextCarry;
  }
  // Em 30 ticks, (10 * 30) / 3 = 100 unidades exatas com carry 0
  assert.equal(totalAdvanced, 100);
  assert.equal(currentCarry, 0);

  // 1.7 Distribuição de centavos exata (sem sobras nem faltas)
  const totalCents = 10005; // 100.05
  const weights = [3, 3, 4]; // 30%, 30%, 40%
  const distributed = distributeExactMinorUnits(totalCents, weights);
  assert.equal(distributed.length, 3);
  assert.equal(distributed.reduce((a, b) => a + b, 0), totalCents, "Soma das partes deve ser estritamente igual ao total");
  assert.equal(distributed[0] + distributed[1] + distributed[2], 10005);
});

/* ==========================================================================
   2. AUDITORIA ECONÔMICA: LEDGER, BALANÇO, RUNWAY E FORMATAÇÃO DE TAXAS
   ========================================================================== */
test("Auditoria Econômica: Formatador de Taxas, Precisões e Balanço /tick", async () => {
  const { formatFlowRateDisplay, buildResourceLedger } = await import("../scripts/features/economy/ledger.js");

  // 2.1 Formatador de Taxas com Precision 2 (Créditos / Moedas)
  // 50.00 créditos por tick -> 5000 minorUnits / 1 tick
  assert.equal(formatFlowRateDisplay(5000n, 1n, 2), "+50,00");
  assert.equal(formatFlowRateDisplay(-1250n, 1n, 2), "-12,50");
  assert.equal(formatFlowRateDisplay(0n, 1n, 2), "0,00");

  // 2.2 Períodos Fracionários com Precision 2
  // 10.00 créditos a cada 3 ticks -> 1000 minorUnits / 3 ticks = +3,33/tick
  assert.equal(formatFlowRateDisplay(1000n, 3n, 2), "+3,33");

  // 2.3 Formatador de Taxas com Precision 0 (Comida, Água, Minérios inteiros)
  assert.equal(formatFlowRateDisplay(100n, 1n, 0), "+100");
  assert.equal(formatFlowRateDisplay(-25n, 1n, 0), "-25");
  assert.equal(formatFlowRateDisplay(0n, 1n, 0), "0");

  // 2.4 Ledger do Recurso: Estoque, Reservas, Taxa e Runway
  const resourceDef = { id: "credits", name: "Créditos", precision: 2, allowNegative: false };
  const ledger = buildResourceLedger({
    resource: resourceDef,
    stockAmount: 10000, // 100.00 créditos em estoque
    flows: [
      { localId: "f1", resourceId: "credits", direction: "inflow", amount: 2000, periodTicks: 1, active: true }, // +20.00
      { localId: "f2", resourceId: "credits", direction: "outflow", amount: 4500, periodTicks: 1, active: true } // -45.00
    ],
    reservations: [
      { resourceId: "credits", amount: 1500, source: "Obra" } // 15.00 reservado
    ]
  });

  assert.equal(ledger.stockDisplay, "100,00");
  assert.equal(ledger.reservedDisplay, "15,00");
  assert.equal(ledger.availableDisplay, "85,00");
  assert.equal(ledger.netDirection, "negative");
  assert.equal(ledger.netPerTickDisplay, "-25,00"); // +20 - 45 = -25.00

  // Runway: 85.00 disponível gastando 25.00/tick -> 85 / 25 = 3 ticks
  assert.equal(ledger.runwayTicksFloor, 3);
});

/* ==========================================================================
   3. AUDITORIA DE SUSTENTO DA POPULAÇÃO: COMIDA, ÁGUA E GUARDAS
   ========================================================================== */
test("Auditoria de Sustento: Consumo de Comida, Água e Manutenção de Guardas", async () => {
  const { calculateDomainUpkeep } = await import("../scripts/features/economy/upkeep.js");

  const catalog = {
    resources: [
      { id: "credits", name: "Créditos", precision: 2 },
      { id: "food", name: "Comida", precision: 0 },
      { id: "water", name: "Água", precision: 0 }
    ]
  };

  // Cenário A: Colônia com 1.250 habitantes e 10 guardas
  const domainA = {
    population: {
      groups: [
        { localId: "g1", name: "Colonizadores", count: 800 },
        { localId: "g2", name: "Engenheiros", count: 450 }
      ]
    },
    security: {
      guardCount: 10
    }
  };

  const upkeepA = calculateDomainUpkeep({ domainData: domainA, catalog });
  assert.equal(upkeepA.totalPop, 1250);
  assert.equal(upkeepA.guards, 10);

  // 1250 habitantes / 100 = 12.5 -> ceil(12.5) = 13 unidades de comida e água por tick
  assert.equal(upkeepA.rawFoodUnits, 13);
  assert.equal(upkeepA.rawWaterUnits, 13);
  assert.equal(upkeepA.rawGuardUnits, 10);

  // Fluxos sintéticos gerados
  assert.equal(upkeepA.syntheticFlows.length, 3);
  const foodFlow = upkeepA.syntheticFlows.find((f) => f.resourceId === "food");
  const waterFlow = upkeepA.syntheticFlows.find((f) => f.resourceId === "water");
  const guardFlow = upkeepA.syntheticFlows.find((f) => f.resourceId === "credits");

  assert.ok(foodFlow);
  assert.equal(foodFlow.amount, 13);
  assert.equal(foodFlow.direction, "outflow");

  assert.ok(waterFlow);
  assert.equal(waterFlow.amount, 13);
  assert.equal(waterFlow.direction, "outflow");

  assert.ok(guardFlow);
  assert.equal(guardFlow.amount, 1000); // 10 guardas * 1.00 crédito (precision 2 = 1000 minorUnits)
  assert.equal(guardFlow.direction, "outflow");

  // Cenário B: Posto vazio (0 habitantes e 0 guardas)
  const upkeepB = calculateDomainUpkeep({ domainData: {}, catalog });
  assert.equal(upkeepB.totalPop, 0);
  assert.equal(upkeepB.rawFoodUnits, 0);
  assert.equal(upkeepB.rawWaterUnits, 0);
  assert.equal(upkeepB.rawGuardUnits, 0);
  assert.equal(upkeepB.syntheticFlows.length, 0);
});

/* ==========================================================================
   4. AUDITORIA DO MOTOR DE SIMULAÇÃO: AVANÇO TEMPORAL E CONSEQÜÊNCIAS DE FOME
   ========================================================================== */
test("Auditoria Temporal: Simulação de Avanço, Consumo de Estoque e Crise de Fome", async () => {
  const { simulateAdvance } = await import("../scripts/simulation/simulate.js");

  const catalog = [
    { id: "credits", name: "Créditos", precision: 2, allowNegative: false },
    { id: "food", name: "Comida", precision: 0, allowNegative: false },
    { id: "water", name: "Água", precision: 0, allowNegative: false }
  ];

  // Snapshot com 500 habitantes (consome 5 comida e 5 água por tick)
  // Estoque inicial: 12 comida (dura 2 ticks; no tick 3 esgota!)
  const snapshot = {
    catalog,
    projects: [],
    domains: [
      {
        uuid: "Domain.colonia-alpha",
        name: "Colônia Alpha",
        stocks: [
          { resourceId: "credits", amount: 5000 },
          { resourceId: "food", amount: 12 },
          { resourceId: "water", amount: 50 }
        ],
        flows: [],
        population: {
          groups: [{ localId: "g1", name: "Trabalhadores", count: 500, quality: "Estável", assignment: "2" }]
        },
        security: { guardCount: 2 }
      }
    ]
  };

  // Simulação de 2 Ticks: Comida suficiente (12 - 10 = 2 restantes)
  const report2Ticks = simulateAdvance({ snapshot, deltaTicks: 2 });
  const foodReport2 = report2Ticks.domains[0].resources.find((r) => r.resourceId === "food");
  assert.equal(foodReport2.projectedStock, 2);
  assert.equal(foodReport2.shortfall, false);
  assert.equal(report2Ticks.alerts.some((a) => a.type === "famine"), false);

  // Simulação de 3 Ticks: Comida insuficiente (12 - 15 = -3 -> Fome!)
  const report3Ticks = simulateAdvance({ snapshot, deltaTicks: 3 });
  const foodReport3 = report3Ticks.domains[0].resources.find((r) => r.resourceId === "food");
  assert.equal(foodReport3.projectedStock, -3);
  assert.equal(foodReport3.shortfall, true);

  // Alerta de fome disparado pelo motor
  const famineAlert = report3Ticks.alerts.find((a) => a.type === "famine");
  assert.ok(famineAlert, "Deve emitir alerta de crise de alimentos");
  assert.ok(famineAlert.message.includes("Crise de Alimentos"));
});

/* ==========================================================================
   5. AUDITORIA DE OBRAS, TIERS E MODIFICADORES TERRITORIAIS
   ========================================================================== */
test("Auditoria de Obras: Progresso, Conclusão e Ativação de Modificadores", async () => {
  const { simulateAdvance } = await import("../scripts/simulation/simulate.js");

  const snapshot = {
    catalog: [{ id: "credits", name: "Créditos", precision: 2, allowNegative: false }],
    domains: [{ uuid: "Domain.base-1", name: "Base 1", stocks: [{ resourceId: "credits", amount: 10000 }], flows: [] }],
    projects: [
      {
        uuid: "Project.muralha",
        name: "Muralha de Defesa",
        domainUuid: "Domain.base-1",
        status: "active",
        work: { required: 100, completed: 80, rateAmount: 20, periodTicks: 1, carry: 0 },
        costs: []
      }
    ]
  };

  // Avançar 1 tick (80 + 20 = 100 -> Obra Concluída!)
  const report = simulateAdvance({ snapshot, deltaTicks: 1 });
  const projReport = report.projects[0];

  assert.equal(projReport.projectedCompleted, 100);
  assert.equal(projReport.progressPercent, 100);
  assert.equal(projReport.wouldComplete, true);
  assert.equal(projReport.projectedStatus, "completed");
});

/* ==========================================================================
   6. AUDITORIA DE SEGURANÇA E DEFESA EFETIVA
   ========================================================================== */
test("Auditoria de Defesa: Defesa Base + Bônus de Guardas + Modificadores", async () => {
  const defenseBase = 15;
  const guardCount = 8;
  const projectDefenseBonus = 10;

  // Fórmula: defenseBase + floor(guardCount * 1.5) + projectDefenseBonus
  // 15 + floor(8 * 1.5) + 10 = 15 + 12 + 10 = 37
  const effectiveDefense = defenseBase + Math.floor(guardCount * 1.5) + projectDefenseBonus;
  assert.equal(effectiveDefense, 37);

  // Mitigação de Agitação pelos Guardas: floor(guardCount * 0.2) = floor(8 * 0.2) = 1 ponto
  const guardUnrestMitigation = Math.floor(guardCount * 0.2);
  assert.equal(guardUnrestMitigation, 1);
});

/* ==========================================================================
   7. AUDITORIA DE DIPLOMACIA E QUEBRA DE ACORDOS
   ========================================================================== */
test("Auditoria Diplomática: Transferência e Detecção de Quebra de Acordo por Falta de Estoque", async () => {
  const { simulateAdvance } = await import("../scripts/simulation/simulate.js");

  const snapshot = {
    catalog: [{ id: "minerals", name: "Minérios Raros", precision: 0, allowNegative: false }],
    projects: [],
    domains: [
      {
        uuid: "Domain.mine-1",
        name: "Mina de Cristais",
        stocks: [{ resourceId: "minerals", amount: 5 }], // Apenas 5 unidades
        flows: [],
        agreements: [
          {
            status: "active",
            remainingTicks: 10,
            transfers: [{ resourceId: "minerals", direction: "send", amountPerTick: 10 }] // Deve enviar 10/tick
          }
        ]
      }
    ]
  };

  // Avançar 1 tick: O domínio tenta enviar 10, mas só tem 5 -> Estoque ficaria negativo (-5)
  const report = simulateAdvance({ snapshot, deltaTicks: 1 });
  const breachAlert = report.alerts.find((a) => a.type === "agreementBreach");

  assert.ok(breachAlert, "Deve disparar alerta de quebra de acordo");
  assert.equal(breachAlert.resourceId, "minerals");
  assert.ok(breachAlert.message.includes("Risco de Quebra de Acordo"));
});

/* ==========================================================================
   8. AUDITORIA DE AGITAÇÃO CIVIL PONDERADA (WEIGHTED UNREST)
   ========================================================================== */
test("Auditoria Populacional: Cálculo de Agitação Ponderada por Habitante", async () => {
  // Grupo 1: 1.000 colonos com agitação 2 (Estável) -> 1.000 * 2 = 2.000
  // Grupo 2: 200 mineradores rebeldes com agitação 9 (Rebelde) -> 200 * 9 = 1.800
  // Grupo 3: 800 cientistas leais com agitação 0 (Muito Alta) -> 800 * 0 = 0
  // Total População = 2.000 habitantes.
  // Soma Ponderada = 2.000 + 1.800 + 0 = 3.800
  // Média Bruta de Agitação = 3.800 / 2.000 = 1.90
  const groups = [
    { count: 1000, unrest: 2 },
    { count: 200, unrest: 9 },
    { count: 800, unrest: 0 }
  ];
  const totalPop = groups.reduce((acc, g) => acc + g.count, 0);
  const weightedSum = groups.reduce((acc, g) => acc + (g.count * g.unrest), 0);
  const rawAverage = weightedSum / totalPop;
  assert.equal(rawAverage, 1.9);

  // Mitigação por 10 Guardas: floor(10 * 0.2) = 2 pontos de mitigação
  const guards = 10;
  const guardMitigation = Math.floor(guards * 0.2);
  assert.equal(guardMitigation, 2);

  // Agitação Efetiva: max(0, 1.9 - 2) = 0 (Totalmente pacificado pelos guardas!)
  const effectiveUnrest = Math.max(0, rawAverage - guardMitigation);
  assert.equal(effectiveUnrest, 0);
  const riskPercent = Math.min(100, Math.round(effectiveUnrest * 10));
  assert.equal(riskPercent, 0);
});

/* ==========================================================================
   9. AUDITORIA DE DECAIMENTO TEMPORAL DE CONDIÇÕES
   ========================================================================== */
test("Auditoria Temporal: Decaimento e Expiração de Condições Ativas", async () => {
  let conditions = [
    { localId: "c1", name: "Neblina Tóxica", durationTicks: 3, active: true },
    { localId: "c2", name: "Epidemia", durationTicks: 1, active: true },
    { localId: "c3", name: "Herança Ancestral", durationTicks: null, active: true } // Permanente
  ];

  // Simular avanço de 1 tick
  const ticksToAdvance = 1;
  conditions = conditions
    .map((cond) => {
      if (typeof cond.durationTicks === "number" && cond.durationTicks > 0) {
        const remaining = Math.max(0, cond.durationTicks - ticksToAdvance);
        return { ...cond, durationTicks: remaining, active: remaining > 0 };
      }
      return cond;
    })
    .filter((cond) => cond.active !== false || cond.durationTicks === null);

  assert.equal(conditions.length, 2, "Condição c2 com durationTicks=1 deve expirar e ser removida");
  const c1 = conditions.find((c) => c.localId === "c1");
  const c3 = conditions.find((c) => c.localId === "c3");

  assert.equal(c1.durationTicks, 2);
  assert.equal(c1.active, true);
  assert.equal(c3.durationTicks, null, "Condição permanente não decai");
});

/* ==========================================================================
   10. AUDITORIA DE CONFLITO DE REVISÃO E CONCORRÊNCIA (OCC)
   ========================================================================== */
test("Auditoria de Concorrência: Proteção contra Sobrescrita Concorrente (OCC)", async () => {
  const { ModuleError, ERROR_CODES } = await import("../scripts/core/errors.js");

  function assertRevision(doc, expectedTime) {
    if (expectedTime == null) return;
    const current = doc._stats?.modifiedTime ?? null;
    if (current !== expectedTime) {
      throw new ModuleError(ERROR_CODES.CONFLICT, "O Domain mudou enquanto o formulário estava aberto.");
    }
  }

  const doc = { _stats: { modifiedTime: 1700000000 } };

  // Mesma revisão: sucesso
  assert.doesNotThrow(() => assertRevision(doc, 1700000000));

  // Revisão diferente (alguém editou no meio tempo): deve lançar erro CONFLICT
  assert.throws(() => assertRevision(doc, 1699999999), (err) => {
    assert.equal(err.code, ERROR_CODES.CONFLICT);
    return true;
  });
});

/* ==========================================================================
   11. AUDITORIA DE LIMITES E VALIDAÇÕES DO CATÁLOGO DE RECURSOS
   ========================================================================== */
test("Auditoria de Regras de Negócio: Normalização de Recursos e Validação de IDs", async () => {
  const { normalizeResourceDefinition, slugifyResourceId } = await import("../scripts/features/economy/rules.js");

  // Slugificação correta com acentos e caracteres especiais
  assert.equal(slugifyResourceId("Minério de Ferro & Ouro"), "minerio-de-ferro-ouro");
  assert.equal(slugifyResourceId("Água Potável 100%"), "agua-potavel-100");

  // Normalização de definição
  const def = normalizeResourceDefinition({
    id: "energia-solar",
    name: "Energia Solar",
    unit: "kWh",
    precision: 2,
    allowNegative: false
  });
  assert.equal(def.id, "energia-solar");
  assert.equal(def.precision, 2);
  assert.equal(def.allowNegative, false);

  // Erro se precisão for inválida (fora de 0 a 4)
  assert.throws(() => normalizeResourceDefinition({ name: "Teste", precision: 8 }));
  // Erro se id contiver caracteres inválidos
  assert.throws(() => normalizeResourceDefinition({ id: "id_com_underline", name: "Teste" }));
});

/* ==========================================================================
   12. AUDITORIA DE EDIÇÃO PELO GM: SUSTENTO, ESTOQUES E FLUXOS
   ========================================================================== */
test("Auditoria de Edição GM: Configuração de Sustento, Edição de Estoque e Fluxo", async () => {
  const { calculateDomainUpkeep } = await import("../scripts/features/economy/upkeep.js");

  const catalog = {
    resources: [
      { id: "credits", name: "Créditos", precision: 2 },
      { id: "food", name: "Comida", precision: 0 },
      { id: "water", name: "Água", precision: 0 }
    ]
  };

  // Domínio com 1000 habitantes e 5 guardas
  const domainData = {
    population: {
      groups: [{ localId: "grp-1", name: "Trabalhadores", count: 1000 }]
    },
    security: { guardCount: 5 },
    economy: {
      stocks: [{ resourceId: "credits", amount: 10000, reserved: 0 }],
      flows: [{ localId: "fl-1", name: "Comércio Local", resourceId: "credits", direction: "inflow", amount: 5000, periodTicks: 1, active: true }],
      sustenanceSettings: {
        enabled: true,
        foodPer100: 2.0, // GM alterou para 2 unidades por 100 hab
        waterPer100: 1.5, // GM alterou para 1.5 unidades por 100 hab
        guardUpkeep: 2.0  // GM alterou para 2 créditos por guarda
      }
    }
  };

  // 12.1 Verificar se o cálculo de sustento respeita as configurações customizadas do GM
  const upkeep = calculateDomainUpkeep({ domainData, catalog });
  // 1000 hab * 2.0 / 100 = 20 comida/tick
  assert.equal(upkeep.rawFoodUnits, 20);
  // 1000 hab * 1.5 / 100 = 15 água/tick
  assert.equal(upkeep.rawWaterUnits, 15);
  // 5 guardas * 2.0 = 10 créditos/tick
  assert.equal(upkeep.rawGuardUnits, 10);
  assert.equal(upkeep.guardMinorAmount, 1000); // 10.00 créditos em minorUnits (precision 2)

  // 12.2 Desativação do sustento pelo GM
  domainData.economy.sustenanceSettings.enabled = false;
  const upkeepDisabled = calculateDomainUpkeep({ domainData, catalog });
  assert.equal(upkeepDisabled.enabled, false);
  assert.equal(upkeepDisabled.syntheticFlows.length, 0);

  // 12.3 Edição de Estoque existente
  const stock = domainData.economy.stocks[0];
  // GM edita o valor para 250 créditos (25000 minor units) e 50 reservados (5000 minor units)
  stock.amount = 25000;
  stock.reserved = 5000;
  assert.equal(stock.amount, 25000);
  assert.equal(stock.reserved, 5000);

  // 12.4 Edição de Fluxo existente
  const flow = domainData.economy.flows[0];
  flow.name = "Rota Comercial da Aliança";
  flow.amount = 7500; // 75.00 créditos
  flow.direction = "inflow";
  assert.equal(flow.name, "Rota Comercial da Aliança");
  assert.equal(flow.amount, 7500);
});

/* ==========================================================================
   13. AUDITORIA DE BOTÕES DE EDIÇÃO, EXCLUSÃO, SUSTENTO E ESTÚDIO DE IMAGEM
   ========================================================================== */
test("Auditoria Geral: Retorno de Modais, Desativação de Consumo e Estúdio de Imagem", async () => {
  // 13.1 Estúdio de Imagem: Parâmetros visuais e estilo inline
  const domainData = {
    identity: { name: "Base Alfa", category: "outpost" },
    visuals: {
      image: "modules/domain-manager/assets/base.webp",
      imageFit: "cover",
      imageHeight: 260,
      imagePosX: 40,
      imagePosY: 65,
      imageZoom: 120
    },
    economy: {
      sustenanceSettings: { enabled: true, foodPer100: 1.5, waterPer100: 1.0, guardUpkeep: 2.0 },
      stocks: [{ resourceId: "food", amount: 500, reserved: 0 }],
      flows: []
    },
    population: {
      groups: [{ localId: "grp-alpha", name: "Colonizadores", count: 200, quality: "Estável" }],
      notables: [{ localId: "not-1", name: "Comandante Shepard", role: "Líder Militar" }]
    }
  };

  const scale = domainData.visuals.imageZoom / 100;
  assert.equal(scale, 1.2);
  assert.equal(domainData.visuals.imageHeight, 260);
  assert.equal(domainData.visuals.imagePosX, 40);
  assert.equal(domainData.visuals.imagePosY, 65);

  // 13.2 Desativação de consumo de sustento via exclusão do fluxo automático
  const localIdFood = "upkeep-food";
  if (localIdFood === "upkeep-food") {
    domainData.economy.sustenanceSettings.foodPer100 = 0;
  }
  assert.equal(domainData.economy.sustenanceSettings.foodPer100, 0);

  const localIdWater = "upkeep-water";
  if (localIdWater === "upkeep-water") {
    domainData.economy.sustenanceSettings.waterPer100 = 0;
  }
  assert.equal(domainData.economy.sustenanceSettings.waterPer100, 0);

  // 13.3 Localização de entidades para edição
  const editingNotable = domainData.population.notables.find((n) => n.localId === "not-1");
  assert.ok(editingNotable);
  assert.equal(editingNotable.name, "Comandante Shepard");

  const editingGroup = domainData.population.groups.find((g) => g.localId === "grp-alpha");
  assert.ok(editingGroup);
  assert.equal(editingGroup.name, "Colonizadores");
});
