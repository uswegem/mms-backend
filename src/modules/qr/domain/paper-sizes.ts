/** ISO paper sizes from TANQR Annex 2 Table 1 (dimensions in millimetres). */
export interface PaperSizeSpec {
  code: string;
  widthMm: number;
  heightMm: number;
  areaCm2: number;
  qrAreaRatio: number;
  qrAreaCm2: number;
  qrSideMm: number;
}

export const PAPER_SIZES: Record<string, PaperSizeSpec> = {
  A8: {
    code: 'A8',
    widthMm: 52,
    heightMm: 74,
    areaCm2: 38.48,
    qrAreaRatio: 0.11,
    qrAreaCm2: 4.233,
    qrSideMm: 20.574,
  },
  A7: {
    code: 'A7',
    widthMm: 74,
    heightMm: 105,
    areaCm2: 77.7,
    qrAreaRatio: 0.11,
    qrAreaCm2: 8.547,
    qrSideMm: 29.235,
  },
  A6: {
    code: 'A6',
    widthMm: 105,
    heightMm: 148,
    areaCm2: 155.4,
    qrAreaRatio: 0.11,
    qrAreaCm2: 17.094,
    qrSideMm: 41.345,
  },
  A5: {
    code: 'A5',
    widthMm: 148,
    heightMm: 210,
    areaCm2: 310.8,
    qrAreaRatio: 0.11,
    qrAreaCm2: 34.188,
    qrSideMm: 58.471,
  },
  A4: {
    code: 'A4',
    widthMm: 210,
    heightMm: 297,
    areaCm2: 623.7,
    qrAreaRatio: 0.11,
    qrAreaCm2: 68.607,
    qrSideMm: 82.829,
  },
};

export const DEFAULT_PAPER_SIZE = 'A8';

export function resolvePaperSize(code?: string): PaperSizeSpec {
  const key = (code ?? DEFAULT_PAPER_SIZE).toUpperCase();
  return PAPER_SIZES[key] ?? PAPER_SIZES[DEFAULT_PAPER_SIZE];
}
