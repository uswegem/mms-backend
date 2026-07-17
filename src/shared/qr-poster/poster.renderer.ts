import { Injectable } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit') as typeof import('pdfkit');
import * as QRCode from 'qrcode';
import * as path from 'path';
import * as fs from 'fs';
import { POSTER } from './poster-design';
import { formatLipaNamba } from './format-lipa-namba';

export interface PosterData {
  name: string;
  alias: string;
  tlvPayload: string;
  schoolName: string;
  isActive: boolean;
  statusLabel?: string;
}

// Path to the Letshego logo in the NestJS public/static assets folder.
// Adjust if the asset is served from a different location.
const LETSHEGO_LOGO_PATH = path.resolve(process.cwd(), 'public', 'letshego-faidika-logo.png');

@Injectable()
export class PosterRenderer {
  /** Render one or more student QR posters into a single PDF buffer. */
  async renderPdf(data: PosterData | PosterData[]): Promise<Buffer> {
    const records = Array.isArray(data) ? data : [data];

    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      const doc = new PDFDocument({
        size: [POSTER.WIDTH_PT, POSTER.HEIGHT_PT],
        autoFirstPage: false,
        margin: 0,
      });

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      (async () => {
        for (const record of records) {
          doc.addPage();
          await this.drawPoster(doc, record);
        }
        doc.end();
      })().catch(reject);
    });
  }

  private async drawPoster(doc: PDFKit.PDFDocument, data: PosterData): Promise<void> {
    const W = POSTER.WIDTH_PT;
    const H = POSTER.HEIGHT_PT;

    // ── Background gradient (approximated with gradient fill) ────────────────
    const grad = doc.linearGradient(0, 0, 0, H);
    grad.stop(0, POSTER.COLOR.BLACK);
    grad.stop(0.44, POSTER.COLOR.NEAR_BLACK);
    grad.stop(1, '#c8a400');
    doc.rect(0, 0, W, H).fill(grad);

    // ── White header bar ──────────────────────────────────────────────────────
    const hh = POSTER.HEADER_HEIGHT_PT;
    doc.rect(0, 0, W, hh).fill(POSTER.COLOR.WHITE);

    // TIPS text
    doc
      .fillColor(POSTER.COLOR.HEADER_TEXT)
      .font('Helvetica-BoldOblique')
      .fontSize(POSTER.FONT.TIPS_LABEL)
      .text('TIPS', 12, hh / 2 - POSTER.FONT.TIPS_LABEL / 2, { lineBreak: false });

    // Letshego logo (graceful fallback to text)
    if (fs.existsSync(LETSHEGO_LOGO_PATH)) {
      const logoH = 42;
      const logoW = 110; // estimated; pdfkit scales by height
      doc.image(LETSHEGO_LOGO_PATH, W - logoW - 10, (hh - logoH) / 2, { height: logoH });
    } else {
      doc
        .fillColor('#555555')
        .font('Helvetica')
        .fontSize(8)
        .text('Letshego Faidika Bank', W - 110, hh / 2 - 4, {
          width: 100,
          align: 'right',
          lineBreak: false,
        });
    }

    // ── "LIPA HAPA" ───────────────────────────────────────────────────────────
    let y = hh + 8;
    doc
      .fillColor(POSTER.COLOR.WHITE)
      .font('Helvetica-BoldOblique')
      .fontSize(POSTER.FONT.TITLE)
      .text('LIPA HAPA', 0, y, { width: W, align: 'center', lineBreak: false });

    // ── "SCAN KULIPA" ─────────────────────────────────────────────────────────
    y += POSTER.FONT.TITLE + 4;
    doc
      .fillColor(POSTER.COLOR.GOLD)
      .font('Helvetica-Bold')
      .fontSize(POSTER.FONT.SUBTITLE)
      .text('SCAN KULIPA', 0, y, { width: W, align: 'center', lineBreak: false });

    // ── QR code ───────────────────────────────────────────────────────────────
    y += POSTER.FONT.SUBTITLE + 8;
    const qrSize = 140;
    const qrPng = await QRCode.toBuffer(data.tlvPayload, {
      type: 'png',
      width: qrSize * 2,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#ffffff' },
    });
    // White box behind QR
    const qrX = (W - qrSize - 16) / 2;
    doc.roundedRect(qrX, y, qrSize + 16, qrSize + 16, 6).fill(POSTER.COLOR.WHITE);
    doc.image(qrPng, qrX + 8, y + 8, { width: qrSize, height: qrSize });
    y += qrSize + 24;

    // ── Inactive banner ───────────────────────────────────────────────────────
    if (!data.isActive) {
      const bannerLabel = `${(data.statusLabel ?? 'INACTIVE').toUpperCase()} — QR INACTIVE`;
      doc.roundedRect(20, y, W - 40, 18, 4).fill('#b91c1c');
      doc
        .fillColor(POSTER.COLOR.WHITE)
        .font('Helvetica-Bold')
        .fontSize(POSTER.FONT.INACTIVE_WARN)
        .text(bannerLabel, 20, y + 4, { width: W - 40, align: 'center', lineBreak: false });
      y += 22;
    }

    // ── "LIPA NAMBA" label ────────────────────────────────────────────────────
    doc
      .fillColor('rgba(255,255,255,0.85)')
      .font('Helvetica-BoldOblique')
      .fontSize(POSTER.FONT.LIPA_LABEL)
      .text('LIPA NAMBA', 0, y, {
        width: W,
        align: 'center',
        characterSpacing: 3,
        lineBreak: false,
      });
    y += POSTER.FONT.LIPA_LABEL + 4;

    // ── Gold card ─────────────────────────────────────────────────────────────
    const cardH = 54;
    const cardPad = 16;
    doc.roundedRect(cardPad, y, W - cardPad * 2, cardH, 10).fill(POSTER.COLOR.GOLD);

    const alias = formatLipaNamba(data.alias);
    doc
      .fillColor(POSTER.COLOR.BLACK)
      .font('Helvetica-BoldOblique')
      .fontSize(POSTER.FONT.ALIAS)
      .text(alias, cardPad, y + 5, {
        width: W - cardPad * 2,
        align: 'center',
        characterSpacing: 2,
        lineBreak: false,
      });

    // Separator line
    const sepY = y + 32;
    doc
      .moveTo(cardPad + 10, sepY)
      .lineTo(W - cardPad - 10, sepY)
      .strokeColor('rgba(0,0,0,0.25)')
      .lineWidth(0.75)
      .stroke();

    const nameDisplay =
      data.name.length > 24 ? data.name.slice(0, 23) + '…' : data.name;
    doc
      .fillColor(POSTER.COLOR.BLACK)
      .font('Helvetica-BoldOblique')
      .fontSize(POSTER.FONT.NAME)
      .text(nameDisplay.toUpperCase(), cardPad, sepY + 4, {
        width: W - cardPad * 2,
        align: 'center',
        lineBreak: false,
      });

    y += cardH + 8;

    // ── Footer ────────────────────────────────────────────────────────────────
    doc
      .fillColor(POSTER.COLOR.GOLD)
      .font('Helvetica-BoldOblique')
      .fontSize(POSTER.FONT.FOOTER)
      .text('Lipa kutoka Benki au Mtandao wowote wa Simu', 0, y, {
        width: W,
        align: 'center',
        lineBreak: false,
      });
  }
}
