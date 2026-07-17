/**
 * Canonical poster design constants — single source of truth for both the
 * backend pdfkit renderer (poster.renderer.ts) and the frontend Canvas 2D
 * renderer (frontend/src/lib/poster-utils.ts).
 *
 * If the design changes, update this file and mirror the change in the
 * frontend's poster-utils.ts canvas renderer.
 */
export const POSTER = {
  // Page dimensions (A5 portrait in points: 1mm = 2.835pt)
  WIDTH_PT: 419.53,  // 148mm
  HEIGHT_PT: 595.28, // 210mm

  // Colors
  COLOR: {
    BLACK: '#000000',
    NEAR_BLACK: '#1a1400',
    GOLD: '#d4a500',
    WHITE: '#ffffff',
    HEADER_TEXT: '#1a1a1a',
    INACTIVE_RED: '#b91c1c',
  },

  // Header bar
  HEADER_HEIGHT_PT: 60,

  // Gradient stops (Y as fraction of total height)
  GRADIENT: [
    { stop: 0,    color: '#000000' },
    { stop: 0.44, color: '#1a1400' },
    { stop: 1,    color: '#c8a400' },
  ],

  // Typography (font sizes in points)
  FONT: {
    TIPS_LABEL: 15,
    TITLE: 42,
    SUBTITLE: 20,
    LIPA_LABEL: 9,
    ALIAS: 24,
    NAME: 15,
    FOOTER: 9,
    INACTIVE_WARN: 9,
  },
} as const;
