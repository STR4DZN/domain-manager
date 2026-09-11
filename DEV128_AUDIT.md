# dev.128 — Audit Summary

## Escopo desta estabilização

Esta versão atua apenas no kernel e em invariantes diretamente ligados à integridade de dados. Não há redesign visual nem introdução de Squads/Structures.

## Bugs confirmados no baseline dev.127

1. Snapshot de Domain omitindo população, segurança e `sustenanceSettings`.
2. `calculateDomainUpkeep()` recebendo catálogo como array enquanto esperava `{ resources }`.
3. Custos de Project calculados como `dueNow`, mas não debitados de `projectedStocks`.
4. Fluxos periódicos sem carry persistente, tornando `advance(N)` diferente de N vezes `advance(1)`.
5. Fome disparando com estoque exatamente em zero, mesmo quando a demanda foi atendida.
6. Condição automática usando severity inválida (`crisis`).
7. Dois ou mais GMs podiam processar o mesmo hook de World Time.
8. TransactionQueue implementada, porém fora dos caminhos críticos de Request e Simulation.
9. Pipeline de migração não executado antes do decode/indexação dos registros.
10. Migração v0 criava `nature: settlement`, não aceita pelo modelo atual.
11. `normalizeDomainDraft()` reconstruía `economy` e podia descartar `sustenanceSettings`/campos futuros.
12. Constante interna de versão divergente do manifesto (`dev.79` vs `dev.127`).
13. Project concluído podia gerar eventos de conclusão novamente em avanços posteriores.
14. Fome recém-criada era submetida ao decay no mesmo avanço.

## Decisões tomadas

- `SCHEMA_VERSION = 2` devido à persistência de carry nos fluxos.
- Project sem verba suficiente avança apenas até o maior progresso financiável no settlement do ciclo e permanece ativo para tentar retomar automaticamente.
- Produção/consumo do período é calculado antes da liquidação de Projects; portanto recursos produzidos naquele ciclo podem financiar custos de Project do mesmo ciclo.
- Apenas `game.users.activeGM` é autoridade para executar avanços globais.

## Fora do escopo, observado e mantido para fases futuras

- Refatoração do `shell-app.js` e templates monolíticos.
- Novo sistema de capabilities/presets.
- Entidades Squad, Structure e Person independentes.
- Event Bus/Command Layer completo.
- Atomicidade multi-documento com rollback real de todas as operações.
- Redesign de Missions.
- Redesign visual completo.
