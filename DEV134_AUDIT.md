# DEV134 Audit — Structures & Base Core

## Baseline

O desenvolvimento partiu do ZIP congelado `0.1.0-dev.133`. O milestone anterior não foi sobrescrito.

## Escopo executado

### Contrato e schema

- `schemaVersion` elevado para 6.
- `Structure.activeProject` adicionado como EntityReference opcional para Project.
- Migration v5→v6 adiciona `activeProject: null` a Structures legadas e preserva referências existentes.

### Commands e autoridade

Implementados:

- `structure.create`
- `structure.patch`
- `structure.admin-update`
- `structure.begin-construction`

As operações usam o Command Kernel, autoridade do Primary GM, idempotência e rollback/compensação existentes.

### Construção

`structure.begin-construction` valida capabilities, catálogo e reservas antes de criar registros. O fluxo cria Project + Structure planned vinculados e remove ambos se houver falha parcial durante a criação.

### Simulation Kernel

Structures são carregadas no snapshot como entidades independentes. Elas não são copiadas para `Domain.economy.flows`.

O kernel gera fluxos sintéticos de Structure apenas em memória:

- operational: 100% manutenção/produção;
- damaged: manutenção integral + produção proporcional à condition;
- demais estados: sem fluxo.

Foi mantida equivalência determinística `advance(N) == N × advance(1)` para os cenários estruturais cobertos.

### Comissionamento

Project concluído comissiona Structure planned vinculada dentro do mesmo batch de Domain + Project + Structure. O teste de integração verifica:

- custo reserved consumido uma única vez;
- Project concluído;
- Structure operational;
- `activeProject` limpo;
- histórico/notificação do Domain;
- hook com `updatedStructures`.

### UI

Infrastructure Control substitui a listagem passiva por:

- telemetria de ativos;
- manutenção e produção;
- vínculo de Project;
- criação direta/construção;
- Resource Matrix;
- controle operacional;
- administração GM.

A UI usa exclusivamente command types para persistência de Structures.

## Bugs encontrados durante o milestone

1. `structure.admin-update` reconstruía o blueprint sem preservar `entityId`; o Journal store corretamente rejeitou a alteração. Corrigido mantendo identidade imutável.
2. O card de Project vinculado não carregava `tone`, impedindo semântica visual coerente. Corrigido.
3. Durante a aplicação do novo tema, a classe de Structures chegou a ser aplicada à view de Domains; detectado por inspeção e corrigido antes do release.

## Decisões de fronteira

O `dev.134` não degrada condition/status automaticamente quando falta manutenção. Ele emite risco. A política de degradação pertence ao `dev.135`, pois depende de prioridades, criticidade, reservas e possíveis redes/logística.

A Structure comissionada não produz no mesmo tick que encerrou a obra: ela estava planned no snapshot daquele intervalo. Operação econômica começa no tick seguinte.

## Validação pré-release

Antes do versionamento final, a suíte completa atingiu **113/113 testes aprovados**.

Cobertura nova inclui:

- contratos de Structure;
- command authorization;
- reserva de construção;
- rollback sem órfãos;
- referência uuid/entityId conflitante;
- economia por estado;
- eficiência damaged;
- determinismo;
- maintenance risk;
- comissionamento real via `executeAdvanceRun`;
- migration v6;
- wiring/arquitetura da UI.

## Pendência externa

Ainda é recomendado smoke test manual dentro de Foundry VTT v13 real, especialmente para:

- renderização dos dialogs em diferentes resoluções;
- multiplayer com GM + controller;
- interação real com Resource Matrix;
- comissionamento após avanço de World Time/Simple Timekeeping.
