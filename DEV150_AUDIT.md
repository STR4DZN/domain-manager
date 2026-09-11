# dev.150 — Application Shell Rebuild / Recovery Audit

## Baseline protegido
- Fonte canônica: `0.1.0-dev.149`.
- Baseline funcional: **275/275 testes verdes**.
- Schema de entrada/saída: **v9**.
- Escopo: recuperação de usabilidade, navegação, Pessoas e gestão visual do Domínio. Nenhuma expansão de regra estratégica e nenhuma migration.

## Motivo do gate
O smoke test real da dev.149 mostrou que a Application continuava impraticável: microtexto, FUI/telemetria cenográfica, navegação confusa, páginas comprimidas/cortadas, terminologia inglesa e funções importantes (especialmente Pessoas/retratos/aparência do Domínio) difíceis de localizar ou aparentemente ausentes. A dev.150 trata isso como regressão de produto, não como polimento cosmético.

## Recuperação funcional de interface
### Pessoas
- `Pessoas` é novamente uma página operacional explícita em master-detail.
- Diretório com retrato, nome, função e estado.
- Dossiê central com retrato, função, especialização, estado, moral, condição, unidade, Actor vinculado, notas, marcadores e `entityId`.
- Criação/edição reutiliza os Commands canônicos existentes; nenhuma persistência paralela foi introduzida.
- Editor inclui FilePicker de retrato, Actor UUID e vínculo com unidade.
- Notáveis legados permanecem visíveis como somente leitura para evitar migration destrutiva.

### Imagens e aparência do Domínio
- Ação GM-only `Aparência` no contexto do Domínio.
- FilePicker para imagem principal, banner e brasão.
- Controles de `fit`, altura, zoom, posição X/Y e cor temática.
- Atualização visual é agrupada em **um único write** por `updateDomainMediaFields()`.
- Campos visuais ausentes são inicializados de forma segura sem alterar schema.
- A imagem principal configurada volta a aparecer na Visão geral do Domínio.
- Compatibilidade com retratos legados de notáveis é preservada.

## Navegação e idioma
- Navegação global em PT-BR: **Comando, Domínios, Operações, Sistema**.
- Workspaces: **Gestão, Base, Operações, Pessoas, Estratégia**.
- Páginas: **Visão geral, Solicitações, Histórico, Infraestrutura, Recursos, Projetos, Missões, Forças, Defesa, População, Pessoas, Inteligência, Território e Relações**.
- Rótulos operacionais, options e notificações principais foram revisados para remover termos ingleses visíveis da experiência de gestão.
- Marca `DOMAIN//OS` é preservada como identidade do produto, não como vocabulário operacional.

## Reconstrução visual
- Nova camada final `styles/app/recovery.css`, carregada depois de `usability.css`.
- Filosofia: **software de gestão primeiro; FUI apenas como identidade secundária**.
- Base tipográfica de 15 px e hit target principal de 44 px.
- Títulos, textos auxiliares, tabelas, cards, formulários, dialogs e inspector recebem piso de legibilidade.
- Retículas, órbitas, anéis, radares, telemetria cenográfica e texturas de HUD sem função são suprimidos.
- Animação ambiental continua desligada; somente feedback local curto permanece.

## Responsividade
- Responsividade continua baseada na largura real da Application (`container-type:inline-size`), não no viewport global.
- Breakpoints de recuperação: **1360 / 1180 / 820 / 560 px**.
- Até 1360 px o Inspector é contextual/drawer.
- Até 1180 px a sidebar deixa a coluna lateral e migra para o topo; somente os filhos do workspace ativo permanecem expostos.
- Até 820 px layouts complexos e Pessoas colapsam progressivamente para uma coluna.
- Até 560 px busca global e chrome não-crítico cedem espaço antes de qualquer redução de fonte; dialogs e FilePicker empilham corretamente.
- Matrizes/tabelas densas usam overflow deliberado em vez de comprimir colunas até ilegibilidade.
- Altura curta reduz chrome e preserva scroll natural da área principal.

## Arquivos de produto alterados contra dev.149
- `scripts/build-css.js`
- `scripts/features/domains/media.js`
- `scripts/ui/navigation.js`
- `scripts/ui/shell-app.js`
- `styles/app/recovery.css` (novo)
- `styles/shell.css` (bundle gerado)
- `templates/app-shell.hbs`
- testes de UI/presentação afetados pela nova semântica em PT-BR
- `tests/ui-recovery-dev150.test.mjs` (novo)

## Invariantes protegidos
- nenhuma alteração em schema/migration;
- nenhuma nova regra de Economy, Simulation, Missions, Requests, Relations, Territory ou Intel;
- nenhuma segunda fonte de verdade para Pessoas ou mídia;
- IDs/nomes internos (`projectName`, `allSquads`, `actorUuid`, etc.) permanecem intactos;
- mudança visual não converte registros legados silenciosamente.

## Regressão e validação
- suíte completa versionada: **283/283 testes verdes**;
- novo gate cobre ordem do CSS de recuperação, navegação PT-BR, página Pessoas, FilePicker/aparência do Domínio, reflow por container, remoção de decoração e regressão de termos ingleses visíveis;
- Handlebars: stack de blocos balanceado;
- JSON: **7/7** parseados;
- JS/MJS: **166/166** aprovados em `node --check`;
- CSS modular e bundle: chaves balanceadas;
- identificadores acidentalmente traduzidos/corrompidos foram verificados e não estão presentes.

## Limite deliberado
A execução não possui Foundry VTT 13.351 real licenciado para aprovar visualmente a composição final. Portanto esta build só passa no **gate estático/funcional**. O gate visual final continua dependente do smoke test do usuário nas janelas reais, começando pela faixa ~1000×550 e depois em tamanhos menores/maiores.

## Veredito
**APROVADA COMO CANDIDATA DEV.150 — APPLICATION SHELL REBUILD / RECOVERY.**

Não iniciar dev.151 enquanto houver microtexto, overflow incorreto, navegação confusa, função de gestão inacessível, inglês operacional visível ou regressão de Pessoas/imagens no Foundry real.
