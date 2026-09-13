# Implementação — lote 01 de estabilização

Data: 2026-09-12  
Base: `domain-manager-v0.1.0-dev.150.zip`  
Escopo: fluxo de Domínios, troca de contexto e primeira recuperação visual/responsiva.

## Resultado

Este lote transforma Domínio em uma entidade editável pelo mesmo caminho autoritativo usado pelos demais subsistemas e remove a principal composição cenográfica da tela de Comando. A cópia de trabalho foi alterada; o ZIP original permaneceu intacto.

## Funcionalidade entregue

- Comandos autoritativos `domain.create`, `domain.update` e `domain.media.update`, com validação de GM, fila transacional, eventos, rollback e resultado normalizado.
- Criação e edição de Domínio com identidade, descrição, categoria, natureza, estado, tags, controladores, hierarquia e perfil de gerenciamento.
- Capabilities configuráveis de verdade, inclusive combinação personalizada, em vez de um preset "custom" sem controles.
- Edição da aparência encaminhada pelo Command Kernel, sem gravação direta pela camada de UI.
- Correção da seleção automática de uma Pessoa recém-criada, que antes consultava um resultado com formato incorreto.
- Limpeza centralizada de todo estado transitório ao trocar de Domínio, evitando editar no domínio novo uma entidade selecionada no domínio anterior.
- Seletor compacto de área de trabalho e listener funcional para navegação responsiva.

## Recuperação visual entregue

- A tela de Comando agora é uma worklist operacional baseada em Domínios, missões e contagens reais.
- Foram removidos dessa tela radar, anéis, eixos, mira, linhas e percentuais decorativos sem significado funcional.
- A navegação compacta preserva palavras inteiras e usa rolagem horizontal deliberada quando necessário.
- A tabela de Domínios vira cartões compactos abaixo de 720 px, sem largura mínima forçada.
- O editor de Domínio usa duas colunas em viewport amplo e uma coluna em viewport estreito.
- O rodapé de diálogos sem telemetria permanece dentro da janela, deixando as ações Cancelar/Salvar sempre acessíveis.
- A quebra de texto global deixou de usar `overflow-wrap:anywhere`, reduzindo palavras partidas de forma agressiva.

## Validação

Matriz visual conferida na prévia local:

| Largura do módulo | Navegação | Painel de Comando | Editor de Domínio |
| --- | --- | --- | --- |
| 1000 px | sem overflow | grade íntegra | duas colunas, sem overflow horizontal, rodapé visível |
| 760 px | rail horizontal, sem palavras verticais | sem overflow do workspace | uma coluna, rodapé visível |
| 520 px | rail horizontal, sem palavras verticais | cartões compactos, sem overflow | uma coluna, botões em largura total, rodapé visível |

Suíte automatizada: **291 testes aprovados, 0 falhas**.

## Limites desta etapa

- A validação de runtime foi feita com mocks e renderização local. Ainda é necessária uma rodada dentro de uma instalação licenciada do Foundry VTT para validar FilePicker, hooks reais, sockets entre clientes e persistência de JournalEntry no ambiente final.
- Outras telas ainda contêm elementos decorativos históricos ou CSS legado apenas ocultado pela camada de recuperação. Eles devem ser removidos progressivamente, sem uma reescrita total de uma vez.
- Exclusão de Domínio não entrou neste lote porque requer uma política explícita para dependências: bloquear, reatribuir ou excluir em cascata registros ligados.

## Próximo lote recomendado

1. Definir e implementar a política segura de exclusão de Domínio, com prévia das dependências afetadas.
2. Auditar criação/edição/exclusão de Projetos, Estruturas, Missões, Forças, Pessoas, Relações, Acordos e Inteligência pelo mesmo checklist funcional.
3. Remover do DOM as decorações residuais das telas restantes e consolidar CSS duplicado entre as camadas base, usability e recovery.
4. Executar testes multiusuário no Foundry: GM principal, GM secundário, controlador e observador.

