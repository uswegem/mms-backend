import { QrAnnex2DisplayService } from '../application/services/qr-annex2-display.service';
import { QrRendererService } from '../application/services/qr-renderer.service';

// Actual QR/PDF rendering work, not mocked — cold JIT warm-up under parallel
// test workers can exceed Jest's 5s default (same class of flake fixed in
// qr-renderer.spec.ts).
jest.setTimeout(15000);

describe('QrAnnex2DisplayService', () => {
  const annex2 = new QrAnnex2DisplayService();
  const renderer = new QrRendererService();
  const samplePayload =
    '00020101021126390014tz.go.bot.tips0105010010208123456785204581453038345802TZ5914YN RESTAURANTS6006DODOMA610541000622103080011234907051100263047D47';

  it('renders Annex 2 SVG with Parts A–C', async () => {
    const qrPng = await renderer.renderPng(samplePayload, 200);
    const svg = annex2.renderSvg({
      merchantName: 'YN RESTAURANTS',
      aliasMerchantId: '00112349',
      qrImagePng: qrPng.buffer,
      tipsLabel: 'TIPS',
      acquirerName: 'Bank A',
      acquirerSlogan: 'Scan to Pay with TANQR',
      paperSize: 'A8',
    });

    expect(svg).toContain('part-a');
    expect(svg).toContain('part-b');
    expect(svg).toContain('part-c');
    expect(svg).toContain('00112349');
    expect(svg).toContain('YN RESTAURANTS');
  });

  it('renders Annex 2 PDF buffer', async () => {
    const qrPng = await renderer.renderPng(samplePayload, 200);
    const pdf = await annex2.renderPdf({
      merchantName: 'YN RESTAURANTS',
      aliasMerchantId: '00112349',
      qrImagePng: qrPng.buffer,
      paperSize: 'A8',
    });

    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pdf.length).toBeGreaterThan(500);
  });
});
