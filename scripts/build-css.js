import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const CSS_FILES = [
  "styles/tokens/colors.css",
  "styles/tokens/typography.css",
  "styles/tokens/layout.css",
  "styles/components/buttons.css",
  "styles/components/cards.css",
  "styles/components/badges.css",
  "styles/components/tree.css",
  "styles/components/modals.css",
  "styles/components/biomonitor.css",
  "styles/components/image-studio.css",
  "styles/views/rail.css",
  "styles/views/sidebar.css",
  "styles/views/header.css",
  "styles/views/overview.css",
  "styles/views/economy.css",
  "styles/views/projects.css",
  "styles/views/people.css",
  "styles/views/diplomacy.css",
  "styles/views/intel.css",
  "styles/views/history.css",
  "styles/views/transitions.css"
];

const SHELL_SHELL_BASE = `/* ==========================================================================
   DOMAIN MANAGER - MODULAR SCI-FI COCKPIT THEME (ASSEMBLED BUNDLE)
   Foundry VTT v13 ApplicationV2
   Gerado automaticamente a partir dos módulos em styles/tokens, styles/components e styles/views.
   ========================================================================== */

.domain-manager-shell-window .window-content {
  padding: 0;
  overflow: hidden;
  background-color: #02060b;
  color: #f5fffd;
  font-family: var(--dm-font-primary, system-ui, sans-serif);
}

.dm-shell {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  background: #02060b;
  overflow: hidden;
  user-select: none;
  position: relative;
}

.dm-shell__layout {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.dm-shell__body {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.dm-shell__main {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

.dm-workspace {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.dm-footer {
  height: var(--dm-footer-height, 32px);
  background: #010408;
  border-top: 1px solid var(--dm-border-dark, #072b38);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  font-family: var(--dm-font-mono, monospace);
  font-size: 0.72rem;
  color: var(--dm-text-dim, #1e5a66);
  flex-shrink: 0;
}
`;

export function buildCss() {
  const parts = [SHELL_SHELL_BASE];

  for (const relPath of CSS_FILES) {
    const fullPath = path.join(ROOT, relPath);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, "utf8");
      parts.push(`\n/* --- ${relPath} --- */\n` + content);
    } else {
      console.warn(`[build-css] Arquivo não encontrado: ${relPath}`);
    }
  }

  const outputPath = path.join(ROOT, "styles/shell.css");
  fs.writeFileSync(outputPath, parts.join("\n"), "utf8");
  console.log(`[build-css] styles/shell.css gerado com sucesso (${parts.length} partes).`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  buildCss();
}
