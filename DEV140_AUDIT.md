# dev.140 — Request Operations Audit

## Baseline

- Fonte: `0.1.0-dev.139` preservada em `/mnt/data/domain-current/work139/domain-manager`.
- Baseline antes da alteração: **222/222 testes verdes**.
- Schema inicial: **v9**.

## Achado principal

Requests possuíam modelo, regras, ownership e socket de criação, mas ainda estavam fora do Command Registry moderno e sem interface operacional. A shell também agregava todas as Requests de um Domain sem aplicar a permissão `OBSERVER` antes do decode, o que seria uma fronteira de privacidade inválida assim que a view fosse exposta.

## Implementado

- `request.create` e `request.review` no Command Kernel.
- Eventos `request.created` e `request.reviewed`.
- Contratos tipados de create/review e resource locks.
- Rollback de criação caso a receipt de idempotência falhe.
- Compatibilidade do socket legado redirecionada para o Command Kernel.
- Filtro de ownership antes do decode da shell.
- Workspace Command → Requests.
- Request Queue, Request Dossier, console de criação e console GM de revisão.
- Testes de idempotência, rollback, permissão, stale revision, ownership e privacidade.

## Não implementado deliberadamente

- retirada (`withdrawn`) por comando novo;
- fulfillment (`fulfilled`) por comando novo;
- conversão automática em Mission, Project ou Agreement;
- alteração de schema/migration;
- edição do conteúdo submetido.

## Regressão pré-versionamento

Após a UI, a suíte detectou 1 contrato de navegação antigo que esperava `overview → history`. O teste foi atualizado para refletir Requests como ferramenta universal do workspace Command. Não houve falha de kernel ou persistência.

Resultado após correção: **231/231 testes verdes**.

## Arquivos críticos deliberadamente não alterados

- Domain model;
- migration pipeline;
- Simulation;
- Strategic Economy;
- Project execution/settlement;
- Structure commissioning;
- Defense rules/command.

## Gate final

- versão: `0.1.0-dev.140`;
- schema: **v9**;
- syntax check: **160 JS/MJS** válidos;
- JSON parse: **7/7** válidos;
- suíte versionada: **231/231**;
- ZIP candidata reextraída em diretório limpo: **231/231**;
- nenhuma migration nova;
- nenhum write direto de Request pela UI;
- privacidade de Requests coberta por teste de ownership/selector e contrato estático da shell.

A distribuição final é gerada a partir deste mesmo source tree após apenas a consolidação deste relatório.
