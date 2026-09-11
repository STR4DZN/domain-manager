import test from "node:test";
import assert from "node:assert/strict";

class DummyField {}
class DummyDataModel {
  constructor(data = {}) { this.data = structuredClone(data); }
  validate() { this.constructor.validateJoint?.(this.data); return true; }
  toObject() { return structuredClone(this.data); }
}
globalThis.foundry = {
  abstract: { DataModel: DummyDataModel },
  data: { fields: { ArrayField: DummyField, BooleanField: DummyField, NumberField: DummyField, SchemaField: DummyField, StringField: DummyField } },
  utils: { deepClone: (value) => structuredClone(value), randomID: (() => { let i=0; return () => `RID${++i}`; })() }
};
globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0, OBSERVER: 2, OWNER: 3 } };
globalThis.Hooks = { callAll() {} };
const gm = { id: "GM", name: "GM", isGM: true, active: true };
const users = new Map([[gm.id, gm]]); users.activeGM = gm; users.contents = [gm];
const dataFolder = { id: "DATA", type: "JournalEntry", getFlag: () => true };
const folders = { get: (id) => id === "DATA" ? dataFolder : null, find: (fn) => fn(dataFolder) ? dataFolder : null };
const catalog = { version: 1, resources: [
  { id: "fuel", name: "Fuel", unit: "u", precision: 0, allowNegative: false },
  { id: "energy", name: "Energy", unit: "u", precision: 0, allowNegative: false },
  { id: "food", name: "Food", unit: "u", precision: 0, allowNegative: false },
  { id: "water", name: "Water", unit: "u", precision: 0, allowNegative: false }
] };
const documents = new Map();
globalThis.game = {
  user: gm, users, journal: [], folders, modules: new Map(),
  settings: { get(_m,key) { if (key === "dataFolderId") return "DATA"; if (key === "resourceCatalog") return structuredClone(catalog); if (key === "syncTimekeeping") return false; if (key === "secondsPerTick") return 86400; return null; }, async set(_m,_k,v){ return v; } }
};
globalThis.Folder = { async create(){ throw new Error("folder exists"); } };
globalThis.fromUuid = async (uuid) => documents.get(uuid) ?? null;
function setPath(target,path,value){ const parts=path.split('.'); let cursor=target; for(const part of parts.slice(0,-1)){ cursor[part]??={}; cursor=cursor[part]; } cursor[parts.at(-1)]=structuredClone(value); }
function doc({id,name,recordType,data}) { const d={ id, uuid:`JournalEntry.${id}`, documentName:"JournalEntry", name, ownership:{default:0}, flags:{"domain-manager":{recordType,schemaVersion:9,data:structuredClone(data)}}, getFlag(m,k){return this.flags[m]?.[k];}, testUserPermission(a){return a?.isGM===true;}, async update(changes){ for(const [k,v] of Object.entries(changes)){ if(k==="name")this.name=v; else setPath(this,k,v);} return this;} }; documents.set(d.uuid,d); return d; }
globalThis.JournalEntry = { async updateDocuments(updates){ const out=[]; for(const update of updates){ const d=[...documents.values()].find((x)=>x.id===update._id); assert.ok(d); const c={...update}; delete c._id; await d.update(c); out.push(d);} return out; } };
const { recordIndex } = await import("../scripts/data/record-index.js");
const { executeAdvanceRun } = await import("../scripts/simulation/advance-run.js");
function domainData({
  fuel=0, food=0, water=0, agreements=[], resourcePolicies=[], populationTotal=0, groups=[], sustenanceEnabled=false
}={}) { return {
  entityId:"domain:D1", description:"", management:{preset:"base",capabilities:{economy:true,structures:true,population:true}}, governance:{controllers:[]}, identity:{tags:[]},
  economy:{
    stocks:[
      {resourceId:"fuel",amount:fuel},
      {resourceId:"energy",amount:0},
      {resourceId:"food",amount:food},
      {resourceId:"water",amount:water}
    ],
    flows:[],resourcePolicies:structuredClone(resourcePolicies),
    sustenanceSettings:{enabled:sustenanceEnabled,foodPer100:1,waterPer100:1,guardUpkeep:1}
  },
  population:{total:populationTotal,countMode:"direct",groups:structuredClone(groups),notables:[]},
  security:{guardCount:0},conditions:[],relations:[],agreements,intel:[],history:[],notifications:[]
}; }
function reset({fuel=0, food=0, water=0, agreements=[], resourcePolicies=[], populationTotal=0, groups=[], sustenanceEnabled=false, withStructure=true}={}) {
  documents.clear();
  const domain=doc({id:"D1",name:"Aurelia",recordType:"domain",data:domainData({fuel,food,water,agreements,resourcePolicies,populationTotal,groups,sustenanceEnabled})});
  let structure=null;
  if(withStructure){
    structure=doc({id:"S1",name:"Reactor",recordType:"structure",data:{ entityId:"structure:S1", domain:{recordType:"domain",uuid:domain.uuid,entityId:"domain:D1"}, activeProject:null, description:"",category:"power",tier:1,maxTier:2,status:"operational",condition:100,capacity:0,maintenancePriority:50,maintenance:[{resourceId:"fuel",amount:5}],production:[{resourceId:"energy",amount:10}],tags:[] }});
  }
  game.journal=[domain,...(structure?[structure]:[])]; recordIndex.rebuild(); return {domain,structure};
}

test("advance-run persiste degradação de Structure calculada pelo kernel", async () => {
  const { structure } = reset({ fuel: 0 });
  const result = await executeAdvanceRun({ deltaTicks: 2, fromWorldTimeHook: true });
  const data = structure.getFlag("domain-manager","data");
  assert.equal(data.status,"damaged");
  assert.equal(data.condition,90);
  assert.deepEqual(result.updatedStructures,[structure.uuid]);
  assert.ok(result.report.alerts.some((a)=>a.type==="structureMaintenanceRisk" && a.occurrences===2));
});

test("advance-run persiste expiração de Agreement exatamente como o kernel", async () => {
  const agreement={localId:"A1",name:"Supply",status:"active",remainingTicks:1,transfers:[{resourceId:"fuel",direction:"receive",amountPerTick:3}]};
  const { domain } = reset({ fuel: 0, agreements:[agreement], withStructure:false });
  await executeAdvanceRun({ deltaTicks: 3, fromWorldTimeHook: true });
  const data=domain.getFlag("domain-manager","data");
  assert.equal(data.economy.stocks.find((x)=>x.resourceId==="fuel").amount,3);
  assert.equal(data.agreements[0].status,"terminated");
  assert.equal(data.agreements[0].remainingTicks,0);
});


test("fome e seca no mesmo tick contam uma única crise civil por tick", async () => {
  const group = { localId:"G1", name:"Civis", count:100, includedInTotal:true, assignment:"2", quality:"Estável" };
  const { domain } = reset({
    populationTotal:100, groups:[group], sustenanceEnabled:true, food:0, water:0, withStructure:false
  });

  const result = await executeAdvanceRun({ deltaTicks: 2, fromWorldTimeHook: true });
  const data = domain.getFlag("domain-manager","data");
  const famine = result.report.alerts.find((alert) => alert.type === "famine");
  const drought = result.report.alerts.find((alert) => alert.type === "drought");

  assert.deepEqual(famine.occurrenceTicks, [1,2]);
  assert.deepEqual(drought.occurrenceTicks, [1,2]);
  assert.equal(data.population.morale, 50, "dois ticks de crise devem reduzir moral populacional em 10");
  assert.equal(data.population.groups[0].morale, 50, "fome+seca no mesmo tick contam uma única penalidade de moral");
  assert.equal(data.population.groups[0].assignment, "2", "assignment permanece semântico e não vira contador de crise");
  assert.equal(data.population.groups[0].quality, "Estável", "quality não é degradada como efeito colateral da simulação");
  const condition = data.conditions.find((entry) => entry.localId === "cond_famine");
  assert.equal(condition.durationTicks, 3, "crise no último tick deve sair do avanço recém-refrescada");
});

test("advance(2) e dois advance(1) produzem o mesmo estado civil sob fome+seca", async () => {
  const group = { localId:"G1", name:"Civis", count:100, includedInTotal:true, assignment:"2", quality:"Estável" };
  const aggregate = reset({ populationTotal:100, groups:[group], sustenanceEnabled:true, food:0, water:0, withStructure:false });
  await executeAdvanceRun({ deltaTicks: 2, fromWorldTimeHook: true });
  const aggregateData = structuredClone(aggregate.domain.getFlag("domain-manager","data"));

  const sequential = reset({ populationTotal:100, groups:[group], sustenanceEnabled:true, food:0, water:0, withStructure:false });
  await executeAdvanceRun({ deltaTicks: 1, fromWorldTimeHook: true });
  await executeAdvanceRun({ deltaTicks: 1, fromWorldTimeHook: true });
  const sequentialData = sequential.domain.getFlag("domain-manager","data");

  assert.equal(aggregateData.population.morale, sequentialData.population.morale);
  assert.equal(aggregateData.population.groups[0].morale, sequentialData.population.groups[0].morale);
  assert.equal(aggregateData.population.groups[0].assignment, sequentialData.population.groups[0].assignment);
  assert.equal(aggregateData.population.groups[0].quality, sequentialData.population.groups[0].quality);
  assert.equal(aggregateData.conditions.find((entry) => entry.localId === "cond_famine")?.durationTicks,
    sequentialData.conditions.find((entry) => entry.localId === "cond_famine")?.durationTicks);
  for (const id of ["food","water"]) {
    assert.equal(aggregateData.economy.stocks.find((entry) => entry.resourceId === id)?.amount,
      sequentialData.economy.stocks.find((entry) => entry.resourceId === id)?.amount);
  }
});


test("Structure sem manutenção degrada deterministicamente até disabled e então para de operar", async () => {
  const { structure } = reset({ fuel:0 });
  const result = await executeAdvanceRun({ deltaTicks:25, fromWorldTimeHook:true });
  const data = structure.getFlag("domain-manager","data");
  const risk = result.report.alerts.find((alert) => alert.type === "structureMaintenanceRisk");
  assert.equal(data.condition,0);
  assert.equal(data.status,"disabled");
  assert.equal(risk.occurrences,20, "depois de disabled a Structure não deve continuar degradando");
  assert.deepEqual(risk.occurrenceTicks, Array.from({length:20}, (_, index) => index + 1));
});

test("storageCapacity clampa e persiste overflow ao longo de múltiplos ticks", async () => {
  const { domain } = reset({
    fuel:10,
    resourcePolicies:[{resourceId:"energy",criticalFloor:0,reserveTarget:0,storageCapacity:15}]
  });
  const dataBefore = domain.getFlag("domain-manager","data");
  dataBefore.economy.stocks.find((entry) => entry.resourceId === "energy").amount = 10;
  await domain.update({"flags.domain-manager.data": dataBefore});
  recordIndex.rebuild();

  const result = await executeAdvanceRun({ deltaTicks:2, fromWorldTimeHook:true });
  const data = domain.getFlag("domain-manager","data");
  const energy = data.economy.stocks.find((entry) => entry.resourceId === "energy");
  const reportEnergy = result.report.domains[0].resources.find((entry) => entry.resourceId === "energy");
  assert.equal(energy.amount,15);
  assert.equal(reportEnergy.storageOverflow,15, "5 unidades perdidas no tick 1 + 10 no tick 2");
  const overflow = result.report.alerts.find((alert) => alert.type === "storageOverflow");
  assert.equal(overflow.occurrences,2);
  assert.deepEqual(overflow.occurrenceTicks,[1,2]);
});

test("Agreement de envio sem cobertura entra em breach e o estado é persistido", async () => {
  const agreement={localId:"A2",name:"Export",status:"active",remainingTicks:10,transfers:[{resourceId:"fuel",direction:"send",amountPerTick:4}]};
  const { domain } = reset({ fuel:0, agreements:[agreement], withStructure:false });
  const result = await executeAdvanceRun({ deltaTicks:1, fromWorldTimeHook:true });
  const data=domain.getFlag("domain-manager","data");
  assert.equal(data.agreements[0].status,"breached");
  assert.equal(data.agreements[0].remainingTicks,10, "breach substitui a expiração normal do contrato");
  assert.equal(data.economy.stocks.find((entry)=>entry.resourceId==="fuel").amount,0);
  assert.ok(result.report.alerts.some((alert)=>alert.type==="shortfall" && alert.resourceId==="fuel"));
});

function externalDomain(id, entityId, fuel) {
  const data = domainData({ fuel });
  data.entityId = entityId;
  data.management.capabilities.diplomacy = true;
  return doc({ id, name: id, recordType: "domain", data });
}
function domainRefFor(d) {
  return { recordType: "domain", uuid: d.uuid, entityId: d.getFlag("domain-manager", "data").entityId };
}
function externalAgreement(a, b, { amount = 4, periodTicks = 2, carry = 0, status = "active" } = {}) {
  return doc({ id: "AGR1", name: "Fuel Corridor", recordType: "agreement", data: {
    entityId: "agreement:AGR1", description: "", parties: [domainRefFor(a), domainRefFor(b)], type: "trade_pact", status,
    startTick: null, endTick: null,
    transfers: [{ localId: "t1", resourceId: "fuel", fromDomain: domainRefFor(a), toDomain: domainRefFor(b), amount, periodTicks, carry }],
    tags: []
  }});
}

test("advance-run persiste transferência + carry de Agreement independente no mesmo batch", async () => {
  documents.clear();
  const a = externalDomain("DA", "domain:DA", 10);
  const b = externalDomain("DB", "domain:DB", 0);
  const agreement = externalAgreement(a, b, { amount: 3, periodTicks: 2 });
  game.journal = [a, b, agreement]; recordIndex.rebuild();

  const result = await executeAdvanceRun({ deltaTicks: 1, fromWorldTimeHook: true });
  const aFuel = a.getFlag("domain-manager", "data").economy.stocks.find((entry) => entry.resourceId === "fuel").amount;
  const bFuel = b.getFlag("domain-manager", "data").economy.stocks.find((entry) => entry.resourceId === "fuel").amount;
  const persistedAgreement = agreement.getFlag("domain-manager", "data");

  assert.equal(aFuel, 9);
  assert.equal(bFuel, 1);
  assert.equal(persistedAgreement.status, "active");
  assert.equal(persistedAgreement.transfers[0].carry, 1);
  assert.deepEqual(result.updatedAgreements, [agreement.uuid]);
  assert.equal(result.report.agreements[0].transfers[0].transferred, 1);
});

test("advance-run persiste breach de Agreement independente sem criar estoque no destino", async () => {
  documents.clear();
  const a = externalDomain("DA", "domain:DA", 1);
  const b = externalDomain("DB", "domain:DB", 0);
  const agreement = externalAgreement(a, b, { amount: 5, periodTicks: 1 });
  game.journal = [a, b, agreement]; recordIndex.rebuild();

  const result = await executeAdvanceRun({ deltaTicks: 1, fromWorldTimeHook: true });
  assert.equal(a.getFlag("domain-manager", "data").economy.stocks.find((entry) => entry.resourceId === "fuel").amount, 0);
  assert.equal(b.getFlag("domain-manager", "data").economy.stocks.find((entry) => entry.resourceId === "fuel").amount, 1);
  assert.equal(agreement.getFlag("domain-manager", "data").status, "breached");
  assert.ok(result.report.alerts.some((entry) => entry.type === "agreementBreach" && entry.missing === 4));
});
