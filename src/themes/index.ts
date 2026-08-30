/**
 * Per-class color themes. Each key maps to a `[data-theme="…"]` block in
 * index.css that redefines the accent custom properties. Swapping the
 * attribute on <html> reskins the app — there are no per-theme stylesheets.
 */
export const THEMES = {
  teal: 'Teal',
  indigo: 'Indigo',
  amber: 'Amber',
  rose: 'Rose',
  violet: 'Violet',
  lime: 'Lime',
} as const

export type ThemeKey = keyof typeof THEMES

export const DEFAULT_THEME: ThemeKey = 'teal'

export function isThemeKey(value: string): value is ThemeKey {
  return Object.hasOwn(THEMES, value)
}

export const THEME_KEYS = Object.keys(THEMES) as ThemeKey[]
