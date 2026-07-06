import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import type { RenderedQrAsset } from './qr-renderer.service';

export interface StoredQrAsset {
  format: 'png' | 'svg';
  storagePath: string;
  publicUrl: string;
  fileHash: string;
  width: number;
  height: number;
  sizeBytes: number;
}

@Injectable()
export class QrStorageService {
  private readonly root: string;
  private readonly bucket: string;

  constructor(private readonly config: ConfigService) {
    this.root = this.config.get<string>('qr.storagePath') ?? join(process.cwd(), 'storage');
    this.bucket = this.config.get<string>('qr.storageBucket') ?? 'local';
  }

  buildRelativePath(
    merchantId: string,
    qrId: string,
    version: number,
    format: 'png' | 'svg',
  ): string {
    return join('qr', merchantId, qrId, `v${version}.${format}`);
  }

  toPublicUrl(relativePath: string): string {
    const normalized = relativePath.replace(/\\/g, '/');
    return `/storage/${normalized}`;
  }

  async saveRenderedAssets(
    merchantId: string,
    qrId: string,
    version: number,
    assets: RenderedQrAsset[],
  ): Promise<StoredQrAsset[]> {
    const stored: StoredQrAsset[] = [];
    for (const asset of assets) {
      const relativePath = this.buildRelativePath(
        merchantId,
        qrId,
        version,
        asset.format,
      );
      const absolutePath = join(this.root, relativePath);
      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, asset.buffer);
      stored.push({
        format: asset.format,
        storagePath: relativePath.replace(/\\/g, '/'),
        publicUrl: this.toPublicUrl(relativePath),
        fileHash: asset.fileHash,
        width: asset.width,
        height: asset.height,
        sizeBytes: asset.buffer.length,
      });
    }
    return stored;
  }

  getBucket(): string {
    return this.bucket;
  }
}
