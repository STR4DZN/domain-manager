import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CSS_FILES = [
  "styles/app/tokens.css",
  "styles/app/base.css",
  "styles/app/navigation.css",
  "styles/app/components.css",
  "styles/app/views.css",
  "styles/app/dialogs.css"
];

export function buildCss() {
  const banner = `/* DOMAIN MANAGER // STRATEGIC OPERATIONS SYSTEM\n   Generated bundle. Source: styles/app/*.css\n*/\n`;
  const parts = [banner];
  for (const relativePath of CSS_FILES) {
    const fullPath = path.join(ROOT, relativePath);
    if (!fs.existsSync(fullPath)) throw new Error(`CSS source ausente: ${relativePath}`);
    parts.push(`\n/* --- ${relativePath} --- */\n${fs.readFileSync(fullPath, "utf8")}`);
  }
  const outputPath = path.join(ROOT, "styles/shell.css");
  fs.writeFileSync(outputPath, parts.join("\n"), "utf8");
  console.log(`[build-css] ${CSS_FILES.length} módulos -> styles/shell.css`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) buildCss();
