# DEV137 Audit — Territory / Diplomacy / Intel

## Baseline

- origem: ZIP validado `0.1.0-dev.136`;
- schema alvo: v9;
- arquitetura visual: DOMAIN//OS v4 preservada.

## Implementado

### Territory
- estado territorial real em `Domain.territory`;
- controller/influence com referências tipadas;
- command `territory.configure`;
- Territory Control com summary, Influence Matrix e hierarquia real.

### Diplomacy
- Relations com target tipado, posture, score, trust e tension;
- commands `relation.upsert` / `relation.remove`;
- Agreement independente como direção oficial para novos tratados;
- commands de create/update/status no backend;
- Agreement participa da simulação econômica Domain→Domain;
- carry, breach, term e storage overflow cobertos por testes;
- Relations Matrix + Treaty Channel no DOMAIN//OS.

### Intel
- commands `intel.upsert`, `intel.remove`, `intel.reveal`;
- alvo tipado e visibility contract;
- `listVisibleIntel()` aplicado antes do view model;
- Intelligence Mesh como worklist/master-detail;
- telemetria de visible/confirmed/restricted/revealed derivada de dados reais.

## Correções estruturais

- RecordIndex passa a indexar Agreement corretamente sem colisões silenciosas;
- schema exibido no footer vem de `SCHEMA_VERSION`, não valor hardcoded;
- removidas coordenadas fictícias e orbitais cenográficos de Territory;
- removida card gallery de Intel;
- removidos seletores CSS mortos da geração anterior.

## Validation coverage

- conservação econômica de Agreement;
- breach sem criação de recurso;
- carry periódico e determinismo;
- start/end tick;
- storage overflow;
- permission/capability de Territory;
- self-relation e referências conflitantes;
- Agreement/resource validation;
- Intel reveal/visibility;
- actions e Command Kernel da UI;
- ausência de fake coordinates/card gallery/hardcoded schema;
- first-frame/runtime/action gates herdados.

## Limites deliberados

- não existe entidade `Territory` separada;
- Relation permanece edge leve, não substitui Agreement;
- Agreements embedded antigos continuam legíveis, sem migração destrutiva automática;
- UI de Agreement cria MVP de duas partes e não oferece editor destrutivo de tratados complexos;
- fog-of-war geográfico/map canvas avançado fica para expansão futura;
- smoke test dentro de Foundry VTT real continua recomendado.

## Gate pré-release

- 201/201 testes automatizados;
- Territory, Diplomacy e Intel revisados visualmente com dados representativos;
- seletor CSS legado `dm-relations-map` removido durante arqueologia final;
- nenhum fake coordinate, card gallery de Intel ou schema hardcoded permanece na apresentação ativa.
