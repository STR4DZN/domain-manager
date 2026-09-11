# Domain Manager — Design Language v1

## Conceito
**STRATEGIC OPERATIONS SYSTEM** — um software administrativo/militar de ficção científica que parece existir dentro do universo da campanha. Não é uma skin de Foundry e não é um HUD cinematográfico colado sobre formulários.

## Princípios
1. **App first, FUI second.** A interface deve ser utilizável antes de ser espetacular.
2. **Hierarquia por área, não por glow.** Tamanho, espaço e contraste definem prioridade.
3. **Cor é semântica.** Amber=ação/seleção, teal=nominal/intel, red=risco, blue=informação.
4. **Motion é evento.** Sem movimento constante em estado nominal.
5. **Dados são reais.** Micrográficos devem refletir dados do módulo.
6. **Densidade controlada.** Overview pode ser denso; edição deve ser calma.
7. **Capabilities moldam o produto.** O app não mostra módulos que a entidade não possui.

## Arquitetura visual
- **Command Rail:** navegação global compacta.
- **Entity Deck:** lista/pesquisa de Domains e unidades.
- **Workspace:** área principal adaptada ao módulo.
- **Telemetry Strip:** resumo de estado contextual.
- **System Footer:** authority, tick, sync e versão para GM; informação mínima para player.

## Paleta semântica
- `--dm-void`: #06090d
- `--dm-surface-0`: #0a0f14
- `--dm-surface-1`: #10171d
- `--dm-surface-2`: #151f26
- `--dm-line`: rgba(160, 188, 198, .18)
- `--dm-text`: #e8f0ef
- `--dm-muted`: #83949a
- `--dm-amber`: #f0a52b
- `--dm-amber-soft`: #bb7a20
- `--dm-teal`: #48d7b0
- `--dm-cyan`: #67b9d4
- `--dm-red`: #ef5c55
- `--dm-blue`: #668cff

## Geometria
- Radius geral entre 0 e 4px.
- Corner-cut discreto via pseudo-elemento em painéis importantes.
- Linha principal 1px; nunca pilhas decorativas de bordas.
- Hachura somente em progresso/forecast/risk zones.

## Tipografia
- UI: `Inter`, `Roboto Condensed`, `Arial Narrow`, system sans fallback.
- Metadata/IDs: monoespaçada.
- Labels: 10–12px, uppercase com tracking moderado.
- Corpo: 12–14px.
- Métricas: 20–34px, tabular nums.

## Movimento
- Hover/selection: 100–160ms.
- Mudança de view: 140–220ms, opacity/translate máximo 4px.
- Alert pulse: no máximo 2 ciclos e apenas em novo alerta.
- Progress sweep: somente enquanto operação está realmente em curso.
- Glitch: apenas erro/interferência, 200–500ms.

## Componentes centrais
- `dm-panel`: superfície modular.
- `dm-stat`: métrica com label, valor e delta.
- `dm-status-chip`: nominal/warning/critical/info.
- `dm-data-row`: label/valor/meta.
- `dm-meter`: barra segmentada real.
- `dm-telemetry`: micrográfico ou leitura temporal.
- `dm-empty-state`: explica o sistema e próxima ação.
- `dm-dialog`: prompt de sistema consistente.

## Regra de qualidade
Se removermos toda decoração e a tela deixar de ser compreensível, o design falhou.
