# dev.134.1 — Runtime Boot Audit

## Incidente
O primeiro render da nova shell podia lançar `ReferenceError: Cannot access 'editingStructure' before initialization`. A causa era uma leitura direta da variável antes da declaração `const`, dentro da mesma execução de `_prepareContext()`. Isso é uma Temporal Dead Zone (TDZ) e não é detectada por `node --check`.

## Correção
`structureStatusOptions` e `structureOperatorStatusOptions` agora são derivados somente depois de `editingStructureRecord`, `structures` e `editingStructure` existirem.

## Novas barreiras
- first-frame context smoke test;
- import smoke de todos os módulos runtime;
- verificação de actions Handlebars ↔ ApplicationV2;
- detecção de ciclos ESM estáticos;
- varredura AST externa para TDZ direta.

## Resultado da auditoria
- 118/118 testes no hotfix;
- 93/93 módulos runtime importam sem ReferenceError de inicialização;
- 0 ciclos de import estático;
- 0 achados TDZ diretos em 121 JS/MJS;
- crash reportado pelo usuário reproduzido conceitualmente e coberto por teste de primeiro frame.

## Observação
O ciclo `timekeeping -> import() advance-run -> timekeeping` é dinâmico e deliberado; não participa da inicialização ESM estática.
