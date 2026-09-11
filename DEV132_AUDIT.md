# dev.132 — Squad MVP Audit

## Objetivo

Transformar `Squad` de contrato de dados em primeiro vertical slice operacional sobre a nova UI e o Command/Authority Kernel, sem alterar o schema v4 e sem reintroduzir lógica de domínio dentro da camada visual.

## Implementado

### Command lifecycle
- `squad.create` cria a unidade sob autoridade do Primary GM, inclusive quando solicitado por outro GM via socket.
- `squad.patch` permite ao GM ou controller atribuído modificar apenas campos operacionais: briefing, status, moral e condição.
- `squad.admin-update` restringe a GM capacidade, efetivo, nome e controllers.
- Todos usam o ledger de idempotência, TransactionQueue e EventBus do `dev.130`.
- Referências com UUID e `entityId` são cruzadas; divergência produz conflito.

### Ownership e controles
- Controllers persistidos no Squad também recebem ownership Foundry `OBSERVER`.
- Reatribuição administrativa sincroniza `governance.controllers` e ownership.
- Usuário não controlador não pode mutar o Squad.

### Force Control UI
- Página de Squads passou de leitura passiva para console operacional.
- Criação de unidade pelo GM dentro do Domain selecionado.
- Console de controle adaptado por papel: GM administra o contrato; controller opera o estado permitido.
- Telemetria de efetivo, moral, condição, missão, recursos, equipamento e composição.
- Identidade visual permanece no Design Language do `dev.131`, sem overlays/animação decorativa legada.

### Supply
- UI expõe o command `resources.transfer` já existente.
- GM pode transferir Domain→Squad e Squad→Domain.
- Controller não-GM só pode usar Squad→Domain, preservando a autoridade econômica da base.
- Quantidades de UI são convertidas para minor units de acordo com a precisão do Resource Catalog.

## Compatibilidade
- `SCHEMA_VERSION` permanece 4; nenhum contrato persistente precisou de migration.
- Domains/Squads antigos do schema v4 permanecem válidos.
- O kernel e a shell do `dev.131` foram preservados, com extensão vertical apenas nos pontos necessários.

## Testes adicionados
- Normalização de create/patch/admin payloads.
- Limites de capacidade/efetivo e enum de status.
- Command create com ownership.
- Patch de controller + retry idempotente.
- Rejeição de usuário não controlador.
- Reatribuição administrativa.
- Conflito UUID/entityId.

## Limites deliberados
- Composição e equipamento já existem no contrato, mas editor dedicado fica para uma expansão posterior do Squad, para não misturar múltiplos sistemas no mesmo milestone.
- Atribuição/resolução de Mission pertence ao `dev.133`.
- Ainda é necessário smoke test visual/multiplayer em Foundry VTT real.
