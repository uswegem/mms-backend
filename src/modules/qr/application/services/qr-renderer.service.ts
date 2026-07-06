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

@Injectable()
export class QrRendererService {
  async renderPng(payload: string, width = 300): Promise<RenderedQrAsset> {
    const buffer = await QRCode.toBuffer(payload, {
      type: 'png',
      width,
      margin: 2,
      errorCorrectionLevel: 'M',
    });
    return {
      format: 'png',
      buffer,
      width,
      height: width,
      fileHash: createHash('sha256').update(buffer).digest('hex'),
    };
  }

  async renderSvg(payload: string, width = 300): Promise<RenderedQrAsset> {
    const svg = await QRCode.toString(payload, {
      type: 'svg',
      width,
      margin: 2,
      errorCorrectionLevel: 'M',
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
