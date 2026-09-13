# Domain Manager DEV150 — auditoria do estado atual

Data: 2026-09-11  
Fonte: `domain-manager-v0.1.0-dev.150.zip`  
Escopo: leitura de arquitetura, suíte automatizada, contratos de CRUD e renderização local do template real com o bundle CSS real.

## Veredito

A base de domínio e simulação é valiosa e está consideravelmente mais madura que a camada de produto. O principal problema atual é a distância entre o que o kernel suporta e o que a interface realmente expõe, agravada por uma shell monolítica e por três gerações de CSS sobrepostas. A DEV150 não deve receber novas features estratégicas antes de um ciclo curto de estabilização funcional e reconstrução da shell.

Os 283 testes passam, mas isso não aprova o produto no Foundry: a maior parte dos testes valida contratos, strings, seletores e imports. Não existe um teste de ponta a ponta que abra a ApplicationV2, clique, preencha, persista, reabra e confirme o resultado.

## Arquitetura compreendida

- Bootstrap em `scripts/main.js`, dividido entre `init`, `setup`, `ready` e `socketlib.ready`.
- Persistência em `JournalEntry`, sob flags de `domain-manager`, com schema v9 e `entityId` estável.
- Índice em memória por tipo, UUID, `entityId` e relações, sincronizado por hooks de Journal.
- Autoridade central no GM primário, com socketlib para encaminhamento, fila transacional, idempotência, rollback compensatório e event bus.
- Entidades persistentes: Domain, Request, Project, Mission, Squad, Person, Structure e Agreement. Resource é catálogo global, não Journal.
- Domain é o aggregate estratégico; presets e capabilities determinam quais ferramentas ficam disponíveis.
- Simulation é determinística, usa aritmética exata/carry e integra economia, projetos, estruturas, acordos, população e crises.
- A interface é uma única ApplicationV2 em `scripts/ui/shell-app.js`, um único template Handlebars em `templates/app-shell.hbs` e um bundle de oito folhas CSS.

## Evidências visuais reproduzidas

### Janela 1000 × 552

- Shell útil: 1000 × 516.
- Sidebar transformada em cabeçalho: 171 px de altura.
- Topbar: 64 px.
- Toolbar do domínio: 62 px.
- Workspace restante: 218 px, apenas 42% da altura útil.
- Navegação: `clientWidth=1000`, `scrollWidth=1106`.
- Filhos do workspace ativo encolhem para 45–51 px de largura e 85 px de altura, quebrando palavras letra por letra.
- A causa imediata é a combinação de `overflow-wrap:anywhere` global com flex items comprimíveis e duas camadas responsivas concorrentes.

### Janela 1280 × 552

- No Comando, os cards de Domain começam em `y=540`, enquanto a área visível do workspace termina perto de `y=619`.
- O canvas conserva aproximadamente 175 px vazios antes dos cards porque o CSS antigo ainda centraliza o conteúdo (`place-items:center`) mesmo depois de ocultar os anéis/eixos.
- Em Infraestrutura, categorias longas e `entityId` ficam colados/quebrados no cabeçalho dos cards.
- Na largura ampla a tela é mais legível, mas a janela baixa continua colocando conteúdo operacional essencial abaixo da dobra.

## Falhas funcionais e lacunas de CRUD

### Defeitos concretos

1. Criação de Person lê o retorno incorretamente.
   - O kernel devolve `{ uuid, ... }` diretamente.
   - A UI usa `result?.result?.uuid`.
   - Efeito: a pessoa pode ser criada, mas não se torna a seleção atual, fazendo a ação parecer incompleta ou inconsistente.

2. Domain e mídia do Domain furam o Command Kernel.
   - Criação de Domain chama `createDomainAction` diretamente.
   - Aparência chama `updateDomainMediaFields` diretamente.
   - Ambas acabam no store, que só aceita o GM primário.
   - A UI, porém, habilita os controles para qualquer GM. Um GM secundário vê o botão e recebe erro de autoridade em vez de encaminhamento por socket.

3. O preset `custom` cria um Domain inutilizável.
   - O formulário oferece “Personalizado”.
   - O preset `custom` desliga todas as capabilities.
   - O formulário não oferece checkboxes de capabilities e não existe editor geral do Domain para ativá-las depois.

4. A busca promete mais do que executa.
   - Placeholder: “domínios, pessoas, projetos”.
   - Implementação: pesquisa apenas nome, descrição, categoria e tags de Domain e sempre abre o registro de Domains.

5. Estado transitório não é limpo de forma centralizada ao trocar de Domain.
   - A troca limpa apenas parte dos estados de Projects/Requests.
   - Editores de Person, mídia, Squad, Mission, Population, Territory, Relations e Intel podem continuar abertos ou reaparecer com o novo Domain.
   - Isso abre caminho para edição no contexto errado e para formulários que mudam de significado durante o uso.

6. Re-render global pode interromper formulários.
   - Todo create/update/delete de Journal invalida e re-renderiza a parte `main` da aplicação.
   - Os handlers também chamam `render()` explicitamente depois do comando.
   - Não existe store de rascunho dos formulários. Uma atualização concorrente pode destruir e recriar o DOM do modal, perdendo dados digitados ou produzindo flicker/race.

7. Exclusões expostas acontecem imediatamente.
   - Custo de Project, grupo populacional, Relation e Intel não têm confirmação nem pré-checagem visual de dependências.
   - Conflitos só aparecem como toast depois da tentativa.

### Matriz de capacidades da interface

| Área | Criar | Editar | Excluir/encerrar | Situação |
|---|---:|---:|---:|---|
| Domain | Sim | Não | Não | Ações de update/delete existem fora da shell, mas não são alcançáveis. |
| Aparência do Domain | — | Sim | Limpar campos manualmente | Caminho direto, fora do Command Kernel. |
| Capabilities/hierarquia/controllers/tags/state do Domain | Parcial na base, não na UI | Não | — | A maior parte da customização não está exposta. |
| Squad | Sim | Sim | Só status/lifecycle | Não há remoção física; isso pode ser correto, mas precisa ser explicitado. |
| Mission | Sim | Não pela UI | Resolve/falha; cancelamento não exposto | Commands de update e objectives existem, mas não estão conectados. |
| Structure | Sim | Sim | Só status/lifecycle | Sem fluxo explícito de decommission/destruição com impacto/referências. |
| Project | Sim | Sim | Cancelamento condicionado | Hard-delete é deliberadamente proibido; custo possui CRUD parcial. |
| Person | Sim | Sim | Não | Não existe command/UI de remoção ou aposentadoria guiada. |
| Grupo populacional | Sim | Sim | Sim | Fluxo mais completo, mas dependências de workforce só aparecem após erro. |
| Relation | Sim | Sim | Sim | Exclusão imediata, sem confirmação. |
| Agreement | Sim | Command existe, UI não | Status de término | `agreement.update` está órfão na interface. |
| Intel | Sim | Sim | Sim | Exclusão imediata, sem confirmação. |
| Condition | Commands completos | Commands completos | Commands completos | Nenhuma UI foi conectada. |
| Catálogo/flows de Resource | Ações legadas existem | Parcial | Ações existem | Console atual só altera estoque/políticas, não administra o catálogo completo. |
| Request | Sim | Review/lifecycle | Withdraw/fulfill | Sem correção estruturada após `needs-changes`. |

## Causa raiz da camada visual

O CSS atual não é uma implementação única; é uma sequência de correções sobre correções:

1. `base.css`, `navigation.css`, `views.css` e `dialogs.css` preservam a linguagem FUI antiga.
2. `usability.css` tenta resgatar tipografia e responsividade.
3. `recovery.css` tenta desfazer novamente elementos e medidas anteriores.
4. Regras de viewport (`@media`) e regras de largura da aplicação (`@container`) convivem e podem disparar combinações diferentes.
5. Elementos decorativos foram ocultos, mas a geometria que os acomodava continua ativa em vários lugares.

Resultado: o código contém anéis, retículas, miras, scopes, ladders e linhas falsas; parte está escondida, parte deixa espaços vazios e parte reaparece em composições específicas. Continuar adicionando overrides à `recovery.css` aumentará a imprevisibilidade.

## Plano recomendado

### Fase 0 — congelamento e reprodução

- Congelar features estratégicas novas.
- Criar uma branch de estabilização a partir da DEV150.
- Definir fixtures de mundo: vazio, pequeno, denso, GM primário, GM secundário e jogador controlador.
- Registrar erros reais do console Foundry e a sequência exata de cliques para cada falha.
- Adotar como matriz mínima: 520×700, 760×600, 1000×552, 1280×720 e 1600×900.

Critério de saída: cada problema possui passos reproduzíveis e resultado esperado.

### Fase 1 — consertar o contrato funcional antes do redesign

- Corrigir o retorno de Person create.
- Centralizar mudança de rota/Domain e limpar todo estado transitório.
- Encaminhar toda mutação por commands autoritativos, inclusive Domain e mídia.
- Decidir lifecycle versus hard-delete por entidade e deixar essa decisão explícita na UI.
- Conectar commands já existentes e hoje órfãos: Domain update, Mission update/objectives, Agreement update e Conditions.
- Completar o editor de Domain: nome, descrição, categoria, natureza, state, tags, controllers, hierarquias, preset, capabilities e mídia.
- Remover temporariamente o preset `custom` ou expor capabilities no mesmo fluxo.
- Adicionar confirmação e análise de dependências para operações destrutivas.
- Preservar rascunho de formulário ou suspender invalidação global enquanto um editor possui alterações não salvas.

Critério de saída: matriz CRUD/lifecycle aprovada no Foundry para GM primário, GM secundário e jogador autorizado.

### Fase 2 — reconstruir a shell sem cascata legada

- Não criar uma quarta camada de override.
- Substituir `app-shell.hbs` por partials por chrome, workspace, view e dialog.
- Dividir `shell-app.js` em router/state, selectors/view-models e controllers por feature.
- Recomeçar o CSS operacional com poucos arquivos canônicos e remover seletores FUI decorativos do DOM.
- Em 1000×552, usar uma única faixa de navegação de no máximo 48–52 px; workspace e ferramenta ativa viram seletor/overflow menu, não duas linhas simultâneas.
- Definir `white-space:nowrap`, `overflow-wrap:normal` e `flex:none` para chips de navegação; permitir scroll horizontal deliberado sem esmagamento.
- Remover o canvas do Comando e usar uma worklist/resumo real. Caso exista topologia verdadeira, renderizá-la apenas com relações reais.
- Separar categoria e ID nos cards com truncamento/tooltip, nunca concatenar ambos no mesmo fluxo estreito.
- Trabalhar com tokens mínimos: tipografia, spacing, surface, border, color e hit target.

Critério de saída: nenhuma palavra quebrada letra por letra, nenhum conteúdo essencial abaixo da dobra por chrome excessivo, nenhuma geometria sem dado real.

### Fase 3 — testes de produto

- Testes de DOM/render real para cada view e breakpoint.
- Testes de formulário: abrir, preencher, salvar, reabrir e confirmar persistência.
- Testes de conflito e rerender concorrente.
- Testes de autorização com GM primário/secundário e controllers.
- Screenshots de regressão visual com fixtures determinísticas.
- Auditoria de acessibilidade: nomes de botões de ícone, foco, Escape, navegação por teclado, contraste e alvo mínimo.

Critério de saída: além da suíte unitária, um smoke E2E reproduz os fluxos de CRUD/lifecycle no runtime Foundry suportado.

### Fase 4 — continuar features

Somente depois das fases anteriores: evoluir regras, relatórios, automações e visualizações estratégicas. A UI não deve novamente ficar atrás do kernel.

## Primeiro lote sugerido

Uma primeira entrega pequena e verificável deveria conter:

1. Correção de Person create e reset completo de contexto.
2. Command autoritativo para Domain create/update/media/archive.
3. Editor completo de Domain e tratamento seguro de `custom`.
4. Navegação compacta de uma linha em 1000×552.
5. Remoção do canvas/ornamentos residuais do Comando.
6. Testes E2E dos fluxos acima no Foundry real.

Esse lote resolve os sintomas mais graves sem alterar schema, economia ou simulação.
