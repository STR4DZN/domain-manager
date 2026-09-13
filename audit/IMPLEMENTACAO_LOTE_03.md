# Implementação — lote 03 de estabilização

Data: 2026-09-13  
Base: `domain-manager-v0.1.0-dev.150.zip`  
Escopo: ciclo completo de Missões, controle de Forças, logística, concorrência e limpeza visual das telas operacionais.

## Resultado

Este lote fecha os principais buracos funcionais de Missões e Forças: uma Mission planejada já não fica sem saída, o planejamento existente pode ser editado pela interface, efeitos relevantes deixaram de ocorrer no primeiro clique e formulários antigos não sobrescrevem silenciosamente um estado mais recente.

A implementação permanece na cópia de trabalho em `module-audit/domain-manager`. Nenhum comando deste lote escreveu no arquivo de origem em Downloads; no encerramento da etapa, porém, o caminho original informado já não estava presente no sistema e por isso não foi possível repetir a verificação final de hash/data do ZIP.

## Missões — planejamento editável

- A interface agora expõe `EDITAR` em Missions `planned` e `available`.
- O mesmo diálogo atende criação e edição, preservando identificação, briefing, audiência, observações e objetivos existentes.
- O salvamento de edição usa `mission.update`, continua GM-only e envia `expectedModifiedTime`.
- A substituição da lista de objetivos ocorre dentro da mesma atualização autoritativa; identificadores existentes são preservados por posição e novos objetivos recebem identidade própria.
- Objetivos não podem mais ser alterados ou removidos por comandos auxiliares depois do lançamento.
- O backend recusa edição de planejamento quando a Mission já está ativa ou terminal.
- O resumo operacional persistido agora aparece no card; antes, o template lia `description`, campo inexistente no modelo de Mission, e exibia conteúdo vazio.

## Missões — ciclo de vida

- Novo comando autoritativo `mission.publish`: promove exclusivamente `planned → available`.
- A ação `DISPONIBILIZAR` fecha o estado impossível em que uma Mission criada como planejada não tinha caminho de continuação.
- A publicação é GM-only, idempotente pelo Command Kernel, protegida por revisão e emite `mission.published`.
- `mission.launch` exige um snapshot completo dos Squads preparados. Esses Squads passam a fazer parte das chaves da transação, impedindo que lançamento e edição operacional concorram sem coordenação.
- `mission.resolve` exige um resultado único para cada Squad designado e um estado para cada objetivo atual; listas duplicadas, incompletas ou obsoletas são recusadas.
- Preparação, liberação, lançamento e resolução validam a revisão capturada na abertura do respectivo fluxo.

## Confirmações e efeitos irreversíveis

- `Liberar unidade` deixou de desfazer o vínculo imediatamente. O primeiro clique abre um resumo com Mission, Squad, efetivo e efeito sobre reservas.
- A confirmação de liberação preserva simultaneamente as revisões da Mission e do Squad.
- `Iniciar missão` deixou de consumir suprimentos imediatamente. O primeiro clique abre um resumo com quantidade de unidades, efetivo comprometido e recursos que serão debitados.
- A confirmação de lançamento preserva o snapshot de assignments e a revisão da Mission; qualquer mudança exige reabrir a confirmação.
- Recursos comprometidos são apresentados na unidade de exibição do catálogo, não como minor units internas.

## Forças e logística

- `squad.patch` e `squad.admin-update` agora normalizam e verificam `expectedModifiedTime`.
- O editor de Força envia a revisão do documento, tanto para GM quanto para controlador.
- A transferência de suprimentos aceita revisões independentes da origem e do destino.
- O diálogo de suprimentos envia as revisões do Domain e do Squad na direção correta; se qualquer estoque tiver mudado, a transferência é recusada antes de alterar saldos.
- Foi corrigido o rótulo duplicado `Resumo operacional operacional`.

## Recuperação visual e responsiva

- A mira/retículo decorativo foi removida do DOM dos cards de Mission.
- O espaço lateral agora mostra um resumo funcional de objetivos concluídos.
- As linhas cruzadas decorativas do indicador de efetivo dos Squads foram desativadas; o bloco mantém apenas a leitura real `efetivo/capacidade`.
- Ações do card aceitam quebra de linha e os botões ocupam largura útil em janelas estreitas.
- Os novos diálogos de confirmação usam texto legível, resumo semântico e layout empilhável abaixo de 720 px.
- O gerador de auditoria foi ampliado com vistas para Missions, Forças, editor de Mission, liberação, lançamento, resolução, editor de Squad e suprimentos, nas larguras 1280, 1000, 760 e 520 px.

## Validação

- Suíte automatizada integral: **308 testes aprovados, 0 falhas**.
- Casos novos cobrem publicação de Mission, edição atômica de objetivos, formulário obsoleto de Mission, snapshot incompleto no lançamento, formulário obsoleto de Squad e transferência com origem obsoleta.
- Testes estruturais confirmam que todos os `data-action` possuem handler, o template Handlebars continua balanceado e todos os fluxos de Mission usam comandos autoritativos.
- CSS modular recompilado com sucesso para `styles/shell.css`.
- A prévia determinística foi sincronizada em `audit/preview.html` e contém 21 vistas selecionáveis.
- A inspeção automatizada em navegador não pôde abrir a URL local porque a política de Browser Use bloqueia `file://` e proíbe contornos. A verificação deste lote ficou, portanto, em renderização bem-sucedida, testes estruturais/responsivos e revisão do HTML/CSS gerado; a prévia continua disponível para inspeção manual.
- Dependências usadas apenas para gerar a prévia foram removidas; não há `node_modules` nem `package-lock.json` residual.

## Limites desta etapa

- A edição compacta de objetivos trabalha com um objetivo por linha. Título pode ser alterado e linhas podem ser adicionadas/removidas, mas descrição e opcionalidade ainda não possuem controles individuais na UI.
- Ainda não existe um comando dedicado para cancelar uma Mission `planned` ou `available`; essa decisão precisa definir se assignments serão liberados automaticamente ou se o cancelamento será bloqueado até a liberação manual.
- A validação real de sockets, ownership, hooks, FilePicker e múltiplos usuários ainda requer Foundry VTT v13 com GM principal, GM secundário, controlador e observador conectados.
- Permanecem estilos históricos de retículo/telemetria no CSS legado, embora os elementos removidos já não sejam renderizados. A consolidação física das camadas deve ocorrer junto de uma comparação visual executável.

## Próximo lote recomendado

1. Tratar Pessoas, Relações, Acordos e Inteligência: confirmações de remoção, revisão otimista e dependências.
2. Definir e implementar cancelamento/arquivamento de Missions e dissolução segura de Squads.
3. Criar editor detalhado de objetivos, com descrição, opcionalidade, reordenação e confirmação de remoção.
4. Executar a matriz multiusuário dentro do Foundry VTT v13 e registrar screenshots de 1280, 1000, 760 e 520 px.
5. Consolidar CSS antigo somente depois que a comparação visual automatizada puder abrir a prévia local.
