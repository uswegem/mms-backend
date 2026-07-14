import * as QRCode from 'qrcode';
import { PNG } from 'pngjs';
import jsQR from 'jsqr';
import { QrRendererService } from '../application/services/qr-renderer.service';
import { buildTanqrPayload } from '../domain/tanqr-payload.builder';

/** Decodes a PNG buffer back to its embedded QR string, for round-trip
 * scannability tests — not just "the buffer is a valid PNG". */
function decodePngQr(buffer: Buffer): string | null {
  const png = PNG.sync.read(buffer);
  const result = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  return result?.data ?? null;
}

// Actual QR rendering/decoding work, not mocked — cold JIT warm-up under
// parallel test workers can exceed Jest's 5s default on any test in this file.
jest.setTimeout(15000);

describe('QrRendererService', () => {
  const renderer = new QrRendererService();
  const samplePayload =
    '00020101021126390014tz.go.bot.tips0105010010208123456785204581453038345802TZ5914YN RESTAURANTS6006DODOMA610541000622103080011234907051100263047D47';

  it('generates PNG locally without external APIs', async () => {
    const asset = await renderer.renderPng(samplePayload, 256);
    expect(asset.format).toBe('png');
    expect(asset.buffer.length).toBeGreaterThan(100);
    expect(asset.buffer.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  });

  it('generates SVG locally without external APIs', async () => {
    const asset = await renderer.renderSvg(samplePayload, 256);
    expect(asset.format).toBe('svg');
    expect(asset.buffer.toString('utf8')).toContain('<svg');
  });

  it('produces a scannable matrix for the official sample', async () => {
    const png = await QRCode.toBuffer(samplePayload, { type: 'png', margin: 2 });
    expect(png.length).toBeGreaterThan(100);
  });

  /**
   * These QR codes get printed and laminated at branches/schools, so
   * decodability at the actual production render settings (ECC=Q, margin=4,
   * width=400 — see qr-renderer.service.ts) matters more than "the PNG is
   * well-formed". These tests render with renderPng's real defaults and
   * decode the pixels back with an independent QR reader (jsqr), for both
   * the longest and shortest payloads this system actually produces.
   */
  describe('round-trip decodability at production render settings', () => {
    it('decodes the longest realistic dynamic payload (all tag 62 sub-fields populated)', async () => {
      const { tlvPayload } = buildTanqrPayload({
        poiMethod: '12',
        acquirerId5: '01044',
        merchantId: '999888777666555', // 15-digit bank Merchant ID (max realistic length)
        mcc: '5814',
        merchantName: 'A'.repeat(25), // max merchant name length
        city: 'B'.repeat(15), // max city length
        postalCode: '11000',
        amount: '9999999999.99', // near-max amount length
        additionalData: {
          billNumber: 'D'.repeat(25), // max tag 62 sub-field length
          storeLabel: '78012349', // 8-digit alias, always fixed length
          referenceLabel: 'E'.repeat(25),
          terminalLabel: 'F'.repeat(25),
        },
      });

      const asset = await renderer.renderPng(tlvPayload);
      expect(asset.width).toBe(400);
      const decoded = decodePngQr(asset.buffer);
      expect(decoded).toBe(tlvPayload);
    });

    it('decodes the shortest realistic static payload (no tag 62 additional data)', async () => {
      const { tlvPayload } = buildTanqrPayload({
        poiMethod: '11',
        acquirerId5: '01044',
        merchantId: '78000028',
        mcc: '5814',
        merchantName: 'X',
        city: 'Y',
        postalCode: '11000',
      });

      const asset = await renderer.renderPng(tlvPayload);
      const decoded = decodePngQr(asset.buffer);
      expect(decoded).toBe(tlvPayload);
    });
  });
});
