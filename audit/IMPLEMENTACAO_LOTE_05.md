# Implementação — Lote 05

Data: 2026-09-13  
Escopo: Condições e Solicitações

## Resultado

Este lote transforma duas áreas incompletas em fluxos operacionais seguros e editáveis. Condições ganhou uma página própria com criação, edição, ativação, desativação e remoção confirmada. Solicitações ganhou correção e reenvio pelo autor quando o Mestre solicita ajustes.

## Condições

- Nova entrada **Condições** no workspace de Gestão.
- Resumo com total, ativas, graves, temporárias e indefinidas.
- Lista legível com nome, descrição, gravidade, categoria, duração, estado e ações.
- Criação e edição exclusivas do GM.
- Ativação e desativação reversíveis diretamente na lista.
- Remoção permanente exige confirmação explícita.
- Todas as mutações verificam `expectedModifiedTime`; uma tela antiga não sobrescreve alterações mais recentes.
- A Visão geral e o painel de contexto exibem somente condições ativas.
- Corrigido o erro que deixava o nome do alerta vazio (`name` era lido como `label`).
- Categorias apresentadas em português.

## Solicitações

- Novo comando canônico `request.resubmit`.
- O próprio solicitante pode corrigir tipo, título, intenção e detalhes quando o estado é `needs-changes`.
- O reenvio preserva identidade, operação original, domínio, autoria e histórico.
- A decisão anterior do GM permanece no histórico; o encaminhamento atual é limpo e a solicitação volta a `submitted`.
- O GM não pode aprovar diretamente uma solicitação enquanto ela aguarda correção.
- Revisão e reenvio usam a revisão capturada na abertura do formulário.
- Novo formulário **Corrigir e reenviar**, preenchido com o conteúdo anterior e com o retorno do GM visível.
- Textos da criação foram corrigidos: o conteúdo não é mais descrito como permanentemente travado.
- A fila e o painel de detalhes receberam escala tipográfica mais legível.

## Segurança e consistência

- Conditions e Request continuam usando exclusivamente o Command Kernel.
- Locks de review, resubmit, materialização e lifecycle convergem para a mesma Request.
- Rollback testado para falha ao persistir o receipt do reenvio, inclusive restauração do título.
- Conditions continuam GM-only no backend e na interface.
- Ações destrutivas de Conditions usam confirmação e revisão congelada.

## Responsividade e validação visual

- A página de Condições reorganiza os indicadores em 3, 2 ou 1 coluna conforme a largura.
- A tabela mantém colunas legíveis com rolagem horizontal controlada em janelas estreitas.
- Formulários de Solicitações e Condições reorganizam os campos em coluna única a 520 px.
- Confirmação de remoção permanece integralmente visível a 520 px.
- Prévia ampliada de 28 para 35 estados, incluindo Requests e Conditions.
- Inspeção visual executada a 1000 px e 520 px.

## Verificação

- CSS consolidado reconstruído a partir de 8 módulos.
- `npm test`: **328 testes aprovados, 0 falhas**.
- Nenhuma dependência temporária, `node_modules` ou `package-lock.json` permaneceu no módulo.

## Próximo lote sugerido

Continuar com **Resources / Economia**, priorizando formulários de estoque e políticas, proteção de revisão em todos os pontos de edição, linguagem de unidades consistente e redução dos trechos visuais ainda densos.
