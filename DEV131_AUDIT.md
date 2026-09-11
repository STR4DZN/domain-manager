# DEV131 — UI Foundation Audit

## Objetivo
Substituir integralmente a apresentação legada sem tocar no kernel confiável do `dev.130`.

## Baseline preservado
- Schema: v4 (inalterado).
- Persistência, migrations, simulation kernel, authority, command layer e transaction layer do `dev.130` foram mantidos.
- A mudança é deliberadamente UI/presentation-first.

## UI removida
- Antiga `shell-app.js` monolítica.
- Templates partials legados.
- Tokens/componentes/views CSS anteriores, incluindo boot, glitch e transitions decorativas.
- Preload de partials antigos no lifecycle.

## UI nova
- `scripts/ui/shell-app.js`: ApplicationV2 reescrita do zero.
- `scripts/ui/navigation.js`: contrato de navegação capability-aware.
- `scripts/ui/presentation.js`: helpers puros de apresentação.
- `templates/app-shell.hbs`: único shell novo, sem herança estrutural do cockpit anterior.
- `styles/app/*.css`: design system novo.

## Direção visual
A auditoria das 26 referências identificou quatro famílias:
1. Command Amber — shell e áreas administrativas.
2. Forensic Teal — People, Intel, Security e Missions.
3. Telemetry Red/Blue — dashboards especializados e diagnostics.
4. FUI Grammar — microcomponentes, grids, callouts, glyphs e estados.

O produto usa Command Amber como identidade principal e importa as outras famílias apenas quando semânticamente adequadas.

## Garantias UX
- Complexidade é filtrada por capabilities.
- Sem boot animation obrigatório.
- Sem animação infinita decorativa.
- Vermelho só aparece em risco/erro real.
- Empty states explicam o propósito da área.
- O app continua mostrando apenas dados reais do kernel.

## Testes adicionados
- `ui-navigation.test.mjs`
- `ui-presentation.test.mjs`
- `ui-shell-import.test.mjs`

## Resultado antes do empacotamento
- 67 testes passando.
- Pairing de blocos Handlebars: OK.
- Pairing estrutural HTML: OK.
- JS/MJS syntax check: OK.
- Imports relativos: OK.

## Limitação conhecida
A execução atual não possui uma instância gráfica real do Foundry VTT v13 para smoke visual. O próximo gate prático é instalar o ZIP no Foundry e verificar sizing, helpers de template e integração final com CSS do host.
