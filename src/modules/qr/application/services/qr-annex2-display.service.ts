import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { DEFAULT_PAPER_SIZE, resolvePaperSize } from '../../domain/paper-sizes';

export interface Annex2DisplayInput {
  merchantName: string;
  aliasMerchantId: string;
  qrImagePng: Buffer;
  tipsLabel?: string;
  acquirerName?: string;
  acquirerSlogan?: string;
  paperSize?: string;
}

@Injectable()
export class QrAnnex2DisplayService {
  renderSvg(input: Annex2DisplayInput): string {
    const paper = resolvePaperSize(input.paperSize ?? DEFAULT_PAPER_SIZE);
    const width = paper.widthMm;
    const height = paper.heightMm;
    const qrSize = paper.qrSideMm;
    const partAHeight = height * 0.18;
    const partBHeight = height * 0.42;
    const partCHeight = height * 0.28;
    const partDHeight = height - partAHeight - partBHeight - partCHeight;

    const qrX = (width - qrSize) / 2;
    const qrY = partAHeight + (partBHeight - qrSize) / 2;
    const qrBase64 = input.qrImagePng.toString('base64');
    const merchantName = this.escapeXml(input.merchantName.toUpperCase());
    const alias = this.escapeXml(input.aliasMerchantId);
    const aliasBoxW = Math.min(width - 16, 52);
    const aliasBoxX = (width - aliasBoxW) / 2;
    const aliasBoxY = partAHeight + partBHeight + 8;

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#ffffff" stroke="#000000" stroke-width="0.6"/>
  <line x1="0" y1="${partAHeight}" x2="${width}" y2="${partAHeight}" stroke="#000000" stroke-width="0.4"/>
  <line x1="0" y1="${partAHeight + partBHeight}" x2="${width}" y2="${partAHeight + partBHeight}" stroke="#000000" stroke-width="0.4"/>
  <line x1="0" y1="${partAHeight + partBHeight + partCHeight}" x2="${width}" y2="${partAHeight + partBHeight + partCHeight}" stroke="#000000" stroke-width="0.4"/>
  <g id="part-a">
    <text x="${width / 2}" y="${partAHeight * 0.45}" font-family="Arial, sans-serif" font-size="7" font-weight="700" font-style="italic" fill="#3B5B9A" text-anchor="middle">TIPS</text>
    <text x="${width / 2}" y="${partAHeight * 0.62}" font-family="Arial, sans-serif" font-size="2.8" fill="#6B7280" text-anchor="middle">TANZANIA INSTANT PAYMENTS SYSTEM</text>
  </g>
  <g id="part-b">
    <image x="${qrX}" y="${qrY}" width="${qrSize}" height="${qrSize}" href="data:image/png;base64,${qrBase64}"/>
  </g>
  <g id="part-c">
    <rect x="${aliasBoxX}" y="${aliasBoxY}" width="${aliasBoxW}" height="10" fill="#ececec" stroke="#000000" stroke-width="0.35"/>
    <text x="${width / 2}" y="${aliasBoxY + 7}" font-family="Courier New, monospace" font-size="5.5" font-weight="700" fill="#000000" text-anchor="middle" letter-spacing="0.8">${alias}</text>
    <text x="${width / 2}" y="${aliasBoxY + 16}" font-family="Arial, sans-serif" font-size="4.2" font-weight="700" fill="#000000" text-anchor="middle">${merchantName}</text>
  </g>
</svg>`;
  }

  async renderPdf(input: Annex2DisplayInput): Promise<Buffer> {
    const paper = resolvePaperSize(input.paperSize ?? DEFAULT_PAPER_SIZE);
    const widthPt = this.mmToPt(paper.widthMm);
    const heightPt = this.mmToPt(paper.heightMm);
    const qrSizePt = this.mmToPt(paper.qrSideMm);

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: [widthPt, heightPt],
        margin: 0,
      });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const partAHeight = heightPt * 0.18;
      const partBHeight = heightPt * 0.42;
      const partCHeight = heightPt * 0.28;
      const qrY = partAHeight + (partBHeight - qrSizePt) / 2;
      const qrX = (widthPt - qrSizePt) / 2;

      doc.rect(0, 0, widthPt, heightPt).stroke('#000000');
      doc.moveTo(0, partAHeight).lineTo(widthPt, partAHeight).stroke('#000000');
      doc.moveTo(0, partAHeight + partBHeight).lineTo(widthPt, partAHeight + partBHeight).stroke('#000000');
      doc.moveTo(0, partAHeight + partBHeight + partCHeight).lineTo(widthPt, partAHeight + partBHeight + partCHeight).stroke('#000000');

      doc
        .fillColor('#3B5B9A')
        .fontSize(14)
        .text('TIPS', 0, partAHeight * 0.28, { width: widthPt, align: 'center' });
      doc
        .fillColor('#6B7280')
        .fontSize(6)
        .text('TANZANIA INSTANT PAYMENTS SYSTEM', 0, partAHeight * 0.52, {
          width: widthPt,
          align: 'center',
        });

      doc.image(input.qrImagePng, qrX, qrY, {
        width: qrSizePt,
        height: qrSizePt,
      });

      const aliasBoxW = Math.min(widthPt - 32, 140);
      const aliasBoxX = (widthPt - aliasBoxW) / 2;
      const aliasBoxY = partAHeight + partBHeight + 12;
      doc.rect(aliasBoxX, aliasBoxY, aliasBoxW, 22).fillAndStroke('#ececec', '#000000');
      doc
        .fillColor('#000000')
        .font('Courier')
        .fontSize(14)
        .text(input.aliasMerchantId, aliasBoxX, aliasBoxY + 5, {
          width: aliasBoxW,
          align: 'center',
        });
      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .text(input.merchantName.toUpperCase(), 0, aliasBoxY + 32, {
          width: widthPt,
          align: 'center',
        });

      if (input.acquirerSlogan) {
        doc
          .fillColor('#64748b')
          .font('Helvetica')
          .fontSize(7)
          .text(input.acquirerSlogan, 0, heightPt - 20, {
            width: widthPt,
            align: 'center',
          });
      }

      doc.end();
    });
  }

  private mmToPt(mm: number): number {
    return (mm / 25.4) * 72;
  }

  private escapeXml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
