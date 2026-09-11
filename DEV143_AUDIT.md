# dev.143 — Request Authority Consolidation Audit

## Baseline

- Fonte: `0.1.0-dev.142`.
- Baseline: **248/248 testes verdes**.
- Schema: **v9**.

## Lacuna confirmada

`features/requests/actions.js` mantinha uma segunda implementação completa de create/review fora do Command Kernel, apesar de não ser usada internamente pela UI atual. Como as exports continuavam públicas, esse caminho poderia reintroduzir autoridade paralela.

## Implementado

- `performCreateRequest()` convertido em wrapper de `request.create`;
- `reviewRequestAction()` convertido em wrapper de `request.review`;
- contratos de retorno legados preservados;
- removidos write paths, fila e regras duplicadas do arquivo legado;
- teste runtime prova criação/revisão por compatibilidade;
- teste estático proíbe `createRecord`, `updateRecord` e `transactionQueue` no wrapper.

## Regressão pré-versionamento

- focused Request compatibility: **28/28**;
- suíte completa: **250/250**;
- diff contra dev.142 antes do versionamento: apenas `requests/actions.js` e testes de Request.

## Gate final

### Após versionamento

- versão interna: `0.1.0-dev.143`;
- schema: **v9**;
- syntax check: **160/160 JS/MJS**;
- JSON parse: **7/7**;
- suíte completa: **250/250 testes verdes**.

### ZIP candidata

- extraída em diretório limpo;
- versão interna: `0.1.0-dev.143`;
- schema: **v9**;
- suíte dentro da candidata: **250/250 testes verdes**.

### Distribuição final

- ZIP final reextraída em diretório limpo;
- `package.json`, `module.json` e `MODULE_VERSION`: `0.1.0-dev.143`;
- schema final: **v9**;
- suíte dentro da ZIP final: **250/250 testes verdes**;
- SHA-256: `fbd7ac6a702941a5d902097deab7828908232407690656288ecc01b61a1b5759`.

**Veredito: APROVADA COMO CHECKPOINT DEV.143.**
