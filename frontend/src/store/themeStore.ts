import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeId =
  | 'zona-lavender'
  | 'cosy-blush'
  | 'rose-porcelain'
  | 'indigo-saas'
  | 'emerald-retail'
  | 'ocean-slate';

export type CornerPreset = 'compact' | 'standard' | 'soft';

export const CORNER_PRESETS: Record<
  CornerPreset,
  {
    label: string;
    description: string;
    card: string;
    inner: string;
    control: string;
    badge: string;
    rail: string;
  }
> = {
  compact: {
    label: 'Sharp (6–8px)',
    description: 'High-density architectural edges',
    card: '8px',
    inner: '6px',
    control: '6px',
    badge: '4px',
    rail: '10px',
  },
  standard: {
    label: 'Standard (8–12px)',
    description: 'Balanced clean SaaS standard',
    card: '12px',
    inner: '8px',
    control: '8px',
    badge: '6px',
    rail: '14px',
  },
  soft: {
    label: 'Soft (10–16px)',
    description: 'Gentle rounded panels',
    card: '16px',
    inner: '10px',
    control: '10px',
    badge: '8px',
    rail: '18px',
  },
};

export interface ThemeTokens {
  '--theme-canvas': string;
  '--theme-surface': string;
  '--theme-surface-muted': string;
  '--theme-accent': string;
  '--theme-accent-fg': string;
  '--theme-accent-soft': string;
  '--theme-accent-soft-fg': string;
  '--theme-ink': string;
  '--theme-ink-muted': string;
  '--theme-border': string;
  '--theme-sidebar': string;
  '--theme-sidebar-pill': string;
  '--theme-sidebar-fg': string;
  '--theme-sidebar-active-bg': string;
  '--theme-sidebar-active-fg': string;
  '--theme-contrast-card': string;
  '--theme-contrast-fg': string;
  '--theme-sand': string;
  '--theme-revenue-mesh': string;
  '--theme-shadow': string;
  '--theme-hatch-stripe': string;
  '--theme-hatch-base': string;
  '--theme-positive': string;
  '--theme-negative': string;
}

export interface POSThemeDefinition {
  id: ThemeId;
  name: string;
  tagline: string;
  mode: 'light' | 'dark';
  swatches: [string, string, string];
  tokens: ThemeTokens;
}

export type ColorMode = 'light' | 'dark';

export const POS_THEMES: POSThemeDefinition[] = [
  {
    id: 'zona-lavender',
    name: 'Signature Lavender',
    tagline: 'Clean alabaster canvas, crisp white cards & violet accent',
    mode: 'light',
    swatches: ['#F5F6FA', '#877FC1', '#222026'],
    tokens: {
      '--theme-canvas': '#F5F6FA',
      '--theme-surface': '#FFFFFF',
      '--theme-surface-muted': '#F5F6FA',
      '--theme-accent': '#877FC1',
      '--theme-accent-fg': '#FFFFFF',
      '--theme-accent-soft': '#DBD3F5',
      '--theme-accent-soft-fg': '#222026',
      '--theme-ink': '#222026',
      '--theme-ink-muted': '#6B7280',
      '--theme-border': 'rgba(219, 211, 245, 0.65)',
      '--theme-sidebar': '#222026',
      '--theme-sidebar-pill': '#2C2A32',
      '--theme-sidebar-fg': '#FFFFFF',
      '--theme-sidebar-active-bg': '#FFFFFF',
      '--theme-sidebar-active-fg': '#222026',
      '--theme-contrast-card': '#222026',
      '--theme-contrast-fg': '#FFFFFF',
      '--theme-sand': '#F9EFEA',
      '--theme-revenue-mesh': 'linear-gradient(135deg, #7F78B8 0%, #A9A3CC 52%, #DFC8B8 100%)',
      '--theme-shadow': '0 4px 24px rgba(34, 32, 38, 0.045)',
      '--theme-hatch-stripe': '#DBD3F5',
      '--theme-hatch-base': '#F3EFFC',
      '--theme-positive': '#22C55E',
      '--theme-negative': '#EF4444',
    },
  },
  {
    id: 'cosy-blush',
    name: 'Cosy Blush Dark',
    tagline: 'UIUX dark graphite canvas with pastel blush pink highlights',
    mode: 'dark',
    swatches: ['#111315', '#FAC1D9', '#292C2D'],
    tokens: {
      '--theme-canvas': '#111315',
      '--theme-surface': '#222528',
      '--theme-surface-muted': '#2C3034',
      '--theme-accent': '#FAC1D9',
      '--theme-accent-fg': '#16181A',
      '--theme-accent-soft': '#3E2D36',
      '--theme-accent-soft-fg': '#FAC1D9',
      '--theme-ink': '#F8FAFC',
      '--theme-ink-muted': '#9CA3AF',
      '--theme-border': 'rgba(255, 255, 255, 0.09)',
      '--theme-sidebar': '#1C1F22',
      '--theme-sidebar-pill': '#272A2E',
      '--theme-sidebar-fg': '#F8FAFC',
      '--theme-sidebar-active-bg': '#FAC1D9',
      '--theme-sidebar-active-fg': '#16181A',
      '--theme-contrast-card': '#292C2F',
      '--theme-contrast-fg': '#FFFFFF',
      '--theme-sand': '#2A2528',
      '--theme-revenue-mesh': 'linear-gradient(135deg, #32242D 0%, #5B3C4E 55%, #A66E88 100%)',
      '--theme-shadow': '0 10px 30px rgba(0, 0, 0, 0.28)',
      '--theme-hatch-stripe': '#59424E',
      '--theme-hatch-base': '#2C2629',
      '--theme-positive': '#4ADE80',
      '--theme-negative': '#F87171',
    },
  },
  {
    id: 'rose-porcelain',
    name: 'Rose Porcelain',
    tagline: 'UIUX pastel blush tone reimagined on pure daylight white',
    mode: 'light',
    swatches: ['#FAF7F8', '#EC4899', '#23191E'],
    tokens: {
      '--theme-canvas': '#FAF7F8',
      '--theme-surface': '#FFFFFF',
      '--theme-surface-muted': '#FDF2F7',
      '--theme-accent': '#EC4899',
      '--theme-accent-fg': '#FFFFFF',
      '--theme-accent-soft': '#FCE7F3',
      '--theme-accent-soft-fg': '#831843',
      '--theme-ink': '#23191E',
      '--theme-ink-muted': '#6B5D65',
      '--theme-border': 'rgba(236, 72, 153, 0.18)',
      '--theme-sidebar': '#23191E',
      '--theme-sidebar-pill': '#31232A',
      '--theme-sidebar-fg': '#FFFFFF',
      '--theme-sidebar-active-bg': '#FFFFFF',
      '--theme-sidebar-active-fg': '#23191E',
      '--theme-contrast-card': '#23191E',
      '--theme-contrast-fg': '#FFFFFF',
      '--theme-sand': '#FFF1F2',
      '--theme-revenue-mesh': 'linear-gradient(135deg, #BE185D 0%, #EC4899 55%, #FBCFE8 100%)',
      '--theme-shadow': '0 4px 24px rgba(35, 25, 30, 0.045)',
      '--theme-hatch-stripe': '#FBCFE8',
      '--theme-hatch-base': '#FFF1F5',
      '--theme-positive': '#22C55E',
      '--theme-negative': '#EF4444',
    },
  },
  {
    id: 'indigo-saas',
    name: 'Indigo SaaS Clean',
    tagline: 'Precision Linear & Stripe slate with vibrant indigo focus',
    mode: 'light',
    swatches: ['#F4F6FB', '#5E6AD2', '#131624'],
    tokens: {
      '--theme-canvas': '#F4F6FB',
      '--theme-surface': '#FFFFFF',
      '--theme-surface-muted': '#EEF2FA',
      '--theme-accent': '#5E6AD2',
      '--theme-accent-fg': '#FFFFFF',
      '--theme-accent-soft': '#E0E7FF',
      '--theme-accent-soft-fg': '#1E1B4B',
      '--theme-ink': '#131624',
      '--theme-ink-muted': '#64748B',
      '--theme-border': 'rgba(94, 106, 210, 0.2)',
      '--theme-sidebar': '#131624',
      '--theme-sidebar-pill': '#1D2236',
      '--theme-sidebar-fg': '#FFFFFF',
      '--theme-sidebar-active-bg': '#FFFFFF',
      '--theme-sidebar-active-fg': '#131624',
      '--theme-contrast-card': '#131624',
      '--theme-contrast-fg': '#FFFFFF',
      '--theme-sand': '#EEF2FF',
      '--theme-revenue-mesh': 'linear-gradient(135deg, #4338CA 0%, #5E6AD2 52%, #A5B4FC 100%)',
      '--theme-shadow': '0 4px 24px rgba(19, 22, 36, 0.05)',
      '--theme-hatch-stripe': '#C7D2FE',
      '--theme-hatch-base': '#EEF2FF',
      '--theme-positive': '#22C55E',
      '--theme-negative': '#EF4444',
    },
  },
  {
    id: 'emerald-retail',
    name: 'Emerald Retail',
    tagline: 'Fresh mint canvas built for high-clarity store terminals',
    mode: 'light',
    swatches: ['#F2F8F5', '#10B981', '#11241E'],
    tokens: {
      '--theme-canvas': '#F2F8F5',
      '--theme-surface': '#FFFFFF',
      '--theme-surface-muted': '#ECFDF5',
      '--theme-accent': '#10B981',
      '--theme-accent-fg': '#FFFFFF',
      '--theme-accent-soft': '#D1FAE5',
      '--theme-accent-soft-fg': '#064E3B',
      '--theme-ink': '#0F241D',
      '--theme-ink-muted': '#4B635B',
      '--theme-border': 'rgba(16, 185, 129, 0.22)',
      '--theme-sidebar': '#11241E',
      '--theme-sidebar-pill': '#1A342B',
      '--theme-sidebar-fg': '#FFFFFF',
      '--theme-sidebar-active-bg': '#FFFFFF',
      '--theme-sidebar-active-fg': '#11241E',
      '--theme-contrast-card': '#11241E',
      '--theme-contrast-fg': '#FFFFFF',
      '--theme-sand': '#ECFEFF',
      '--theme-revenue-mesh': 'linear-gradient(135deg, #047857 0%, #10B981 55%, #A7F3D0 100%)',
      '--theme-shadow': '0 4px 24px rgba(17, 36, 30, 0.05)',
      '--theme-hatch-stripe': '#A7F3D0',
      '--theme-hatch-base': '#ECFDF5',
      '--theme-positive': '#16A34A',
      '--theme-negative': '#EF4444',
    },
  },
  {
    id: 'ocean-slate',
    name: 'Ocean Azure',
    tagline: 'Crisp sky-mist canvas with cobalt enterprise highlights',
    mode: 'light',
    swatches: ['#F3F7FC', '#2563EB', '#0F172A'],
    tokens: {
      '--theme-canvas': '#F3F7FC',
      '--theme-surface': '#FFFFFF',
      '--theme-surface-muted': '#EFF6FF',
      '--theme-accent': '#2563EB',
      '--theme-accent-fg': '#FFFFFF',
      '--theme-accent-soft': '#DBEAFE',
      '--theme-accent-soft-fg': '#1E3A8A',
      '--theme-ink': '#0F172A',
      '--theme-ink-muted': '#64748B',
      '--theme-border': 'rgba(37, 99, 235, 0.18)',
      '--theme-sidebar': '#0F172A',
      '--theme-sidebar-pill': '#1E293B',
      '--theme-sidebar-fg': '#FFFFFF',
      '--theme-sidebar-active-bg': '#FFFFFF',
      '--theme-sidebar-active-fg': '#0F172A',
      '--theme-contrast-card': '#0F172A',
      '--theme-contrast-fg': '#FFFFFF',
      '--theme-sand': '#F0F9FF',
      '--theme-revenue-mesh': 'linear-gradient(135deg, #1D4ED8 0%, #3B82F6 55%, #BAE6FD 100%)',
      '--theme-shadow': '0 4px 24px rgba(15, 23, 42, 0.05)',
      '--theme-hatch-stripe': '#BFDBFE',
      '--theme-hatch-base': '#EFF6FF',
      '--theme-positive': '#22C55E',
      '--theme-negative': '#EF4444',
    },
  },
];

export const LIGHT_THEMES: POSThemeDefinition[] = POS_THEMES.filter((t) => t.mode === 'light');

export function getThemeDefinition(id?: string): POSThemeDefinition {
  return POS_THEMES.find((t) => t.id === id) || POS_THEMES[0];
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const n = parseInt(clean, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mixHexRgb(hexA: string, hexB: string, weightB: number): [number, number, number] {
  const [r1, g1, b1] = hexToRgb(hexA);
  const [r2, g2, b2] = hexToRgb(hexB);
  const wA = 1 - weightB;
  return [
    Math.round(r1 * wA + r2 * weightB),
    Math.round(g1 * wA + g2 * weightB),
    Math.round(b1 * wA + b2 * weightB),
  ];
}

function isLightHex(hex: string): boolean {
  const [r, g, b] = hexToRgb(hex);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62;
}

export interface ThemeApplyOptions {
  themeId?: ThemeId;
  colorMode?: ColorMode;
  customAccent?: string | null;
  customCanvas?: string | null;
  customSurface?: string | null;
  cornerPreset?: CornerPreset;
}

export function applyThemeToDOM(
  themeIdOrOpts?: ThemeId | ThemeApplyOptions,
  legacyCustomAccent?: string | null
) {
  const opts: ThemeApplyOptions =
    typeof themeIdOrOpts === 'object' && themeIdOrOpts !== null
      ? themeIdOrOpts
      : { themeId: themeIdOrOpts, customAccent: legacyCustomAccent };

  const rawDef = getThemeDefinition(opts.themeId);
  const lightDef = rawDef.mode === 'light' ? rawDef : POS_THEMES[0];
  const effectiveMode: ColorMode = opts.colorMode || (rawDef.mode === 'dark' ? 'dark' : 'light');
  const corners = CORNER_PRESETS[opts.cornerPreset || 'standard'] || CORNER_PRESETS.standard;
  const root = document.documentElement;
  root.dataset.theme = lightDef.id;
  root.dataset.themeMode = effectiveMode;
  root.dataset.corners = opts.cornerPreset || 'standard';
  root.style.colorScheme = effectiveMode;

  (Object.entries(lightDef.tokens) as Array<[keyof ThemeTokens, string]>).forEach(([k, v]) => {
    root.style.setProperty(k, v);
  });

  root.style.setProperty('--theme-radius-card', corners.card);
  root.style.setProperty('--theme-radius-inner', corners.inner);
  root.style.setProperty('--theme-radius-control', corners.control);
  root.style.setProperty('--theme-radius-badge', corners.badge);
  root.style.setProperty('--theme-radius-rail', corners.rail);

  const validHex = (val?: string | null) => Boolean(val && /^#[0-9A-Fa-f]{6}$/.test(val));
  const activeAccent = validHex(opts.customAccent)
    ? (opts.customAccent as string)
    : lightDef.tokens['--theme-accent'];
  const [ar, ag, ab] = hexToRgb(activeAccent);
  root.style.setProperty('--theme-accent-rgb', `${ar}, ${ag}, ${ab}`);

  if (effectiveMode === 'dark') {
    root.style.setProperty('--theme-canvas', '#0B0D13');
    root.style.setProperty('--theme-surface', '#151924');
    root.style.setProperty('--theme-surface-muted', '#1D2231');
    root.style.setProperty('--theme-surface-glass', 'rgba(21, 25, 36, 0.80)');
    root.style.setProperty('--theme-surface-subtle', 'rgba(255, 255, 255, 0.05)');
    root.style.setProperty(
      '--theme-nav-bg',
      `linear-gradient(135deg, rgba(${ar}, ${ag}, ${ab}, 0.26) 0%, rgba(16, 19, 30, 0.76) 52%, rgba(${ar}, ${ag}, ${ab}, 0.16) 100%)`
    );
    root.style.setProperty('--theme-nav-border', `rgba(${ar}, ${ag}, ${ab}, 0.36)`);
    root.style.setProperty('--theme-nav-pill', 'rgba(20, 25, 38, 0.56)');
    root.style.setProperty('--theme-nav-pill-border', `rgba(${ar}, ${ag}, ${ab}, 0.28)`);
    root.style.setProperty(
      '--theme-nav-shadow',
      `0 14px 36px -14px rgba(${ar}, ${ag}, ${ab}, 0.30), inset 0 1px 0 rgba(255, 255, 255, 0.12)`
    );
    root.style.setProperty('--theme-ink', '#F3F4F6');
    root.style.setProperty('--theme-ink-muted', '#9CA3AF');
    root.style.setProperty('--theme-border', 'rgba(255, 255, 255, 0.11)');
    root.style.setProperty('--theme-sidebar', '#090B10');
    root.style.setProperty('--theme-sidebar-pill', '#171C28');
    root.style.setProperty('--theme-sidebar-fg', '#E5E7EB');
    root.style.setProperty('--theme-sidebar-active-bg', activeAccent);
    root.style.setProperty('--theme-sidebar-active-fg', isLightHex(activeAccent) ? '#111827' : '#FFFFFF');
    root.style.setProperty('--theme-contrast-card', '#1B202E');
    root.style.setProperty('--theme-contrast-fg', '#F9FAFB');
    root.style.setProperty('--theme-sand', 'rgba(255, 255, 255, 0.06)');
    root.style.setProperty('--theme-hatch-base', '#171B26');
    root.style.setProperty('--theme-shadow', '0 14px 36px -12px rgba(0, 0, 0, 0.65), 0 1px 0 rgba(255, 255, 255, 0.05) inset');
    root.style.setProperty('--theme-accent-soft', `rgba(${ar}, ${ag}, ${ab}, 0.22)`);
    root.style.setProperty('--theme-accent-soft-fg', '#E5E7EB');
  } else {
    if (validHex(opts.customCanvas)) {
      root.style.setProperty('--theme-canvas', opts.customCanvas as string);
    }
    const surfaceHex = validHex(opts.customSurface)
      ? (opts.customSurface as string)
      : lightDef.tokens['--theme-surface'];
    if (validHex(opts.customSurface)) {
      root.style.setProperty('--theme-surface', surfaceHex);
    }
    const [sr, sg, sb] = hexToRgb(surfaceHex);
    root.style.setProperty('--theme-surface-glass', `rgba(${sr}, ${sg}, ${sb}, 0.82)`);
    root.style.setProperty('--theme-surface-subtle', `rgba(${ar}, ${ag}, ${ab}, 0.06)`);
    root.style.setProperty(
      '--theme-nav-bg',
      `linear-gradient(135deg, rgba(${ar}, ${ag}, ${ab}, 0.20) 0%, rgba(${sr}, ${sg}, ${sb}, 0.74) 50%, rgba(${ar}, ${ag}, ${ab}, 0.14) 100%)`
    );
    root.style.setProperty('--theme-nav-border', `rgba(${ar}, ${ag}, ${ab}, 0.30)`);
    root.style.setProperty('--theme-nav-pill', 'rgba(255, 255, 255, 0.62)');
    root.style.setProperty('--theme-nav-pill-border', `rgba(${ar}, ${ag}, ${ab}, 0.24)`);
    root.style.setProperty(
      '--theme-nav-shadow',
      `0 12px 32px -14px rgba(${ar}, ${ag}, ${ab}, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.78)`
    );
    root.style.setProperty('--theme-shadow', `0 10px 30px -10px rgba(${ar}, ${ag}, ${ab}, 0.16), 0 2px 8px rgba(15, 23, 42, 0.05)`);
  }

  if (validHex(opts.customAccent)) {
    const light = isLightHex(activeAccent);
    const [mr, mg, mb] = mixHexRgb(activeAccent, '#FFFFFF', 0.28);
    const [sr, sg, sb] = mixHexRgb(activeAccent, '#DFC8B8', 0.45);
    root.style.setProperty('--theme-accent', activeAccent);
    root.style.setProperty('--theme-accent-fg', light ? '#141618' : '#FFFFFF');
    root.style.setProperty(
      '--theme-revenue-mesh',
      `linear-gradient(135deg, ${activeAccent} 0%, rgb(${mr}, ${mg}, ${mb}) 52%, rgb(${sr}, ${sg}, ${sb}) 100%)`
    );
    if (effectiveMode === 'light') {
      root.style.setProperty('--theme-accent-soft', `rgba(${ar}, ${ag}, ${ab}, 0.14)`);
      root.style.setProperty('--theme-accent-soft-fg', light ? lightDef.tokens['--theme-ink'] : activeAccent);
    }
    root.style.setProperty('--theme-hatch-stripe', activeAccent);
  }
}

interface ThemeState {
  themeId: ThemeId;
  colorMode: ColorMode;
  customAccent: string | null;
  customCanvas: string | null;
  customSurface: string | null;
  cornerPreset: CornerPreset;
  setTheme: (id: ThemeId) => void;
  setColorMode: (mode: ColorMode) => void;
  toggleColorMode: () => void;
  setCustomAccent: (hex: string | null) => void;
  syncBrandPrimaryColor: (hex?: string | null) => void;
  setCustomCanvas: (hex: string | null) => void;
  setCustomSurface: (hex: string | null) => void;
  setCornerPreset: (preset: CornerPreset) => void;
  resetCustomAppearance: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      themeId: 'zona-lavender',
      colorMode: 'light',
      customAccent: null,
      customCanvas: null,
      customSurface: null,
      cornerPreset: 'standard',
      setTheme: (id) => {
        const s = get();
        const nextThemeId: ThemeId = id === 'cosy-blush' ? 'rose-porcelain' : id;
        const nextMode: ColorMode = id === 'cosy-blush' ? 'dark' : 'light';
        applyThemeToDOM({
          themeId: nextThemeId,
          colorMode: nextMode,
          customAccent: null,
          customCanvas: null,
          customSurface: null,
          cornerPreset: s.cornerPreset,
        });
        set({
          themeId: nextThemeId,
          colorMode: nextMode,
          customAccent: null,
          customCanvas: null,
          customSurface: null,
        });
      },
      setColorMode: (colorMode) => {
        const s = get();
        applyThemeToDOM({
          themeId: s.themeId,
          colorMode,
          customAccent: s.customAccent,
          customCanvas: s.customCanvas,
          customSurface: s.customSurface,
          cornerPreset: s.cornerPreset,
        });
        set({ colorMode });
      },
      toggleColorMode: () => {
        const s = get();
        const next: ColorMode = s.colorMode === 'dark' ? 'light' : 'dark';
        s.setColorMode(next);
      },
      setCustomAccent: (customAccent) => {
        const s = get();
        applyThemeToDOM({
          themeId: s.themeId,
          colorMode: s.colorMode,
          customAccent,
          customCanvas: s.customCanvas,
          customSurface: s.customSurface,
          cornerPreset: s.cornerPreset,
        });
        set({ customAccent });
      },
      syncBrandPrimaryColor: (hex) => {
        const cleaned = (hex || '').trim().toUpperCase();
        if (!/^#[0-9A-F]{6}$/.test(cleaned)) return;
        const s = get();
        if (s.customAccent?.toUpperCase() === cleaned) return;
        applyThemeToDOM({
          themeId: s.themeId,
          colorMode: s.colorMode,
          customAccent: cleaned,
          customCanvas: s.customCanvas,
          customSurface: s.customSurface,
          cornerPreset: s.cornerPreset,
        });
        set({ customAccent: cleaned });
      },
      setCustomCanvas: (customCanvas) => {
        const s = get();
        applyThemeToDOM({
          themeId: s.themeId,
          colorMode: s.colorMode,
          customAccent: s.customAccent,
          customCanvas,
          customSurface: s.customSurface,
          cornerPreset: s.cornerPreset,
        });
        set({ customCanvas });
      },
      setCustomSurface: (customSurface) => {
        const s = get();
        applyThemeToDOM({
          themeId: s.themeId,
          colorMode: s.colorMode,
          customAccent: s.customAccent,
          customCanvas: s.customCanvas,
          customSurface,
          cornerPreset: s.cornerPreset,
        });
        set({ customSurface });
      },
      setCornerPreset: (cornerPreset) => {
        const s = get();
        applyThemeToDOM({
          themeId: s.themeId,
          colorMode: s.colorMode,
          customAccent: s.customAccent,
          customCanvas: s.customCanvas,
          customSurface: s.customSurface,
          cornerPreset,
        });
        set({ cornerPreset });
      },
      resetCustomAppearance: () => {
        const s = get();
        applyThemeToDOM({
          themeId: s.themeId,
          colorMode: s.colorMode,
          customAccent: null,
          customCanvas: null,
          customSurface: null,
          cornerPreset: 'standard',
        });
        set({ customAccent: null, customCanvas: null, customSurface: null, cornerPreset: 'standard' });
      },
    }),
    {
      name: 'zona-pos-theme-v1',
      onRehydrateStorage: () => (state) => {
        const storedTheme = state?.themeId || 'zona-lavender';
        const migratedTheme: ThemeId = storedTheme === 'cosy-blush' ? 'rose-porcelain' : storedTheme;
        const mode: ColorMode = state?.colorMode || (storedTheme === 'cosy-blush' ? 'dark' : 'light');
        applyThemeToDOM({
          themeId: migratedTheme,
          colorMode: mode,
          customAccent: state?.customAccent,
          customCanvas: state?.customCanvas,
          customSurface: state?.customSurface,
          cornerPreset: state?.cornerPreset || 'standard',
        });
      },
    }
  )
);

