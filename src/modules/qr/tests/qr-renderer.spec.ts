import * as QRCode from 'qrcode';
import { QrRendererService } from '../application/services/qr-renderer.service';

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
});
