# Implementação 0.2.0 — encerramento da base operacional

Data do fechamento documental: **15 de setembro de 2026**  
Schema persistente: **v9**  
Gate automatizado registrado: **394/394 testes aprovados, 0 falhas**  
Estado deste documento: **implementação funcional e inspeção visual local consolidadas; homologação no Foundry e multiplayer real ainda pendentes**

## 1. Resumo executivo

A linha `0.2.0` conclui a fundação operacional do Domain Manager. O módulo deixa de ser uma coleção de telas parcialmente editáveis e passa a tratar as mutações principais como operações explícitas, validadas e auditáveis.

O objetivo não foi oferecer um botão de exclusão para todo tipo de registro. Onde apagar quebraria histórico, proveniência ou referências, a solução correta é uma ação de lifecycle — cancelamento, dissolução, destruição, descomissionamento, morte ou aposentadoria — acompanhada de confirmação e guardas de integridade.

O resultado combina três frentes:

1. **autoridade e consistência**, com Command Kernel, GM primário, idempotência, locks, revisão otimista, batch e compensação;
2. **gestão real**, com criação, edição, remoção segura ou encerramento explícito nas áreas customizáveis;
3. **produto utilizável**, com hierarquia visual mais simples, texto legível, controles coerentes, responsividade e retirada de decoração que simulava telemetria sem possuir função.

## 2. Definição de concluído para a 0.2.0

A base é considerada funcionalmente concluída quando:

- uma mutação iniciada na shell chega a um command registrado, passa pela autoridade correta e produz receipt;
- o mesmo `operationId` não repete efeitos e não pode ser reutilizado com outro command, caller ou payload;
- uma edição baseada em estado antigo é rejeitada em vez de sobrescrever silenciosamente a versão mais recente;
- operações com mais de um registro realizam preflight e persistência conjunta, com tentativa de compensação quando o provider falha parcialmente;
- referências tipadas e identidades estáveis são preservadas durante edição;
- operações destrutivas possuem confirmação e guardas de vínculo;
- as telas críticas continuam operáveis em largura compacta sem reduzir texto e ícones a escalas impraticáveis;
- o gate automatizado integral permanece verde.

## 3. Fluxo de autoridade

O caminho esperado para uma escrita de produto é:

```text
Interface / API de compatibilidade
            ↓
      Command Dispatcher
            ↓
 Primary Active GM via socketlib
            ↓
 contrato + permissão + revisão + locks
            ↓
 Transaction Manager / Journal Store
            ↓
 receipt idempotente + Domain Event + History
```

As APIs antigas podem permanecer como superfície de compatibilidade, mas não devem criar uma segunda autoridade de persistência. Elas normalizam o pedido e delegam ao command canônico.

## 4. Escopo entregue

| Área | Operação consolidada | Proteções relevantes |
| --- | --- | --- |
| Domain e aparência | criação, edição, configuração de capabilities e remoção segura | identidade estável, permissão, revisão e preservação da configuração customizada |
| Resource Catalog | criar, editar e remover definições | lock global, dependências, precisão imutável quando em uso e rollback |
| Economy Policies | editar estoque, reservas, capacidades e políticas | revisão do Domain capturada ao abrir o formulário |
| Economy Flows | criar, editar e remover fluxos persistentes | validação do recurso, GM-only, revisão otimista, idempotência e confirmação |
| Population | configurar núcleo, grupos e workforce | limite de alocação e referências à Structure do mesmo Domain |
| People | criar e editar Person; aposentar ou marcar morte | confirmação terminal e encerramento do vínculo com Squad |
| Structures | registrar, construir e administrar | commissioning por Project, batch e bloqueio terminal com Project ativo |
| Projects | criar, editar e configurar custos | work/custos congelados após início; conclusão exclusiva da Simulation |
| Squads | criar, editar, administrar e transferir suprimentos | controllers, ownership, capacidade e bloqueio de dissolução em Mission |
| Missions | criar, editar, preparar, liberar, lançar, resolver e cancelar | audiência, locks, retries idempotentes e liberação consistente de Squads |
| Requests | criar, revisar, retirar, cumprir e materializar Mission | privacidade, provenance e guardas de lifecycle |
| Relations, Agreements e Intel | criar/editar/remover ou alterar status conforme o contrato | alvo tipado, visibilidade, autoridade e integração econômica |
| Conditions e Defense | administrar condições e configuração de segurança | validação canônica e campos derivados somente leitura |
| Events e History | aplicar Event; adicionar, remover e limpar History | GM, revisão, rollback, receipts e chat após confirmação |

### 4.1 Economy Flows

Os fluxos econômicos deixaram de ser apenas dados exibidos pelo Strategic Ledger. A interface oferece editor e confirmação de remoção, enquanto os commands `economy.flow-upsert` e `economy.flow-remove` tratam a persistência autoritativa.

O formulário permite definir nome, recurso, direção, quantidade, período, categoria, origem e estado ativo. A edição preserva o identificador do fluxo e usa a revisão esperada do Domain para detectar concorrência.

### 4.2 Cancelamento de Mission

O command `mission.cancel` encerra Missions `planned`, `available` ou `active` mediante confirmação do GM e motivo operacional.

O cancelamento:

- rejeita estados já terminais;
- libera as Squads participantes no mesmo batch;
- marca assignments como retornados sem criar duplicatas;
- não devolve suprimentos que já foram consumidos no lançamento;
- preserva o histórico da operação e responde corretamente a retry idempotente;
- limita e normaliza o motivo recebido pelo contrato.

Preparação e lançamento também rejeitam uma Squad já `disbanded`, impedindo que uma operação posterior reative acidentalmente um estado terminal.

### 4.3 Events e History

A aplicação de Domain Event e as operações `history.add`, `history.remove` e `history.clear` passam pelo mesmo caminho autoritativo das demais mutações. A interface oferece formulário de registro, confirmações de remoção e limpeza, além de sorteio e pré-visualização do resultado antes da aplicação.

O observer de chat só publica a mensagem depois que o command retorna receipt confirmado. Uma repetição idempotente recupera o resultado persistido sem publicar o mesmo Event novamente.

A listagem usa a filtragem canônica de visibilidade: registros `gm_only` e controles administrativos não são entregues à visão de jogador.

### 4.4 Transições terminais

As transições potencialmente irreversíveis usam um dialog guiado com contexto, consequências e ações claras:

- **Person:** `dead` ou `retired`; a associação operacional com Squad é removida;
- **Squad:** `disbanded`; a ação é bloqueada enquanto houver Mission atual;
- **Structure:** `destroyed` ou `decommissioned`; a ação é bloqueada enquanto houver Project ativo.

O backend exige a confirmação mesmo que alguém tente contornar a interface. Assim, a proteção não depende apenas do dialog.

### 4.5 Responsividade e acessibilidade operacional

A composição visual foi simplificada para se comportar como software de gestão:

- sidebar adaptativa e Inspector contextual em vez de múltiplas navegações concorrentes;
- tipografia, ícones e áreas de clique com piso de legibilidade;
- tabelas e matrizes densas usam overflow deliberado ou representação rotulada compacta;
- formulários e dialogs passam a uma coluna quando a largura não comporta duas;
- estados vazios explicam a próxima ação possível;
- ações críticas apresentam título, descrição, consequência, voltar e confirmar;
- animações ambientais contínuas, scans, miras, retículas, órbitas, ondas, linhas e medidores cenográficos sem função permanecem fora da interface.

Os testes automatizados verificam os contratos estruturais e responsivos. Eles não comprovam, sozinhos, a aparência final renderizada pelo Foundry.

## 5. Garantias técnicas verificadas

### Autoridade

- O Primary Active GM é a autoridade das mutações oficiais.
- GM secundário e jogador encaminham operações autorizadas pelo transporte do módulo; eles não criam uma fila oficial concorrente.
- Commands validam a permissão do caller, além de qualquer ocultação de controles feita pela interface.

### Idempotência e concorrência

- Receipts são associados a `operationId` e fingerprint do pedido.
- Retry compatível retorna o receipt persistido sem repetir o efeito.
- Reutilização incompatível do mesmo `operationId` gera conflito.
- Campos de revisão esperada impedem perda silenciosa de atualização concorrente.

### Integridade

- `entityId` permanece estável e referências novas usam tipo mais UUID/entityId.
- Preflight antecede operações multi-record relevantes.
- Falha parcial aciona compensação quando o provider permite restauração.
- Exclusões consultam dependências quando o tipo pode ser referenciado.
- Estados terminais são validados no command, não apenas na interface.

### Observabilidade

- Commands retornam receipts estruturados.
- Domain Events e History carregam operação, ator e entidades afetadas quando aplicável.
- Efeitos externos, como mensagem de chat de Event, ocorrem depois do commit confirmado.

## 6. Evidência automatizada disponível

O gate integral executado antes deste fechamento documental terminou com:

```text
tests: 394
pass:  394
fail:  0
```

A suíte cobre, entre outros pontos:

- contratos, permissões e revisão otimista;
- idempotência, concorrência, rollback e compensação;
- referências tipadas e preservação de identidade;
- Economy Flows;
- cancelamento e lifecycle de Mission;
- Events e History;
- transições terminais de Person, Squad e Structure;
- actions registradas, import do runtime e primeiro frame da shell;
- responsividade, legibilidade e regressões contra decoração descartada.

Durante o gate, a composição de CSS também foi reconstruída. Além da cobertura automatizada, a prévia local representativa foi inspecionada manualmente em `1280`, `1000`, `760` e `520` px, incluindo os estados GM/jogador de History e os novos dialogs. Não houve overflow horizontal indevido nem erros ou avisos no console do navegador.

## 7. Limites e riscos honestos

1. **Prévia local aprovada, mas sem validação no Foundry real.** Ainda é necessário abrir a candidata no Foundry VTT 13.351 e conferir diferenças do tema, foco, FilePicker e mensagens integradas ao ambiente.
2. **Sem smoke multiplayer real registrado neste fechamento.** A suíte simula autoridade, mas deve-se verificar um GM primário, um GM secundário e um jogador conectados ao mesmo mundo.
3. **Compensação não é ACID.** Um encerramento abrupto do processo entre escritas do provider pode impedir a restauração completa; backup continua recomendado antes de atualização.
4. **Schema v9 permanece.** Não há migration nova para a 0.2.0; isso reduz risco, mas não elimina a necessidade de testar um mundo existente e um mundo limpo.
5. **Lifecycle deliberado, não automação total.** Viagem/duração automática de Missions, mapa geográfico avançado e editor visual completo de Agreements multi-party complexos continuam fora do núcleo fechado nesta versão.
6. **A prévia local não substitui o tema ativo do Foundry.** Quebras, foco ou contraste introduzidos pelo ambiente hospedeiro só podem ser aprovados na instância real.

## 8. Roteiro de homologação

### Etapa A — gate local e pacote

1. Executar `npm test` em uma árvore limpa e confirmar que todos os testes passam.
2. Verificar sintaxe/imports do runtime e reconstrução de `styles/shell.css`.
3. Conferir que `package.json`, `module.json`, constante pública e nome do ZIP usam a mesma versão.
4. Inspecionar o ZIP e confirmar que não contém `node_modules`, arquivos temporários, preview local ou dados de desenvolvimento.
5. Calcular e registrar SHA-256 do pacote final.

### Etapa B — visual local representativo

A prévia local representativa foi revisada em `1280`, `1000`, `760` e `520` pixels, com atenção a:

- Overview e navegação global;
- lista e editor de Economy Flows;
- Mission Control e dialog de cancelamento;
- People e confirmação de morte/aposentadoria;
- Force Control e confirmação de dissolução;
- Infrastructure e confirmação de destruição/descomissionamento;
- Events, History, matrizes econômicas e estados vazios;
- foco, tecla `Escape`, ordem de tabulação, scroll e textos longos.

Resultado local: nenhum texto ou ícone saiu do container nos estados inspecionados, nenhuma ação crítica ficou inacessível, a visão de jogador omitiu registros restritos e nenhuma decoração cenográfica reapareceu. A largura de `380` px permanece coberta por contratos CSS automatizados, mas não substitui o ensaio no Foundry real.

### Etapa C — Foundry VTT com GM único

1. Fazer backup do mundo de teste.
2. Instalar o ZIP em uma pasta limpa e ativar `socketlib` e Domain Manager.
3. Abrir um mundo existente em schema v9 e um mundo novo.
4. Criar um Domain customizado, alterar capabilities e aparência, fechar e reabrir a aplicação.
5. Criar, editar e remover um Resource não utilizado.
6. Criar, editar e remover um Economy Flow e avançar a Simulation para conferir o efeito.
7. Executar os ciclos principais de Project/Structure, Squad/Mission, Population/People, Request, Relations/Agreement e Intel.
8. Aplicar um Domain Event, confirmar a mensagem única no chat e revisar History.
9. Testar cancelamento de Mission antes e depois do consumo de suprimentos.
10. Testar cada transição terminal, inclusive as guardas de Mission/Project ativo.

### Etapa D — multiplayer e concorrência

Usar um GM primário, um GM secundário e ao menos um jogador:

1. confirmar que comandos do jogador autorizado são encaminhados e aplicados uma única vez;
2. confirmar que jogador não autorizado recebe erro e não altera o Journal;
3. editar o mesmo objeto em dois clientes e verificar rejeição da revisão obsoleta;
4. repetir deliberadamente um `operationId` e verificar ausência de efeito duplicado;
5. trocar o GM primário ativo e confirmar que a autoridade passa ao novo host sem duas filas concorrentes;
6. observar Events, History e chat nos três clientes.

### Etapa E — backup e recuperação

1. exportar backup antes de mudanças destrutivas;
2. importar em mundo descartável e comparar contagens, identidades e vínculos;
3. reiniciar o Foundry após operações em batch e validar o estado reconstruído pelo índice;
4. manter o backup anterior até o mundo atualizado passar por uma sessão real.

## 9. Checklist de aceite

- [x] Command Kernel e bridges de compatibilidade consolidados nos fluxos-alvo.
- [x] Economy Flows editáveis pela interface.
- [x] `mission.cancel` com liberação consistente de Squads.
- [x] Events e History no caminho autoritativo.
- [x] Transições terminais protegidas no frontend e backend.
- [x] Gates automatizados: 394/394.
- [x] Schema preservado em v9.
- [x] Versão e URL do artefato final alinhadas em todos os metadados.
- [x] Inspeção visual local final da candidata concluída.
- [x] ZIP final inspecionado e hash registrado em arquivo lateral `.sha256`.
- [ ] Smoke test em Foundry VTT 13.351 concluído.
- [x] Smoke multiplayer real ainda não executado e assumido explicitamente como risco de lançamento.

## 10. Critério para promoção

A candidata pode ser empacotada como `0.2.0` quando o gate local continuar verde, os metadados e o ZIP estiverem coerentes e a inspeção visual não encontrar regressão bloqueadora.

A homologação em Foundry real e multiplayer deve ser registrada separadamente. Se a versão for distribuída antes desses dois testes, as duas pendências precisam acompanhar a release como risco conhecido, sem serem apresentadas como validações já executadas.
