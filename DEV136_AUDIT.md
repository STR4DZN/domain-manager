# DEV136 Audit — Population & People

## Baseline

- Origem: `domain-manager-v0.1.0-dev.135.zip` validado.
- Release alvo: `0.1.0-dev.136`.
- Schema alvo: `8`.
- Arquitetura de apresentação preservada: DOMAIN//OS v4.

## Escopo executado

### Data contract
- `population.morale`;
- `group.morale`;
- `group.workforceEligible`;
- `population.workforce.allocations`;
- `Structure.workforceRequired`;
- `Person.portrait`, morale e condition normalizados.

### Authority / commands
- `population.configure`;
- `population.group-upsert`;
- `population.group-remove`;
- `population.workforce-set`;
- `person.create`;
- `person.update`.

### Simulation
- workforce coverage por Structure;
- service ratio limitado por recursos e staffing;
- produção escalada pelo service ratio;
- degradação por substaffing;
- crises alteram morale explicitamente;
- fome + seca no mesmo tick não duplicam penalidade.

### UI
- Civil summary strip;
- cohort worklist;
- Workforce Board;
- Staffing Matrix Command Console;
- Person creation/update;
- Personnel master-detail preservado;
- `workforceRequired` exposto nos consoles de Structure.

## Validações realizadas antes do fechamento

- 180/180 testes automatizados aprovados no estado pré-release.
- Civil Control renderizado e inspecionado em 1440×900.
- Personnel renderizado e inspecionado como master-detail.
- Staffing Matrix renderizado como Command Console amplo.
- Correção de densidade garante visibilidade do campo STATE na worklist de cohorts.

## Invariantes

1. UI não persiste Population/Person diretamente.
2. Workforce não pode exceder elegíveis do cohort.
3. Allocation não pode atravessar Domains.
4. Cohort com workforce ativa não pode ser removido/desativado silenciosamente.
5. References UUID + entityId divergentes são conflito.
6. Substaffing entra no mesmo kernel determinístico da Strategic Economy.
7. `assignment`/`quality` nunca são usados como contadores de crise.

## Riscos residuais / fora do escopo

- população ainda é agregada, não simulação individual;
- Person nomeada não é automaticamente unidade de workforce;
- Notables legados permanecem embedded;
- crescimento demográfico, salários, skills e turnos ficam para milestones futuros;
- smoke test manual em Foundry VTT v13 real continua necessário.

## Gate de release

O release só deve ser congelado depois de:

- suíte completa verde após bump de versão;
- build CSS;
- sintaxe/imports/JSON/Handlebars;
- runtime import + first-frame;
- empacotamento;
- repetição dos gates sobre o ZIP extraído.
