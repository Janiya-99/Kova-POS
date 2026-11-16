import * as React from 'react';
import ReactDOM from 'react-dom/client';
import { keepPreviousData, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { registerRealtimeQueryClient } from '@/lib/realtime';
import { applyThemeToDOM, useThemeStore } from '@/store/themeStore';
import { App } from './App';
import './index.css';

const initialTheme = useThemeStore.getState();
applyThemeToDOM({
  themeId: initialTheme.themeId,
  customAccent: initialTheme.customAccent,
  customCanvas: initialTheme.customCanvas,
  customSurface: initialTheme.customSurface,
  cornerPreset: initialTheme.cornerPreset,
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      gcTime: 30 * 60_000,
      retry: 1,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      refetchOnMount: 'always',
      placeholderData: keepPreviousData,
    },
  },
});

registerRealtimeQueryClient(queryClient);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={80} skipDelayDuration={120}>
        <App />
      </TooltipProvider>
      <Toaster
        position="bottom-right"
        richColors
        toastOptions={{
          style: {
            borderRadius: 'var(--theme-radius-card)',
            fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif",
          },
        }}
      />
    </QueryClientProvider>
  </React.StrictMode>
);
