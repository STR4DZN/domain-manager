# Defense Operations — dev.139

## Escopo

A dev.139 fecha `security` como vertical slice operacional da arquitetura atual sem alterar o schema v9. O milestone parte exclusivamente da `dev.138` e utiliza o contrato já persistido em `Domain.security`.

## Estado persistente

Defense continua possuindo apenas:

- `defenseRating`: rating estratégico base;
- `guardCount`: efetivo agregado de guarda;
- `fortifications[]`: camadas textuais de fortificação.

Nenhum campo derivado novo é persistido.

## Command Kernel

Novo command autoritativo:

- `security.configure`

O command:

1. exige Primary Active GM no pipeline autoritativo;
2. exige capability `security` no Domain;
3. valida inteiros não-negativos;
4. rejeita fortificações duplicadas por nome normalizado;
5. usa lock do Domain e idempotency ledger;
6. persiste a mutação pelo Journal Store oficial;
7. emite `security.configured`;
8. fornece rollback transacional do handler.

## Estado derivado

A UI reutiliza `calculateDomainRisks()` já existente. São derivados em runtime:

- `effectiveDefense`;
- nível de Defense;
- `scarcityRisk`;
- `unrestRisk`;
- fatores explicativos de cada risco.

A UI nunca envia esses valores ao command e nunca os persiste.

## DOMAIN//OS v4

Defense Grid preserva o workspace Operations e adiciona:

- Effective Defense como instrumento principal;
- base rating, guard count, layers e state;
- Fortification Layers;
- Strategic Pressure com Scarcity/Unrest e fatores reais;
- Command Console GM-only para os três campos persistentes.

Não há simulação de combate, war engine, dano de fortificação ou automação militar nesta versão.

## Compatibilidade

- `schemaVersion`: **9**;
- nenhuma migration nova;
- Simulation sem alteração;
- Strategic Economy sem alteração;
- Structure commissioning sem alteração;
- `guardCount` continua participando das regras já existentes de upkeep/risco exatamente como antes.
