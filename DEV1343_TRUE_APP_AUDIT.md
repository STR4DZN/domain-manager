# dev.134.3 — True App Architecture Audit

## Objetivo

O `dev.134.3` não adiciona regra de gameplay nem altera schema. Ele substitui a arquitetura intermediária do `dev.134.2` por uma arquitetura de aplicativo orientada pelas 26 referências FUI e pelas 3 referências modernas fornecidas pelo usuário.

O baseline funcional é o kernel/schema v6 do `dev.134.1/134.2`.

## Problema observado

A primeira reconstrução visual já havia removido Command Rail + Entity Deck + tabs globais, mas ainda pensava o produto como `Command Header → Stage + Context Console → Workspace Dock`. Após a análise das referências de apps, isso foi considerado uma solução intermediária: ainda havia navegação/contexto demais competindo com o conteúdo e uma separação insuficiente entre “produto real” e “FUI”.

## Arquitetura v4

A estrutura passa a ser:

`App Sidebar → Global Topbar → Domain Toolbar opcional → Workspace + Context Inspector → Statusbar`

### App Sidebar
- única navegação global persistente;
- Domain switcher compacto;
- System actions;
- workspaces hierárquicos;
- children aparecem apenas dentro do workspace ativo;
- authority/session no rodapé.

### Global Topbar
- breadcrumb;
- busca global;
- New Node quando autorizado;
- estado de autoridade.

### Workspace
Cada ferramenta possui composição própria. Não existe grid universal de cards.

### Context Inspector
É orientado ao objeto selecionado. Personnel já implementa o primeiro master-detail completo: directory central + dossier da pessoa no Inspector.

## Mudanças estruturais

Removidos:
- Workspace Dock inferior;
- Context Console como seletor permanente de Domains;
- Subsystem Strip;
- resíduos de Command Rail / Entity Deck / Domain tabs;
- Person card gallery;
- Project card pipeline;
- CSS morto das arquiteturas descartadas.

Adicionados/refinados:
- sidebar única de app;
- topbar única com busca;
- domain switcher compacto;
- inspector contextual;
- Personnel worklist + dossier;
- Project engineering queue;
- breakpoints que removem primeiro o Inspector, preservando navegação e tarefa principal.

## Revisão visual iterativa

Foram renderizados e inspecionados durante a implementação:
- Command;
- Overview;
- Infrastructure;
- Missions;
- Economy;
- Population;
- Territory/Intelligence;
- Personnel;
- Projects;
- Forces;
- Registry;
- System;
- Defense;
- Chronology;
- Relations;
- Intel;
- layout compacto.

A revisão detectou e corrigiu, entre outros:
- Infrastructure Bus dimensionado incorretamente;
- microtexto excessivamente pequeno;
- espaço morto no overview inicial;
- dialogs ainda parecendo HTML genérico;
- identidade de workspace inconsistente;
- Project Pipeline ainda parecendo galeria de cards;
- Personnel ainda precisando de master-detail;
- CSS morto de gerações anteriores.

## Autoavaliação

### Estrutura de produto
**9.5/10.** Navegação global existe em um único lugar. Domain não virou segunda sidebar. Workspace e Inspector têm responsabilidades claras.

### Distância da UI antiga
**10/10.** Os seletores e anatomias antigas não existem mais na camada ativa e os fósseis conhecidos foram removidos do CSS.

### Aparência de aplicativo real
**9.5/10.** Worklists, topbar, sidebar hierárquica, inspector e surfaces seguem padrões de software moderno em vez de HUD puro.

### Linguagem futurista
**9/10.** FUI está presente em instrumentação, retículas, meters, topologias e states sem substituir a ergonomia de app.

### Diferenciação de workspaces
**9.5/10.** Registry, Economy, Infrastructure, Forces, Mission, Personnel, Territory, Relations, Defense, History e System não usam uma composição única reciclada.

### Legibilidade
**9/10.** Sans é usada para informação principal e mono para metadata. A responsividade remove informação secundária antes da primária.

## Limite conhecido

Renderização Chromium valida composição/CSS, mas um smoke visual dentro do Foundry VTT real continua necessário para confirmar métricas de fonte, window chrome e escala final. Nenhum problema de dados/kernel é esperado desta versão, pois schema permanece 6 e a mudança é de apresentação.

## Gate de aceitação

A versão só é considerada pronta se:
- suíte completa estiver verde;
- JS/MJS tiver sintaxe válida;
- imports relativos resolverem;
- JSONs forem válidos;
- template Handlebars estiver balanceado;
- primeiro frame `_prepareContext()` passar;
- runtime imports passarem;
- nenhum selector de anatomia descartada permanecer;
- não houver animação decorativa infinita;
- ZIP final extraído reproduzir todos os gates.
