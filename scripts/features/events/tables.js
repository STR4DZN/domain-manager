/**
 * Bloco 15 — Catálogo de Eventos de Domínio Padrão (Tabelas de Reino).
 */

import { EVENT_CATEGORIES, EVENT_SEVERITIES } from "./constants.js";

export const REALM_EVENT_TABLES = [
  // --- ECONÔMICOS ---
  {
    id: "colheita_abundante",
    title: "Colheita Abundante",
    category: EVENT_CATEGORIES.ECONOMY,
    severity: EVENT_SEVERITIES.BOON,
    description: "O clima favorável e o trabalho árduo dos lavradores resultaram em uma safra extraordinária. Os celeiros e armazéns estão repletos.",
    outcomes: [
      {
        id: "vender_excedente",
        label: "Armazenar e Vender Excedente",
        description: "Adiciona estoque de provisões ou riquezas à tesouraria e registra uma celebração na crônica.",
        stockBonus: { amount: 100 },
        condition: null,
        chronicleTitle: "Ano de Colheita Abundante"
      }
    ]
  },
  {
    id: "caravana_estrangeira",
    title: "Caravana de Mercadores Estrangeiros",
    category: EVENT_CATEGORIES.ECONOMY,
    severity: EVENT_SEVERITIES.BOON,
    description: "Mercadores de terras distantes montaram acampamento nos arredores, trazendo mercadorias raras e movimentando o comércio local.",
    outcomes: [
      {
        id: "taxar_comercio",
        label: "Cobrar Tarifas Alfandegárias e Incentivar Feira",
        description: "Gera renda imediata para a tesouraria e estabelece a condição 'Feira Comercial Ativa' por 14 ticks.",
        stockBonus: { amount: 150 },
        condition: {
          name: "Feira Comercial Ativa",
          description: "Comércio aquecido gerando prosperidade temporária.",
          durationTicks: 14,
          effects: { economicModifier: 10 }
        },
        chronicleTitle: "Passagem da Grande Caravana"
      }
    ]
  },
  {
    id: "bloqueio_comercial",
    title: "Bloqueio ou Rota Interrompida",
    category: EVENT_CATEGORIES.ECONOMY,
    severity: EVENT_SEVERITIES.CRISIS,
    description: "Deslizamentos, ataques nas estradas ou disputas tributárias interromperam as principais rotas de suprimento do domínio.",
    outcomes: [
      {
        id: "impor_racionamento",
        label: "Impor Racionamento e Proteger Rotas",
        description: "Aplica a condição 'Rotas Bloqueadas' por 10 ticks reduzindo fluxos.",
        stockBonus: null,
        condition: {
          name: "Rotas Bloqueadas",
          description: "Dificuldade de trânsito e encarecimento de suprimentos.",
          durationTicks: 10,
          effects: { economicModifier: -15 }
        },
        chronicleTitle: "Crise nas Rotas Comerciais"
      }
    ]
  },

  // --- SOCIAIS & POLÍTICOS ---
  {
    id: "revolta_popular",
    title: "Agitação e Protesto Popular",
    category: EVENT_CATEGORIES.SOCIAL,
    severity: EVENT_SEVERITIES.CRISIS,
    description: "O descontentamento com impostos, escassez ou decisões recentes levou artesãos e camponeses a protestarem nas praças.",
    outcomes: [
      {
        id: "negociar_concessoes",
        label: "Negociar Concessões e Ouvir Líderes",
        description: "Acalma a população e adiciona a condição 'Negociações Cívicas' por 7 ticks.",
        stockBonus: null,
        condition: {
          name: "Negociações Cívicas",
          description: "População atenta às promessas dos governantes.",
          durationTicks: 7,
          effects: { unrestModifier: -10 }
        },
        chronicleTitle: "Protestos e Acordo Popular"
      }
    ]
  },
  {
    id: "onda_refugiados",
    title: "Chegada de Refugiados e Trabalhadores",
    category: EVENT_CATEGORIES.SOCIAL,
    severity: EVENT_SEVERITIES.NEUTRAL,
    description: "Famílias fugindo de guerras vizinhas buscam asilo e trabalho dentro dos limites do seu domínio.",
    outcomes: [
      {
        id: "acolher_integrar",
        label: "Acolher e Integrar à Mão de Obra",
        description: "Aumenta a força de trabalho mas pressiona estoques imediatos.",
        stockBonus: null,
        condition: {
          name: "Assentamento de Refugiados",
          description: "Mão de obra extra sendo treinada e integrada.",
          durationTicks: 20,
          effects: { workModifier: 15 }
        },
        chronicleTitle: "Acolhimento de Refugiados"
      }
    ]
  },
  {
    id: "festival_tradicional",
    title: "Festival da Fundação e Tradição",
    category: EVENT_CATEGORIES.SOCIAL,
    severity: EVENT_SEVERITIES.BOON,
    description: "Uma data comemorativa une os habitantes em danças, torneios e banquetes públicos, fortalecendo os laços comunitários.",
    outcomes: [
      {
        id: "financiar_banquete",
        label: "Financiar o Banquete Real",
        description: "Reduz o descontentamento geral e cria a condição 'Espírito Festivo' por 10 ticks.",
        stockBonus: null,
        condition: {
          name: "Espírito Festivo",
          description: "Moral elevado e lealdade fortalecida.",
          durationTicks: 10,
          effects: { unrestModifier: -20 }
        },
        chronicleTitle: "Grande Festival Anual"
      }
    ]
  },

  // --- MILITARES & SEGURANÇA ---
  {
    id: "incursao_bandidos",
    title: "Incursão de Bandidos ou Saqueadores",
    category: EVENT_CATEGORIES.MILITARY,
    severity: EVENT_SEVERITIES.CRISIS,
    description: "Bandos armados foram avistados atacando vilarejos periféricos e saqueando depósitos isolados.",
    outcomes: [
      {
        id: "mobilizar_guarnicao",
        label: "Mobilizar Guarnição e Patrulhas",
        description: "Aplica a condição 'Estado de Alerta' por 15 ticks para proteger as fronteiras.",
        stockBonus: null,
        condition: {
          name: "Estado de Alerta",
          description: "Patrulhas constantes garantindo a segurança das fronteiras.",
          durationTicks: 15,
          effects: { securityModifier: 20 }
        },
        chronicleTitle: "Defesa Contra Saqueadores"
      }
    ]
  },
  {
    id: "voluntarios_armas",
    title: "Convocação de Voluntários e Guardas",
    category: EVENT_CATEGORIES.MILITARY,
    severity: EVENT_SEVERITIES.BOON,
    description: "Jovens e veteranos locais se apresentam voluntariamente para reforçar as defesas do reino.",
    outcomes: [
      {
        id: "treinar_recrutas",
        label: "Treinar e Equipar a Nova Guarda",
        description: "Aumenta a prontidão militar do domínio.",
        stockBonus: null,
        condition: {
          name: "Defensores Motivados",
          description: "Tropas com moral elevado e prontidão ampliada.",
          durationTicks: 30,
          effects: { securityModifier: 15 }
        },
        chronicleTitle: "Alistamento Voluntário"
      }
    ]
  },

  // --- NATURAIS & CLIMA ---
  {
    id: "inverno_rigoroso",
    title: "Frente Fria / Inverno Rigoroso",
    category: EVENT_CATEGORIES.NATURE,
    severity: EVENT_SEVERITIES.CRISIS,
    description: "Nevascas e geadas repentinas congelam pastos, rios e dificultam o transporte de suprimentos essenciais.",
    outcomes: [
      {
        id: "aquecimento_emergencial",
        label: "Distribuir Lenha e Manter Abrigos Aquecidos",
        description: "Aplica a condição 'Inverno Rigoroso' por 20 ticks aumentando consumo de recursos.",
        stockBonus: null,
        condition: {
          name: "Inverno Rigoroso",
          description: "Frio intenso congelando plantações e dificultando obras.",
          durationTicks: 20,
          effects: { economicModifier: -10, workModifier: -15 }
        },
        chronicleTitle: "Inverno Extremo e Nevasca"
      }
    ]
  },
  {
    id: "descoberta_mineral",
    title: "Descoberta de Veio de Minério ou Pedreira",
    category: EVENT_CATEGORIES.NATURE,
    severity: EVENT_SEVERITIES.BOON,
    description: "Trabalhadores encontraram um rico veio subterrâneo de pedras ou metais de alta qualidade.",
    outcomes: [
      {
        id: "abrir_extracao",
        label: "Iniciar Extração Imediata",
        description: "Adiciona recursos e aplica 'Nova Jazida Mineral' por 40 ticks.",
        stockBonus: { amount: 200 },
        condition: {
          name: "Nova Jazida Mineral",
          description: "Abundância de materiais brutos para construções e forjas.",
          durationTicks: 40,
          effects: { workModifier: 20 }
        },
        chronicleTitle: "Descoberta da Nova Jazida"
      }
    ]
  }
];

/**
 * Retorna todos os eventos disponíveis.
 * @returns {Array}
 */
export function listRealmEvents() {
  return REALM_EVENT_TABLES;
}

/**
 * Busca um evento pelo ID.
 * @param {string} id
 * @returns {Object|null}
 */
export function getRealmEventById(id) {
  return REALM_EVENT_TABLES.find((e) => e.id === id) ?? null;
}
