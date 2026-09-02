# Domain Manager — ponto limpo para reconstrução da interface

Esta edição remove a interface antiga e mantém o sistema de dados, regras,
persistência, sockets, hooks, simulação e integração com o Foundry.

## Estado atual

- A janela `ApplicationV2` abre com um shell mínimo e redimensionável.
- Não existem páginas, cards, tabs, formulários ou animações da UI anterior.
- As macros e a API pública continuam existindo.
- Chamadas de páginas ainda não reconstruídas abrem o shell na rota solicitada.
- As operações funcionais continuam em `scripts/features/`, `scripts/simulation/`,
  `scripts/data/` e `scripts/authority/`.

## Arquivos da nova base visual

- `scripts/ui/app.js`: fachada estável usada por lifecycle, macros e hooks.
- `scripts/ui/shell-app.js`: única classe da janela visual atual.
- `scripts/ui/launcher.js`: registro oficial do botão nos controles de cena.
- `templates/app-shell.hbs`: conteúdo mínimo da janela.
- `styles/shell.css`: somente regras estruturais mínimas.

## Fronteiras obrigatórias

1. `core`, `data`, `models`, `features`, `simulation`, `authority` e
   `integration` nunca importam `ui`.
2. Arquivos de `features` não criam dialogs, não consultam elementos HTML e não
   registram listeners de documento.
3. `ui` pode chamar `features`, mas não deve duplicar regras de negócio.
4. Persistência passa por `data/journal-store.js`.
5. Permissões e visibilidade ficam em `rules.js` ou `selectors.js`, nunca apenas
   no template.
6. Não usar listeners globais, injeção manual no DOM dos controles do Foundry ou
   alteração global de `DialogV2`.
7. CSS novo deve pertencer a um componente ou região identificável. Não acumular
   correções genéricas no final do arquivo.
8. Animações entram somente depois de estrutura, ações e responsividade estarem
   aprovadas.

## Contrato que não deve ser quebrado

`game.modules.get("domain-manager").api` deve continuar oferecendo:

- `open`
- `openDomainManager`
- `openDomain`
- `openDashboard`
- `openMyDomain`
- `openAdvanceRun`
- `openSimulationPreview`
- `rollDomainEvent`
- `openHelp`
- `status`

## Primeiro gate: testar apenas o shell

Antes de criar uma página, instale o ZIP e confirme:

1. O módulo inicia sem erro no console.
2. O botão aparece uma única vez no controle de Tokens.
3. O botão e o atalho abrem a mesma janela.
4. Uma segunda chamada apenas foca/renderiza a instância existente.
5. A janela fecha, reabre, move e redimensiona.
6. GM e jogador conseguem abrir o shell.
7. O rodapé mostra contagem de domínios e estado da autoridade.
8. As quatro macros abrem o shell sem lançar exceções.
9. Criar, atualizar ou apagar um Journal do módulo mantém o índice sincronizado.
10. Avanço de World Time continua disparando a integração existente.

## Ordem da reconstrução

Depois que o gate do shell passar:

1. Adicionar somente navegação e estado de rota.
2. Implementar uma lista de domínios apenas para leitura usando
   `features/domains/selectors.js`.
3. Implementar o detalhe de um domínio apenas para leitura.
4. Ligar uma única action de domínio e validar persistência/permissão.
5. Repetir por feature: economia, pessoas, projetos, missões, solicitações,
   relações, intel, histórico, condições e eventos.
6. Criar responsividade real.
7. Aplicar identidade visual.
8. Adicionar animações e detalhes finais.

Não crie todas as páginas de uma vez. Cada página deve ter um teste simples de
abertura, permissão, estado vazio, erro e atualização antes da próxima.

## Operações preservadas para a UI futura

- Domínios: `features/domains/actions.js`
- Mídia persistida: `features/domains/media.js`
- Economia: `features/economy/actions.js`
- Pessoas: `features/people/actions.js`
- Projetos: `features/projects/actions.js`
- Missões: `features/missions/actions.js` e `bridge.js`
- Solicitações: `features/requests/actions.js`
- Relações: `features/relations/actions.js`
- Intel: `features/intel/actions.js`
- Histórico: `features/history/actions.js`
- Condições: `features/conditions/actions.js`
- Eventos: `features/events/actions.js`
- Simulação: `simulation/simulate.js`
- Avanço real: `simulation/advance-run.js`

## Pendências funcionais que não são trabalho visual

Antes de considerar o módulo pronto para produção, investigar separadamente:

- desconto de custos progressivos/reservados durante a simulação e o avanço;
- remapeamento de UUIDs e ownership na importação para um mundo novo;
- uso ou descarte formal de `transaction-queue.js`, `exact-math.js` e
  `migration-pipeline.js`.

Esses arquivos foram preservados porque representam infraestrutura, não restos
da interface.
