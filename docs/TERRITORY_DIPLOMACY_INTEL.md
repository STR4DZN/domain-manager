# Territory / Diplomacy / Intel — Contract v9

## Objetivo

O `dev.137` fecha a camada estratégica de **onde um Domain está e quem o controla**, **como Domains se relacionam** e **o que um Domain sabe**. O milestone preserva a arquitetura de entidades estabelecida no `dev.129`: Territory e Intel são estados contextuais do Domain; Agreement é entidade persistente independente.

## Territory

`Domain.territory` contém:

- `controlState`: estado semântico de controle;
- `controller`: `EntityReference<Domain>` opcional;
- `control`: 0–100;
- `strategicValue`: 0–100;
- `influence[]`: vetores tipados de Domain com valor 0–100 e notas;
- `notes`: observação estratégica.

Territory **não cria um record type paralelo**. Um território, planeta, setor, base ou região pode continuar sendo representado por `Domain`, usando `identity`, `locatedInUuid`, `administrativeParentUuid` e `territory` conforme a escala da campanha.

### Regras

- apenas GM altera controle territorial;
- o Domain precisa possuir capability `territory`;
- `uuid + entityId` divergentes são rejeitados;
- influence não aceita o mesmo Domain duas vezes;
- control/influence/strategicValue são inteiros clampados por contrato entre 0 e 100.

Command: `territory.configure`.

## Relations

Relations são **edges diplomáticas leves embutidas no Domain**. Elas descrevem leitura política corrente, não obrigações econômicas persistentes.

Cada relation possui:

- `localId`;
- `target: EntityReference<Domain>`;
- `targetDomainUuid` legado preservado por compatibilidade;
- `posture`;
- `score` de -100 a +100;
- `trust` de 0 a 100;
- `tension` de 0 a 100;
- `notes`.

Commands:

- `relation.upsert`;
- `relation.remove`.

Autorrelação é proibida. Mutações exigem GM e capability `diplomacy` no Domain de origem.

## Agreements independentes

Tratados novos usam `AgreementModel`, não `Domain.agreements` embedded legado.

Um Agreement contém:

- `entityId` estável;
- duas ou mais partes tipadas (`EntityReference<Domain>`);
- tipo e status;
- `startTick` / `endTick` opcionais;
- zero ou mais transferências periódicas;
- tags e descrição.

Transferências possuem `resourceId`, origem, destino, `amount`, `periodTicks` e `carry`.

### Invariantes econômicos

- origem e destino precisam ser partes do tratado;
- recursos precisam existir no catálogo;
- transferência nunca cria recurso: débito e crédito são conservativos;
- falta de cobertura coloca o Agreement em `breached` em vez de gerar estoque negativo/fictício;
- `carry` preserva equivalência entre `advance(N)` e N avanços unitários;
- `storageCapacity` do destino é respeitada, com overflow explícito;
- início/fim são resolvidos na linha temporal tick-by-tick.

Commands:

- `agreement.create`;
- `agreement.update` (backend/contrato disponível);
- `agreement.status`.

A UI do `dev.137` cria um tratado de duas partes e transferência opcional como MVP seguro; ela **não achata** Agreements complexos existentes durante edição. Status pode ser alterado sem reescrever o corpo do tratado.

## Intel

Intel continua embedded no Domain porque representa **conhecimento daquele Domain**, não um objeto global independente.

Cada pacote possui:

- `localId`;
- título e categoria;
- alvo tipado opcional (`EntityReference<Domain>`);
- conteúdo;
- credibilidade;
- fonte;
- visibilidade;
- estado de reveal;
- tags.

Visibilidade:

- `gm_only`: somente GM;
- `all_controllers`: GM + controllers do Domain;
- `public`: todos os jogadores.

`listVisibleIntel()` filtra o conjunto **antes** da construção do view model da UI. Assim o usuário não recebe no workspace pacotes que não pode visualizar.

Commands:

- `intel.upsert`;
- `intel.remove`;
- `intel.reveal`.

Reveal muda o pacote para visibilidade pública sem duplicar o registro.

## DOMAIN//OS

O `dev.137` mantém a arquitetura visual v4 congelada:

- App Sidebar;
- Topbar;
- Workspace central;
- Context Inspector;
- Statusbar.

Cada ferramenta usa composição própria:

### Territory Control

- summary de estado/controle/valor/influência;
- Influence Matrix com vetores reais;
- hierarquia física e administrativa real;
- sem coordenadas fictícias.

### Relations Matrix

- worklist de counterpart/posture/score/trust/tension;
- Treaty Channel para Agreements independentes;
- status/lifecycle sem transformar Agreement em card genérico de Domain.

### Intelligence Mesh

- telemetria de coverage derivada dos pacotes visíveis;
- worklist comparável;
- pacote selecionado abre dossier master-detail no Inspector;
- ausência total de card gallery.

## Compatibilidade e migration v8→v9

Domains antigos recebem `territory` normalizado. Relations legadas recebem `target` tipado a partir de `targetDomainUuid` quando necessário e métricas default. Intel antigo preserva conteúdo e recebe `targetDomain: null` quando ausente.

Agreements embedded legados não são convertidos destrutivamente neste milestone. Eles permanecem compatíveis enquanto novos tratados usam o record independente.
