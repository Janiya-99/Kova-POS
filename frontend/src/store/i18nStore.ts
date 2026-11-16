import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import en, { type TranslationSchema } from '@/locales/en';
import si from '@/locales/si';
import ta from '@/locales/ta';

export type SupportedLanguage = 'en' | 'si' | 'ta';

export const SUPPORTED_LANGUAGES: Array<{
  code: SupportedLanguage;
  label: string;
  nativeLabel: string;
  shortCode: string;
}> = [
  { code: 'en', label: 'English', nativeLabel: 'English', shortCode: 'EN' },
  { code: 'si', label: 'Sinhala', nativeLabel: 'සිංහල', shortCode: 'සිං' },
  { code: 'ta', label: 'Tamil', nativeLabel: 'தமிழ்', shortCode: 'தமி' },
];

const DICTIONARIES: Record<SupportedLanguage, TranslationSchema> = {
  en,
  si,
  ta,
};

export function normalizeLanguage(raw?: string | null): SupportedLanguage {
  const cleaned = String(raw || '')
    .replace(/^"|"$/g, '')
    .trim()
    .toLowerCase();
  if (cleaned === 'si' || cleaned === 'ta' || cleaned === 'en') {
    return cleaned;
  }
  return 'en';
}

function syncDocumentLanguage(lang: SupportedLanguage) {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang;
  }
}

interface I18nState {
  language: SupportedLanguage;
  userPinned: boolean;
  setLanguage: (lang: string, options?: { fromTenantDefault?: boolean }) => void;
  resetToTenantDefault: (lang: string) => void;
}

export const useI18nStore = create<I18nState>()(
  persist(
    (set, get) => ({
      language: 'en',
      userPinned: false,
      setLanguage: (rawLang, options) => {
        const next = normalizeLanguage(rawLang);
        if (options?.fromTenantDefault && get().userPinned) {
          return;
        }
        syncDocumentLanguage(next);
        set({
          language: next,
          userPinned: options?.fromTenantDefault ? get().userPinned : true,
        });
      },
      resetToTenantDefault: (rawLang) => {
        const next = normalizeLanguage(rawLang);
        syncDocumentLanguage(next);
        set({ language: next, userPinned: false });
      },
    }),
    {
      name: 'pos-i18n-v1',
      onRehydrateStorage: () => (state) => {
        syncDocumentLanguage(normalizeLanguage(state?.language));
      },
    }
  )
);

export function getDictionary(lang?: SupportedLanguage): TranslationSchema {
  const active = lang || useI18nStore.getState().language;
  return DICTIONARIES[active] || en;
}

/**
 * React hook returning the active translation dictionary, active language code, and instant setter.
 */
export function useT() {
  const language = useI18nStore((s) => s.language);
  const setLanguage = useI18nStore((s) => s.setLanguage);
  const t = DICTIONARIES[language] || en;
  return { language, setLanguage, t };
}

