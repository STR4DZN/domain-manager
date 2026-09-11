# Population & People — dev.136

## Objetivo

O milestone `dev.136` transforma Population/People de dados predominantemente cadastrais em um subsistema civil operacional. O Domain passa a possuir moral explícita, cohorts com capacidade de trabalho e uma matriz persistente de alocação para Structures. `Person` passa a ter lifecycle independente pelo Command Kernel.

## Population

```text
Population
├── total
├── countMode
├── morale (0..100)
├── groups[]
│   ├── localId
│   ├── name
│   ├── count
│   ├── includedInTotal
│   ├── function
│   ├── quality
│   ├── status
│   ├── assignment
│   ├── morale (0..100)
│   └── workforceEligible
└── workforce
    └── allocations[]
        ├── localId
        ├── groupLocalId
        ├── target: StructureRef
        ├── count
        └── role
```

`assignment` e `quality` continuam sendo dados semânticos do cohort. Consequências de crise não os reutilizam como contadores numéricos.

## Morale

Morale é inteiro de `0..100`. A apresentação deriva bandas: `high`, `stable`, `strained` e `critical`.

Dados legados sem morale podem derivar um valor inicial a partir de `quality` na migration v8:

- Muito Alta → 90
- Estável → 70
- Insatisfeito → 40
- Rebelde → 15

Depois da migration, morale é estado próprio e não depende mais de `quality`.

## Workforce

Um cohort possui `workforceEligible <= count`. Apenas cohorts `active` contribuem para workforce disponível.

Uma allocation aponta para uma `Structure` do mesmo Domain. O Command Kernel valida:

1. capability `population`;
2. usuário controlador/GM;
3. existência do cohort;
4. Structure pertencente ao mesmo Domain;
5. ausência de referências UUID/entityId divergentes;
6. soma de allocations por cohort <= `workforceEligible`;
7. cohorts inativos não podem receber workforce.

Cohorts com allocations ativas não podem ser removidos nem desativados antes da liberação da força de trabalho.

## Structures e eficiência

Structures podem declarar `workforceRequired`.

```text
workforceRatio = min(assigned / required, 1.0)
serviceRatio   = min(resourceMaintenanceRatio, workforceRatio)
```

Se `workforceRequired == 0`, workforce não limita a Structure.

A produção continua sendo calculada por condição e service ratio. Substaffing, portanto, reduz produção e pode causar degradação do ativo de forma determinística.

## Commands

### Population

- `population.configure`
- `population.group-upsert`
- `population.group-remove`
- `population.workforce-set`

### Person

- `person.create`
- `person.update`

Todos passam por authority, transaction queue, idempotency ledger, history/event bus e referências tipadas. A UI não grava Journal diretamente.

## Person

`Person` é entidade independente e pode manter:

- Domain principal;
- localização atual;
- Squad opcional;
- portrait;
- role / specialization;
- morale / condition;
- status;
- tags / notes;
- Actor UUID opcional.

Notables embutidos legados continuam legíveis, mas não são automaticamente convertidos em Person neste milestone.

## UI

### Civil Control

A ferramenta Population segue três níveis:

1. **Summary strip** — population, morale, eligible workforce, assigned e available;
2. **Cohort worklist** — comparação operacional de groups;
3. **Workforce Board** — cobertura por Structure e gaps.

### Staffing Matrix

Command Console amplo para roteamento cohort × Structure. Não é uma segunda página global nem grava documentos diretamente.

### Personnel

Mantém o padrão master-detail do DOMAIN//OS:

- directory/worklist no workspace;
- dossier da Person selecionada no Inspector;
- create/update por Command Console.

## Determinismo

A cobertura de workforce participa do kernel tick-by-tick. Testes comparam avanços agregados e unitários para evitar divergência de condition, production e morale.

## Fora do escopo

- salários;
- turnos;
- profissões/skills detalhados;
- household/famílias;
- crescimento/natalidade/mortalidade natural;
- migração automática de Notables legados;
- indivíduos nomeados contabilizados automaticamente como workforce.
