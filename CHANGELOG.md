# Changelog

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
