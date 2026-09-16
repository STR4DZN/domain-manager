# Domínios // Domain Manager

[![Foundry VTT](https://img.shields.io/badge/Foundry%20VTT-v13-blue.svg)](https://foundryvtt.com)
[![Compatible](https://img.shields.io/badge/Verified-13.351-green.svg)](https://foundryvtt.com)

**Domain Manager** é um framework estratégico e operacional para Foundry VTT v13. Ele conecta Domains, economia, projetos, squads, pessoas, estruturas, missões, diplomacia, território e inteligência dentro de um estado persistente e multiplayer.

## Linha 0.2.3 — administração de domínios

A `0.2.3` concentra a primeira correção funcional do lote: somente Mestre e Assistente do Mestre recebem controles administrativos, e a exclusão de um domínio passa a remover os registros próprios e desvincular referências externas confirmadas.

## Linha 0.2.1 — motion e abertura personalizada

A `0.2.1` adiciona transições de interface com respeito à preferência de redução de movimento e uma abertura contextual, exibida uma vez por sessão para cada pessoa, usando o nome do usuário, o mundo e o domínio ativo.

## Linha 0.2.0 — base operacional consolidada

A `0.2.0` fecha a etapa de fundação do produto: as áreas que antes funcionavam apenas como leitura ou protótipo visual agora possuem operações reais, validação e autoridade centralizada. Criação, edição e remoção estão disponíveis onde a remoção é segura; entidades com histórico ou vínculos operacionais usam cancelamento ou transições terminais explícitas para evitar perda silenciosa de dados.

Principais entregas desta linha:

- mutações de Domain, recursos, economia, população, pessoas, Structures, Projects, Squads, Missions, Requests, relações, Agreements, Intel, Conditions, segurança, Events e History passam pelo **Command Kernel** ou por wrappers de compatibilidade que delegam a ele;
- **Economy Flows** podem ser criados, editados e removidos pela interface, com validação de recursos, revisão otimista e confirmação de remoção;
- Missions planejadas, disponíveis ou ativas podem ser canceladas por GM com motivo, liberação atômica das Squads e preservação dos suprimentos já consumidos;
- Events e History possuem comandos autoritativos, receipts idempotentes, gestão completa pela interface, filtragem de registros restritos para jogadores e publicação no chat somente depois da aplicação confirmada;
- estados irreversíveis de Person, Squad e Structure usam confirmação guiada e guardas contra vínculos ativos;
- a interface prioriza legibilidade e responsividade: sem scans, miras ou animações decorativas contínuas, com tipografia, ícones, áreas de clique, overflow e dialogs adaptados a janelas compactas;
- o gate automatizado da candidata aprovou **394 de 394 testes**, cobrindo comportamento funcional, autoridade, concorrência, rollback, referências, contratos da interface e regressões responsivas.

A candidata também foi inspecionada na prévia local representativa em `1280`, `1000`, `760` e `520` px, incluindo a visão GM e a filtragem de History para jogador. Isso não substitui a instalação e a homologação multiplayer dentro do Foundry VTT. O roteiro completo e os limites conhecidos estão em `audit/IMPLEMENTACAO_0.2.0.md`.

## DOMAIN//OS — True App Architecture

A partir do `dev.134.3`, a camada de apresentação passa a seguir um contrato de produto reconstruído a partir de **26 referências FUI** e **3 referências de aplicativos modernos**. O kernel/schema permanecem independentes da apresentação.

A arquitetura oficial é:

- **App Sidebar** — única navegação global, Domain switcher compacto e workspaces hierárquicos;
- **Global Topbar** — breadcrumb, busca e autoridade em uma única camada;
- **Domain Toolbar** — contexto compacto apenas dentro de ferramentas de Domain;
- **Workspace** — ferramenta principal, com composição específica por sistema;
- **Context Inspector** — detalhes do objeto selecionado, nunca uma segunda navegação;
- **Statusbar** — estado mínimo do kernel/contexto;
- **Command Consoles** — criação/edição integrada ao mesmo produto.

Foram removidos também os intermediários do reset anterior: **Workspace Dock inferior**, `Context Console` como seletor permanente de Domain e `Subsystem Strip`. Não existem Command Rail, Entity Deck ou Domain tab bar.

Padrões já materializados:
- Personnel usa directory + dossier contextual (master-detail);
- Projects usa engineering worklist em vez de galeria de cards;
- Registry usa índice tabular + telemetria;
- Infrastructure, Missions, Forces, Defense, Territory, Relations e System mantêm composições próprias;
- busca global e navegação por workspace permanecem separadas da seleção de Domain;
- nenhuma animação decorativa infinita.

Consulte `docs/VISUAL_REFERENCE_AUDIT.md`, `docs/DESIGN_LANGUAGE.md` e `DEV1343_TRUE_APP_AUDIT.md`.

## Vertical slices operacionais

### Squad MVP — dev.132

- GM cria Squads dentro de Domains com capability `squads`.
- Controllers recebem ownership `OBSERVER` e operam a unidade pelo Command Kernel.
- Moral, condição, status e briefing operacional podem ser atualizados pelo jogador controlador.
- GM administra capacidade, efetivo e reatribuição de controllers.
- Suprimentos usam a transferência Domain/Squad já transacional.

### Mission MVP — dev.133

- GM registra operações com audiência, briefing e objetivos.
- Jogadores da audiência preparam Squads que controlam, comprometendo efetivo e suprimentos.
- Preparação reserva o compromisso; consumo ocorre apenas no lançamento.
- Launch é idempotente e coloca as unidades em campo.
- After Action Resolution aplica baixas, moral, condição e resultados de objetivos de volta aos Squads.
- Mission Control novo apresenta força, recursos, objetivos e estado operacional sem reutilizar a UI legada.

Consulte `docs/SQUAD_MVP.md` e `docs/MISSION_MVP.md`.

### Structures & Base Core — dev.134

- GM pode registrar ativos físicos existentes ou iniciar construções financiadas.
- Construção cria um `Project` real e uma `Structure planned` vinculada.
- Project concluído comissiona automaticamente a Structure em batch com Domain/Project.
- Structures `operational` consomem manutenção e produzem recursos por tick.
- Structures `damaged` mantêm o custo de manutenção e produzem proporcionalmente à condição.
- Infrastructure Control apresenta condição, capacidade, tier, vetores econômicos, construção e controle operacional.

Consulte `docs/STRUCTURES_BASE_CORE.md`.

### Strategic Economy — dev.135

- Políticas por recurso definem piso crítico, reserva-alvo e capacidade física.
- Structures disputam manutenção por prioridade explícita e degradam quando o serviço é insuficiente.
- Produção respeita condição e atendimento de manutenção.
- Agreements temporários, storage overflow e Projects são resolvidos dentro da mesma linha temporal.
- Logistics usa Strategic Ledger real em vez de exibir somente flows persistentes.
- Policy Console configura economia exclusivamente pelo Command Kernel.
- O catálogo global de recursos pode ser criado, editado e removido pela interface, com ID estável, versão otimista e inventário de dependências antes de excluir.
- Recursos em uso não podem mudar a precisão nem ser removidos, protegendo estoques, custos, estruturas, acordos e demais referências persistentes.
- `advance(N)` é testado contra N avanços unitários em cenários combinados.

Consulte `docs/STRATEGIC_ECONOMY.md`.

### Population & People — dev.136

- Population passa a possuir moral explícita, cohorts operacionais e workforce elegível/alocado.
- Workforce é roteada de cohorts para Structures por uma matriz persistente e validada pelo Command Kernel.
- `Structure.workforceRequired` fecha o ciclo Civil → Infrastructure → Simulation.
- Substaffing reduz service ratio/produção e pode degradar condition/status de Structures de forma determinística.
- Person deixa de ser apenas contrato e ganha lifecycle autoritativo `person.create` / `person.update`, morale, condition, portrait e vínculos tipados.
- Civil Control usa summary + cohort worklist + Workforce Board; Personnel preserva master-detail com dossier no Inspector.
- Crises de sustento afetam morale explicitamente sem corromper `assignment` ou `quality` dos cohorts.

Consulte `docs/POPULATION_PEOPLE.md` e `DEV136_AUDIT.md`.

### Territory / Diplomacy / Intel — dev.137

- `Domain.territory` representa controle, controlador, valor estratégico, influência e posição hierárquica sem criar uma entidade Territory paralela.
- Relations continuam edges leves do Domain, agora com referência tipada, postura, score, trust e tension.
- Agreements novos são registros independentes com partes tipadas, lifecycle, carry periódico e transferências econômicas conservativas Domain→Domain.
- Intel permanece conhecimento contextual do Domain, mas passa por commands autoritativos, alvo tipado e filtros reais de visibilidade.
- Territory Control, Relations Matrix e Intelligence Mesh usam ferramentas diferentes dentro do DOMAIN//OS: matriz de influência, worklist diplomática + treaty channel e worklist/master-detail de intelligence.
- A UI exibe o schema real do runtime; coordenadas cenográficas e a antiga card gallery de Intel foram removidas.

Consulte `docs/TERRITORY_DIPLOMACY_INTEL.md` e `DEV137_AUDIT.md`.

### Projects Advanced — dev.138

- Projects passam de worklist somente-leitura para vertical slice operacional dentro da DOMAIN//OS v4.
- GM e controllers autorizados podem criar/editar Projects e configurar custos via Command Kernel.
- `completed` continua exclusivo da Simulation; não existe botão de conclusão manual.
- Work total e plano de custos congelam quando o progresso começa, evitando reescrita retroativa de execução/economia.
- Project Dossier mostra work/rate/carry, custos e Structures vinculadas no Context Inspector.
- Schema permanece v9; Simulation, Economy e Structure commissioning não foram reescritos.

Consulte `docs/PROJECTS_ADVANCED.md` e `DEV138_AUDIT.md`.

## Kernel

- Aritmética exata com minor units e carry persistente.
- Simulation kernel determinístico.
- Autoridade única no GM primário.
- Command/transaction layer com idempotência e event bus.
- Transferências Domain/Squad com atualização em batch e compensação.
- Schema versionado e migrations sequenciais.
- Capabilities e management presets para reduzir ou ampliar complexidade por entidade.

## Requisitos

- Foundry VTT `>= 13.341` (verificado em `13.351`).
- `socketlib >= 1.1.3`.

## Instalação manual

1. Baixe `domain-manager-v0.2.3.zip`.
2. Extraia em `Data/modules/domain-manager`.
3. Ative Domain Manager e socketlib no mundo.

## Testes

```bash
npm test
```

## Autor

Fusion / STR4DZN
