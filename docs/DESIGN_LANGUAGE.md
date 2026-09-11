# Domain Manager — Design Language v3 / DOMAIN//OS

## Conceito

**DOMAIN//OS — Strategic Operations System** é um aplicativo administrativo, militar e operacional de ficção científica que parece existir dentro do universo da campanha. O Foundry hospeda o produto, mas não define sua linguagem visual.

A meta não é fazer uma ficha de RPG com tema sci-fi, um dashboard corporativo escuro ou um HUD cinematográfico. A meta é um **software real, operável por horas, com linguagem futura coerente**.

A direção v3 nasce da combinação de duas fontes:

- **26 referências FUI**: instrumentação, retículas, status strips, alertas, topologias, telemetria, geometria e gramática cromática;
- **3 referências de aplicativos modernos**: ergonomia, navegação, master-detail, hierarquia de superfície, busca, inspector e densidade de informação.

Regra-mãe: **App first, FUI second.**

## Anatomia oficial

A aplicação possui uma única anatomia global. Workspaces mudam internamente sem recriar navegação paralela.

### 1. App Sidebar

Única navegação global persistente.

Contém:
- identidade DOMAIN//OS;
- Domain switcher compacto;
- ações globais (Command, Registry, Operations Network);
- grupos de workspaces;
- subsistemas apenas dentro do workspace ativo;
- autoridade/sessão no rodapé.

A sidebar **não** é um Entity Deck e **não** lista todos os Domains permanentemente.

### 2. Global Topbar

Uma única camada horizontal de contexto.

Contém:
- breadcrumb;
- busca global;
- ação administrativa principal quando aplicável;
- estado mínimo de autoridade.

Não empilhar headers globais, tabs globais ou barras redundantes.

### 3. Domain Toolbar

Aparece somente quando uma ferramenta está operando dentro de um Domain.

Exibe identidade e sinais compactos relevantes. Não é navegação.

### 4. Workspace

Área central e principal. Cada sistema é uma ferramenta, não uma aba com o mesmo template.

Exemplos:
- Command: topologia e operações globais;
- Registry: worklist + telemetria de índice;
- Infrastructure: bus + ativos industriais;
- Logistics: matriz de recursos + flow schematic;
- Projects: engineering queue;
- Missions: mission control;
- Forces: readiness/network de unidades;
- Population: demographic core;
- Personnel: directory master-detail;
- Territory: spatial scope;
- Relations: relation topology;
- Chronology: event stream;
- System: kernel diagram + simulation console.

### 5. Context Inspector

Inspector persistente à direita em resoluções amplas.

Ele responde ao objeto selecionado e ao workspace. Exemplos:
- Domain: condition bus, recursos, controllers;
- Person: dossier, role, specialization, identity matrix e trace;
- futuras entidades selecionáveis deverão seguir a mesma regra.

Inspector contextualiza; **nunca vira uma segunda navegação**.

### 6. Statusbar

Camada mínima de sistema no rodapé. Deve comunicar kernel/authority/contexto sem competir com o conteúdo.

### 7. Command Consoles

Criação e edição usam consoles transitórios integrados ao DOMAIN//OS. Dialogs devem herdar superfície, hierarquia e semântica do app; não usar formulários HTML genéricos como produto final.

## Padrões de produto

### Worklist antes de card gallery

Quando o usuário compara muitos registros homogêneos, preferir lista/tabela operacional:
- Domain Registry;
- Personnel;
- Projects;
- resource matrices;
- history/event streams.

Cards são adequados quando a entidade é discreta e precisa de leitura rica própria, como Squad, Mission, Structure ou Intel packet.

### Master-detail

Quando seleção individual importa, usar master-detail em vez de abrir dezenas de modais. Personnel é a implementação de referência: directory no workspace + dossier no Inspector.

### Hierarquia de superfície

Nem toda informação recebe uma borda. Usar níveis de superfície, espaçamento e contraste para criar agrupamento. Linhas técnicas são reservadas a estrutura, instrumentação ou estados.

### Informação + comportamento

Métrica importante deve comunicar tendência, capacidade, estado ou relação quando possível. Evitar número solto se um micrográfico, progress meter ou status strip comunicar melhor a decisão.

## Gramática FUI

A FUI é aplicada em **componentes funcionais**, não como camada decorativa global.

Vocabulário permitido:
- reticles e scopes quando existe alvo/objeto espacial;
- progress ladders e segmented meters para condição/progresso;
- status strips para estado compacto;
- topology lines para relações reais;
- waveform/trace para sinal, identidade ou atividade;
- warning geometry para condições excepcionais;
- IDs e metadata mono para rastreabilidade.

Evitar:
- scanlines permanentes;
- glitch gratuito;
- radar girando sem dado real;
- números falsos decorativos;
- hexágonos indiscriminados;
- microtexto crítico ilegível.

## Gramática cromática

- `amber` — Command/Base, engenharia, ação administrativa;
- `cyan` — Operations e telemetria operacional;
- `teal` — Civil, nominal, identidade e validação;
- `ice-cyan` — Intelligence, spatial e forensics;
- `red` — risco real, falha, destruição ou consequência crítica;
- neutros — estrutura do aplicativo.

Cor é contexto e estado. Não usar todas as cores simultaneamente para ornamentar.

## Tipografia

- Display/corpo: system sans legível (`Segoe UI Variable` / equivalente);
- Metadata/IDs: `Cascadia Mono` / `Consolas`;
- títulos: leitura rápida, não caixa alta obrigatória;
- metadata: caixa alta e tracking moderado;
- informação decisória não pode depender de texto microscópico;
- números de telemetria usam leitura tabular/mono quando ajuda comparação.

## Geometria e superfícies

A v3 abandona a regra de “quase sem radius”. Apps modernos usam surfaces discretas; FUI entra nos detalhes.

- radius pequeno/médio em surfaces e controles;
- bordas de baixo contraste;
- recortes/retículas reservados a módulos técnicos;
- espaço negativo é parte do layout;
- evitar painel dentro de painel sem função;
- densidade varia conforme a tarefa.

## Movimento

Motion é feedback, não decoração.

- nenhuma animação decorativa infinita;
- hover/selection curto e discreto;
- pulse temporário apenas para novo alerta/estado;
- loading/sweep somente durante processamento real;
- glitch somente como erro/interferência real e por tempo curto;
- respeitar `prefers-reduced-motion`.

## Responsividade

O app nasce para canvas amplo, mas precisa continuar operável em janelas menores.

- resolução ampla: Sidebar + Workspace + Inspector;
- abaixo do breakpoint: Inspector pode desaparecer e o Workspace assume largura;
- labels secundários podem colapsar antes de informação primária;
- nunca restaurar Entity Deck ou tab bar como solução de responsividade.

## Regras anti-regressão

Não reintroduzir:
- Command Rail antigo;
- Entity Deck fixo;
- Domain tabs globais;
- Workspace Dock inferior;
- Context Console como seletor permanente de Domain;
- Subsystem Strip horizontal global;
- KPI grid universal;
- Person cards como diretório principal;
- Project cards como engineering queue.

## Checklist obrigatório de qualidade

1. A tela continua compreensível se removermos glow/cor temática?
2. A composição corresponde à tarefa real ou é apenas um grid de cards?
3. O usuário sabe imediatamente qual objeto está operando?
4. A navegação global existe em um único lugar?
5. O Inspector mostra contexto real do objeto selecionado?
6. Algum dado é puramente cenográfico?
7. Algum texto essencial está pequeno demais?
8. Existe movimento contínuo sem mudança de estado?
9. Esta ferramenta parece distinta das outras sem perder identidade de produto?
10. A tela poderia ser confundida com a UI antiga?

Se a resposta da pergunta 10 for “sim”, a alteração falha a revisão.
