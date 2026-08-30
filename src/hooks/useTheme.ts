import { useEffect } from 'react'
import { DEFAULT_THEME, isThemeKey } from '../themes'

/** Applies a class's color theme by swapping the root data attribute. */
export function useTheme(themeKey: string | undefined): void {
  useEffect(() => {
    const key = themeKey && isThemeKey(themeKey) ? themeKey : DEFAULT_THEME
    document.documentElement.dataset['theme'] = key
  }, [themeKey])
}
