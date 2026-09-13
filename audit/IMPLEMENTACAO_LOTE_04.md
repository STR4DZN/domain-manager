# Implementação — lote 04 de estabilização

Data: 2026-09-13  
Base: cópia de trabalho extraída da `domain-manager-v0.1.0-dev.150`  
Escopo: População, Pessoas, Relações, Acordos, Inteligência, confirmações destrutivas, concorrência otimista e remoção de ornamentação residual.

## Resultado

Este lote fecha os caminhos paralelos de gravação que ainda existiam nas áreas civil e estratégica, protege formulários contra sobrescritas silenciosas e transforma remoções ou mudanças irreversíveis em operações de duas etapas. A interface deixa claro quando uma ação elimina dados, preserva entidades relacionadas ou leva um registro a um estado terminal.

Também foram removidos do template os principais elementos cenográficos remanescentes das telas tratadas neste lote: mira de registro, faixa binária, esquema logístico falso, onda de identificação e radar do inspetor. A recuperação não depende apenas de ocultá-los por CSS; esses elementos já não fazem parte do DOM renderizado.

## População e força de trabalho

- Configuração geral de População, criação/edição de grupo, remoção de grupo e matriz de força de trabalho agora enviam `expectedModifiedTime`.
- Os contratos normalizam a revisão recebida de campos HTML e recusam valores inválidos.
- Os comandos conferem a revisão dentro do caminho autoritativo antes de persistir qualquer mudança.
- Um editor aberto sobre uma versão antiga do Domain recebe conflito explícito, em vez de apagar uma atualização mais recente.
- A edição de um grupo identificado por `localId` não pode recriá-lo silenciosamente se ele tiver sido removido enquanto o formulário estava aberto.
- A remoção de grupo deixou de acontecer no primeiro clique. A interface apresenta nome, população, elegíveis para trabalho e alocações conhecidas antes de solicitar confirmação.
- O diálogo mantém a revisão capturada quando foi aberto; a operação é recusada se o Domain mudar antes da confirmação.
- As ações legadas de População passaram a ser adaptadores do Command Kernel e não conservam um segundo caminho direto para `updateRecord`.

## Pessoas

- A edição de Person agora carrega e envia sua revisão persistida.
- O backend rejeita formulário obsoleto antes de aplicar alterações.
- Os antigos “Notables” embutidos no Domain foram declarados somente leitura. Criar, editar ou remover por esse modelo antigo produz uma orientação explícita de migração para a entidade Person independente.
- Essa restrição evita que a mesma pessoa conceitual seja alterada por dois modelos de persistência incompatíveis.
- A página continua operando no modelo mestre–detalhe e o editor preserva o estado sistêmico real da Person.

## Relações diplomáticas

- Criação, edição e remoção de Relation agora usam revisão otimista do Domain.
- Uma relação removida durante a edição não pode ser recriada silenciosamente pelo formulário antigo.
- A remoção exige confirmação e explica que apenas o vínculo diplomático local será excluído; Acordos independentes permanecem preservados.
- O texto da interface foi uniformizado em português e o resumo apresenta contraparte, postura e efeito sobre os acordos.
- As ações legadas continuam disponíveis como adaptadores para compatibilidade, mas delegam a mutação ao Command Kernel.

## Acordos

- Atualização e mudança de status de Agreement agora recebem `expectedModifiedTime`.
- Um Agreement alterado desde a abertura do formulário não pode ser sobrescrito por uma versão antiga.
- `terminated` passou a ser um estado terminal real: um acordo encerrado não pode ser reativado como se a renegociação fosse o mesmo registro.
- A interface oculta ações de reativação em registros encerrados e orienta que uma renegociação gere um novo acordo.
- O encerramento exige confirmação específica, com estado atual, estado de destino e aviso de irreversibilidade.
- Acordos independentes continuam sendo o modelo gravável. O array legado embutido em Domain foi mantido apenas para leitura/migração, eliminando o write path paralelo.

## Inteligência

- Criação/edição, remoção e revelação de Intel agora carregam a revisão do Domain.
- Uma Intel removida enquanto o editor estava aberto não pode reaparecer por salvamento obsoleto.
- A edição comum não pode tornar pública uma informação controlada. Publicação ocorre exclusivamente pela ação dedicada `Revelar`.
- Uma informação já pública/revelada não pode voltar a ser privada por edição comum.
- Remover e revelar deixaram de executar no primeiro clique e compartilham um fluxo explícito de confirmação.
- O editor perdeu o checkbox ambíguo de revelação e passou a mostrar uma explicação operacional sobre a ação separada e irreversível.

## Concorrência e integridade

Os quatro conjuntos tratados seguem agora o mesmo padrão:

1. a UI captura a revisão do registro exibido;
2. o contrato normaliza essa revisão;
3. o comando a confere dentro da fila autoritativa;
4. uma divergência encerra a operação com conflito, sem persistência parcial;
5. edições identificadas não convertem ausência em criação acidental.

Esse padrão reduz especialmente os erros causados por dois GMs, por rerender global ou por um formulário mantido aberto enquanto outro cliente altera o mesmo registro.

## Recuperação visual e responsiva

- Foram removidos do template `dm-registry-scope`, retículo e faixa binária de registro.
- O falso esquema de rota logística, seu caminho e sua legenda foram removidos.
- A onda decorativa da identificação de Person foi removida.
- O radar decorativo do inspetor lateral foi removido.
- Quatro novos estados de confirmação foram adicionados: remoção de grupo populacional, remoção de relação, encerramento de acordo e remoção/revelação de inteligência.
- O gerador de auditoria agora contém **28 vistas selecionáveis**, cobrindo também os estados principais entregues nos lotes anteriores.
- O resumo dos modais usa container query baseada na largura real do módulo, não apenas na largura externa do navegador.
- Em 520 px, cabeçalho, corpo, resumo e rodapé permanecem contidos. Na medição final, o diálogo apresentou `clientWidth=508` e `scrollWidth=508`; o resumo apresentou `clientWidth=480` e `scrollWidth=480`.
- Os três campos do resumo são empilhados na largura estreita, impedindo o corte de rótulos como `PRESERVADOS`.
- A descrição do cabeçalho quebra em linhas completas, enquanto títulos longos usam truncamento deliberado sem deslocar o botão de fechar.

## Validação automatizada

- Suíte integral: **319 testes aprovados, 0 falhas, 0 cancelados, 0 ignorados**.
- Duração da execução final: aproximadamente **4,8 s**.
- O lote acrescentou 11 testes em relação ao encerramento do lote 03.
- Casos novos cobrem revisão obsoleta de Population, Person, Relation, Agreement e Intel.
- Há regressões específicas contra recriação silenciosa de grupo, relação e informação removidos.
- Há testes para Agreement terminal, publicação de Intel apenas pela ação dedicada e bloqueio dos write paths legados.
- Testes estruturais verificam as novas confirmações, campos de revisão e ausência dos ornamentos removidos no template.
- Uma regressão dedicada protege a container query e a contenção das trilhas internas dos modais críticos.
- Todos os `data-action` do template continuam ligados a handlers válidos da ApplicationV2.
- Os logs de erro emitidos durante a suíte são cenários negativos intencionais de permissão, validação, ausência e conflito.
- O bundle modular foi recompilado com sucesso para `styles/shell.css`.
- As dependências temporárias usadas para renderizar a prévia foram removidas; não há `node_modules` nem `package-lock.json` residual.

## Validação visual

A prévia determinística foi servida localmente por HTTP e inspecionada no navegador com o template real e o bundle CSS compilado.

- Relação — remoção em 520 px: resumo empilhado, texto completo, ações visíveis e nenhum overflow interno.
- Acordo — encerramento em 520 px: estado atual/destino legíveis, aviso terminal e ação final contida.
- Inteligência — revelação em 520 px: visibilidade atual/destino legíveis, aviso irreversível e nenhum elemento com largura rolável maior que seu contêiner.
- A inspeção programática confirmou igualdade entre `clientWidth` e `scrollWidth` do diálogo e do resumo nos estados críticos.

## Arquivos centrais alterados

- `scripts/features/people/contracts.js`
- `scripts/features/people/commands.js`
- `scripts/features/people/actions.js`
- `scripts/features/relations/contracts.js`
- `scripts/features/relations/commands.js`
- `scripts/features/relations/actions.js`
- `scripts/features/intel/contracts.js`
- `scripts/features/intel/commands.js`
- `scripts/features/intel/actions.js`
- `scripts/ui/shell-app.js`
- `templates/app-shell.hbs`
- `styles/app/dialogs.css`
- `styles/shell.css`
- `audit/render-preview.mjs`
- `audit/preview.html`
- `tests/people-commands.test.mjs`
- `tests/territory-diplomacy-intel-commands.test.mjs`
- `tests/civil-ui.test.mjs`
- `tests/strategic-intelligence-ui.test.mjs`

## Limites desta etapa

- Não foi executado um Foundry VTT v13 real com múltiplos clientes. Sockets, ownership, FilePicker, hooks e invalidações entre GM principal, GM secundário, controlador e observador ainda precisam dessa matriz de runtime.
- Person ainda não possui um lifecycle explícito de aposentadoria, desaparecimento ou falecimento; hard-delete não deve ser introduzido sem definir efeitos sobre referências históricas.
- Mission ainda não possui cancelamento/arquivamento dedicado, Squad não possui dissolução guiada e os objetivos de Mission ainda usam o editor compacto de uma linha.
- Conditions possuem comandos completos, mas continuam sem console operacional na shell.
- A administração do catálogo e dos fluxos de Resource continua parcial; o console atual prioriza estoque e políticas.
- Request ainda precisa de um fluxo claro de correção e reenvio depois de `needs-changes`.
- O template e o controller principal continuam grandes. A estabilização funcional reduziu o risco, mas não substitui a divisão futura em partials e controllers por feature.
- Ainda há seletores históricos no CSS que já não possuem elemento renderizado. Sua remoção física deve ser incremental e acompanhada pela prévia visual para evitar regressões.
- O arquivo ZIP original informado no início não estava disponível para uma nova conferência ao fechar este lote; a validação foi realizada sobre a cópia de trabalho já extraída.

## Próximo lote recomendado — lote 05

O próximo passo mais valioso é fechar as áreas operacionais que o kernel já suporta, mas que a interface ainda não entrega por completo:

1. **Conditions:** criar console completo de criação, edição, ativação/desativação e remoção, com revisão, confirmação e referências reais.
2. **Resources:** separar catálogo, estoque, políticas e fluxos; completar o CRUD administrativo do catálogo sem permitir identidade mutável ou saldos incoerentes.
3. **Requests:** implementar correção e reenvio depois de `needs-changes`, preservando histórico, autoria e revisão.
4. **Lifecycle administrativo:** definir aposentadoria de Person, dissolução de Squad e cancelamento/arquivamento de Mission antes de expor qualquer exclusão física.
5. **Arquitetura da shell:** começar a extrair partials e controllers das áreas já estabilizadas, removendo seletores CSS órfãos com comparação nas 28 vistas.
6. **Foundry real:** preparar uma matriz de smoke tests com GM principal, GM secundário, controlador e observador; registrar persistência, sockets, rerender concorrente e permissões.

### Ordem sugerida dentro do lote 05

Começar por Conditions e Requests, porque os comandos principais já existem e o ganho de produto é alto com risco de domínio relativamente baixo. Em seguida, tratar Resource como uma área separada, pois catálogo, estoque e fluxo possuem regras de identidade e simulação que exigem uma revisão mais cuidadosa. A extração arquitetural deve acompanhar cada tela estabilizada, sem uma reescrita total da shell de uma só vez.
