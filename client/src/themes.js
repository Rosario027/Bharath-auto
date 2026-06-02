// Mirrors server/lib/themes.js — drives the live preview & print CSS variables.
export const THEMES = {
  orange: {
    key: 'orange', name: 'Bharath Classic', accent: '#E8732B', accentSoft: '#FDEDE1',
    secondary: '#5B9B36', ink: '#1B1B1B', muted: '#666666', headBg: '#E8732B',
    headText: '#FFFFFF', zebra: '#FBF4EE', totalBg: '#1B1B1B', totalText: '#FFFFFF', layout: 'classic',
  },
  emerald: {
    key: 'emerald', name: 'Emerald Modern', accent: '#0F7A53', accentSoft: '#E4F4ED',
    secondary: '#E8732B', ink: '#10241C', muted: '#5A6B63', headBg: '#0F7A53',
    headText: '#FFFFFF', zebra: '#F1F8F4', totalBg: '#0F7A53', totalText: '#FFFFFF', layout: 'modern',
  },
  slate: {
    key: 'slate', name: 'Slate Minimal', accent: '#2D3E50', accentSoft: '#EEF1F5',
    secondary: '#E8732B', ink: '#1F2933', muted: '#7B8794', headBg: '#2D3E50',
    headText: '#FFFFFF', zebra: '#F6F8FA', totalBg: '#2D3E50', totalText: '#FFFFFF', layout: 'minimal',
  },
};
export const THEME_LIST = Object.values(THEMES);
export function getTheme(key) { return THEMES[key] || THEMES.orange; }
export default THEMES;
