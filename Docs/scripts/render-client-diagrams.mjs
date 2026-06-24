#!/usr/bin/env node
/**
 * Render high-quality client diagram PNG + SVG exports.
 * Usage: node Docs/scripts/render-client-diagrams.mjs
 */
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const config = join(root, 'Docs', 'diagrams', 'mermaid-hq-config.json');
const pngDir = join(root, 'Docs', 'diagrams', 'png');
const svgDir = join(root, 'Docs', 'diagrams', 'svg');
const archDir = join(root, 'Architecture');

const diagrams = [
  {
    input: join(archDir, 'MMS-Executive-Business-Flow.mmd'),
    name: 'MMS-Executive-Business-Flow',
    width: 2800,
    scale: 3,
  },
  {
    input: join(archDir, 'MMS-Master-Module-Flow.mmd'),
    name: 'MMS-Master-Module-Flow',
    width: 3600,
    scale: 3,
  },
  {
    input: join(archDir, 'MMS-Student-Alias-Dual-ID-Flow.mmd'),
    name: 'MMS-Student-Alias-Dual-ID-Flow',
    width: 2800,
    scale: 3,
  },
];

mkdirSync(pngDir, { recursive: true });
mkdirSync(svgDir, { recursive: true });

const mmdc = 'npx -y @mermaid-js/mermaid-cli@11';

for (const d of diagrams) {
  if (!existsSync(d.input)) {
    console.error(`Missing: ${d.input}`);
    process.exit(1);
  }

  const pngOut = join(pngDir, `${d.name}.png`);
  const svgOut = join(svgDir, `${d.name}.svg`);

  const base = `${mmdc} -c "${config}" -b white -w ${d.width} -s ${d.scale}`;

  console.log(`Rendering PNG: ${d.name} (${d.width}px @ ${d.scale}x)`);
  execSync(`${base} -i "${d.input}" -o "${pngOut}"`, {
    stdio: 'inherit',
    cwd: root,
  });

  console.log(`Rendering SVG: ${d.name}`);
  execSync(`${mmdc} -c "${config}" -b white -i "${d.input}" -o "${svgOut}"`, {
    stdio: 'inherit',
    cwd: root,
  });
}

console.log('\nDone. Outputs:');
console.log(`  PNG → Docs/diagrams/png/`);
console.log(`  SVG → Docs/diagrams/svg/`);
