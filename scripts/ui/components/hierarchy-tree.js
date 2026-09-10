/**
 * HierarchyTreeController — Gerenciador da Árvore Hierárquica e Filtros de Domínios
 * Suporta auto-cura de ciclos, cálculo de nós descendentes, agrupamento por tags,
 * controle de visibilidade (GM vs Controllers/Observers) e dicionário PT-BR completo.
 */

import { RECORD_TYPES } from "../../core/constants.js";
import { recordIndex } from "../../data/record-index.js";
import { decodeRecord } from "../../models/record-codec.js";

export const LABELS_PTBR = Object.freeze({
  categories: {
    settlement: "Assentamento",
    territory: "Território",
    outpost: "Posto Avançado",
    planet: "Planeta",
    galaxy: "Galáxia",
    system: "Sistema Estelar",
    fleet: "Frota",
    base: "Base Operacional",
    city: "Cidade",
    fortress: "Fortaleza",
    kingdom: "Reino",
    province: "Província",
    station: "Estação Espacial",
    infraestrutura: "Infraestrutura",
    comércio: "Comércio",
    mineração: "Mineração",
    militar: "Militar",
    defesa: "Defesa",
    pesquisa: "Pesquisa & Ciência",
    monumento: "Monumento",
    social: "Social & Cultural"
  },
  natures: {
    physical: "Físico / Territorial",
    organization: "Organização / Guilda",
    hybrid: "Híbrido",
    abstract: "Esfera Abstrata"
  },
  states: {
    active: "Ativo",
    inactive: "Inativo",
    lost: "Perdido",
    destroyed: "Destruído",
    archived: "Arquivado"
  },
  projectStatuses: {
    planned: "Planejado",
    active: "Em Construção",
    paused: "Pausado",
    blocked: "Bloqueado",
    completed: "Concluído",
    cancelled: "Cancelado"
  },
  directions: {
    inflow: "Entrada",
    outflow: "Saída"
  },
  postures: {
    allied: "Aliança",
    friendly: "Amigável",
    neutral: "Neutro",
    tense: "Tenso",
    hostile: "Hostil",
    at_war: "Em Guerra"
  },
  intelCategories: {
    secret: "Segredo Confidencial",
    rumor: "Boato / Rumor",
    fact: "Fato Comprovado",
    clue: "Pista de Investigação",
    lore: "História / Tradição"
  },
  intelCredibility: {
    confirmed: "Confirmada",
    likely: "Provável",
    doubtful: "Duvidosa",
    false: "Falsa / Boato"
  },
  intelVisibility: {
    gm_only: "Apenas o Mestre",
    all_controllers: "Controladores",
    public: "Público"
  },
  peopleStatuses: {
    active: "Ativo",
    away: "Ausente",
    unavailable: "Indisponível",
    missing: "Desaparecido",
    dead: "Falecido",
    retired: "Aposentado"
  }
});

export function isImageSource(src) {
  if (!src || typeof src !== "string") return false;
  const trimmed = src.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("//")) return true;
  if (trimmed.startsWith("data:image/")) return true;
  if (/\.(png|jpe?g|webp|gif|svg|avif|bmp)(\?.*)?$/i.test(trimmed)) return true;
  if (trimmed.includes("/") || trimmed.includes("\\")) return true;
  return false;
}

export function listVisibleDomainRecords(user) {
  const documents = recordIndex.list(RECORD_TYPES.DOMAIN);
  return documents
    .map(decodeRecord)
    .filter((record) => {
      if (!record?.data) return false;
      if (user?.isGM) return true;
      const controllers = record.data.governance?.controllers ?? [];
      const observers = record.data.governance?.observers ?? [];
      return controllers.includes(user?.id) || observers.includes(user?.id);
    });
}

export function getVisibleDomainRecord(uuid, user) {
  const doc = recordIndex.get(RECORD_TYPES.DOMAIN, uuid);
  if (!doc) return null;
  const record = decodeRecord(doc);
  if (!record?.data) return null;
  if (user?.isGM) return record;
  const controllers = record.data.governance?.controllers ?? [];
  const observers = record.data.governance?.observers ?? [];
  return (controllers.includes(user?.id) || observers.includes(user?.id)) ? record : null;
}

export function buildDomainTreeNodes(domains, parentUuid = null, currentSelectedUuid = null, visited = new Set()) {
  const nodes = [];
  const children = domains.filter((d) => {
    let p = d.data.hierarchy?.locatedInUuid || d.data.hierarchy?.administrativeParentUuid || null;
    if (p === d.document.uuid) p = null; // Auto-curar ciclo onde a base é seu próprio pai
    return p === parentUuid;
  });

  for (const child of children) {
    if (visited.has(child.document.uuid)) continue;
    visited.add(child.document.uuid);
    const subChildren = buildDomainTreeNodes(domains, child.document.uuid, currentSelectedUuid, new Set(visited));
    const totalDescendants = subChildren.reduce((acc, sub) => acc + 1 + (sub.descendantCount || 0), 0);
    const crestPath = child.data.identity?.crestMedia?.path || child.data.visuals?.crestImg || "fa-solid fa-landmark";

    nodes.push({
      uuid: child.document.uuid,
      name: child.document.name,
      icon: crestPath,
      isImageCrest: isImageSource(crestPath),
      category: child.data.identity?.category || "territory",
      categoryLabel: LABELS_PTBR.categories[child.data.identity?.category] || child.data.identity?.category || "Território",
      nature: child.data.identity?.nature || "physical",
      state: child.data.identity?.state || "active",
      isSelected: child.document.uuid === currentSelectedUuid,
      children: subChildren,
      hasChildren: subChildren.length > 0,
      childCount: totalDescendants,
      descendantCount: totalDescendants
    });
  }

  return nodes;
}

export function flattenDomainTree(nodes, depth = 0, collapsedUuids = new Set()) {
  const flat = [];
  for (const node of nodes) {
    const isCollapsed = collapsedUuids.has(node.uuid);
    flat.push({
      ...node,
      depth,
      indentPx: depth * 16,
      isRoot: depth === 0,
      isCollapsed,
      isExpanded: !isCollapsed
    });
    if (node.children && node.children.length > 0 && !isCollapsed) {
      flat.push(...flattenDomainTree(node.children, depth + 1, collapsedUuids));
    }
  }
  return flat;
}

export function buildDomainTagGroups(domains, currentSelectedUuid = null) {
  const map = new Map();

  for (const d of domains) {
    const tags = Array.isArray(d.data.identity?.tags) && d.data.identity.tags.length > 0
      ? d.data.identity.tags
      : ["Sem Tag"];

    for (const tag of tags) {
      if (!map.has(tag)) map.set(tag, []);
      map.get(tag).push({
        uuid: d.document.uuid,
        name: d.document.name,
        icon: d.data.identity?.crestMedia?.path || "fa-solid fa-landmark",
        isSelected: d.document.uuid === currentSelectedUuid
      });
    }
  }

  const groups = [];
  for (const [tag, items] of map.entries()) {
    groups.push({
      tag,
      count: items.length,
      items
    });
  }

  return groups.sort((a, b) => b.count - a.count);
}
