# dev.149 — UI Usability / Responsive Rescue Audit

## Baseline protegido
- Fonte canônica: `0.1.0-dev.148`.
- Baseline funcional: **266/266 testes verdes**.
- Schema de entrada/saída: **v9**.
- Esta versão é um gate de usabilidade: nenhuma feature estratégica nova e nenhuma migration.

## Bloqueador confirmado
A shell v4 estava estruturalmente impraticável em janelas Foundry compactas: três colunas rígidas comprimiam o workspace, o Inspector consumia largura permanentemente, microtexto de 5–9 px dominava a interface, chrome/telemetria competia com a tarefa principal, estados vazios desperdiçavam área e a responsividade dependia mais do viewport do navegador do que do tamanho real da Application.

A captura de referência usada para o resgate tinha aproximadamente `1002×552`, tamanho no qual a interface anterior não permitia testar o módulo com conforto.

## Implementado

### Escala e legibilidade
- nova camada final `styles/app/usability.css`, carregada depois do design system existente;
- tipografia operacional elevada: base 14 px, controles 13 px, metadata principal 10–11 px;
- contraste de texto secundário e divisores reforçado;
- hit targets principais de 40 px ou mais;
- títulos, parágrafos, listas, tabelas, cards e dialogs reescalados sem depender de zoom do navegador;
- microtexto legado recebe um piso de legibilidade na camada final.

### Layout responsivo real
- a `.window-content` agora é um CSS container (`dm-window`), portanto os breakpoints seguem **a largura real da janela do módulo**, não apenas a tela inteira;
- suporte explícito para `1360 / 1120 / 900 / 720 / 520 / 380 px`;
- mínimo da Application reduzido de `980×650` para `320×300` sem encolher a tipografia para caber;
- default de abertura alterado de `1480×880` para `1280×760`;
- em largura estreita, sidebar vira rail horizontal rolável;
- tabelas/datasets densos preservam legibilidade por overflow deliberado em vez de comprimir colunas até ficarem ilegíveis;
- dialogs colapsam para uma coluna e ações viram grids de largura útil em telas estreitas.

### Altura real da Application
- `ResizeObserver` classifica a shell como `normal`, `compact` ou `short` pela altura real renderizada;
- janelas baixas economizam chrome/padding sem reduzir a fonte principal;
- em altura curta o statusbar redundante é removido e o workspace recebe a área recuperada.

### Inspector contextual
- acima do breakpoint confortável o Inspector continua fixo;
- até 1360 px ele deixa de roubar coluna do workspace e vira drawer contextual;
- botão `Contexto` abre o drawer e `Escape`/botão de fechar o recolhem;
- o drawer permanece disponível inclusive em largura de 320–380 px, ocupando 100% quando necessário;
- controles que vivem no Inspector não foram descartados nem escondidos permanentemente.

### Organização e redução de ruído
- telemetria global da barra do Domain é removida em larguras de laptop/Foundry compactas em vez de competir com o conteúdo da página;
- radar genérico do Inspector foi removido da apresentação;
- empty states foram reduzidos e suas ações principais ampliadas;
- a ação duplicada de registro na tela vazia de Forces é suprimida no cabeçalho;
- a tela Force Control recebeu cards maiores, grid responsivo e leitura operacional mais direta;
- elementos decorativos do Command HUD foram rebaixados ou removidos em breakpoints compactos.

### Movimento
- animação ambiental da shell foi desligada globalmente;
- permanecem apenas transições locais curtas de feedback (aprox. 120 ms);
- `prefers-reduced-motion` remove também essas transições.

## Arquivos funcionais deliberadamente intocados
Nenhuma alteração funcional foi feita em `scripts/features/**`, modelos, persistência, Command Kernel, Simulation, Economy, Relations, Requests, Missions ou migration pipeline. O diff funcional contra dev.148 está restrito à shell/presentation, build de CSS, metadata de versão e testes de apresentação.

## Regressão automatizada
- suíte completa: **275/275 testes verdes**;
- teste novo `tests/ui-responsive-rescue.test.mjs` cobre ordem da camada CSS, breakpoints por container, drawer contextual, rail estreito, escala tipográfica, remoção de chrome em janelas pequenas, movimento e observação de altura;
- action contract permanece verde com a nova ação `toggleInspector`;
- import/context da ApplicationV2 permanecem verdes.

## ZIP candidata
- candidata empacotada com root `domain-manager/` e extraída em diretório limpo;
- package/module/download coerentes com `0.1.0-dev.149`;
- suíte executada dentro da candidata extraída: **275/275 testes verdes**, exit code 0.

## Gate estático
- `node --check`: **165/165 JS/MJS**;
- JSON parse: **7/7**;
- `styles/shell.css`: **1669/1669** chaves balanceadas;
- versão package/module/runtime: `0.1.0-dev.149`;
- schema: **v9**.

## Limites e smoke test
- não houve alteração de dados persistidos e não há migration;
- esta execução não possui um runtime Foundry VTT licenciado para inspeção visual física;
- Chromium headless do ambiente não inicializou de forma confiável por dependência de D-Bus, portanto nenhum render headless é usado como evidência de aprovação visual;
- o próximo passo correto é smoke test no Foundry real, especialmente na janela de referência ~`1002×552`, além de 320/380, 720, 900, 1120 e desktop amplo.

## Veredito
**APROVADA COMO CANDIDATA DEV.149 — UI USABILITY / RESPONSIVE RESCUE.**

A distribuição final será reextraída e testada após este relatório; o SHA-256 canônico fica no `PROJECT_STATE.md` externo para evitar hash autorreferencial dentro da própria ZIP. A versão só deve ser promovida para novo trabalho funcional depois do smoke test do usuário. Se a shell ainda exigir zoom, esconder controles ou colapsar conteúdo na janela real, isso é falha do gate visual e deve ser corrigido antes da dev.150.
