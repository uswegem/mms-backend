import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const path = join(root, 'Architecture', 'MMS-Master-Module-Flow.md');
let c = readFileSync(path, 'utf8');

const d2 = `## Diagram 2 — Master module map (all milestones)

*Technical module view with student alias service, bulk upload, and payment routing.*

![Master Module Flow](../Docs/diagrams/png/MMS-Master-Module-Flow.png)

*Mermaid source: \`Architecture/MMS-Master-Module-Flow.mmd\`*

**PNG (high resolution):** \`Docs/diagrams/png/MMS-Master-Module-Flow.png\` (3600px @ 3× scale)

**SVG (vector):** \`Docs/diagrams/svg/MMS-Master-Module-Flow.svg\``;

const d3 = `## Diagram 3 — Student alias dual-ID flow (school fees)

*Confirms client requirement: permanent pay bill per student, funds to school account.*

![Student Alias Dual-ID Flow](../Docs/diagrams/png/MMS-Student-Alias-Dual-ID-Flow.png)

*Mermaid source: \`Architecture/MMS-Student-Alias-Dual-ID-Flow.mmd\`*

**PNG (high resolution):** \`Docs/diagrams/png/MMS-Student-Alias-Dual-ID-Flow.png\` (2800px @ 3× scale)

**SVG (vector):** \`Docs/diagrams/svg/MMS-Student-Alias-Dual-ID-Flow.svg\``;

c = c.replace(
  /## Diagram 2[\s\S]*?\*\*SVG \(vector\):\*\* `Docs\/diagrams\/svg\/MMS-Master-Module-Flow\.svg`/,
  d2,
);
c = c.replace(
  /## Diagram 3[\s\S]*?\*\*SVG \(vector\):\*\* `Docs\/diagrams\/svg\/MMS-Student-Alias-Dual-ID-Flow\.svg`/,
  d3,
);
c = c.replace('Prepared for client sign-off — v1.1', 'Prepared for client sign-off — v1.2');

writeFileSync(path, c);
writeFileSync(
  join(root, 'Docs', 'MMS-Client-Master-Flow-Deliverable', 'MMS-Master-Module-Flow.md'),
  c.replaceAll('../Docs/diagrams/', '../diagrams/'),
);
console.log('Patched deliverable markdown');
