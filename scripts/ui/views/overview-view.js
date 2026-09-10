/**
 * OverviewView — Controlador e Preparador de Contexto da Visão Geral
 * Grade Tática de 3 Linhas: KPIs de Soberania -> Radar Orbital & Identidade vs Obras/Oficiais -> Feed de Alertas
 */

export class OverviewView {
  static prepareContext({ selectedRecord, selectedDomain, metrics, domainProjects, notables, activeConditions }) {
    if (!selectedRecord || !selectedDomain) {
      return {
        hasDomain: false,
        kpis: [],
        topProjects: [],
        topNotables: [],
        alertFeed: []
      };
    }

    const data = selectedRecord.data;

    // Top 3 Projetos em Andamento
    const activeProjects = (domainProjects || []).filter((p) => !p.isCompleted);
    const topProjects = activeProjects.slice(0, 3);

    // Top 4 Notáveis Oficiais
    const topNotables = (notables || []).slice(0, 4);

    // Alertas e Condições Ativas
    const notifications = (selectedDomain.notifications || []).filter((n) => !n.dismissed);
    const alertFeed = [
      ...notifications.map((n) => ({
        id: n.localId,
        title: n.title,
        message: n.message,
        severity: n.severity || "info",
        timestamp: n.timestamp,
        isDismissible: true
      })),
      ...(activeConditions || []).map((c) => ({
        id: c.localId,
        title: c.name || "Condição Ativa",
        message: c.description || "",
        severity: "warning",
        durationTicks: c.durationTicks,
        isDismissible: false
      }))
    ];

    return {
      hasDomain: true,
      kpis: [
        {
          id: "treasury",
          label: "Tesouro & Fluxo",
          value: metrics.treasuryTotal || "0",
          sub: metrics.netRate || "+0 /tick",
          icon: "fa-solid fa-coins",
          accent: "cyan"
        },
        {
          id: "defense",
          label: "Defesa & Guarnição",
          value: metrics.effectiveDefense || 0,
          sub: `${metrics.guardCount || 0} Guardas`,
          icon: "fa-solid fa-shield-halved",
          accent: "amber"
        },
        {
          id: "population",
          label: "População & Ordem",
          value: (metrics.populationTotal || 0).toLocaleString("pt-BR"),
          sub: `Agitação: ${metrics.unrestRiskPercent || 0}%`,
          icon: "fa-solid fa-users",
          accent: metrics.unrestRiskLevel === "high" ? "rose" : "emerald"
        },
        {
          id: "engineering",
          label: "Engenharia & Obras",
          value: `${metrics.activeProjectsCount || 0} Ativas`,
          sub: `${metrics.completedProjectsCount || 0} Concluídas`,
          icon: "fa-solid fa-person-digging",
          accent: "sky"
        }
      ],
      topProjects,
      topNotables,
      alertFeed,
      radarData: {
        domainName: selectedDomain.name,
        category: selectedDomain.categoryLabel,
        sectorCoords: "LAT. 44°12'S // LONG. 53°08'W",
        sweepFrequency: "60 FPS // SCAN.RADIAL"
      }
    };
  }
}
