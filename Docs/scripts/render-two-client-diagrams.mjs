#!/usr/bin/env node
/** Render the two client diagram PNGs only — high resolution */
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const arch = join(root, 'Architecture');
const pngDir = join(root, 'Docs', 'diagrams', 'png');
mkdirSync(pngDir, { recursive: true });

const mmdc = 'npx -y @mermaid-js/mermaid-cli@11';
const cfg = join(root, 'Docs', 'diagrams', 'mermaid-hq-config.json');

const jobs = [
  {
    in: join(arch, 'MMS-Executive-Business-Flow.mmd'),
    out: join(pngDir, 'MMS-Executive-Business-Flow.png'),
    w: 5200,
    s: 3,
  },
  {
    in: join(arch, 'MMS-Master-Module-Flow.mmd'),
    out: join(pngDir, 'MMS-Master-Module-Flow.png'),
    w: 3600,
    s: 2,
  },
];

for (const j of jobs) {
  console.log(`Rendering ${j.out} (${j.w}px @ ${j.s}x)`);
  execSync(
    `${mmdc} -c "${cfg}" -b white -w ${j.w} -s ${j.s} -i "${j.in}" -o "${j.out}"`,
    { stdio: 'inherit', cwd: root },
  );
}

console.log('Done — updated PNGs in Docs/diagrams/png/');
