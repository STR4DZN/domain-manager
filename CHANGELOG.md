# Changelog

## 0.2.4 — Exclusão funcional de projetos e pessoas

- Projetos sem Structures vinculadas podem ser excluídos pelo Mestre ou Assistente; a interface pede confirmação e o comando valida a revisão antes de apagar.
- Pessoas registradas agora têm exclusão autoritativa e confirmada, além da edição já disponível.
- O bundle de estilos foi recompilado a partir das fontes que mantêm alertas, controles de marcação e painel de sistema legíveis e contidos.

## 0.2.3 — Administração e exclusão de domínio

- Controles administrativos agora são exclusivos do Mestre e do Assistente do Mestre, tanto na interface quanto na validação autoritativa dos comandos.
- A confirmação para excluir domínio passa a solicitar a exclusão em cascata: registros próprios são removidos e vínculos externos são desfeitos antes de apagar o domínio.
- A operação informa quantos registros foram removidos e quantas referências externas foram desvinculadas; o mecanismo transacional restaura os registros se a confirmação final não puder ser gravada.
- Solicitações, eventos, condições, defesa, pessoas, território, relações, inteligência, projetos e histórico usam a mesma regra de administração.

## 0.2.2 — Pacote para validação no Foundry

- Publica o pacote atual com manifesto, tag e asset sincronizados para atualização pelo Foundry.
- Mantém a camada de motion e abertura personalizada da linha 0.2.1.
- Reserva a validação de permissões, exclusão de Domínios e correções de interface para o teste em ambiente Foundry.

## 0.2.1 — Motion e abertura personalizada

- Adiciona transições leves entre as áreas da aplicação, sem animações contínuas de alto custo.
- Respeita `prefers-reduced-motion`, com perfis completo, reduzido e sem motion.
- Exibe uma abertura individual por sessão, contextualizada com jogador, papel, mundo e domínio ativo.
- Inclui testes unitários para as regras de preferência de motion e contexto da abertura.

## 0.2.0 — Base Operacional Consolidada

### Autoridade e gestão editável

- O Command Kernel passa a ser o caminho canônico para as mutações das áreas operacionais; actions legadas de Domain, Projects, Structures, Events e History foram reduzidas a bridges de compatibilidade, sem manter uma segunda autoridade de escrita.
- Os fluxos de criação e edição preservam identidade estável, referências tipadas e revisão otimista. Remoções só são oferecidas quando não quebram proveniência ou vínculos; nos demais casos, o produto usa cancelamento ou estado terminal explícito.
- Receipts idempotentes impedem a repetição de efeitos em retries, enquanto locks por recurso e persistência em batch reduzem disputas entre clientes.

### Economy Flows

- Fluxos econômicos persistentes podem ser criados, editados e removidos pela interface.
- O formulário cobre nome, recurso, direção, quantidade, período, categoria, origem e estado ativo sem exigir edição manual do registro.
- Upsert e remoção passam por contratos canônicos, permissão GM, revisão otimista, idempotência e confirmação de exclusão.

### Missions, Events e History

- Preparação e lançamento de Mission rejeitam Squads dissolvidas no backend, impedindo reativação acidental de estado terminal.
- History agora pode ser adicionado, removido e limpo pela interface com confirmação, revisão otimista e autoridade do GM.
- Domain Events podem ser sorteados, pré-visualizados e aplicados pela interface; a publicação opcional no chat ocorre somente após a confirmação autoritativa.
- A visão de jogador usa a filtragem canônica e não recebe registros `gm_only` nem controles administrativos.

- Novo command `mission.cancel` para Missions `planned`, `available` ou `active`, restrito a GM e acompanhado de motivo operacional.
- O cancelamento libera as Squads no mesmo batch, evita devolução duplicada e preserva suprimentos que já haviam sido consumidos no lançamento.
- Aplicação de Domain Event e manutenção de History (`add`, `remove` e `clear`) passam pelo Command Kernel, com rollback e proteção contra revisão obsoleta.
- A publicação de Event no chat ocorre somente após receipt confirmado e não é repetida em retry idempotente.

### Transições terminais seguras

- Person exige confirmação explícita para `dead` e `retired` e encerra sua associação operacional com Squad.
- Squad exige confirmação para `disbanded` e não pode ser dissolvida enquanto estiver vinculada a uma Mission atual.
- Structure exige confirmação para `destroyed` e `decommissioned` e bloqueia a transição enquanto possuir Project ativo.
- Um dialog guiado apresenta consequências e permite voltar antes de confirmar a operação irreversível.

### Legibilidade, responsividade e acessibilidade

- Cards, listas, matrizes, formulários e dialogs foram reorganizados para impedir texto ou ícones fora de seus limites e preservar leitura em janelas compactas.
- Tipografia, áreas de clique, alinhamento de ícones, contraste, estados vazios e tratamento de overflow foram consolidados em uma linguagem visual coerente.
- Scans, miras, linhas, ondas, retículas, medidores cenográficos e animações ambientais contínuas não fazem parte da interface operacional.
- Dialogs críticos possuem título, contexto, consequências e ações inequívocas; o conteúdo degrada para uma coluna em largura reduzida.

### Garantias e validação

- Schema permanece **v9**; a atualização não exige migration nova.
- Gate automatizado integral da candidata: **394/394 testes aprovados, 0 falhas**.
- A suíte cobre idempotência, concorrência, rollback/compensação, permissões, referências, lifecycle, actions da interface, primeiro frame e contratos responsivos.
- A prévia local representativa foi inspecionada em `1280`, `1000`, `760` e `520` px; o console do navegador permaneceu sem erros ou avisos.
- O escopo e o roteiro de homologação estão registrados em `audit/IMPLEMENTACAO_0.2.0.md`.

### Limites conhecidos

- Persistência em batch com compensação não equivale a uma transação ACID contra encerramento abrupto do processo hospedeiro.
- A instalação do pacote, as diferenças visuais do tema real e o comportamento com GM primário, GM secundário e jogador ainda devem ser homologados em uma instância real do Foundry VTT 13.351.
- O núcleo 0.2.0 administra o lifecycle estratégico deliberado; ele não adiciona, por inferência, viagem automática de Missions, mapa geográfico avançado ou um editor visual completo para Agreements multi-party complexos.

## 0.1.0-dev.154 — Catálogo de Recursos e Consolidação Visual

### Catálogo global de recursos
- Nova interface completa para criar, editar e remover definições de recursos sem editar configurações manualmente.
- Definições expõem nome, unidade, precisão, categoria, marcadores e permissão de saldo negativo; o identificador torna-se imutável após a criação.
- Escritas passam pelo Command Kernel com autoridade exclusiva do GM, lock global, idempotência, versão otimista, eventos e rollback do catálogo quando o receipt falha.
- Alterar a precisão de um recurso já utilizado é bloqueado para impedir reinterpretação silenciosa de valores persistidos.
- Remoção realiza varredura de dependências e apresenta inventário legível dos registros que ainda referenciam o recurso.

### Economia e concorrência
- O formulário de políticas captura a revisão do Domain ao abrir e recusa sobrescrever uma alteração mais recente.
- Estoques, saldos, reservas e capacidades exibem unidades de forma consistente.
- A matriz econômica e os formulários passam para cards rotulados em larguras menores, preservando leitura e ações.

### Consolidação do resgate visual
- Incorporadas as correções visuais posteriores ao dev.150: botões sem altura global indevida, dialogs opacos, textos e ícones alinhados, e retirada de ondas, retículas e medidores cenográficos sem função.
- Population, Intel, Territory, Policies e listas de recursos receberam estados vazios e layouts compactos responsivos.
- Domínios personalizados preservam as capabilities escolhidas; solicitações personalizadas persistem o rótulo definido pelo usuário durante criação, revisão e reenvio.

### Validação
- Schema permanece **v9**; nenhuma migration é necessária.
- Gates dedicados cobrem comandos do catálogo, dependências, rollback, concorrência, interface responsiva e regressões visuais.

## 0.1.0-dev.150 — Reconstrução da Aplicação e Recuperação de Gestão

### Recuperado
- Página **Pessoas** volta a ser uma área operacional explícita em master-detail, com lista, retrato, cadastro, vínculo de Actor, unidade, estado, moral, condição, notas e marcadores.
- Gestão de **imagens e aparência do Domínio** volta a ficar acessível por ação própria, com FilePicker para imagem principal, banner e brasão, além de enquadramento, zoom, posição e cor temática.
- A imagem configurada do Domínio volta a aparecer na própria visão geral, evitando uma configuração invisível.
- Registros legados de notáveis permanecem visíveis em modo somente leitura, sem migração destrutiva.

### Reorganizado
- Navegação global, workspaces e páginas foram renomeados e reorganizados em PT-BR: Gestão, Base, Operações, Pessoas e Estratégia.
- A camada `styles/app/recovery.css` passa a ser a última camada visual: software de gestão primeiro, FUI apenas como identidade secundária.
- Tipografia, botões, ícones, listas, tabelas, cards, formulários e estados vazios recebem novo piso de legibilidade e hit targets maiores.
- Em largura compacta, a sidebar deixa de consumir a lateral e passa ao topo; somente os filhos do workspace ativo permanecem expostos.
- Inspector deixa de ser obrigatório na página Pessoas e continua contextual/drawer nas demais páginas compactas.
- Tabelas e matrizes densas usam overflow deliberado em vez de esmagar conteúdo.
- Alturas curtas reduzem chrome, não fonte, e preservam rolagem natural do conteúdo.

### Limpeza visual e idioma
- Elementos decorativos sem função (retículas, órbitas, anéis, telemetria cenográfica e texturas de HUD) são suprimidos pela camada de recuperação.
- Rótulos estáticos e mensagens operacionais principais foram consolidados em português, incluindo grupos populacionais, força de trabalho, infraestrutura, relações e ciclos de simulação.
- Animação ambiental continua desativada; apenas feedback local curto é permitido.

### Integridade
- Nenhuma regra estratégica, modelo persistente, Simulation, Economy, Missions, Requests, Relations ou migration foi alterada.
- Schema permanece **v9**.
- Novo gate de regressão: `tests/ui-recovery-dev150.test.mjs`.
- Aprovação visual continua dependendo de smoke test no Foundry VTT 13.351 real.

## 0.1.0-dev.149 — UI Usability / Responsive Rescue

### Added
- Camada final `styles/app/usability.css` dedicada a legibilidade, organização e responsividade da ApplicationV2.
- Container queries da janela real em 1360/1120/900/720/520/380 px.
- `ResizeObserver` para adaptar densidade também à altura real da janela.
- Inspector contextual em drawer com ação explícita, fechamento por `Escape` e fallback de largura total.
- Testes permanentes de responsividade/legibilidade em `tests/ui-responsive-rescue.test.mjs`.

### Changed
- Canvas padrão passa de `1480×880` para `1280×760`; mínimo efetivo passa de `980×650` para `320×300`.
- Tipografia, controles, listas, tabelas, cards e dialogs recebem escala de leitura utilizável sem zoom.
- Sidebar vira rail horizontal em janelas estreitas; datasets densos preferem scroll a microcolunas.
- Inspector deixa de ocupar coluna permanente em janelas até 1360 px.
- Chrome e telemetria redundantes são removidos progressivamente conforme largura/altura diminuem.
- Force Control recebe grid/card/empty state reescalados e ação primária inequívoca.
- Contraste secundário e divisores foram reforçados.

### Removed
- Animações ambientais contínuas da shell.
- Radar decorativo genérico do Inspector.
- Statusbar em janelas de altura curta e telemetria global redundante em larguras compactas.

### Validation
- Schema permanece **v9**; nenhuma migration e nenhuma regra de domínio alterada.
- Suíte completa: **275/275**.
- Syntax: **165/165 JS/MJS**; JSON: **7/7**.
- Smoke visual final deve ser feito no Foundry real; render headless local não é usado como evidência.

## 0.1.0-dev.148 — Relations Authority Consolidation

### Changed
- `relations/actions.js` passa a delegar create/update/remove de relações diplomáticas aos Commands `relation.upsert` e `relation.remove`.
- `updateRelation()` legado preserva patch parcial por merge em memória antes do dispatch canônico.
- A compatibilidade de Agreements embedded foi isolada e documentada; novos Agreements continuam sendo records independentes operados pelo Command Kernel.

### Validation
- Schema permanece **v9**.
- Agreements independentes, Simulation e UI estratégica permanecem funcionalmente inalterados.
- A consolidação não inventa migração entre Agreement embedded e Agreement record.

## 0.1.0-dev.147 — Intel Authority Consolidation

### Changed
- `intel/actions.js` passa a ser apenas compatibilidade sobre `intel.upsert`, `intel.remove` e `intel.reveal`.
- `updateIntel()` legado preserva a semântica de patch parcial sem manter write path próprio.

### Validation
- Schema permanece **v9**.
- Suíte pré-versionamento: **265/265**.
- Nenhum outro subsistema funcional foi alterado.

## 0.1.0-dev.146 — Conditions Authority Consolidation

### Added
- Commands `condition.create`, `condition.update`, `condition.remove` e `condition.toggle`.
- Contratos canônicos de validação/locking para Conditions.
- Testes de permissão GM-only, idempotência e compatibilidade das APIs legadas.
- Documento `docs/CONDITIONS_AUTHORITY_CONSOLIDATION.md` e auditoria `DEV146_AUDIT.md`.

### Changed
- `conditions/actions.js` passa a ser apenas wrapper do Command Kernel.
- `durationTicks: null` em update agora realmente converte a Condition para duração indefinida.

### Validation
- Schema permanece **v9**.
- Simulation/decay automático permanecem fora do escopo.
- Suíte pré-versionamento: **264/264**.

## 0.1.0-dev.145 — Project Authority Consolidation

### Changed
- `projects/actions.js` passa a delegar create/update/custos ao Command Kernel.
- `expectedModifiedTime` é validado pelos Commands canônicos de Project.
- hard-delete legado de Project foi desativado para preservar UUID/provenance.

### Validation
- Schema permanece **v9**.
- Simulation e Structure commissioning permanecem fora do escopo.
- Suíte pré-versionamento: **260/260**.

## 0.1.0-dev.144 — Mission Authority Consolidation

### Added
- Commands `mission.update`, `mission.objective-upsert` e `mission.objective-remove`.
- Guard rails contra bypass de lifecycle e alteração de Domains com Squads preparados.
- Teste permanente de coerência de metadata de release.
- Documento `docs/MISSION_AUTHORITY_CONSOLIDATION.md` e auditoria `DEV144_AUDIT.md`.

### Changed
- `missions/actions.js` passa a ser apenas wrapper do Command Kernel.
- Mission derivada não pode mais ser criada pelo caminho legado; bridges canônicos preservam provenance.
- `module.json.download` volta a acompanhar a versão real da distribuição.

### Validation
- Schema permanece **v9**.
- Nenhuma alteração em Simulation, Economy, Projects, Structures, Requests, Defense ou migrations.

## 0.1.0-dev.143 — Request Authority Consolidation

### Changed
- APIs legadas de create/review de Request delegam integralmente ao Command Kernel.
- Removida autoridade paralela de persistência em `requests/actions.js`.

### Validation
- **250/250 testes**; schema **v9**.

## 0.1.0-dev.142 — Request Lifecycle Closure

### Added
- `request.withdraw` e `request.fulfill`.
- Locks unificados e proteção contra reabertura/revisão após materialização.

### Validation
- **248/248 testes**; schema **v9**.

## 0.1.0-dev.141 — Request Mission Bridge

### Added
- Command autoritativo `request.create-mission` com provenance, deduplicação semântica e rollback.
- Ação GM explícita **CREATE MISSION** no Request Dossier para Requests aprovadas e roteadas como Mission.
- Evento `request.mission-created` e testes de capability, permissão, rollback e deduplicação por origem.
- Documento `docs/REQUEST_MISSION_BRIDGE.md` e auditoria `DEV141_AUDIT.md`.

### Changed
- `createMissionFromRequestAction()` deixa de materializar diretamente e passa a ser wrapper do Command Kernel.
- Request aprovada mantém status `approved` após a criação da Mission; `fulfilled` não é inferido prematuramente.

### Validation
- Schema permanece **v9**.
- Domain model, migrations, Simulation, Economy, Projects, Structures e Defense permanecem inalterados.
- Gate final registrado em `DEV141_AUDIT.md`.

### Known Issues
- Bridges Request → Project e Request → Agreement continuam ausentes.
- A conclusão da Mission não marca automaticamente a Request como `fulfilled`.
- Smoke test em Foundry VTT real continua recomendado.

## 0.1.0-dev.140 — Request Operations

### Added
- Commands autoritativos `request.create` e `request.review` com idempotência, locks e rollback.
- Request Queue master-detail e Request Dossier no workspace Command.
- Consoles de submissão e revisão GM-only.
- Testes de ownership, privacidade, stale revision, idempotência e rollback.
- Documento `docs/REQUEST_OPERATIONS.md` e auditoria `DEV140_AUDIT.md`.

### Changed
- Endpoint socket legado `request.create` agora redireciona para o Command Kernel moderno.
- Requests do contexto da shell são filtradas por `OBSERVER` antes do decode.
- Requests passa a ser ferramenta universal do workspace Command.

### Fixed
- Impedida exposição contextual de Requests pertencentes a outro jogador ao abrir o mesmo Domain.
- Eliminada autoridade paralela entre o socket especial de Request e o Command Kernel para novos fluxos.

### Validation
- Schema permanece **v9**; nenhuma migration nova.
- Simulation, Strategic Economy, Projects, Structures e Defense permanecem fora do escopo.
- Gate final registrado em `DEV140_AUDIT.md`.

### Known Issues
- Aprovar uma Request com handling `mission`, `project` ou `agreement` ainda não materializa automaticamente a entidade correspondente.
- Estados `withdrawn` e `fulfilled` existem no modelo, mas não ganharam comandos novos nesta versão.
- Smoke test dentro de uma instância real do Foundry VTT v13 continua recomendado.

## 0.1.0-dev.139 — Defense Operations

### Added
- Command autoritativo `security.configure` com lock do Domain, idempotência e evento `security.configured`.
- Contrato de validação para `defenseRating`, `guardCount` e camadas de fortificação.
- Defense Grid operacional com Effective Defense, Scarcity Risk e Unrest Risk derivados do estado real.
- Command Console GM-only para configuração de Defense.
- Testes específicos de command, capability, permissão, idempotência e fronteira UI → Command Kernel.
- Documento `docs/DEFENSE_OPERATIONS.md` e auditoria `DEV139_AUDIT.md`.

### Changed
- Defense deixa de ser uma view somente leitura e passa a operar pelo Command Kernel.
- Métricas derivadas de risco/defesa permanecem somente leitura e nunca são persistidas pela UI.
- Fortificações duplicadas por nome normalizado são rejeitadas antes do commit.
- A apresentação de Defense preserva a anatomia DOMAIN//OS v4 e passa a mostrar pressão estratégica explicável.

### Fixed
- Removida uma guarda condicional duplicada no caminho de abertura do editor de Project, sem alterar comportamento funcional.

### Validation
- Schema permanece **v9**; nenhuma migration nova.
- Domain model, Simulation, Strategic Economy, Structure commissioning e migration pipeline permanecem byte-a-byte inalterados antes do bump de versão.
- Gate final registrado em `DEV139_AUDIT.md`.

### Known Issues
- `guardCount` continua sendo um valor estratégico agregado; não é automaticamente derivado de Workforce ou Squads.
- Fortificações continuam como camadas textuais do contrato existente; não foram promovidas a entidades próprias.
- Smoke test dentro de uma instância real do Foundry VTT v13 continua recomendado.

## 0.1.0-dev.138 — Projects Advanced

### Added
- Commands autoritativos `project.create`, `project.update`, `project.cost-upsert` e `project.cost-remove`.
- Project Dossier master-detail no Context Inspector da DOMAIN//OS v4.
- Command Consoles para criação/edição de Project e manutenção do plano de custos.
- Testes de permissão, idempotência, reserva, lifecycle, custos e regressão da UI.
- Documento `docs/PROJECTS_ADVANCED.md` e auditoria `DEV138_AUDIT.md`.

### Changed
- Projects deixam de ser somente leitura na shell atual e passam a operar pelo Command Kernel.
- `completed` deixa de integrar os statuses editáveis manualmente; conclusão continua exclusiva da Simulation.
- `project.update` preserva `entityId` e campos existentes fora do contrato operacional.
- Work total e plano de custos são protegidos contra mudanças retroativas após início do progresso.
- Project ligado a Structure `planned` não oferece cancelamento isolado na UI e o backend também rejeita a operação.

### Fixed
- Corrigida reconstrução de Project em update que podia gerar novo `entityId` e ser corretamente rejeitada pelo Journal Store.
- Evitado cancelamento que deixaria uma Structure planejada órfã.
- Reservas de Project são validadas antes de ativação/edição sem consumo fictício de estoque.

### Validation
- Schema permanece **v9**; nenhuma migration nova.
- Simulation, Structure commissioning e Strategic Economy permanecem inalterados.
- Gate final registrado em `DEV138_AUDIT.md`.

### Known Issues
- Smoke test dentro de uma instância real do Foundry VTT v13 continua recomendado.
- `scripts/features/projects/actions.js` permanece como implementação legada interna sem callers na shell atual; a DOMAIN//OS usa exclusivamente o Command Kernel.

## 0.1.0-dev.137 — Territory / Diplomacy / Intel

### Added
- `Domain.territory` com control state, controller tipado, control, strategic value, influence vectors e notes.
- Commands autoritativos `territory.configure`, `relation.upsert`, `relation.remove`, `agreement.create`, `agreement.update`, `agreement.status`, `intel.upsert`, `intel.remove` e `intel.reveal`.
- Relations com target tipado, score, trust e tension.
- Agreements independentes integrados à simulação econômica Domain→Domain com carry, breach, term e storage overflow.
- Territory Control, Relations Matrix/Treaty Channel e Intelligence Mesh master-detail dentro do DOMAIN//OS v4.
- Telemetria de Intel visível/confirmada/restrita/revelada derivada dos pacotes realmente acessíveis ao operador.
- Documento `docs/TERRITORY_DIPLOMACY_INTEL.md` e auditoria `DEV137_AUDIT.md`.

### Changed
- `schemaVersion` passa de 8 para 9.
- Agreement independente passa a ser a direção oficial para novos tratados; formato embedded permanece compatível/legado.
- Intel é filtrada por visibilidade antes de compor o view model.
- Footer exibe `SCHEMA_VERSION` real do runtime.
- Territory deixa de usar representação cenográfica e passa a expor estado/hierarquia reais.

### Fixed
- RecordIndex passa a tratar Agreement independente corretamente nas relações/indexes.
- Removidos `LAT 00.000 // LNG 00.000`, orbitais falsos e CSS territorial morto.
- Intel deixa de usar card gallery e passa a worklist + contextual dossier.
- Relações antigas com `targetDomainUuid` ganham target tipado durante migration.

### Validation
- 201 testes automatizados aprovados antes do gate final de release, incluindo cobertura de telemetria estratégica da UI.
- Territory, Diplomacy e Intel foram renderizados com dados representativos e avaliados visualmente.
- Gates de runtime, first-frame, action contract, schema dinâmico e ausência de anatomias descartadas permanecem ativos.

### Migration Notes
- Domains v8 recebem `territory` normalizado quando ausente.
- Relations v8 preservam `targetDomainUuid` e recebem `target` tipado, score/trust/tension defaults.
- Intel v8 preserva dados e recebe `targetDomain: null` quando ausente.
- Agreements embedded legados não são convertidos automaticamente em records independentes.

### Known Issues
- Fog-of-war geográfico/mapa territorial avançado fica fora do escopo.
- Editor visual completo de Agreements complexos multi-party/multi-transfer fica para uma etapa futura; o backend já suporta o contrato.
- Smoke test em Foundry VTT v13 real continua recomendado.

## 0.1.0-dev.136 — Population & People

### Added
- `morale` explícita no Population e em cohorts, com bandas semânticas derivadas.
- `workforceEligible` por cohort e matriz persistente `population.workforce.allocations`.
- `Structure.workforceRequired` para fechar o ciclo Civil → Infrastructure → Simulation.
- Commands autoritativos/idempotentes `population.configure`, `population.group-upsert`, `population.group-remove`, `population.workforce-set`, `person.create` e `person.update`.
- Civil Control com summary strip, cohort worklist e Workforce Board.
- Staffing Matrix como Command Console para roteamento cohort × Structure.
- Personnel com criação/edição real de `Person` mantendo o padrão directory + contextual dossier.
- Documento `docs/POPULATION_PEOPLE.md` e auditoria `DEV136_AUDIT.md`.

### Changed
- `schemaVersion` passa de 7 para 8.
- Workforce passa a participar do service ratio estrutural junto da disponibilidade de manutenção.
- Produção de Structure é escalada por condição × service ratio e, portanto, também pela cobertura de workforce.
- Crises civis reduzem `population.morale` e `group.morale` em vez de adulterar campos textuais como `assignment`/`quality`.
- Consoles de Structure passam a expor `workforceRequired`.
- UI Civil/People permanece dentro da arquitetura DOMAIN//OS v4: app sidebar, workspace central e contextual inspector.

### Fixed
- Fome + seca no mesmo tick aplicam uma única penalidade civil naquele tick.
- Workforce não pode ser sobrealocada acima do total elegível de um cohort.
- Allocation para Structure de outro Domain é rejeitada.
- Cohort com alocação ativa não pode ser removido/desativado sem primeiro liberar workforce.
- Referências `UUID + entityId` divergentes continuam sendo rejeitadas também nos novos commands de People.
- `PersonModel` deixa de possuir declaração duplicada de `portrait`.
- Civil Control mantém a coluna `STATE` legível ao lado do Workforce Board em largura desktop.

### Validation
- 180 testes automatizados aprovados antes do gate final de release.
- Cobertura inclui migration v7→v8, permissões, idempotência, over-allocation, cross-domain workforce, Person↔Squad, workforce simulation e determinismo temporal.
- Civil Control, Personnel e Staffing Matrix foram renderizados e inspecionados visualmente.
- Gates de first-frame, data-action, runtime imports, Handlebars e arquitetura visual permanecem ativos.

### Migration Notes
- Domains v7 recebem `population.morale` quando ausente, moral/workforce elegível por cohort e `population.workforce.allocations: []`.
- `quality` legado é usado apenas como fallback inicial para derivar morale; o campo original é preservado.
- Structures v7 recebem `workforceRequired: 0` quando ausente.
- Persons v7 recebem `portrait`, `morale: 60` e `condition: 100` quando ausentes.

### Known Issues
- Employment/skills avançados, salários, turnos, famílias, migração automática de Notables legados para `Person` e crescimento demográfico permanecem fora do escopo do milestone.
- Workforce ainda é alocada em quantidade abstrata; indivíduos nomeados não contam automaticamente como workforce.
- Smoke test em Foundry VTT v13 real continua recomendado.

## 0.1.0-dev.135 — Strategic Economy

### Added
- Resource policies por recurso: `criticalFloor`, `reserveTarget` e `storageCapacity`.
- `maintenancePriority` por Structure com desempate determinístico.
- Command autoritativo/idempotente `economy.configure`.
- Strategic Domain Ledger consolidando flows, sustenance, Structures, Agreements e reservas de Projects.
- Policy Console integrado ao DOMAIN//OS para estoque, thresholds, capacidade e sustento.
- Bateria determinística de cenários econômicos agregados vs unitários.

### Changed
- `schemaVersion` passa de 6 para 7.
- Simulation Kernel resolve avanços internamente tick por tick.
- Structures disputam manutenção por prioridade, degradam sob serviço insuficiente e produzem conforme condição × service ratio.
- `advance-run` persiste diretamente Agreements e projeções finais de Structures calculadas pelo kernel.
- Logistics passa a mostrar o estado estratégico real: stock, available, net/tick, reserve, capacity, autonomy e state.

### Fixed
- Agreement temporário deixa de transferir recursos depois do tick de expiração dentro de avanços longos.
- Structure comissionada no meio de `advance(N)` começa a participar da economia no tick seguinte, não somente após o lote inteiro.
- Storage overflow é aplicado no tick correto e não carrega excesso silenciosamente.
- Degradação por falta de manutenção agora chega ao Journal em vez de existir apenas no preview.
- Fome/desabastecimento em avanço agregado respeitam a posição temporal da crise.
- Fome e seca simultâneas no mesmo tick contam como uma única ocorrência civil, evitando penalidade duplicada por recurso.

### Validation
- 160 testes automatizados aprovados no gate final pré-empacotamento.
- Bateria estratégica cobre carry, Agreements, prioridades, produção, degradação, storage, crises civis e commissioning intermediário.
- Logistics e Policy Console foram renderizados e inspecionados visualmente.
- `DEV135_AUDIT.md` e `docs/STRATEGIC_ECONOMY.md` documentam regras e invariantes.

### Migration Notes
- Domains v6 recebem `economy.resourcePolicies: []` quando ausente.
- Structures v6 recebem `maintenancePriority: 50` quando ausente.
- Policies/prioridades já presentes são preservadas.

### Known Issues
- Repair automático, workforce allocation, rotas territoriais e mercado continuam fora do escopo.
- Smoke test em Foundry VTT v13 real continua recomendado.

## 0.1.0-dev.134.3 — True App Architecture

### Rebuilt
- Substitui a arquitetura intermediária `Command Header → Stage + Context Console → Workspace Dock` por uma arquitetura real de aplicativo: `Sidebar → Topbar → Workspace + Inspector → Statusbar`.
- Remove Workspace Dock, Context Console permanente e Subsystem Strip.
- Domain selection deixa de ser uma segunda navegação fixa e vira um switcher compacto.
- Personnel vira directory + dossier contextual (master-detail).
- Projects vira engineering worklist em vez de card gallery.

### Refined
- Sidebar passa a ser a única navegação global persistente e agrupa workspaces hierarquicamente.
- Topbar concentra breadcrumb, busca, ação principal e authority state em uma única camada.
- Inspector passa a responder ao objeto selecionado; Person é a primeira implementação específica.
- Responsividade preserva tarefa principal e remove Inspector antes de colapsar navegação.
- Surfaces, radius, tipografia e microcomponentes equilibram app moderno com FUI funcional.

### Removed
- CSS morto de Person cards, People workbench/dossier antigo e Project card pipeline.
- Resíduos conhecidos das anatomias Command Rail, Entity Deck, Domain tabs e Presentation Reset intermediário.

### Validation
- Revisão visual iterativa de workspaces principais e secundários em Chromium.
- Gate automatizado contra reintrodução das anatomias descartadas.
- `DEV1343_TRUE_APP_AUDIT.md` registra arquitetura, comparação e autoavaliação.

### Migration Notes
- Nenhuma migration de dados. `schemaVersion` permanece 6.
- Mudança restrita à apresentação, navegação e estado de seleção da UI.

## 0.1.0-dev.134.2 — Presentation Reset / DOMAIN//OS

### Rebuilt
- Reconstrói integralmente a arquitetura de apresentação sem alterar kernel, schema v6 ou regras de gameplay.
- Remove Command Rail vertical, Entity Deck fixo, tab bar global do Domain e overview baseado em KPI cards.
- Introduz `Command Header → Stage + Context Console → Workspace Dock`.
- Agrupa capacidades em workspaces Command, Base, Operations, Civil e Intelligence.
- Cada workspace recebe composição e acento semântico próprios.
- Reescreve dialogs como Command Consoles integrados ao DOMAIN//OS.

### Added
- Command node constellation, strategic load e operations channel.
- Domain Vector + telemetria contextual.
- Resource Flow matrix/schematic, demographic core, territory scope e relações topológicas.
- Presentation regression tests contra anatomia legada e animações infinitas.
- Auditoria visual iterativa `DEV1342_PRESENTATION_AUDIT.md`.

### Changed
- Canvas inicial da ApplicationV2 passa a 1480×880, preservando layout compacto a partir de 1120×700.
- Microtextos críticos recebem incremento de legibilidade.
- Scroll preservation passa a observar workspace, Context Console e Command Consoles, sem referência ao Entity Deck removido.
- `docs/DESIGN_LANGUAGE.md` passa à arquitetura DOMAIN//OS v2.

### Validation
- 128 testes automatizados aprovados antes do fechamento de release.
- Previews renderizados/inspecionados para Command, Overview, Infrastructure, Missions, Logistics, Civil, Intelligence, layout compacto e Command Console.
- Zero seletores da anatomia antiga no template/styles/shell.
- Zero animações decorativas infinitas.

### Migration Notes
- Nenhuma migration de dados. `schemaVersion` permanece 6.
- A mudança é deliberadamente restrita à apresentação e navegação.

## 0.1.0-dev.134.1 — Runtime Boot Hotfix

### Fixed
- Corrige crash ao abrir o Domain Manager: `editingStructure` era lido antes da inicialização durante `_prepareContext()`.
- Reordena a derivação dos status de Structure para ocorrer somente após a resolução do registro em edição.

### Hardening
- Novo smoke test executa `_prepareContext()` no primeiro frame da ApplicationV2.
- Novo smoke test importa todos os módulos runtime sob um Foundry mínimo.
- Novo contrato garante que todo `data-action` do Handlebars possui handler registrado e implementado.
- Novo teste impede ciclos de imports ESM estáticos.
- Auditoria TDZ externa: 0 usos diretos de `let`/`const`/`class` antes da declaração em 121 arquivos JS/MJS.


## 0.1.0-dev.134 — Structures & Base Core

### Added
- Commands autoritativos `structure.create`, `structure.patch`, `structure.admin-update` e `structure.begin-construction`.
- `Structure.activeProject` como referência tipada opcional para Project.
- Construção real baseada em Project, com validação de reservas antes de criar Project + Structure planned.
- Fluxos econômicos sintéticos de manutenção e produção de Structures no Simulation Kernel.
- Comissionamento automático de Structure quando o Project vinculado conclui.
- Histórico/notificação de comissionamento e `updatedStructures` no hook de avanço.
- Infrastructure Control completo na shell nova, incluindo Resource Matrix e controle operacional.
- Documento `docs/STRUCTURES_BASE_CORE.md` e auditoria `DEV134_AUDIT.md`.

### Changed
- `schemaVersion` passa de 5 para 6.
- Structure deixa de ser apenas contrato/listagem e passa a constituir um sistema persistente operável.
- Structures `operational` participam da economia a 100%; `damaged` produzem proporcionalmente à condição mantendo manutenção integral.
- `planned`, `disabled`, `destroyed` e `decommissioned` não injetam fluxos estruturais.
- Domain + Project + Structure são preparados/persistidos no mesmo batch compensável quando uma obra comissiona um ativo.

### Fixed
- Administração de Structure agora preserva `entityId` imutável ao reconstruir o blueprint.
- Project vinculado ao card de Structure recebe tom semântico de status na UI.
- Referências com UUID/entityId divergentes são rejeitadas em vez de resolver ambiguamente.
- Falha de reserva de construção não deixa Project/Structure órfãos.

### Migration Notes
- Structures v5 sem o novo campo recebem `activeProject: null`.
- Uma referência `activeProject` já presente é preservada.
- Nenhuma Structure legada muda de status automaticamente.

### Validation
- 113 testes automatizados aprovados antes do fechamento documental.
- Teste de integração prova o ciclo Project quase concluído → liquidação reserved → Project completed → Structure operational → histórico/notificação.
- Testes de simulação cobrem economia por estado, eficiência damaged, risco de manutenção e determinismo.
- Testes de UI garantem que Infrastructure Control persiste apenas pelo Command Kernel.

### Known Issues
- Falta de manutenção emite risco, mas ainda não degrada condition/status automaticamente; política avançada entra no `dev.135 — Strategic Economy`.
- Structure comissionada começa a produzir/consumir no tick seguinte ao comissionamento, não retroativamente no tick que finalizou a obra.
- Smoke test visual/multiplayer em Foundry VTT v13 real continua recomendado.

## 0.1.0-dev.133 — Mission MVP / Mission Control

### Added
- Mission lifecycle autoritativo completo: `mission.create`, `mission.prepare`, `mission.release`, `mission.launch` e `mission.resolve`.
- Schema v5 com `assignments`, timestamps de início/resolução e consequências persistentes.
- Mission Control interativo na nova shell, com criação de operação, audiência, objetivos, preparação por Squad, comprometimento de efetivo/suprimentos, lançamento e After Action Resolution.
- Telemetria por missão: força comprometida, unidades, audiência, objetivos concluídos/falhos e recursos reservados.
- Testes de UI para actions, command wiring, balanceamento Handlebars e componentes visuais do Mission Control.
- Documentos `DEV133_AUDIT.md` e `docs/MISSION_MVP.md`.

### Changed
- Missions deixam de ser cards somente-leitura e passam a constituir o segundo vertical slice operacional da UI nova.
- Preparação de Mission reserva compromisso sem consumir estoque; consumo ocorre somente no lançamento.
- CRUD legado de Mission preserva o estado operacional v5 ao editar briefing/objetivos.
- Resolução aplica baixas, moral, condição, estado do Squad e resultados de objetivos em um único fluxo autoritativo.

### Fixed
- Retry do lançamento não consome suprimentos duas vezes graças ao ledger idempotente.
- Jogador fora da audiência ou sem controle do Squad não consegue preparar a unidade.
- Squad não pode ser comprometido silenciosamente em outra Mission.
- Referências Mission/Squad com UUID e entityId divergentes são rejeitadas.
- Consequências de resolução não permitem baixas acima do efetivo comprometido/disponível.

### Migration Notes
- `schemaVersion` passa de 4 para 5.
- Missions antigas recebem `assignments: []`, `startedAtWorldTime: null` e `resolvedAtWorldTime: null`.
- Nenhum dado de briefing, objetivos, audiência ou resultado legado é descartado.

### Validation
- 89 testes automatizados aprovados antes do empacotamento.
- Testes de integração provam o ciclo GM → preparação pelo jogador → launch → retry idempotente → resolução → retorno do Squad.
- Template Mission Control possui validação automática de blocos Handlebars e actions registradas.

### Known Issues
- Smoke test visual/multiplayer em uma instância real do Foundry VTT v13 continua recomendado.
- Mission ainda não possui sistema de duração/viagem/checagens automáticas; o MVP trata preparação, lançamento e resolução deliberada.
- Loot, XP, reputação e efeitos territoriais serão consumidores futuros dos eventos estruturados de Mission.

## 0.1.0-dev.132 — Squad MVP / Force Control

### Added
- Commands autoritativos `squad.create`, `squad.patch` e `squad.admin-update`.
- Force Control interativo na nova shell: criação, telemetria, edição operacional e administração de controllers.
- Console de Supply para transferências Domain/Squad usando o kernel transacional existente.
- Testes de contrato e integração do lifecycle de Squad.
- Documentos `DEV132_AUDIT.md` e `docs/SQUAD_MVP.md`.

### Changed
- Squads deixam de ser somente cards de leitura e passam a constituir o primeiro vertical slice operacional da UI nova.
- Todas as mutações do novo fluxo de Squad passam pelo Primary GM Command Kernel, inclusive para GM secundário/jogador via socket.
- Reatribuição de controller mantém `governance.controllers` e ownership Foundry sincronizados.

### Fixed
- Referências de Squad com UUID/entityId divergentes agora são rejeitadas.
- Usuário não controlador não consegue alterar estado operacional da unidade.
- UI de recursos não concede implicitamente acesso ao estoque do Domain para controllers de Squad.

### Validation
- 76 testes automatizados aprovados antes do fechamento documental.
- Schema permanece v4; nenhuma migration é necessária.

### Known Issues
- Composição/equipamento ainda não possuem editor dedicado.
- Mission lifecycle e vínculo real de Squad com missão entram no próximo vertical slice.
- Smoke test visual/multiplayer em Foundry VTT v13 real continua recomendado.

## 0.1.0-dev.131 — Strategic Operations UI Foundation

### Added
- Interface ApplicationV2 completamente nova: **Strategic Operations System**.
- Command Rail global, Entity Deck pesquisável, Workspace contextual e System Footer.
- Navegação de Domain gerada por `management.capabilities`.
- Views novas para overview, economia, população, pessoas, estruturas, projetos, squads, missões, diplomacia, território, intel, segurança e histórico.
- Linguagem visual própria derivada de auditoria de 26 referências FUI.
- `docs/VISUAL_REFERENCE_AUDIT.md` com análise individual de todas as referências do usuário.
- `docs/DESIGN_LANGUAGE.md` com tokens, semântica de cor, geometria, motion e componentes.
- Helpers puros de navegação e apresentação (`navigation.js`, `presentation.js`).
- Testes de capabilities na navegação e smoke import da nova shell.

### Changed
- UI antiga, partials antigos e todo o conjunto de CSS visual anterior foram removidos.
- Build de CSS agora compõe exclusivamente `styles/app/*.css`.
- Launcher abre diretamente o novo app, sem boot cinematográfico ou transition overlay.
- `README` foi reescrito para refletir a arquitetura atual.
- Aparência principal usa grafite/navy + amber; teal/ciano é reservado a intel/estado nominal e vermelho a risco real.

### Fixed
- Navegação deixa de exibir módulos desligados por capability.
- Progresso de Projects na UI é calculado a partir de `work.completed / work.required`, em vez de depender de um campo inexistente.
- A UI não depende mais da antiga shell monolítica de milhares de linhas.

### Validation
- 67 testes automatizados aprovados.
- Nova shell possui teste de import com mock de ApplicationV2.
- Handlebars teve pairing de blocos e estrutura HTML verificados automaticamente.
- Todos os JS/MJS e imports relativos passam por validação estática antes do empacotamento.

### Known Issues
- Esta versão estabelece a nova fundação visual; fluxos completos de CRUD para todos os novos record types ainda serão adicionados verticalmente nas próximas versões.
- O layout ainda precisa de smoke test visual dentro de uma instância real do Foundry VTT v13.
- Territory apresenta a camada visual/espacial, mas ainda não implementa o sistema avançado de controle territorial.

## 0.1.0-dev.130 — Transaction & Authority Kernel

### Added
- Command kernel com registry/dispatcher e roteamento autoritativo via socketlib.
- `TransactionManager` sobre a TransactionQueue.
- Ledger world persistente de idempotência com fingerprint de command/caller/payload e retenção limitada.
- Event bus interno + bridge para Foundry Hooks.
- Command `resources.transfer` para transferências Domain/Squad.
- `updateRecordsBatch()` para preflight e persistência multi-record em uma operação de coleção.
- Histórico estruturado com `eventType`, `operationId`, `actorUserId`, `entityIds` e metadata.
- Documentação `docs/TRANSACTION_AUTHORITY_KERNEL.md`.

### Changed
- `schemaVersion` passou de 3 para 4.
- Journal store inteiro agora exige Primary Active GM para mutações oficiais.
- TransactionQueue agora rejeita execução em GM secundário.
- Resource Catalog oficial exige Primary Active GM para escrita.
- Migrations são executadas somente pelo GM primário; outros clientes aguardam o schema atual antes de reconstruir o índice.
- `advance-run` prepara Domains e Projects e persiste o conjunto em batch, com compensação em caso de falha do provider.
- API pública expõe `executeCommand` e `commandTypes`.

### Fixed
- Retry de uma mutação autoritativa pode agora retornar receipt persistente sem repetir a alteração de estado.
- Reutilização de um `operationId` com payload/caller/comando diferente gera conflito em vez de comportamento ambíguo.
- Transferências multi-entidade não deixam intencionalmente origem debitada e destino não creditado quando o provider reporta falha parcial; o handler tenta restauração compensatória.
- GM secundário não mantém mais uma fila local concorrente para mutações que usam a TransactionQueue/store oficial.

### Migration Notes
- Migration v3→v4 adiciona campos estruturados neutros às entradas históricas existentes.
- O novo world setting `operationLedger` inicia vazio; não há conversão necessária de Requests antigas.

### Known Issues
- Bulk update + compensação não equivale a transação ACID de banco contra crash abrupto do host/processo.
- Nem toda action legada possui um command type dedicado ainda, embora o Journal store bloqueie persistência fora do GM primário.
- UI de transferência ainda não existe.
- Não houve teste multiplayer real dentro do Foundry VTT nesta execução.

## 0.1.0-dev.129 — Architecture Contract

### Added
- Schema v3 com `entityId` estável para todos os records persistentes.
- Contrato de `EntityReference` tipado (`recordType + uuid/entityId`) para novas entidades.
- Management presets e capabilities explícitas: `squad`, `outpost`, `base`, `strategic-organization` e `custom`.
- Capability `people` separada de `population` para suportar personagens nomeados sem população estratégica.
- Contratos/DataModels iniciais para `Squad`, `Person`, `Structure`, `Agreement` e `Resource`.
- Indexação por `entityId` e índices relacionais de Squads, People, Structures e Agreements.
- Backup schema v2 com novos tipos de record.
- Metadados públicos de contracts (`schemaVersion`, record types, capabilities e presets) na API do módulo.
- Documento `docs/ARCHITECTURE_CONTRACT_V3.md`.

### Changed
- `Domain` agora possui `management.preset` e `management.capabilities`.
- `Domain`, `Request`, `Project` e `Mission` passam a possuir identidade estável sem substituir UUIDs legados.
- Resource definitions passam a aceitar `category` e `tags`, preservando esses campos em updates feitos pela UI antiga.
- `RecordIndex` e Journal store validam unicidade de identidade; `entityId` é imutável após criação.
- Importação de backup procura registros por `entityId` antes do UUID.
- Novos relacionamentos usam referências tipadas consultáveis por UUID ou `entityId`.

### Fixed
- Backup legado v1 sem `entityId` pode atualizar um registro moderno herdando sua identidade estável em vez de gerar uma identidade nova e falhar por conflito.
- Separação entre `people` e `population` evita que o preset de Squad precise habilitar população estratégica apenas para administrar NPCs/notáveis.

### Migration Notes
- `schemaVersion` passa de 2 para 3.
- Registros v2 recebem `entityId` automaticamente.
- Domains antigos recebem `management` normalizado com preset `base` por compatibilidade.
- Não há conversão automática de notables/agreement embutidos para `Person`/`Agreement` nesta versão.

### Known Issues
- A UI antiga ainda não é capability-aware.
- Novos record types possuem contratos, validação, indexação e backup, mas ainda não têm fluxo completo de actions/UI.
- Relacionamentos legados de Domain/Request/Project/Mission continuam UUID-based nesta etapa.
- Import `overwrite` ainda não remove records que não estejam presentes no backup.
- Remapeamento cross-world de referências UUID legadas ainda não está implementado.
- Não houve smoke test dentro de uma instância real do Foundry VTT nesta execução.

## 0.1.0-dev.128 — Stabilization

### Added
- Suíte automatizada inicial com testes de aritmética exata, simulação, sustento, custos de Projects, migração, normalização de Domain, autoridade GM e fila transacional.
- `carry` persistente nos fluxos econômicos periódicos.
- Autoridade explícita de GM primário para avanços globais de tempo.
- Migração de schema v1 para v2.

### Changed
- `schemaVersion` passou de 1 para 2.
- Simulation Snapshot agora carrega população, segurança, configuração de sustento e carry dos fluxos.
- Simulation Kernel liquida custos de Projects contra o estoque real do Domain.
- Projects sem recursos suficientes têm o avanço limitado ao que pode ser financiado, sem consumo fictício; continuam ativos para retomada automática.
- Requests são criadas dentro da TransactionQueue para tornar o check de `operationId` e a criação uma operação serializada.
- Avanços temporais reais são serializados pela TransactionQueue.
- Edição básica de Domain preserva campos econômicos existentes, incluindo `sustenanceSettings`.

### Fixed
- Sustento populacional não era aplicado corretamente no snapshot da simulação.
- Catálogo de recursos era passado ao upkeep em formato incompatível.
- Custos `progressive` e `reserved` de Projects eram marcados como consumidos sem reduzir estoque.
- Fluxos como `1 unidade / 3 ticks` perdiam frações entre avanços separados.
- Estoque terminando exatamente em zero era tratado como crise de fome/água.
- Condição automática de fome utilizava `severity: crisis`, valor inválido no DataModel.
- Condição de fome recém-criada podia perder duração imediatamente no mesmo avanço.
- Projects já concluídos podiam gerar histórico/notificação de conclusão repetidamente.
- Mais de um GM podia reagir ao mesmo `updateWorldTime`.
- Pipeline de migração existia, mas não era executado antes da reconstrução do índice.
- Migração antiga criava `nature: settlement`, valor incompatível com o enum atual.
- `MODULE_VERSION` estava preso em `0.1.0-dev.79`.

### Removed
- Imports não utilizados diretamente relacionados à estabilização (`FLOW_CATEGORIES` e `getTimekeepingStatus`).

### Known Issues
- A UI/cockpit atual continua sendo legado e não foi redesenhada nesta versão.
- A TransactionQueue é local ao cliente GM; uma camada de autoridade distribuída mais ampla fica para o kernel de autoridade futuro.
- Acordos ainda utilizam `amountPerTick` direto e não possuem carry próprio, pois não usam períodos fracionários hoje.
- Não houve validação manual dentro de uma instância real do Foundry VTT nesta execução; a validação realizada foi estática + testes Node.

### Migration Notes
- Ao carregar o mundo como GM, registros do módulo com schema antigo são migrados antes de `recordIndex.rebuild()`.
- Domains v1 recebem `carry: 0` em fluxos que não possuíam o campo.
- `identity.nature: settlement` é convertido para `physical`.
- Conditions legadas com `severity: crisis` são convertidas para `severe`.
