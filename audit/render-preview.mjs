import fs from "node:fs";
import path from "node:path";
import Handlebars from "handlebars";

const root = path.resolve(import.meta.dirname, "..");
const template = Handlebars.compile(fs.readFileSync(path.join(root, "templates/app-shell.hbs"), "utf8"));

const nav = [
  { id: "command", label: "Comando", icon: "fa fa-grid", active: false },
  { id: "domains", label: "Domínios", icon: "fa fa-building", active: false },
  { id: "operations", label: "Operações", icon: "fa fa-route", active: false },
  { id: "system", label: "Sistema", icon: "fa fa-cog", active: false }
];
const workspaces = [
  { id: "command", label: "Gestão", code: "GES", view: "overview", icon: "fa fa-home", children: [
    { id: "overview", label: "Visão geral", icon: "fa fa-home" }, { id: "requests", label: "Solicitações", icon: "fa fa-inbox" }, { id: "conditions", label: "Condições", icon: "fa fa-triangle-exclamation" }, { id: "history", label: "Histórico", icon: "fa fa-clock" }
  ]},
  { id: "base", label: "Base", code: "BAS", view: "structures", icon: "fa fa-industry", children: [
    { id: "structures", label: "Infraestrutura", icon: "fa fa-industry" }, { id: "economy", label: "Recursos", icon: "fa fa-box" }, { id: "projects", label: "Projetos", icon: "fa fa-hammer" }
  ]},
  { id: "operations", label: "Operações", code: "OPS", view: "missions", icon: "fa fa-flag", children: [
    { id: "missions", label: "Missões", icon: "fa fa-flag" }, { id: "squads", label: "Forças", icon: "fa fa-users" }, { id: "security", label: "Defesa", icon: "fa fa-shield" }
  ]},
  { id: "civil", label: "Pessoas", code: "CIV", view: "population", icon: "fa fa-person", children: [
    { id: "population", label: "População", icon: "fa fa-chart" }, { id: "people", label: "Pessoas", icon: "fa fa-person" }
  ]},
  { id: "intel", label: "Estratégia", code: "EST", view: "intel", icon: "fa fa-eye", children: [
    { id: "intel", label: "Inteligência", icon: "fa fa-eye" }, { id: "territory", label: "Território", icon: "fa fa-map" }, { id: "diplomacy", label: "Relações", icon: "fa fa-handshake" }
  ]}
];

const domain = { uuid: "JournalEntry.DOM001", entityId: "domain:DOM001", entityIdShort: "DOM001", expectedModifiedTime: 1726000000000, name: "Colônia Aurélia", category: "Colônia orbital de pesquisa e manufatura avançada", preset: "base", presetLabel: "Base estratégica", natureLabel: "Físico", state: "Ativo", stateLabel: "Ativo", stateTone: "nominal", population: 24850, selected: true, visuals: { image: "", bannerImg: "", crestImg: "", imageFit: "cover", imagePosX: 50, imagePosY: 50, imageZoom: 100, imageHeight: 260, imagePosition: "center", themeColorHex: "#f3aa35" } };
const resources = [
  { id: "energy", name: "Energia", unit: "MW", displayAmount: "12.480", stockDisplay: "12.480", criticalFloorDisplay: "3.000", reserveTargetDisplay: "8.000", storageCapacityDisplay: "15.000", storageUtilizationDisplay: "83%", netPerTickDisplay: "+240", reserveGapDisplay: "+4.480", policyState: "nominal", tone: "nominal" },
  { id: "water", name: "Água processada", unit: "m³", displayAmount: "6.920", stockDisplay: "6.920", criticalFloorDisplay: "2.500", reserveTargetDisplay: "6.000", storageCapacityDisplay: "9.000", storageUtilizationDisplay: "77%", netPerTickDisplay: "−180", reserveGapDisplay: "+920", policyState: "warning", tone: "warning" },
  { id: "alloys", name: "Ligas industriais", unit: "t", displayAmount: "1.280", stockDisplay: "1.280", criticalFloorDisplay: "400", reserveTargetDisplay: "1.600", storageCapacityDisplay: "3.000", storageUtilizationDisplay: "43%", netPerTickDisplay: "+35", reserveGapDisplay: "−320", policyState: "warning", tone: "warning" }
];
const projects = [
  { uuid: "JournalEntry.PROJ1", entityId: "project:PROJ1", entityIdShort: "PROJ1", name: "Expansão do anel habitacional leste", description: "Ampliação modular para acomodar novos pesquisadores e equipes de manutenção.", status: "active", statusLabel: "Ativo", tone: "nominal", progressDisplay: "64%", rateDisplay: "12 / ciclo", workDisplay: "640 / 1.000", carry: 0, costCount: 3, costPlanMutable: false, canEdit: true, segments: Array.from({length: 20}, (_,i)=>({on:i<13})), costs: [
    { localId: "c1", resourceName: "Ligas industriais", modeLabel: "Reservado", unit: "t", amountDisplay: "800", consumedDisplay: "510", remainingDisplay: "290" },
    { localId: "c2", resourceName: "Componentes eletrônicos", modeLabel: "Progressivo", unit: "cx", amountDisplay: "240", consumedDisplay: "150", remainingDisplay: "90" }
  ] },
  { uuid: "JournalEntry.PROJ2", entityId: "project:PROJ2", entityIdShort: "PROJ2", name: "Rede de sensores do corredor exterior", description: "Cobertura de aproximação e alerta antecipado.", status: "blocked", statusLabel: "Bloqueado", tone: "critical", progressDisplay: "28%", rateDisplay: "6 / ciclo", workDisplay: "140 / 500", blockedReason: "Aguardando componentes de comunicação de longo alcance.", carry: 2, costCount: 2, canEdit: true, segments: Array.from({length:20},(_,i)=>({on:i<6})) }
];
const people = [
  { uuid: "JournalEntry.P1", entityId: "person:P1", name: "Dra. Helena Voss", role: "Diretora de Operações Científicas", specialization: "Sistemas de suporte ecológico e pesquisa orbital", statusLabel: "Ativa", tone: "nominal", morale: 78, moraleDisplay: "78%", condition: 92, conditionDisplay: "92%", portrait: "", notes: "Coordena as equipes civis e o programa de expansão. Responsável pela resposta operacional em incidentes ambientais.", tagLabel: "comando, ciência, ecologia", canEdit: true },
  { uuid: "JournalEntry.P2", entityId: "person:P2", name: "Comandante Rafael Moura", role: "Chefe de Segurança", specialization: "Defesa de instalações e operações extraveiculares", statusLabel: "Em serviço", tone: "nominal", morale: 66, condition: 88, portrait: "", canEdit: true },
  { uuid: "JournalEntry.P3", entityId: "person:P3", name: "Engenheira Linh Park", role: "Supervisora de Infraestrutura", specialization: "Reatores compactos e manufatura", statusLabel: "Ferida", tone: "warning", morale: 59, condition: 61, portrait: "", canEdit: true }
];
const structures = [
  { uuid: "JournalEntry.S1", entityId: "structure:S1", entityIdShort: "S1", name: "Reator Helios-4", description: "Reator primário com redundância parcial; manutenção preventiva prevista no próximo ciclo.", category: "Energia e infraestrutura crítica", status: "operational", statusLabel: "Operacional", tone: "nominal", tier: 3, maxTier: 5, conditionDisplay: "87%", capacity: 12000, workforceRequired: 42, workforceAssigned: 38, workforceCoverageDisplay: "90%", workforceTone: "warning", maintenance: [{resourceName:"Componentes",amountDisplay:"12",unit:"cx"}], production: [{resourceName:"Energia",amountDisplay:"420",unit:"MW"}], canControl: true },
  { uuid: "JournalEntry.S2", entityId: "structure:S2", entityIdShort: "S2", name: "Complexo de reciclagem hídrica", description: "Recuperação, filtragem e redistribuição para os setores habitacionais e industriais.", category: "Suporte vital", status: "damaged", statusLabel: "Danificada", tone: "warning", tier: 2, maxTier: 4, conditionDisplay: "63%", capacity: 8400, workforceRequired: 31, workforceAssigned: 24, workforceCoverageDisplay: "77%", workforceTone: "critical", maintenance: [{resourceName:"Energia",amountDisplay:"90",unit:"MW"}], production: [{resourceName:"Água",amountDisplay:"280",unit:"m³"}], canControl: true }
];
const squads = [
  { uuid:"JournalEntry.SQ1", entityId:"squad:SQ1", entityIdShort:"SQ1", name:"Vanguarda Órion", description:"Reconhecimento, contenção e resposta rápida em instalações exteriores.", status:"ready", statusLabel:"Pronta", tone:"nominal", strength:18, capacity:24, morale:76, moraleDisplay:"76%", condition:91, conditionDisplay:"91%", moraleSegments:Array.from({length:10},(_,i)=>({on:i<8})), conditionSegments:Array.from({length:10},(_,i)=>({on:i<9})), controllerLabel:"Operadora Helena", controlledByMe:true, canOperate:true, canUseSupply:true, currentMissionName:"RECUPERAR ESTAÇÃO DE ESCUTA" },
  { uuid:"JournalEntry.SQ2", entityId:"squad:SQ2", entityIdShort:"SQ2", name:"Equipe Delta-7", description:"Engenharia de campo, suporte médico e recuperação de sistemas críticos.", status:"recovering", statusLabel:"Recuperando", tone:"warning", strength:11, capacity:16, morale:58, moraleDisplay:"58%", condition:64, conditionDisplay:"64%", moraleSegments:Array.from({length:10},(_,i)=>({on:i<6})), conditionSegments:Array.from({length:10},(_,i)=>({on:i<7})), controllerLabel:"Fusion", controlledByMe:false, canOperate:true, canUseSupply:true, currentMissionName:"SEM MISSÃO" }
];
const missions = [
  { uuid:"JournalEntry.M1", entityId:"mission:M1", entityIdShort:"M1", name:"Recuperar estação de escuta", description:"Restabelecer comunicações, recuperar os registros e retirar a equipe antes da próxima janela orbital.", briefing:"Restabelecer comunicações, recuperar os registros e retirar a equipe antes da próxima janela orbital.", status:"available", statusLabel:"Disponível", tone:"nominal", audienceLabel:"Operadora Helena · Fusion", completedObjectives:1, failedObjectives:0, objectiveCount:3, assignmentCount:1, committedStrength:12, canEdit:true, canPublish:false, canLaunch:true, canResolve:false, isAvailable:true, objectives:[{localId:"o1",title:"Acessar o núcleo de comunicações",status:"completed"},{localId:"o2",title:"Recuperar os registros",status:"pending"},{localId:"o3",title:"Extrair a equipe técnica",status:"pending"}], assignments:[{localId:"a1",squadUuid:"JournalEntry.SQ1",squadName:"Vanguarda Órion",stateLabel:"Preparada",committedStrength:12,canRelease:true,resources:[{name:"Munição",amountDisplay:"40",unit:"cx"},{name:"Suprimentos médicos",amountDisplay:"6",unit:"kits"}]}], eligibleSquads:[{...squads[0],isPrepared:true,prepareLabel:"RECONFIGURAR"},{...squads[1],isPrepared:false,prepareLabel:"PREPARAR"}] },
  { uuid:"JournalEntry.M2", entityId:"mission:M2", entityIdShort:"M2", name:"Mapear corredor exterior", description:"Consolidar rotas seguras para o próximo comboio logístico.", briefing:"Consolidar rotas seguras para o próximo comboio logístico.", status:"planned", statusLabel:"Planejada", tone:"warning", audienceLabel:"GM", completedObjectives:0, failedObjectives:0, objectiveCount:2, assignmentCount:0, committedStrength:0, canEdit:true, canPublish:true, canLaunch:false, canResolve:false, isAvailable:false, objectives:[{localId:"p1",title:"Validar três rotas",status:"pending"},{localId:"p2",title:"Registrar riscos",status:"pending"}], assignments:[], eligibleSquads:[] }
];
const relations = [{ localId:"rel-tarsis", targetName:"Consórcio do Cinturão de Tarsis", targetEntityId:"domain:DOM2", postureLabel:"Parceiro comercial", tone:"nominal", score:42, scoreDisplay:"+42", trust:74, trustDisplay:"74%", trustTone:"nominal", trustSegments:Array.from({length:10},(_,i)=>({on:i<7})), tension:18, tensionDisplay:"18%", tensionTone:"nominal", tensionSegments:Array.from({length:10},(_,i)=>({on:i<2})) }];
const agreements = [{ uuid:"JournalEntry.AGR1", entityId:"agreement:AGR1", entityIdShort:"AGR1", expectedModifiedTime:1726000000100, name:"Corredor de abastecimento Tarsis", description:"Transferência regular de ligas para manutenção do anel habitacional.", typeLabel:"Pacto comercial", statusLabel:"Ativo", tone:"nominal", isTerminated:false, partyLabel:"Colônia Aurélia ↔ Consórcio Tarsis", timingLabel:"120 → 180", transferCount:1, transfers:[{resourceName:"Ligas industriais",fromName:"Tarsis",toName:"Aurélia",amountDisplay:"80",unit:"t",periodTicks:4}] }];
const intel = [{ localId:"intel-reactor", title:"Vulnerabilidade no reator externo", categoryLabel:"Segredo confidencial", credibilityLabel:"Provável", visibilityLabel:"Apenas o Mestre", targetName:"Consórcio Tarsis", targetEntityId:"domain:DOM2", sourceLabel:"Equipe de reconhecimento", tagLabel:"reator · infraestrutura", content:"A refrigeração externa fica exposta durante a janela de manutenção.", visibility:"gm_only", revealed:false, tone:"neutral", selected:true }];
const conditions = [
  {localId:"cond-water",name:"Racionamento hídrico",label:"Racionamento hídrico",description:"Reservas abaixo do objetivo operacional para o próximo ciclo.",severity:"moderate",severityLabel:"Moderada",category:"logistical",categoryLabel:"Logística",durationTicks:4,durationLabel:"4 tick(s)",active:true,stateLabel:"Ativa",tone:"warning"},
  {localId:"cond-maint",name:"Déficit de manutenção",label:"Déficit de manutenção",description:"Uma estrutura crítica opera abaixo do efetivo necessário.",severity:"severe",severityLabel:"Grave",category:"economic",categoryLabel:"Econômica",durationTicks:null,durationLabel:"Indefinida",active:true,stateLabel:"Ativa",tone:"critical"},
  {localId:"cond-dust",name:"Nuvem de detritos dissipada",label:"Nuvem de detritos dissipada",description:"Registro histórico mantido para referência operacional.",severity:"minor",severityLabel:"Leve",category:"environmental",categoryLabel:"Ambiental",durationTicks:null,durationLabel:"Indefinida",active:false,stateLabel:"Inativa",tone:"neutral"}
];
const requests = [
  {uuid:"JournalEntry.REQ1",entityId:"request:REQ1",name:"Reconhecimento do corredor norte",type:"mission",typeLabel:"Missão",status:"needs-changes",statusLabel:"Requer ajustes",tone:"warning",requesterName:"Operadora Helena",requesterUserUuid:"User.U2",intent:"Mapear uma rota segura para o próximo comboio logístico.",details:"Evitar confronto e priorizar a recuperação dos sensores.",decisionSummary:"Inclua uma rota de retirada e o limite de risco aceitável.",handling:"none",handlingLabel:"Sem encaminhamento",resultUuid:null,modifiedTime:1726000000300,canWithdraw:true,canRevise:true,canReview:false,canMaterializeMission:false,canFulfill:false,selected:true,history:[{kindLabel:"Requer ajustes",summary:"Inclua uma rota de retirada e o limite de risco aceitável.",userName:"Fusion"},{kindLabel:"Enviada",summary:"Solicitação enviada ao Mestre.",userName:"Operadora Helena"}]},
  {uuid:"JournalEntry.REQ2",entityId:"request:REQ2",name:"Reposição de ligas estruturais",type:"purchase",typeLabel:"Aquisição",status:"approved",statusLabel:"Aprovada",tone:"nominal",requesterName:"Operadora Helena",requesterUserUuid:"User.U2",intent:"Repor o estoque reservado à expansão habitacional.",details:"Prioridade média.",decisionSummary:"Aquisição aprovada para atendimento imediato.",handling:"immediate",handlingLabel:"Ação imediata",resultUuid:null,modifiedTime:1726000000400,canWithdraw:false,canRevise:false,canReview:true,canMaterializeMission:false,canFulfill:true,selected:false,history:[]}
];

function contextFor(viewName) {
  const workspace = workspaces.find(w => w.children.some(c => c.id === viewName))?.id ?? viewName;
  const clonedWorkspaces = structuredClone(workspaces).map(w => ({...w, childCount:w.children.length, active:w.id===workspace, children:w.children.map(c=>({...c,active:c.id===viewName}))}));
  const selectedPerson = people[0];
  const selectedProject = projects[0];
  return {
    appVersion: "0.1.0-dev.150", schemaVersion: 9, isGM: true, authorityReady: true,
    activeView: viewName, activeWorkspace: workspace, view: { [viewName]: true }, inspectorOpen: false,
    globalNav: nav.map(n => ({...n, active:n.id===viewName})), workspaceNav: clonedWorkspaces,
    selectedDomain: domain, hasSelectedDomain: true, domains: [domain, {...domain,uuid:"JournalEntry.DOM2",name:"Consórcio do Cinturão de Tarsis",category:"Organização logística interplanetária",entityId:"domain:DOM2",entityIdShort:"DOM2",population:7300,selected:false}], domainCount: 2,
    system: { authority:"ONLINE", authorityTone:"nominal", primary:"MESTRE PRINCIPAL", activeGM:"Fusion", timeProvider:"Calendário do Mundo" },
    telemetry: { population:"24.850", operationalStructures:7, activeMissions:2, conditions:2, activeProjects:3, readySquads:4, resourceKinds:8, intel:12, activeFlows:9 },
    globalCounts: { domains:2, projects:4, missions:3, squads:5, structures:9 },
    allMissions:[{name:"Recuperar estação de escuta",statusLabel:"Em preparação",tone:"warning",entityId:"mission:M1"},{name:"Escolta do comboio Meridian",statusLabel:"Ativa",tone:"nominal",entityId:"mission:M2"}],
    allSquads:[{name:"Vanguarda Órion",statusLabel:"Pronta",tone:"nominal",entityId:"squad:S1"},{name:"Equipe Delta-7",statusLabel:"Recuperando",tone:"warning",entityId:"squad:S2"}],
    allProjects:projects, allStructures:structures,
    resources, projects, selectedProject, people, selectedPerson, structures,
    conditions, activeConditions:conditions.filter(condition=>condition.active), conditionStats:{total:3,active:2,severe:1,finite:1,indefinite:1}, canManageConditions:true,
    controllers:["Fusion","Operadora Helena"],
    missions, squads, requests, selectedRequest:requests[0], canCreateRequest:true, history:[], relations, agreements, intel, selectedIntel:intel[0], intelStats:{visible:1,confirmed:0,restricted:1,revealed:0},
    requestTypeOptions:[{value:"mission",label:"Missão"},{value:"custom",label:"Personalizada"},{value:"purchase",label:"Aquisição"}], requestReviewStatusOptions:[{value:"under-review",label:"Em revisão",selected:true},{value:"needs-changes",label:"Requer ajustes"},{value:"approved",label:"Aprovada"},{value:"rejected",label:"Rejeitada"}], requestHandlingOptions:[{value:"none",label:"Sem encaminhamento",selected:true},{value:"immediate",label:"Ação imediata"},{value:"mission",label:"Missão"}],
    conditionSeverityOptions:[{value:"minor",label:"Leve"},{value:"moderate",label:"Moderada",selected:true},{value:"severe",label:"Grave"}], conditionCategoryOptions:[{value:"environmental",label:"Ambiental"},{value:"logistical",label:"Logística",selected:true},{value:"economic",label:"Econômica"}],
    canManageProjects:true, canManagePeople:true, canManagePopulation:true, canManageDiplomacy:true, canManageIntel:true, canRegisterStructure:true, canBeginStructureConstruction:true, canCreateMission:true, canCreateSquad:true,
    structureStats:{total:2,operational:1,damaged:1,disabled:0,planned:0},
    populationSummary:{total:"24.850",morale:71,moraleBand:"Estável",groupCount:5,workforceEligible:6400,workforceAssigned:5980,workforceAvailable:420,countMode:"Direto"},
    defense:{defenseLevel:3,defenseRating:72,effectiveDefense:64,guardCount:480,fortifications:[],scarcityRisk:"Moderado",scarcityTone:"warning",unrestRisk:"Baixo",unrestTone:"nominal"}
  };
}

const views = ["command","domains","domain-editor","domain-delete-blocked","domain-delete-ready","overview","requests","request-create","request-review","request-revision","conditions","condition-editor","condition-remove","missions","mission-editor","mission-release","mission-launch","mission-resolve","squads","squad-editor","squad-supply","structures","structure-editor","projects","project-editor","project-cost-remove","population","population-group-remove","people","diplomacy","relation-remove","agreement-terminate","intel","intel-remove","intel-reveal"];
const rendered = Object.fromEntries(views.map(view => {
  const baseView = ["domain-editor","domain-delete-blocked","domain-delete-ready"].includes(view)
    ? "domains"
    : ["request-create","request-review","request-revision"].includes(view) ? "requests"
      : ["condition-editor","condition-remove"].includes(view) ? "conditions"
      : ["project-editor","project-cost-remove"].includes(view) ? "projects"
      : ["mission-editor","mission-release","mission-launch","mission-resolve"].includes(view) ? "missions"
        : ["squad-editor","squad-supply"].includes(view) ? "squads"
          : view === "structure-editor" ? "structures"
            : view === "population-group-remove" ? "population"
              : ["relation-remove","agreement-terminate"].includes(view) ? "diplomacy"
                : ["intel-remove","intel-reveal"].includes(view) ? "intel" : view;
  const context = contextFor(baseView);
  if (view === "domain-editor") {
    context.isCreateDomainOpen = true;
    context.isDomainBusy = false;
    context.domainEditor = {
      isEdit: true,
      expectedModifiedTime: 1726000000000,
      name: domain.name,
      category: domain.category,
      natureOptions: [{value:"physical",label:"Físico",selected:true},{value:"abstract",label:"Abstrato",selected:false}],
      stateOptions: [{value:"active",label:"Ativo",selected:true},{value:"inactive",label:"Inativo",selected:false},{value:"archived",label:"Arquivado",selected:false}],
      presetOptions: [{value:"base",label:"Base estratégica",selected:true},{value:"settlement",label:"Assentamento",selected:false},{value:"organization",label:"Organização",selected:false},{value:"custom",label:"Personalizado",selected:false}],
      tagsValue: "orbital, pesquisa, manufatura",
      locatedInOptions: [{uuid:"JournalEntry.DOM2",name:"Consórcio do Cinturão de Tarsis",selected:false}],
      administrativeParentOptions: [{uuid:"JournalEntry.DOM2",name:"Consórcio do Cinturão de Tarsis",selected:false}],
      description: "Colônia orbital dedicada a pesquisa aplicada, manufatura avançada e suporte às operações do cinturão.",
      controllerOptions: [{id:"U2",name:"Operadora Helena",active:true,selected:true},{id:"U3",name:"Observador Tarsis",active:false,selected:false}],
      capabilityOptions: ["projects","requests","structures","missions","squads","people","population","economy","security","territory","diplomacy","intel"].map((value, index) => ({value,label:value[0].toUpperCase()+value.slice(1),checked:index < 9}))
    };
  }
  if (view === "domain-delete-blocked" || view === "domain-delete-ready") {
    const blocked = view === "domain-delete-blocked";
    context.isDomainDeleteOpen = true;
    context.isDomainBusy = false;
    context.domainDeleteReport = {
      domain: { ...domain, expectedModifiedTime: 1726000000000 },
      blocked,
      total: blocked ? 5 : 0,
      groups: blocked ? [
        { key: "hierarchy", label: "Hierarquia", view: "domains", count: 1, items: [{ name: "Entreposto Meridian", entityId: "domain:DOM3", detail: "Localizado neste domínio" }] },
        { key: "projects", label: "Projetos", view: "projects", count: 2, items: [{ name: "Expansão do anel habitacional leste", entityId: "project:PROJ1", detail: "Projeto deste domínio" }, { name: "Rede de sensores do corredor exterior", entityId: "project:PROJ2", detail: "Projeto deste domínio" }] },
        { key: "structures", label: "Estruturas", view: "structures", count: 2, items: [{ name: "Reator Helios-4", entityId: "structure:S1", detail: "Estrutura deste domínio" }, { name: "Complexo de reciclagem hídrica", entityId: "structure:S2", detail: "Estrutura deste domínio" }] }
      ] : []
    };
  }
  if (view === "project-cost-remove") {
    context.pendingProjectCostRemoval = {
      ...projects[0].costs[0],
      modeLabel: "RESERVADO"
    };
  }
  if (view === "request-create") context.isRequestCreateOpen = true;
  if (view === "request-review") {
    context.isRequestReviewOpen = true;
    context.reviewingRequest = {...requests[1],status:"under-review",statusLabel:"Em revisão",handling:"none",handlingLabel:"Sem encaminhamento"};
  }
  if (view === "request-revision") {
    context.isRequestRevisionOpen = true;
    context.revisingRequest = requests[0];
    context.requestRevisionTypeOptions = context.requestTypeOptions.map(option=>({...option,selected:option.value===requests[0].type}));
  }
  if (view === "condition-editor") {
    context.isConditionEditorOpen = true;
    context.editingCondition = conditions[0];
  }
  if (view === "condition-remove") context.pendingConditionRemoval = conditions[1];
  if (view === "mission-editor") {
    context.isCreateMissionOpen = true;
    context.editingMission = { ...missions[0], expectedModifiedTime:1726000000000, objectiveLines:"Acessar o núcleo de comunicações\nRecuperar os registros\nExtrair a equipe técnica", outcomeSummary:"" };
    context.missionAudienceOptions = [{id:"U2",name:"Operadora Helena",active:true,checked:true},{id:"U3",name:"Observador Tarsis",active:false,checked:false}];
  }
  if (view === "mission-release") context.pendingMissionRelease = { missionName:missions[0].name, squadName:squads[0].name, committedStrength:12 };
  if (view === "mission-launch") context.pendingMissionLaunch = { missionName:missions[0].name, assignmentCount:1, committedStrength:12, resources:[{name:"Munição",amountDisplay:"40",unit:"cx"},{name:"Suprimentos médicos",amountDisplay:"6",unit:"kits"}] };
  if (view === "mission-resolve") context.resolvingMission = { ...missions[0], status:"active", statusLabel:"Ativa", assignments:missions[0].assignments, expectedModifiedTime:1726000000000 };
  if (view === "squad-editor") {
    context.editingSquad = { ...squads[0], expectedModifiedTime:1726000000000 };
    context.squadStatusOptions = ["forming","ready","deployed","recovering","inactive","disbanded"].map(value=>({value,label:value,selected:value==="ready"}));
    context.controllerOptions = [{id:"U2",name:"Operadora Helena",active:true,checked:true},{id:"U3",name:"Observador Tarsis",active:false,checked:false}];
  }
  if (view === "squad-supply") {
    context.supplySquad = { ...squads[0], expectedModifiedTime:1726000000000, resourceKinds:2 };
    context.supplyDomainExpectedModifiedTime = 1726000000000;
    context.supplyResourceOptions = resources.map(resource=>({id:resource.id,name:resource.name,unit:resource.unit,domainDisplay:resource.stockDisplay,squadDisplay:resource.id==="energy"?"240":"80"}));
  }
  if (view === "project-editor") {
    context.projectEditorOpen = true;
    context.editingProject = { ...projects[0], required: 1000, completed: 640, rateAmount: 12, periodTicks: 1, expectedModifiedTime: 1726000000000 };
    context.projectStatusOptions = ["active","paused","blocked","cancelled"].map(value => ({ value, label: {active:"Ativo",paused:"Pausado",blocked:"Bloqueado",cancelled:"Cancelado"}[value], selected: value === "active" }));
  }
  if (view === "structure-editor") {
    context.editingStructure = { ...structures[0], rawCategory: "power", condition: 87, maintenancePriority: 82, tags: ["critical", "reactor"], expectedModifiedTime: 1726000000000 };
    context.structureStatusOptions = ["planned","operational","damaged","disabled","destroyed","decommissioned"].map(value => ({ value, label: value, selected: value === "operational" }));
    context.structureOperatorStatusOptions = [];
    context.structureResourceOptions = resources.map(resource => ({ id: resource.id, name: resource.name, unit: resource.unit, maintenanceValue: "", productionValue: "" }));
  }
  if (view === "population-group-remove") context.pendingPopulationGroupRemoval = { name:"Equipe de manutenção exterior", count:184, workforceEligible:126 };
  if (view === "relation-remove") context.pendingRelationRemoval = { targetName:"Consórcio do Cinturão de Tarsis", postureLabel:"Parceiro comercial" };
  if (view === "agreement-terminate") context.pendingAgreementStatus = { name:agreements[0].name, fromLabel:"Ativo", toLabel:"Encerrado" };
  if (view === "intel-remove") context.pendingIntelAction = { isRemove:true, title:intel[0].title, visibilityLabel:intel[0].visibilityLabel };
  if (view === "intel-reveal") context.pendingIntelAction = { isReveal:true, title:intel[0].title, visibilityLabel:intel[0].visibilityLabel };
  return [view, template(context)];
}));
const body = JSON.stringify(rendered).replaceAll("</script", "<\\/script");
const html = `<!doctype html><html><head><meta charset="utf-8"><title>Domain Manager — visual audit</title><link rel="stylesheet" href="../styles/shell.css?audit=${Date.now()}"><style>
html,body{margin:0;background:#191d20;color:#eee;font-family:Segoe UI,Arial,sans-serif;min-height:100%;overflow:auto}.audit-controls{position:sticky;top:0;z-index:9999;min-height:48px;padding:6px 10px;box-sizing:border-box;background:#222a2f;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:8px;border-bottom:1px solid #45525a}.audit-controls button{background:#303b42;color:#e8ecee;border:1px solid #53636c;border-radius:6px;padding:7px 10px;cursor:pointer}.audit-controls button.active{background:#aa7322;border-color:#e7a13b}.audit-frame{margin:16px auto;width:1000px!important;max-width:calc(100vw - 16px)!important;height:552px;border:1px solid #64727a;border-radius:12px;overflow:hidden;box-shadow:0 20px 70px #0008;flex:none}.window-header{height:36px;background:#080b0d;display:flex;align-items:center;padding:0 10px;color:#9ca6aa;font-size:13px}.window-content{height:calc(100% - 36px);container-type:inline-size;container-name:dm-window}.dm-os{height:100%}
</style></head><body><div class="audit-controls"><span>Vista:</span>${views.map(v=>`<button data-view="${v}">${v}</button>`).join("")}<span>Largura:</span><button data-width="1280">1280</button><button data-width="1000">1000</button><button data-width="760">760</button><button data-width="520">520</button></div><div class="audit-frame domain-manager-app-window"><div class="window-header">Domínios // Domain Manager — auditoria visual</div><div class="window-content" id="mount"></div></div><script>const rendered=${body};const mount=document.querySelector('#mount');const frame=document.querySelector('.audit-frame');function show(v){mount.innerHTML=rendered[v];document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===v));}document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>show(b.dataset.view));document.querySelectorAll('[data-width]').forEach(b=>b.onclick=()=>{frame.style.setProperty('width',b.dataset.width+'px','important');document.querySelectorAll('[data-width]').forEach(x=>x.classList.toggle('active',x===b));});show('overview');document.querySelector('[data-width="1000"]').classList.add('active');</script></body></html>`;
fs.mkdirSync(path.join(root,"audit"),{recursive:true});
fs.writeFileSync(path.join(root,"audit","preview.html"),html,"utf8");
console.log(path.join(root,"audit","preview.html"));
