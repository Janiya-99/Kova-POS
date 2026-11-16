import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface PlatformAdminIdentity {
  token_scope?: 'PLATFORM_ADMIN' | string;
  session_id?: string;
  session_expires_at?: string;
  session_idle_expires_at?: string;
  admin_id: string;
  email: string;
  full_name: string;
  title: string;
}

interface PlatformAdminState {
  token: string | null;
  admin: PlatformAdminIdentity | null;
  setAdminSession: (token: string, admin: PlatformAdminIdentity) => void;
  updateAdminProfile: (patch: Partial<PlatformAdminIdentity>) => void;
  logout: () => void;
  forceLocalLogout: () => void;
}

export const usePlatformAdminStore = create<PlatformAdminState>()(
  persist(
    (set, get) => ({
      token: null,
      admin: null,
      setAdminSession: (token, admin) => set({ token, admin }),
      updateAdminProfile: (patch) =>
        set((state) => ({
          admin: state.admin ? { ...state.admin, ...patch } : null,
        })),
      logout: () => {
        const activeToken = get().token;
        if (activeToken) {
          void fetch('/api/v1/admin/logout', {
            method: 'POST',
            headers: { Authorization: `Bearer ${activeToken}` },
            keepalive: true,
          }).catch(() => undefined);
        }
        set({ token: null, admin: null });
      },
      forceLocalLogout: () => set({ token: null, admin: null }),
    }),
    { name: 'zona-platform-admin-auth' }
  )
);

