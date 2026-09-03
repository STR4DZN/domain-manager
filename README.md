# Domínios // Domain Manager

[![Foundry VTT](https://img.shields.io/badge/Foundry%20VTT-v13-blue.svg)](https://foundryvtt.com)
[![Compatible](https://img.shields.io/badge/Verified-13.351-green.svg)](https://foundryvtt.com)
[![License](https://img.shields.io/badge/License-MIT-orange.svg)](#)

**Domain Manager** é um módulo de alta performance para o **Foundry Virtual Tabletop (v13)** projetado para gerenciamento territorial, econômico, político e estratégico em qualquer escala — desde pequenos feudos e reinos medievais até impérios estelares e galáxias com dezenas de bases interligadas.

---

## Principais Recursos

- **Arquitetura Cockpit em 3 Níveis (ApplicationV2):**
  - **Navigation Rail:** Dock minimalista na extrema esquerda com rotas rápidas e indicador de foco.
  - **Explorer Sidebar:** Árvore hierárquica navegável (*Macro ➔ Micro*) com busca instantânea, alternador Pastas/Tags, guias visuais e contadores numéricos de filhos.
  - **Workspace Central:** Cockpit unificado com cartões de métricas vitais, histórico recente e abas para Economia, Projetos, Notáveis, Diplomacia e Informações Secretas.
- **Precisão Matemática Exata (Sem Drift Flutuante):**
  - Contabilidade de unidades menores (*minorUnits*) e aritmética de frações racionais exatas (*RationalFraction*) com acumulador de resíduo (*carry*).
  - Distribuição proporcional de inteiros pelo método Hare-Niemeyer (maiores restos).
- **Motor de Simulação & Avanço Temporal:**
  - Simulação determinística em memória contra *snapshot* imutável.
  - Detecção preventiva de inadimplência em acordos (*breach*) e alertas de escassez (*shortfall*).
  - Sincronização de tempo bidirecional com o relógio do Foundry VTT e o módulo `simple-timekeeping`.
- **Arquitetura Multiplayer Segura (socketlib):**
  - Mutex em fila transacional FIFO no host do Mestre para prevenir concorrência desordenada.
  - Submissão de ordens de jogadores com garantia de idempotência (`operationId`).

---

## Requisitos

- **Foundry VTT:** Versão mínima `13.341` (Verificado até `13.351`).
- **Módulos Obrigatórios:** `socketlib` (>= 1.1.3).
- **Módulos Recomendados:** `simple-timekeeping`.

---

## Instalação

### Instalação via Manifesto
No gerenciador de módulos do Foundry VTT, clique em **Instalar Módulo** e cole a seguinte URL no campo de manifesto:

```text
https://raw.githubusercontent.com/STR4DZN/domain-manager/main/module.json
```

### Instalação Manual
1. Baixe o arquivo `domain-manager-v0.1.0-dev.96.zip` da [última release](https://github.com/STR4DZN/domain-manager/releases).
2. Extraia o conteúdo na pasta `Data/modules/domain-manager` do seu Foundry VTT.
3. Ative o módulo e sua dependência (`socketlib`) nas configurações do seu mundo.

---

## Testes Automatizados

Para rodar a suíte de testes unitários nativa do Node.js:

```bash
npm test
```

---

## Autor

Desenvolvido por **Fusion** ([@STR4DZN](https://github.com/STR4DZN)).
