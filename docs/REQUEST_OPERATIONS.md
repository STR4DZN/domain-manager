# Request Operations — dev.140

## Objetivo

Fechar o fluxo operacional de Requests já existente no projeto atual sem alterar o schema v9 ou inventar fulfillment automático.

## Fronteiras preservadas

- Request continua sendo registro independente e imutável após submissão pela UI.
- Somente o solicitante recebe `OBSERVER`; GM continua com autoridade global.
- Somente controlador do Domain (ou GM) pode criar Request para aquele Domain.
- Somente GM pode revisar Request.
- Revisão registra status, resumo e encaminhamento; não cria Mission, Project ou Agreement automaticamente.
- `withdrawn` e `fulfilled` continuam estados do modelo, mas esta versão não cria novos comandos para eles.

## Command Kernel

### `request.create`

- recebe referência tipada do Domain;
- usa `callerUserId` do envelope autoritativo como solicitante;
- valida controle do Domain;
- persiste a Request com `operationId` do comando;
- concede `OBSERVER` apenas ao solicitante;
- é idempotente pelo ledger global;
- possui rollback compensatório se a receipt não puder ser persistida.

### `request.review`

- GM-only;
- recebe referência tipada da Request;
- suporta `expectedModifiedTime` para impedir commit de formulário obsoleto;
- reutiliza `planRequestDecision()` do contrato existente;
- preserva `entityId` e ownership do solicitante;
- publica evento `request.reviewed`.

## Privacidade

A shell agora filtra `recordIndex.requestsForDomain()` por permissão `OBSERVER` antes do decode/view-model. Um jogador não recebe no contexto Requests pertencentes a outro jogador.

## UI

Requests integra o workspace **Command** como ferramenta universal do Domain:

- Request Queue master-detail;
- Request Dossier no Context Inspector;
- console de criação para operador controlador;
- console de revisão GM-only;
- trace de histórico e decisão;
- nenhum write direto da UI.

## Compatibilidade

O endpoint socket legado `request.create` é mantido para callers antigos, mas passa a encaminhar para o Command Kernel. A UI atual usa `command.execute` por `executeCommandAuthoritatively()`.
