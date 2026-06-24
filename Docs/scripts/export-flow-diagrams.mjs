/**
 * Extract all Mermaid flow diagrams from project docs and optionally render to PNG/SVG.
 *
 * Usage:
 *   node Docs/scripts/export-flow-diagrams.mjs           # extract .mmd files only
 *   node Docs/scripts/export-flow-diagrams.mjs --render  # also render PNG + SVG
 *   node Docs/scripts/export-flow-diagrams.mjs --render --format pdf
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const SOURCE_FILES = [
  'Architecture/Enterprise-System-Architecture.md',
  'Architecture/Module-Breakdown.md',
  'Architecture/tech-stack.md',
  'Database/docs/Database-Schema.md',
  'Docs/BRD-Merchant-Management-System.md',
];

const OUT_DIR = path.join(ROOT, 'Docs/diagrams');
const MMD_DIR = path.join(OUT_DIR, 'source');
const PNG_DIR = path.join(OUT_DIR, 'png');
const SVG_DIR = path.join(OUT_DIR, 'svg');
const PDF_DIR = path.join(OUT_DIR, 'pdf');

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);
}

function extractDiagrams(filePath) {
  const fullPath = path.join(ROOT, filePath);
  if (!fs.existsSync(fullPath)) return [];

  const content = fs.readFileSync(fullPath, 'utf8');
  const lines = content.split('\n');
  const docSlug = path.basename(filePath, '.md').toLowerCase().replace(/\s+/g, '-');
  const diagrams = [];

  let currentHeading = 'diagram';
  let inMermaid = false;
  let mermaidLines = [];
  let index = 0;

  for (const line of lines) {
    if (line.startsWith('#')) {
      currentHeading = line.replace(/^#+\s*/, '').trim();
    }

    if (line.trim() === '```mermaid') {
      inMermaid = true;
      mermaidLines = [];
      continue;
    }

    if (inMermaid && line.trim() === '```') {
      inMermaid = false;
      index += 1;
      const id = `${docSlug}--${String(index).padStart(2, '0')}--${slugify(currentHeading)}`;
      diagrams.push({
        id,
        title: currentHeading,
        source: filePath,
        code: mermaidLines.join('\n'),
      });
      continue;
    }

    if (inMermaid) {
      mermaidLines.push(line);
    }
  }

  return diagrams;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeConsolidatedMarkdown(diagrams) {
  let md = `# MMS — All Flow Diagrams (Client Package)\n\n`;
  md += `> ${diagrams.length} diagrams · Generated ${new Date().toISOString().slice(0, 10)}\n\n`;
  md += `Open this file in **VS Code / Cursor** with Mermaid preview, or export to PDF.\n\n---\n\n`;

  let lastSource = '';
  for (const d of diagrams) {
    if (d.source !== lastSource) {
      md += `## Source: ${d.source}\n\n`;
      lastSource = d.source;
    }
    md += `### ${d.title}\n\n`;
    md += '```mermaid\n' + d.code + '\n```\n\n';
  }

  fs.writeFileSync(path.join(OUT_DIR, 'All-Flow-Diagrams.md'), md);
}

function writeHtmlViewer(diagrams) {
  const sections = diagrams
    .map(
      (d, i) => `
    <section class="diagram-page" id="diagram-${i + 1}">
      <div class="meta">${d.source}</div>
      <h2>${i + 1}. ${escapeHtml(d.title)}</h2>
      <pre class="mermaid">${escapeHtml(d.code)}</pre>
    </section>`,
    )
    .join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>MMS Flow Diagrams — ${diagrams.length} diagrams</title>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Inter, system-ui, sans-serif; margin: 0; background: #f8fafc; color: #0f172a; }
    header { background: #0f2942; color: #fff; padding: 1.5rem 2rem; position: sticky; top: 0; z-index: 10; }
    header h1 { margin: 0 0 0.25rem; font-size: 1.25rem; }
    header p { margin: 0; font-size: 0.85rem; opacity: 0.8; }
    nav { background: #fff; border-bottom: 1px solid #e2e8f0; padding: 0.75rem 2rem; display: flex; gap: 0.5rem; flex-wrap: wrap; position: sticky; top: 72px; z-index: 9; }
    nav button { padding: 0.4rem 0.75rem; border: 1px solid #e2e8f0; background: #fff; border-radius: 6px; cursor: pointer; font-size: 0.75rem; }
    nav button:hover { background: #f1f5f9; }
    main { max-width: 1200px; margin: 0 auto; padding: 2rem; }
    .diagram-page { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 1.5rem 2rem; margin-bottom: 2rem; page-break-inside: avoid; }
    .diagram-page h2 { margin: 0 0 1rem; font-size: 1.1rem; }
    .meta { font-size: 0.7rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem; }
    .mermaid { display: flex; justify-content: center; }
    @media print {
      header nav { display: none; }
      .diagram-page { page-break-after: always; border: none; box-shadow: none; }
    }
  </style>
</head>
<body>
  <header>
    <h1>MMS Platform — Flow Diagrams</h1>
    <p>${diagrams.length} architecture &amp; workflow diagrams · TANQR / TIPS · Tanzania</p>
  </header>
  <nav>
    <button onclick="window.print()">🖨 Print / Save as PDF</button>
    <button onclick="document.getElementById('workflow').scrollIntoView()">Workflow flows (§7–12)</button>
    <button onclick="document.getElementById('diagram-1').scrollIntoView()">Top</button>
  </nav>
  <main>
    <div id="workflow"></div>
    ${sections}
  </main>
  <script>
    mermaid.initialize({ startOnLoad: true, theme: 'neutral', securityLevel: 'loose' });
    // Mark workflow section anchor
    const wf = document.getElementById('diagram-21');
    if (wf) wf.id = 'workflow';
  </script>
</body>
</html>`;

  fs.writeFileSync(path.join(OUT_DIR, 'Flow-Diagrams-Viewer.html'), html);
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function writeIndex(diagrams) {
  const bySource = {};
  for (const d of diagrams) {
    if (!bySource[d.source]) bySource[d.source] = [];
    bySource[d.source].push(d);
  }

  let md = `# MMS Flow Diagrams — Export Index\n\n`;
  md += `| Field | Value |\n|-------|-------|\n`;
  md += `| **Generated** | ${new Date().toISOString().slice(0, 10)} |\n`;
  md += `| **Total diagrams** | ${diagrams.length} |\n`;
  md += `| **Formats** | Source (.mmd), PNG, SVG |\n\n`;
  md += `## Quick download\n\n`;
  md += `All rendered images are in:\n\n`;
  md += `- \`Docs/diagrams/png/\` — PNG images (best for PowerPoint / Word)\n`;
  md += `- \`Docs/diagrams/svg/\` — SVG vectors (best for print / scaling)\n`;
  md += `- \`Docs/diagrams/source/\` — Mermaid source (editable)\n\n`;
  md += `## Diagram catalog\n\n`;

  for (const [source, items] of Object.entries(bySource)) {
    md += `### ${source}\n\n`;
    md += `| # | Title | PNG | SVG | Source |\n`;
    md += `|---|-------|-----|-----|--------|\n`;
    for (const d of items) {
      md += `| ${d.id.split('--')[1]} | ${d.title} | [png](../png/${d.id}.png) | [svg](../svg/${d.id}.svg) | [mmd](../source/${d.id}.mmd) |\n`;
    }
    md += `\n`;
  }

  fs.writeFileSync(path.join(OUT_DIR, 'INDEX.md'), md);
}

function mmdcBin() {
  const win = process.platform === 'win32';
  return path.join(__dirname, 'node_modules', '.bin', win ? 'mmdc.cmd' : 'mmdc');
}

function renderDiagrams(diagrams, format = 'png') {
  const dirs = { png: PNG_DIR, svg: SVG_DIR, pdf: PDF_DIR };
  const targets = format === 'all' ? ['png', 'svg'] : [format];
  const mmdc = mmdcBin();

  if (!fs.existsSync(mmdc)) {
    console.error('mmdc not found. Run: cd Docs/scripts && npm install');
    process.exit(1);
  }

  for (const fmt of targets) {
    ensureDir(dirs[fmt]);
  }

  console.log(`Rendering ${diagrams.length} diagrams with local mmdc...`);
  let ok = 0;
  let fail = 0;

  for (const d of diagrams) {
    const mmdPath = path.join(MMD_DIR, `${d.id}.mmd`);
    for (const fmt of targets) {
      const outPath = path.join(dirs[fmt], `${d.id}.${fmt}`);
      try {
        execSync(
          `"${mmdc}" -i "${mmdPath}" -o "${outPath}" -b white -q`,
          { stdio: 'pipe', cwd: ROOT, timeout: 180_000, shell: true },
        );
        console.log(`  ✓ ${d.id}.${fmt}`);
        ok += 1;
      } catch (err) {
        console.error(`  ✗ ${d.id}.${fmt}`);
        fail += 1;
      }
    }
  }
  console.log(`\nRendered: ${ok} ok, ${fail} failed`);
}

// ─── Main ───
const args = process.argv.slice(2);
const shouldRender = args.includes('--render');
const formatArg = args.find((a) => a.startsWith('--format='));
const format = formatArg ? formatArg.split('=')[1] : 'png';

ensureDir(MMD_DIR);

const allDiagrams = [];
for (const file of SOURCE_FILES) {
  const found = extractDiagrams(file);
  allDiagrams.push(...found);
  console.log(`${file}: ${found.length} diagram(s)`);
}

for (const d of allDiagrams) {
  fs.writeFileSync(path.join(MMD_DIR, `${d.id}.mmd`), d.code + '\n');
}

writeIndex(allDiagrams);
writeConsolidatedMarkdown(allDiagrams);
writeHtmlViewer(allDiagrams);
console.log(`\nExtracted ${allDiagrams.length} diagrams → Docs/diagrams/source/`);
console.log(`Index written → Docs/diagrams/INDEX.md`);
console.log(`Consolidated doc → Docs/diagrams/All-Flow-Diagrams.md`);
console.log(`Browser viewer → Docs/diagrams/Flow-Diagrams-Viewer.html`);

if (shouldRender) {
  renderDiagrams(allDiagrams, format);
  console.log(`\nDone. Open Docs/diagrams/png/ or zip Docs/diagrams/ for the client.`);
} else {
  console.log(`\nTo render PNG/SVG, run:`);
  console.log(`  node Docs/scripts/export-flow-diagrams.mjs --render`);
}
