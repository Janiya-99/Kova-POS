import type { ReactNode } from 'react';
import { KovaAuthBackdrop } from './KovaAuthBackdrop';
import { KovaMark } from './KovaLogo';

export interface KovaShowcaseMetric {
  icon: ReactNode;
  label: string;
  value: string;
  tone?: 'default' | 'positive' | 'accent';
}

export interface KovaAuthSplitLayoutProps {
  colorMode: 'light' | 'dark';
  testId?: string;
  topControls?: ReactNode;
  brandTitle: string;
  brandSubtitle: string;
  showcaseBadge: string;
  showcaseHeadline: string;
  showcaseDescription: string;
  showcaseMetrics: [KovaShowcaseMetric, KovaShowcaseMetric];
  showcaseFootnoteTitle: string;
  showcaseFootnoteText: string;
  formHeaderEyebrow?: ReactNode;
  formHeaderBadge?: string;
  formTitle: string;
  formDescription: string;
  children: ReactNode;
  formFooter?: ReactNode;
  pageFooter?: string;
}

export function KovaAuthSplitLayout({
  colorMode,
  testId,
  topControls,
  brandTitle,
  brandSubtitle,
  showcaseBadge,
  showcaseHeadline,
  showcaseDescription,
  showcaseMetrics,
  showcaseFootnoteTitle,
  showcaseFootnoteText,
  formHeaderEyebrow,
  formHeaderBadge,
  formTitle,
  formDescription,
  children,
  formFooter,
  pageFooter = 'Kova POS · Modern Point of Sale & Accounting',
}: KovaAuthSplitLayoutProps) {
  return (
    <div
      className="relative min-h-screen w-full bg-canvas text-ink flex flex-col justify-between p-4 sm:p-6 overflow-x-hidden"
      data-testid={testId}
    >
      <KovaAuthBackdrop colorMode={colorMode} />

      {/* Top Utility Bar (Theme / Language Switchers) */}
      <header className="relative z-10 mx-auto flex w-full max-w-[980px] items-center justify-end gap-2 pt-1">
        {topControls}
      </header>

      {/* Symmetrical 2-Column Split Card Shell */}
      <main className="relative z-10 mx-auto my-auto w-full max-w-[980px] py-6 sm:py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
          {/* Left Dark Obsidian KOVA Brand Showcase Card */}
          <section className="order-2 lg:order-1 relative overflow-hidden rounded-[24px] border border-white/10 bg-[#14171D] p-6 sm:p-8 text-white shadow-[0_24px_60px_-14px_rgba(2,6,23,0.40)] flex flex-col justify-between gap-6">
            {/* Subtle KOVA Brand Artwork Layer */}
            <img
              src="/brand/artwork/06-abstract-blue-purple-tech-background.png"
              alt=""
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-[0.18] mix-blend-screen select-none"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#14171D]/85 via-[#14171D]/80 to-[#0B0E14]/95"
            />

            {/* Top Brand Lockup + Status Pill */}
            <div className="relative z-10 space-y-6">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <KovaMark
                    variant="app-dark"
                    className="h-10 w-10 shrink-0 rounded-[12px] ring-1 ring-white/15"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-[14.5px] font-bold tracking-tight text-white leading-tight">
                      {brandTitle}
                    </p>
                    <p className="truncate text-[11.5px] font-medium text-[#94A3B8] mt-0.5">
                      {brandSubtitle}
                    </p>
                  </div>
                </div>

                <span className="shrink-0 inline-flex items-center rounded-full bg-[#92D867] px-2.5 py-0.5 text-[11px] font-bold tracking-tight text-[#0F172A]">
                  {showcaseBadge}
                </span>
              </div>

              <div className="space-y-3 pt-1">
                <h1 className="text-2xl sm:text-[26px] font-bold tracking-tight text-white leading-[1.22]">
                  {showcaseHeadline}
                </h1>
                <p className="text-[13px] leading-relaxed text-[#A1AAB8]">
                  {showcaseDescription}
                </p>
              </div>
            </div>

            {/* Bottom Symmetrical Metrics + Security Enforcement Strip */}
            <div className="relative z-10 mt-auto space-y-3 pt-2">
              <div className="grid grid-cols-2 gap-3">
                {showcaseMetrics.map((metric) => {
                  const valueColorClass =
                    metric.tone === 'positive'
                      ? 'text-[#34D399]'
                      : metric.tone === 'accent'
                        ? 'text-[#7DD3FC]'
                        : 'text-white';

                  return (
                    <div
                      key={metric.label}
                      className="rounded-[14px] border border-white/10 bg-white/[0.04] px-3.5 py-3 backdrop-blur-sm"
                    >
                      <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#94A3B8]">
                        <span className="shrink-0 text-[#86EFAC]">{metric.icon}</span>
                        <span className="truncate">{metric.label}</span>
                      </div>
                      <p className={`mt-1.5 truncate text-[12.5px] font-bold tracking-tight ${valueColorClass}`}>
                        {metric.value}
                      </p>
                    </div>
                  );
                })}
              </div>

              <div className="rounded-[14px] border border-white/10 bg-white/[0.03] px-4 py-3.5">
                <p className="text-[10.5px] font-bold uppercase tracking-wider text-[#94A3B8]">
                  {showcaseFootnoteTitle}
                </p>
                <p className="mt-1 text-[11.5px] leading-relaxed text-[#CBD5E1]">
                  {showcaseFootnoteText}
                </p>
              </div>
            </div>
          </section>

          {/* Right Elevated Form Card */}
          <section className="order-1 lg:order-2 rounded-[24px] border border-border-theme/90 bg-surface/95 backdrop-blur-xl p-6 sm:p-8 shadow-[0_24px_60px_-14px_rgba(15,23,42,0.12)] flex flex-col justify-between gap-6">
            <div className="space-y-5">
              {/* Mobile Brand Identity Strip + Form Scope Header */}
              <div className="space-y-3">
                <div className="flex lg:hidden items-center gap-2.5 pb-1">
                  <KovaMark
                    variant="app-dark"
                    className="h-8 w-8 rounded-[10px]"
                  />
                  <span className="text-sm font-bold tracking-tight text-ink">
                    {brandTitle}
                  </span>
                </div>

                {(formHeaderEyebrow || formHeaderBadge) && (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-accent">
                      {formHeaderEyebrow}
                    </div>
                    {formHeaderBadge && (
                      <span className="inline-flex items-center rounded-full border border-border-theme bg-surface-muted/70 px-2.5 py-0.5 text-[11px] font-semibold text-ink">
                        {formHeaderBadge}
                      </span>
                    )}
                  </div>
                )}

                <div>
                  <h2 className="text-[22px] font-bold tracking-tight text-ink leading-snug">
                    {formTitle}
                  </h2>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">
                    {formDescription}
                  </p>
                </div>
              </div>

              {/* Primary Auth Form Content */}
              {children}
            </div>

            {formFooter && <div className="pt-1">{formFooter}</div>}
          </section>
        </div>
      </main>

      <footer className="relative z-10 pb-1 text-center text-[11px] text-ink-muted/75">
        {pageFooter}
      </footer>
    </div>
  );
}
