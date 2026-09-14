# Implementação — Lote 06

Data: 2026-09-13  
Escopo: Resources / Economia e consolidação das correções visuais do dev.153

## Resultado

Este lote fecha a lacuna de administração do catálogo global de recursos e endurece os formulários econômicos contra sobrescritas concorrentes. Também incorpora no módulo local as correções visuais e de customização feitas no lote intermediário, garantindo que a continuidade do projeto parta de uma única base verificável.

## Catálogo de recursos

- A página **Recursos** separa **Catálogo** de **Políticas**.
- O GM pode criar e editar nome, unidade, casas decimais, categoria, marcadores e permissão de saldo negativo.
- O ID pode ser informado ou gerado na criação e fica imutável depois de persistido.
- Todas as mutações usam Commands canônicos, lock global, idempotência e eventos do domínio econômico.
- A versão do catálogo é capturada no formulário; uma tela antiga não sobrescreve uma edição mais recente.
- Falha ao persistir o receipt restaura o catálogo anterior.

## Exclusão e integridade referencial

- Antes de remover, o sistema procura referências ao `resourceId` em todos os registros persistentes.
- Recursos utilizados ficam bloqueados e o diálogo mostra quais registros precisam ser corrigidos primeiro.
- Recursos sem referências podem ser removidos somente após confirmação explícita.
- A precisão de recursos em uso não pode ser alterada, evitando reinterpretar quantidades salvas.

## Economia do domínio

- O formulário de estoques e políticas captura `expectedModifiedTime` ao abrir.
- Mudanças concorrentes no Domain são detectadas no backend e exigem reabrir o formulário.
- Unidades passam a acompanhar estoque, disponível, saldo, reserva e capacidade de forma consistente.
- Em largura compacta, a matriz estratégica vira cards rotulados; nenhum valor depende da posição de uma coluna comprimida.

## Consolidação visual e customização

- Corrigido o estilo global que impunha altura de campo a botões e desorganizava cards.
- Dialogs têm fundo opaco e hierarquia de texto legível.
- Intel não exibe onda falsa nem coluna de fonte na listagem principal; a fonte continua disponível no detalhe.
- Territory não usa mira, retícula nem barras segmentadas decorativas.
- Population possui estado vazio real sem tabela larga fantasma.
- Políticas e listas densas reorganizam-se como cards rotulados em janelas estreitas.
- O preset **Personalizado** mantém capabilities marcadas e mudanças manuais de capability convertem o preset para personalizado.
- Solicitações personalizadas persistem um rótulo humano próprio na criação, revisão e reenvio.

## Verificação

- Testes dedicados cobrem criação, edição, concorrência, idempotência, rollback, bloqueios por dependência e remoção segura do catálogo.
- Gates estáticos cobrem ações da interface, dialogs, cards responsivos e a consolidação visual do dev.153.
- Schema permanece **v9** e não exige migration.
- CSS consolidado reconstruído a partir de 8 módulos.
- `node --check`: **175 arquivos JS/MJS válidos**.
- `npm test`: **344 testes aprovados, 0 falhas**.
- Inspeção visual executada nos estados de catálogo, edição, remoção bloqueada, remoção permitida e políticas a 1000 px e 520 px.
- A inspeção identificou e corrigiu uma largura mínima legada na matriz de políticas; o estado final não apresenta rolagem lateral nem conteúdo recortado.

## Próximo lote sugerido

Prosseguir pela camada operacional de **Projects / Structures**, eliminando os caminhos legados de escrita que ainda não delegam integralmente ao Command Kernel e refinando os formulários mais densos com a mesma regra de revisão congelada.
