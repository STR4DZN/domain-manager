# Squad MVP

## Fluxo

```text
GM / Assistant UI
  -> squad.create
  -> Primary GM Command Kernel
  -> Journal store
  -> Squad indexado sob Domain
  -> Controllers = OBSERVER

Controller
  -> squad.patch
  -> Primary GM
  -> valida governance.controllers
  -> aplica estado operacional
```

## Campos operáveis por Controller
- `description`
- `status`
- `morale`
- `condition`

## Campos administrativos
- nome do documento
- controllers / ownership
- capacity
- strength
- todos os campos operacionais

Somente GM pode alterar o contrato administrativo.

## Suprimentos

A UI não altera `resources` diretamente. Toda movimentação usa `resources.transfer` para preservar saldo, permissão, idempotência e compensação.

- GM: Domain ↔ Squad.
- Controller: Squad → Domain.
- Controller sem controle do Domain não pode retirar estoque estratégico.
