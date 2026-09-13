# Implementação — lote 02 de estabilização

Data: 2026-09-12  
Base: `domain-manager-v0.1.0-dev.150.zip`  
Escopo: exclusão segura de Domínio, integridade de Projetos/Estruturas e validação visual dos fluxos críticos.

## Resultado

Este lote fecha a primeira política segura de exclusão física do módulo e corrige falhas de concorrência e ciclo de vida em Projetos e Estruturas. A cópia de trabalho foi alterada; o ZIP original permaneceu intacto.

## Exclusão segura de Domínio

- Novo comando autoritativo `domain.delete`, registrado no Command Kernel e protegido pela mesma fila transacional e pelo ledger idempotente das demais mutações.
- Confirmação exata pelo `entityId` atual do Domínio.
- Controle de concorrência por `expectedModifiedTime`; um formulário antigo não exclui uma versão mais recente do registro.
- Inventário recalculado dentro da seção crítica antes da exclusão. A operação é bloqueada quando existe qualquer referência ao Domínio.
- Scanner cobre hierarquia, Projetos, Estruturas, Missões, Solicitações, Forças, Pessoas, Acordos independentes e legados, Relações, Território e Inteligência.
- Modal possui dois estados explícitos: bloqueado, com agrupamento das dependências e destinos de correção; e liberado, com confirmação textual obrigatória.
- Se a receipt do ledger não puder ser persistida após a remoção, o JournalEntry é recriado com o mesmo `_id`, nome, pasta, ownership e flags.
- O caminho legado de hard-delete direto foi removido para impedir gravações fora do kernel.

## Projetos

- Formulários de edição e custo agora enviam a revisão capturada na abertura, ativando o controle de concorrência já existente no backend.
- `expectedModifiedTime` é normalizado como número nos contratos, inclusive quando vem de um campo HTML.
- A remoção de custo deixou de acontecer no primeiro clique: agora abre uma confirmação com recurso, modo e total.
- A confirmação de remoção preserva a revisão original; se o Projeto mudar durante o diálogo, o comando recusa a operação.
- Um Projeto com progresso registrado não pode voltar ao estado `planned`, nem pelo backend nem pelo seletor da interface.
- Rótulos de modo foram padronizados para `RESERVADO` e `PROGRESSIVO`.
- Hard-delete de Projeto continua desativado por decisão de integridade; o encerramento permanece representado pelo lifecycle `cancelled`.

## Estruturas

- `structure.patch` e `structure.admin-update` agora aceitam e validam `expectedModifiedTime`.
- O editor envia a revisão capturada e impede sobrescrita silenciosa por formulário obsoleto.
- Estrutura com `activeProject` precisa permanecer `planned`; somente a simulação pode comissioná-la ao concluir o Projeto e limpar o vínculo.
- `maintenancePriority`, já existente no modelo e usada pela simulação, foi adicionada aos formulários de criação e administração.
- Atualizações legadas que não enviam `maintenancePriority` preservam o valor persistido em vez de redefini-lo silenciosamente para 50.

## Recuperação visual e responsiva

- Novo diálogo compacto de confirmação de custo, com resumo em três colunas e empilhamento em largura estreita.
- Os estados bloqueado/liberado da exclusão de Domínio usam hierarquia visual de alerta, resumo do registro e ações persistentes no rodapé.
- A navegação compacta continua rolável por gesto/trackpad, mas não exibe mais a barra horizontal que ocupava espaço e poluía a interface.
- O renderizador de auditoria ganhou vistas dedicadas para editor de Domínio, exclusão bloqueada, exclusão liberada, editor de Projeto, confirmação de custo e editor de Estrutura.
- Inspeção em navegador local confirmou composição compacta em 520 px, rolagem interna dos formulários, ações em largura total e ausência de texto escapando dos novos diálogos.

## Validação

- Suíte automatizada integral: **302 testes aprovados, 0 falhas**.
- Casos novos cobrem bloqueio por dependência, confirmação exata, retry idempotente, rollback de exclusão, formulário obsoleto de Estrutura, bloqueio de comissionamento manual, regressão inválida de Projeto e contratos estruturais da UI.
- Os logs de erro exibidos durante a suíte correspondem a casos negativos intencionais de permissão, validação e conflito.
- CSS modular recompilado com sucesso para `styles/shell.css`.

## Limites desta etapa

- A validação visual foi feita com o template real, CSS compilado e contexto representativo em navegador local. FilePicker, hooks, sockets, permissões de Document e persistência real ainda precisam de uma rodada dentro do Foundry VTT v13.
- A política atual de exclusão de Domínio é conservadora: toda dependência bloqueia a operação. Fluxos de reatribuição em massa ou cascata não foram adicionados porque exigem decisões explícitas para cada tipo de entidade.
- Relações, Acordos, Inteligência, Missões, Forças e Pessoas ainda precisam do mesmo passe sistemático sobre exclusões imediatas, confirmação, revisão otimista e lifecycle.
- Ainda existe CSS histórico duplicado entre camadas antigas e `recovery.css`; a consolidação deve ser incremental e acompanhada por comparação visual.

## Próximo lote recomendado

1. Auditar e corrigir Missões e Forças: preparo, lançamento, resolução, liberação de recursos e estados terminais.
2. Auditar Pessoas, Relações, Acordos e Inteligência, substituindo remoções imediatas por confirmação e revisão otimista onde houver perda de dados.
3. Consolidar os estilos responsivos duplicados e remover do DOM os radares/miras residuais do inspector e das telas ainda não recuperadas.
4. Executar uma matriz multiusuário no Foundry: GM principal, GM secundário, controlador e observador, incluindo desconexão/retry de socket.
