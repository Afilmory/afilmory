export interface Palette {
  accent: string
  accentContrast: string
  accentDim: string
  accentHi: string
  accentLine: string
  bgCanvas: string
  bgElement: string
  bgHover: string
  bgSurface: string
  border: string
  borderStrong: string
  danger: string
  textMuted: string
  textPrimary: string
  textSecondary: string
}

// Dark-only, matching the official site. Grays track the Apple UIKit system palette
// (same values as tailwindcss-uikit-colors on web); accent mirrors config.json accentColor.
export const palette: Palette = {
  bgCanvas: '#000000',
  bgSurface: '#1c1c1e',
  bgElement: '#2c2c2e',
  bgHover: '#3a3a3c',
  border: 'rgba(84, 84, 88, 0.52)',
  borderStrong: '#48484a',
  textPrimary: '#f5f5f7',
  textSecondary: '#aeaeb2',
  textMuted: '#636366',
  accent: '#007bff',
  accentHi: '#4da3ff',
  accentDim: 'rgba(0, 123, 255, 0.13)',
  accentLine: 'rgba(0, 123, 255, 0.45)',
  accentContrast: '#ffffff',
  danger: '#ff453a',
}
