# Intel Authority Consolidation — dev.147

A dev.147 remove o write path paralelo das APIs legadas de Intel sem alterar modelo, visibilidade ou UI estratégica.

## Compatibilidade

`addIntel`, `updateIntel`, `removeIntel` e `revealIntel` continuam exportadas. Toda mutação passa pelos Commands canônicos `intel.upsert`, `intel.remove` e `intel.reveal`.

`updateIntel()` continua aceitando patch parcial: o wrapper lê o registro atual, mescla o patch em memória e envia um payload completo ao Command Kernel.

## Guard rails

- nenhuma API legada chama `updateRecord`/`createRecord`;
- capability `intel` e permissão GM permanecem validadas pelo Command Kernel;
- provenance/targetDomain tipado é preservado;
- schema permanece v9.
