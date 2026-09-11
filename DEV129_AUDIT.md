# DEV129_AUDIT — Architecture Contract

## Escopo

O `0.1.0-dev.129` formaliza a camada de contratos do Domain Manager sem redesenhar a interface e sem tentar completar antecipadamente Squad, Structures ou Missions.

## Decisões consolidadas

### Identidade
- Registros persistentes possuem `entityId` estável e imutável.
- Foundry UUID permanece como endereço local do documento.
- O store e o índice rejeitam colisões de `entityId`.

### Entidades
O registry passa a reconhecer `domain`, `request`, `project`, `mission`, `squad`, `person`, `structure` e `agreement`.

`Resource` continua catálogo global e usa o próprio `id` como identidade; não foi transformado em Journal record.

### Management / capabilities
Foi introduzido um contrato explícito de `management.preset + capabilities`. `people` foi separado de `population` para permitir gerenciamento de personagens nomeados em entidades operacionais que não possuem população estratégica.

### Referências
Novos modelos usam referências tipadas `{ recordType, uuid, entityId }`, aceitando UUID local, identidade estável, ou ambos. Modelos legados permanecem com campos UUID existentes nesta etapa para preservar mundos atuais.

### Compatibilidade
Nenhum dado legado embutido em Domain foi removido. Notables e Agreements antigos continuam válidos; novos `Person`/`Agreement` são contratos paralelos até uma migração funcional futura.

## Migration

Schema passou de v2 para v3. A migração:
- gera `entityId` para registros antigos;
- normaliza `Domain.management` com preset `base` quando ausente;
- valida o resultado antes de persistir.

## Backup

Backup schema passou para v2 e cobre os oito record types além do catálogo. Importação aceita backup v1 e v2. Identidade moderna é reconciliada por `entityId` antes de UUID; backups legados sem identidade podem herdar o `entityId` de um registro existente.

## Validações cobertas

A suíte testa, entre outros pontos:
- presets e overrides de capabilities;
- independência `people`/`population`;
- criação/normalização de entity IDs;
- referências tipadas e duplicidade;
- invariantes de Squad/Person/Structure/Agreement/Resource;
- migration v2→v3;
- índices por `entityId` e relações por UUID/entityId;
- backup v2 e compatibilidade de backup v1;
- regressões do kernel dev.128.

## Dívidas deliberadamente adiadas

- A UI atual ainda não usa capabilities para esconder/mostrar áreas.
- Não existem actions/UI completas para os novos record types.
- Domain ainda mantém notables e agreements embutidos legados.
- Domain/Project/Mission/Request ainda possuem relacionamentos UUID legados.
- `overwrite` de backup atualiza/cria registros presentes, mas ainda não elimina registros ausentes do arquivo.
- Remapeamento cross-world de relações UUID legadas permanece incompleto.
- A validação desta build é automatizada/estática; smoke test real no Foundry continua recomendado.

## Próximo milestone

`dev.130 — Transaction & Authority Kernel`: commands, transações atômicas, idempotência geral, autoridade primária e event/history infrastructure, sem iniciar ainda o redesign visual.
