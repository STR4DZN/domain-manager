# Domínios // Domain Manager

[![Foundry VTT](https://img.shields.io/badge/Foundry%20VTT-v13-blue.svg)](https://foundryvtt.com)
[![Compatible](https://img.shields.io/badge/Verified-13.351-green.svg)](https://foundryvtt.com)

**Domain Manager** é um framework estratégico e operacional para Foundry VTT v13. Ele conecta Domains, economia, projetos, squads, pessoas, estruturas, missões, diplomacia, território e inteligência dentro de um estado persistente e multiplayer.

## Strategic Operations System

A partir do `dev.131`, a interface antiga foi removida. A UI agora é um aplicativo novo, baseado em quatro zonas funcionais:

- **Command Rail** — navegação global compacta.
- **Entity Deck** — seleção e busca de Domains.
- **Workspace** — módulos contextuais controlados por capabilities.
- **System Footer** — autoridade, sincronização e diagnóstico.

A linguagem visual foi construída a partir de 26 referências FUI analisadas individualmente e segue o princípio **App first, FUI second**: estética futurista sem sacrificar hierarquia, leitura ou interação. Consulte `docs/VISUAL_REFERENCE_AUDIT.md` e `docs/DESIGN_LANGUAGE.md`.

## Vertical slices operacionais

### Squad MVP — dev.132

- GM cria Squads dentro de Domains com capability `squads`.
- Controllers recebem ownership `OBSERVER` e operam a unidade pelo Command Kernel.
- Moral, condição, status e briefing operacional podem ser atualizados pelo jogador controlador.
- GM administra capacidade, efetivo e reatribuição de controllers.
- Suprimentos usam a transferência Domain/Squad já transacional.

### Mission MVP — dev.133

- GM registra operações com audiência, briefing e objetivos.
- Jogadores da audiência preparam Squads que controlam, comprometendo efetivo e suprimentos.
- Preparação reserva o compromisso; consumo ocorre apenas no lançamento.
- Launch é idempotente e coloca as unidades em campo.
- After Action Resolution aplica baixas, moral, condição e resultados de objetivos de volta aos Squads.
- Mission Control novo apresenta força, recursos, objetivos e estado operacional sem reutilizar a UI legada.

Consulte `docs/SQUAD_MVP.md` e `docs/MISSION_MVP.md`.

### Structures & Base Core — dev.134

- GM pode registrar ativos físicos existentes ou iniciar construções financiadas.
- Construção cria um `Project` real e uma `Structure planned` vinculada.
- Project concluído comissiona automaticamente a Structure em batch com Domain/Project.
- Structures `operational` consomem manutenção e produzem recursos por tick.
- Structures `damaged` mantêm o custo de manutenção e produzem proporcionalmente à condição.
- Infrastructure Control apresenta condição, capacidade, tier, vetores econômicos, construção e controle operacional.

Consulte `docs/STRUCTURES_BASE_CORE.md`.

## Kernel

- Aritmética exata com minor units e carry persistente.
- Simulation kernel determinístico.
- Autoridade única no GM primário.
- Command/transaction layer com idempotência e event bus.
- Transferências Domain/Squad com atualização em batch e compensação.
- Schema versionado e migrations sequenciais.
- Capabilities e management presets para reduzir ou ampliar complexidade por entidade.

## Requisitos

- Foundry VTT `>= 13.341` (verificado em `13.351`).
- `socketlib >= 1.1.3`.

## Instalação manual

1. Baixe `domain-manager-v0.1.0-dev.134.1.zip`.
2. Extraia em `Data/modules/domain-manager`.
3. Ative Domain Manager e socketlib no mundo.

## Testes

```bash
npm test
```

## Autor

Fusion / STR4DZN
