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
    const partAHeight = height * 0.16;
    const partBHeight = qrSize + 8;
    const partCHeight = height * 0.2;
    const partDHeight = height - partAHeight - partBHeight - partCHeight;

    const qrX = (width - qrSize) / 2;
    const qrY = partAHeight + 4;
    const qrBase64 = input.qrImagePng.toString('base64');

    const tipsLabel = this.escapeXml(input.tipsLabel ?? 'TIPS');
    const acquirerName = this.escapeXml(input.acquirerName ?? 'Service Acquirer');
    const acquirerSlogan = this.escapeXml(
      input.acquirerSlogan ?? 'Scan to Pay with TANQR',
    );
    const merchantName = this.escapeXml(input.merchantName.toUpperCase());
    const alias = this.escapeXml(input.aliasMerchantId);

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#ffffff"/>
  <!-- Part A: Network facilitator logos -->
  <g id="part-a">
    <rect x="2" y="2" width="${width - 4}" height="${partAHeight - 2}" fill="#f8fafc" stroke="#e2e8f0"/>
    <text x="6" y="${partAHeight * 0.55}" font-family="Arial, sans-serif" font-size="5" font-weight="700" fill="#1d4ed8">${tipsLabel}</text>
    <text x="${width - 6}" y="${partAHeight * 0.55}" font-family="Arial, sans-serif" font-size="4" fill="#334155" text-anchor="end">${acquirerName}</text>
  </g>
  <!-- Part B: QR code image -->
  <g id="part-b">
    <image x="${qrX}" y="${qrY}" width="${qrSize}" height="${qrSize}" href="data:image/png;base64,${qrBase64}"/>
  </g>
  <!-- Part C: Merchant details -->
  <g id="part-c">
    <text x="${width / 2}" y="${qrY + qrSize + 10}" font-family="Arial, sans-serif" font-size="6.5" font-weight="700" fill="#0f172a" text-anchor="middle" letter-spacing="1">${alias}</text>
    <text x="${width / 2}" y="${qrY + qrSize + 16}" font-family="Arial, sans-serif" font-size="4.5" font-weight="600" fill="#334155" text-anchor="middle">${merchantName}</text>
  </g>
  <!-- Part D: FSP branding -->
  <g id="part-d">
    <rect x="2" y="${height - partDHeight + 2}" width="${width - 4}" height="${partDHeight - 4}" fill="#f8fafc" stroke="#e2e8f0"/>
    <text x="${width / 2}" y="${height - partDHeight / 2}" font-family="Arial, sans-serif" font-size="3.8" fill="#64748b" text-anchor="middle">${acquirerSlogan}</text>
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

      const partAHeight = heightPt * 0.16;
      const qrY = partAHeight + this.mmToPt(4);
      const qrX = (widthPt - qrSizePt) / 2;

      doc.rect(4, 4, widthPt - 8, partAHeight - 4).fill('#f8fafc');
      doc
        .fillColor('#1d4ed8')
        .fontSize(9)
        .text(input.tipsLabel ?? 'TIPS', 10, 12, { width: widthPt / 2 - 10 });
      doc
        .fillColor('#334155')
        .fontSize(8)
        .text(input.acquirerName ?? 'Service Acquirer', widthPt / 2, 12, {
          width: widthPt / 2 - 10,
          align: 'right',
        });

      doc.image(input.qrImagePng, qrX, qrY, {
        width: qrSizePt,
        height: qrSizePt,
      });

      doc
        .fillColor('#0f172a')
        .fontSize(11)
        .text(input.aliasMerchantId, 0, qrY + qrSizePt + 14, {
          width: widthPt,
          align: 'center',
        });
      doc
        .fillColor('#334155')
        .fontSize(9)
        .text(input.merchantName.toUpperCase(), 0, qrY + qrSizePt + 28, {
          width: widthPt,
          align: 'center',
        });

      const footerY = heightPt - this.mmToPt(12);
      doc.rect(4, footerY, widthPt - 8, this.mmToPt(10)).fill('#f8fafc');
      doc
        .fillColor('#64748b')
        .fontSize(7)
        .text(input.acquirerSlogan ?? 'Scan to Pay with TANQR', 0, footerY + 8, {
          width: widthPt,
          align: 'center',
        });

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
