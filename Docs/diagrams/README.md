# MMS Flow Diagrams — Client Export Package

All architecture and workflow diagrams live as **Mermaid** code inside the planning documents. This folder holds **exported copies** you can download and share with the client.

## Where diagrams come from

| Source document | Diagrams | Content |
|-----------------|----------|---------|
| `Architecture/Enterprise-System-Architecture.md` | 44 | System architecture, TIPS, CBS, QR, school fees, settlement, reconciliation |
| `Database/docs/Database-Schema.md` | 7 | Entity-relationship diagrams |
| `Architecture/Module-Breakdown.md` | 1 | Module dependency map |
| `Architecture/tech-stack.md` | 1 | Stack topology |
| `Docs/BRD-Merchant-Management-System.md` | 1 | BRD context |

**Total: ~54 diagrams**

---

## Option 1 — Browser viewer → PDF (fastest, no install)

1. Open **`Docs/diagrams/Flow-Diagrams-Viewer.html`** in Chrome or Edge (double-click the file)
2. Wait ~30 seconds for all 54 diagrams to render
3. Press **`Ctrl+P`** → **Save as PDF**
4. Send the PDF to the client

This is the easiest way to get **all diagrams in one file**.

---

## Option 2 — One-command extract + PNG export

From the project root:

```bash
# Extract all diagrams + build viewer + consolidated markdown
node Docs/scripts/export-flow-diagrams.mjs

# Optional: render PNG/SVG (requires Node + Chromium; may take 5–10 min)
npm install -g @mermaid-js/mermaid-cli
node Docs/scripts/export-flow-diagrams.mjs --render
```

Output:

| File / Folder | Use for |
|---------------|---------|
| `Flow-Diagrams-Viewer.html` | Open in browser → Print to PDF |
| `All-Flow-Diagrams.md` | Single markdown with all 54 diagrams |
| `INDEX.md` | Catalog with diagram names |
| `source/*.mmd` | Individual Mermaid files |
| `png/` / `svg/` | After `--render` succeeds |

### Zip for client

**PowerShell:**

```powershell
Compress-Archive -Path "Docs\diagrams\Flow-Diagrams-Viewer.html", "Docs\diagrams\All-Flow-Diagrams.md", "Docs\diagrams\INDEX.md", "Docs\diagrams\source" -DestinationPath "Docs\MMS-Flow-Diagrams.zip" -Force
```

Send `Docs/MMS-Flow-Diagrams.zip` to the client.

---

## Option 2 — Mermaid Live Editor (manual, one at a time)

1. Open [https://mermaid.live](https://mermaid.live)
2. Copy any block from `Architecture/Enterprise-System-Architecture.md` (between ` ```mermaid ` and ` ``` `)
3. Paste into the editor
4. Click **Actions → PNG** or **SVG** or **PDF**

Best when you only need 2–3 specific diagrams.

---

## Option 3 — View in Cursor / VS Code

1. Install extension: **Markdown Preview Mermaid Support**
2. Open `Architecture/Enterprise-System-Architecture.md`
3. Press `Ctrl+Shift+V` (Markdown Preview)
4. Right-click diagram → save image (extension-dependent)

---

## Option 4 — Share the architecture PDF path

For a **single document** with all flows in context (not separate images):

1. Open `Architecture/Enterprise-System-Architecture.md` in Cursor
2. Use a Markdown-to-PDF extension, or paste into Notion / Confluence (Mermaid renders automatically)
3. Export as PDF

Sections **7–12** are the main **business workflow** flows the client asked for:

- §7 TIPS integration
- §8 CBS integration
- §9 QR payment
- §10 School fee collection
- §11 Settlement
- §12 Reconciliation

---

## Troubleshooting render

If `--render` fails (Chromium not installed):

```bash
npx puppeteer browsers install chrome-headless-shell
node Docs/scripts/export-flow-diagrams.mjs --render
```

Or use Mermaid Live Editor with files from `Docs/diagrams/source/`.
