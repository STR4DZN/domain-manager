# Request Lifecycle Closure — dev.142

## Objetivo

Fechar de forma explícita os estados `withdrawn` e `fulfilled` que já existiam no `RequestModel`, sem alterar schema v9 e sem inventar bridges para Project/Agreement.

## Novos comandos

### `request.withdraw`

Permitido somente ao próprio solicitante enquanto a Request estiver em `submitted`, `under-review` ou `needs-changes`.

Regras:
- não aceita Request com `resultUuid`;
- preserva ownership e identidade;
- registra history `withdrawn`;
- suporta stale-revision check e rollback compensatório.

### `request.fulfill`

Permitido somente ao GM para Request `approved`.

Evidência aceita nesta versão:
- `handling=immediate`: encerramento explícito pelo GM, sem `resultUuid`;
- `handling=mission`: a Mission apontada por `resultUuid` precisa existir, possuir `origin.kind=request`, apontar de volta para a Request e estar `resolved`.

Não é fulfillment válido:
- Mission `failed`, `cancelled`, `active` ou `available`;
- `handling=none`;
- `handling=project` ou `agreement` sem bridge canônico próprio.

## Invariantes adicionais

- `request.review`, `request.create-mission`, `request.withdraw` e `request.fulfill` usam o mesmo lock transacional da Request.
- Request `withdrawn` ou `fulfilled` não pode ser reaberta por review.
- Request com `resultUuid` materializado também não pode ter routing/status reabertos pelo review genérico.
- Mission failed mantém a Request `approved` e não a transforma silenciosamente em `fulfilled`. Uma futura política explícita de retry/replan pode tratar esse caso.

## UI

O Request Dossier passa a oferecer:
- **WITHDRAW REQUEST** somente ao solicitante em estados retiravéis;
- **MARK FULFILLED** somente ao GM quando a evidência suportada já existe;
- estado da Mission vinculada quando aplicável.

A UI não grava estado diretamente; ambos os caminhos usam o Command Kernel.

## Fora de escopo

- Request → Project;
- Request → Agreement;
- retry/replan automático após Mission failed;
- fulfillment automático por evento;
- schema/migration novo.
