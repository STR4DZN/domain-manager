# Domain Manager — Architecture Contract v3

**Module:** `domain-manager`  
**Module version:** `0.1.0-dev.129`  
**Record schema:** `3`

Este documento congela o contrato arquitetural introduzido no `dev.129`. Ele define identidades, entidades, referências e perfis de gerenciamento. Não representa a implementação completa de UI ou gameplay dessas entidades.

## 1. Identidade persistente

Todo registro persistente do módulo possui dois identificadores com responsabilidades diferentes:

- **`entityId`** — identidade estável e portátil do registro, no formato `<recordType>:<id>`. É imutável após a criação e deve sobreviver a backup/importação.
- **Foundry UUID** — endereço local do `JournalEntry` dentro de um mundo. Pode mudar ao mover/importar dados entre mundos.

Exemplo:

```text
entityId: domain:C7F4...
uuid:     JournalEntry.ABC123
```

`entityId` não substitui o UUID do Foundry. Os dois coexistem.

## 2. Record types persistentes

O registry v3 reconhece:

```text
domain
request
project
mission
squad
person
structure
agreement
```

`Resource` é propositalmente diferente: ele continua sendo uma definição do catálogo global de recursos, identificada pelo seu `id`, e **não** um Journal record.

## 3. Referências tipadas

Novos contratos usam `EntityReference`:

```js
{
  recordType: "domain",
  uuid: "JournalEntry.ABC123", // opcional
  entityId: "domain:C7F4..."   // opcional
}
```

Regras:

- `recordType` é obrigatório;
- pelo menos `uuid` ou `entityId` deve existir;
- campos podem restringir quais tipos aceitam;
- quando ambos existem, `entityId` representa identidade e UUID representa localização local;
- índices relacionais reconhecem ambos.

Os relacionamentos legados de `Domain`, `Request`, `Project` e `Mission` continuam baseados em UUID nesta versão para preservar compatibilidade. A conversão desses campos para referências tipadas será incremental e migrada explicitamente quando houver necessidade funcional.

## 4. Domain e complexidade opt-in

`Domain` continua sendo o aggregate/root estratégico. No schema v3 ele recebe:

```js
management: {
  preset,
  capabilities
}
```

### Capabilities

```text
economy
population
people
structures
projects
squads
missions
diplomacy
territory
intel
security
```

`population` e `people` são independentes. Um Squad pode gerenciar comandantes, especialistas e NPCs nomeados sem possuir um sistema populacional.

### Presets

- `squad`
- `outpost`
- `base`
- `strategic-organization`
- `custom`

O preset fornece defaults. **As capabilities persistidas são a fonte efetiva de verdade.**

## 5. Contratos de entidades

### Domain

Entidade estratégica. Mantém identidade, hierarquias física/administrativa, controladores, management/capabilities e o estado legado já existente. O `dev.129` não remove imediatamente população/notáveis/acordos embutidos porque isso quebraria mundos existentes antes das novas features estarem prontas.

### Squad

Entidade operacional independente. Contrato inicial inclui:

- parent Domain tipado;
- controllers;
- capacidade e efetivo;
- composição abstrata;
- moral e condição;
- recursos e equipamentos;
- referências para Persons notáveis;
- missão atual tipada;
- tags.

Membros genéricos são abstratos por padrão. Nem todo soldado exige um `Person`.

### Person

Pessoa nomeada/importante. Pode referenciar:

- Domain principal;
- Squad;
- localização atual;
- Actor do Foundry (`actorUuid`) opcional.

### Structure

Entidade física/funcional pertencente a um Domain. Contrato inicial inclui tier, condição, capacidade, manutenção e produção.

### Mission

Mantém o modelo legado atual no `dev.129`, agora com `entityId`. O redesign funcional da missão pertence ao vertical slice de Missions posterior.

### Project

Mantém o modelo funcional atual, agora com `entityId`. Projetos permanecem registros independentes.

### Request

Mantém o workflow existente, agora com `entityId`. Continua sendo a ponte Player → GM para ações autorizadas.

### Agreement

Novo contrato independente entre Domains, com parties tipadas, período, status e transferências periódicas. O array legado `Domain.agreements` ainda existe nesta versão e **não é convertido automaticamente**.

### Resource

Definição de catálogo com identidade pelo `id` slug. O contrato agora também comporta categoria e tags sem transformar recursos em Journals.

## 6. Índice

`RecordIndex` agora indexa:

- qualquer registro por UUID/tipo;
- qualquer registro por `entityId`;
- Squads por Domain;
- Persons por Domain;
- Persons por Squad;
- Structures por Domain;
- Agreements por Domain.

Relações novas podem ser consultadas tanto pelo UUID quanto pelo `entityId` da referência.

Uma colisão de `entityId` entre documentos diferentes é inválida.

## 7. Persistência

O Journal store impõe dois invariantes:

1. `entityId` deve ser único entre registros do módulo;
2. `entityId` não pode ser alterado em um update normal.

Isso impede que edição de dados troque silenciosamente a identidade lógica de uma entidade.

## 8. Migration v2 → v3

Ao migrar registros antigos:

- todo registro recebe `entityId` quando ausente;
- Domain recebe management normalizado, com `base` como preset legado padrão;
- dados existentes não são convertidos prematuramente para Squad/Person/Structure/Agreement.

A migração ocorre antes da reconstrução do índice.

## 9. Backup v2

O formato de backup passa a incluir:

- Domains;
- Projects;
- Requests;
- Missions;
- Squads;
- People;
- Structures;
- Agreements;
- catálogo de Resources.

Importação tenta reconciliar registros por `entityId` primeiro e UUID depois. Backups v1 continuam aceitos; ao atualizar um registro já existente, um backup legado sem `entityId` herda a identidade estável existente.

## 10. Limites deliberados do dev.129

O contrato não significa que todas as features estão disponíveis na UI.

Fora de escopo nesta versão:

- UI de Squad/Person/Structure/Agreement;
- capability-aware navigation completa;
- conversão automática dos notáveis/acordos embutidos de Domain;
- conversão dos relacionamentos legados para EntityReference;
- lógica completa de gameplay dos novos tipos;
- remapeamento cross-world de todos os relacionamentos UUID legados.

O objetivo do `dev.129` é impedir que as próximas features nasçam sobre contratos improvisados.
