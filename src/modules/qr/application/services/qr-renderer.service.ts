import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import * as QRCode from 'qrcode';

export interface RenderedQrAsset {
  format: 'png' | 'svg';
  buffer: Buffer;
  width: number;
  height: number;
  fileHash: string;
}

/**
 * These QR codes get printed and laminated at branches/schools, so the
 * render settings are chosen for physical durability, not just on-screen
 * display — do not silently loosen them:
 *
 * - errorCorrectionLevel 'Q' (~25% codeword recovery): TIPS QR stickers take
 *   real wear (dirt, glare, scuffs). 'M' (~15%) is the bare floor for a QR
 *   that's only ever viewed on-screen; anything printed needs Q or higher.
 * - margin 4 (modules): the ISO/IEC 18004 minimum quiet zone, and the
 *   `qrcode` package's own default — do not reduce this, tighter margins
 *   cause real scan failures on lower-quality printers.
 * - width 400 (px): at Q, the longest payload this system produces (a
 *   dynamic QR with all tag 62 sub-fields populated, ~61x61 modules) still
 *   only gets ~5.8 px/module at 400px with the margin above — below that,
 *   printed/laminated copies get too dense to reliably decode.
 */
const QR_ERROR_CORRECTION_LEVEL = 'Q';
const QR_MARGIN_MODULES = 4;
const QR_DEFAULT_WIDTH_PX = 400;

@Injectable()
export class QrRendererService {
  async renderPng(payload: string, width = QR_DEFAULT_WIDTH_PX): Promise<RenderedQrAsset> {
    const buffer = await QRCode.toBuffer(payload, {
      type: 'png',
      width,
      margin: QR_MARGIN_MODULES,
      errorCorrectionLevel: QR_ERROR_CORRECTION_LEVEL,
    });
    return {
      format: 'png',
      buffer,
      width,
      height: width,
      fileHash: createHash('sha256').update(buffer).digest('hex'),
    };
  }

  async renderSvg(payload: string, width = QR_DEFAULT_WIDTH_PX): Promise<RenderedQrAsset> {
    const svg = await QRCode.toString(payload, {
      type: 'svg',
      width,
      margin: QR_MARGIN_MODULES,
      errorCorrectionLevel: QR_ERROR_CORRECTION_LEVEL,
    });
    const buffer = Buffer.from(svg, 'utf8');
    return {
      format: 'svg',
      buffer,
      width,
      height: width,
      fileHash: createHash('sha256').update(buffer).digest('hex'),
    };
  }

  async renderAll(payload: string): Promise<RenderedQrAsset[]> {
    return Promise.all([this.renderPng(payload), this.renderSvg(payload)]);
  }
}
