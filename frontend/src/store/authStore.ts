import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useThemeStore } from '@/store/themeStore';
import { useI18nStore } from '@/store/i18nStore';

export interface TenantContext {
  token_scope?: string;
  session_id?: string;
  session_expires_at?: string;
  session_idle_expires_at?: string;
  user_id: string;
  email: string;
  full_name: string;
  avatar_url: string;
  business_id: string;
  company_slug?: string;
  db_name?: string;
  business_name: string;
  trade_name?: string;
  base_currency: string;
  branch_id: string;
  terminal_id: string;
  all_branches_access?: boolean;
  allowed_branch_ids?: string[];
  allowed_terminal_ids?: string[];
  role_code: string;
  role_name: string;
  designation_name?: string;
  max_pos_discount_pct?: string;
  tax_registration_no?: string;
  logo_light_url?: string;
  logo_dark_url?: string;
  logo_sidebar_url?: string;
  logo_receipt_url?: string;
  primary_color_hex?: string;
  default_language?: string;
  industry_profile?: string;
  permissions: string[];
}

export interface PublicBranding {
  id?: string;
  slug?: string;
  name?: string;
  trade_name: string;
  base_currency: string;
  logo_light_url: string;
  logo_dark_url?: string;
  primary_color_hex: string;
  default_language: string;
}

export interface WarehouseOption {
  id: string;
  business_id: string;
  branch_id?: string | null;
  code: string;
  name: string;
  address?: string;
  is_primary: boolean;
}

export interface BusinessOption {
  user_business_role_id: string;
  business_id: string;
  business_name: string;
  trade_name?: string;
  base_currency: string;
  logo_light_url?: string;
  primary_color_hex?: string;
  default_language?: string;
  industry_profile?: string;
  branch_id?: string | null;
  branch_name: string;
  role_code: string;
  role_name: string;
}

export interface BranchOption {
  id: string;
  business_id: string;
  code: string;
  name: string;
  country_code: string;
  country_name: string;
  is_warehouse?: boolean;
}

export interface TerminalOption {
  id: string;
  branch_id: string;
  code: string;
  name: string;
}

export interface AuthSessionPayload {
  token: string;
  context: TenantContext;
  businesses: BusinessOption[];
  branches: BranchOption[];
  warehouses?: WarehouseOption[];
  terminals: TerminalOption[];
}

interface AuthState {
  token: string | null;
  context: TenantContext | null;
  publicBranding: PublicBranding | null;
  resolvedSettings: Record<string, string>;
  businesses: BusinessOption[];
  branches: BranchOption[];
  warehouses: WarehouseOption[];
  terminals: TerminalOption[];
  activeWarehouseId: string;
  requestedSettingsTab: string | null;
  setActiveWarehouseId: (warehouseId: string) => void;
  setRequestedSettingsTab: (tab: string | null) => void;
  setPublicBranding: (branding: PublicBranding) => void;
  setResolvedSettings: (
    entries: Array<{ key: string; effective_json: string }> | Record<string, string>
  ) => void;
  updateBusinessContext: (patch: Partial<TenantContext>, options?: { forceLanguage?: boolean }) => void;
  setSession: (payload: AuthSessionPayload) => void;
  hasPermission: (code: string) => boolean;
  logout: () => void;
  forceLocalLogout: () => void;
}

function parseSettingScalar(raw?: string): string {
  if (!raw) return '';
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'string' ? parsed : String(parsed);
  } catch {
    return raw.replace(/^"|"$/g, '').trim();
  }
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      context: null,
      publicBranding: null,
      resolvedSettings: {},
      businesses: [],
      branches: [],
      warehouses: [],
      terminals: [],
      activeWarehouseId: '',
      requestedSettingsTab: null,
      setActiveWarehouseId: (warehouseId) => set({ activeWarehouseId: warehouseId }),
      setRequestedSettingsTab: (tab) => set({ requestedSettingsTab: tab }),
      setPublicBranding: (branding) => {
        if (branding.primary_color_hex) {
          useThemeStore.getState().syncBrandPrimaryColor(branding.primary_color_hex);
        }
        if (branding.default_language) {
          useI18nStore.getState().setLanguage(branding.default_language, { fromTenantDefault: true });
        }
        set({ publicBranding: branding });
      },
      setResolvedSettings: (entries) => {
        const map: Record<string, string> = Array.isArray(entries)
          ? entries.reduce<Record<string, string>>((acc, item) => {
              acc[item.key] = parseSettingScalar(item.effective_json);
              return acc;
            }, {})
          : Object.entries(entries).reduce<Record<string, string>>((acc, [k, v]) => {
              acc[k] = parseSettingScalar(v);
              return acc;
            }, {});

        set((state) => {
          const nextResolved = { ...state.resolvedSettings, ...map };
          const nextCurrency = nextResolved['accounting.base_currency']?.toUpperCase();
          const nextLang = nextResolved['system.default_language']?.toLowerCase();
          if (nextLang) {
            useI18nStore.getState().setLanguage(nextLang, { fromTenantDefault: true });
          }
          if (!state.context) {
            return { resolvedSettings: nextResolved };
          }
          const updatedContext = {
            ...state.context,
            ...(nextCurrency && nextCurrency !== state.context.base_currency
              ? { base_currency: nextCurrency }
              : {}),
            ...(nextResolved['pos.ui.layout_mode']
              ? { industry_profile: nextResolved['pos.ui.layout_mode'].toLowerCase() }
              : {}),
          };
          return {
            resolvedSettings: nextResolved,
            context: updatedContext,
          };
        });
      },
      updateBusinessContext: (patch, options) =>
        set((state) => {
          if (!state.context) return state;
          const nextCtx: TenantContext = { ...state.context, ...patch };
          const nextBusinesses = state.businesses.map((b) =>
            b.business_id === nextCtx.business_id
              ? {
                  ...b,
                  business_name: nextCtx.business_name,
                  trade_name: nextCtx.trade_name ?? b.trade_name,
                  base_currency: nextCtx.base_currency,
                  logo_light_url: nextCtx.logo_light_url ?? b.logo_light_url,
                  primary_color_hex: nextCtx.primary_color_hex ?? b.primary_color_hex,
                  default_language: nextCtx.default_language ?? b.default_language,
                  industry_profile: nextCtx.industry_profile ?? b.industry_profile,
                }
              : b
          );

          const nextResolved = { ...state.resolvedSettings };
          if (patch.base_currency) {
            nextResolved['accounting.base_currency'] = patch.base_currency.toUpperCase();
          }
          if (patch.default_language) {
            nextResolved['system.default_language'] = patch.default_language.toLowerCase();
            if (options?.forceLanguage || patch.default_language !== state.context.default_language) {
              useI18nStore.getState().resetToTenantDefault(patch.default_language);
            }
          }
          if (patch.primary_color_hex) {
            useThemeStore.getState().syncBrandPrimaryColor(patch.primary_color_hex);
          }
          if (patch.industry_profile) {
            nextResolved['pos.ui.layout_mode'] = patch.industry_profile.toLowerCase();
          }

          return {
            context: nextCtx,
            businesses: nextBusinesses,
            resolvedSettings: nextResolved,
            publicBranding: {
              id: nextCtx.business_id,
              slug: nextCtx.company_slug || state.publicBranding?.slug,
              name: nextCtx.business_name,
              trade_name: nextCtx.trade_name || nextCtx.business_name,
              base_currency: nextCtx.base_currency,
              logo_light_url: nextCtx.logo_light_url || '',
              logo_dark_url: nextCtx.logo_dark_url || '',
              primary_color_hex: nextCtx.primary_color_hex || '#877FC1',
              default_language: nextCtx.default_language || 'en',
            },
          };
        }),
      setSession: (payload) =>
        set((state) => {
          const whList = payload.warehouses || [];
          const branchId = payload.context.branch_id;
          const currentValid = whList.some((w) => w.id === state.activeWarehouseId);
          const branchMatch =
            whList.find((w) => w.branch_id === branchId && w.is_primary) ||
            whList.find((w) => w.branch_id === branchId) ||
            whList.find((w) => w.is_primary) ||
            whList[0];

          const normalizedContext: TenantContext = {
            ...payload.context,
            trade_name: payload.context.trade_name || payload.context.business_name,
            logo_sidebar_url:
              payload.context.logo_sidebar_url ||
              payload.context.logo_dark_url ||
              payload.context.logo_light_url ||
              '',
            primary_color_hex: payload.context.primary_color_hex || '#877FC1',
            default_language: payload.context.default_language || 'en',
            industry_profile: payload.context.industry_profile || 'retail',
          };

          useThemeStore.getState().syncBrandPrimaryColor(normalizedContext.primary_color_hex);
          useI18nStore
            .getState()
            .setLanguage(normalizedContext.default_language || 'en', { fromTenantDefault: true });

          return {
            token: payload.token,
            context: normalizedContext,
            publicBranding: {
              id: normalizedContext.business_id,
              slug: normalizedContext.company_slug || state.publicBranding?.slug,
              name: normalizedContext.business_name,
              trade_name: normalizedContext.trade_name || normalizedContext.business_name,
              base_currency: normalizedContext.base_currency,
              logo_light_url: normalizedContext.logo_light_url || '',
              logo_dark_url: normalizedContext.logo_dark_url || '',
              primary_color_hex: normalizedContext.primary_color_hex || '#877FC1',
              default_language: normalizedContext.default_language || 'en',
            },
            resolvedSettings: {
              ...state.resolvedSettings,
              'accounting.base_currency': normalizedContext.base_currency,
              'system.default_language': normalizedContext.default_language || 'en',
              'pos.ui.layout_mode': normalizedContext.industry_profile || 'retail',
            },
            businesses: payload.businesses || [],
            branches: payload.branches || [],
            warehouses: whList,
            terminals: payload.terminals || [],
            activeWarehouseId: currentValid ? state.activeWarehouseId : branchMatch?.id || '',
          };
        }),
      hasPermission: (code) => {
        const perms = get().context?.permissions ?? [];
        return perms.includes(code);
      },
      logout: () => {
        const activeToken = get().token;
        if (activeToken) {
          void fetch('/api/v1/auth/logout', {
            method: 'POST',
            headers: { Authorization: `Bearer ${activeToken}` },
            keepalive: true,
          }).catch(() => undefined);
        }
        set((state) => ({
          token: null,
          context: null,
          publicBranding: state.publicBranding,
          resolvedSettings: {},
          businesses: [],
          branches: [],
          warehouses: [],
          terminals: [],
          activeWarehouseId: '',
          requestedSettingsTab: null,
        }));
      },
      forceLocalLogout: () =>
        set((state) => ({
          token: null,
          context: null,
          publicBranding: state.publicBranding,
          resolvedSettings: {},
          businesses: [],
          branches: [],
          warehouses: [],
          terminals: [],
          activeWarehouseId: '',
          requestedSettingsTab: null,
        })),
    }),
    { name: 'zona-pro-auth-v1' }
  )
);

export function getDisplayTradeName(
  ctx?: TenantContext | null,
  pub?: PublicBranding | null
): string {
  return ctx?.trade_name || ctx?.business_name || pub?.trade_name || pub?.name || 'Retail Workspace';
}

export function normalizeCompanySlug(slug?: string | null): string {
  return (slug || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function getActiveCompanySlug(
  ctx?: TenantContext | null,
  pub?: PublicBranding | null
): string {
  return normalizeCompanySlug(ctx?.company_slug || pub?.slug);
}

export function getCompanyLoginPath(slug?: string | null): string {
  const clean = normalizeCompanySlug(slug);
  return clean ? `/c/${clean}/login` : '/login';
}
