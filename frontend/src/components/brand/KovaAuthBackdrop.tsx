import { useId } from 'react';

interface KovaAuthBackdropProps {
  colorMode: 'light' | 'dark';
}

/**
 * Clean architectural backdrop for KOVA POS authentication portals, combining
 * soft cyan-blue-violet aurora depth, subtle hairline coordinate dots, and
 * refined concentric orbital arcs inspired by KOVA Brand Assets.
 */
export function KovaAuthBackdrop({ colorMode }: KovaAuthBackdropProps) {
  const arcGradId = useId();
  const maskId = useId();
  const isDark = colorMode === 'dark';

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 overflow-hidden select-none"
    >
      {/* Base Surface */}
      <div
        className={
          isDark
            ? 'absolute inset-0 bg-[#080C18]'
            : 'absolute inset-0 bg-[#F6F8FC]'
        }
      />

      {/* Official KOVA dark artwork subtly veiled in Dark Mode */}
      {isDark && (
        <img
          src="/brand/artwork/06-abstract-blue-purple-tech-background.png"
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-55"
        />
      )}

      {/* Atmospheric dual-spectrum brand washes (subtle, high contrast safe) */}
      <div
        className="absolute -top-48 -left-32 h-[540px] w-[540px] rounded-full blur-[120px]"
        style={{
          background: isDark
            ? 'radial-gradient(circle, rgba(6,182,212,0.22) 0%, transparent 70%)'
            : 'radial-gradient(circle, rgba(14,165,233,0.16) 0%, transparent 72%)',
        }}
      />
      <div
        className="absolute -bottom-52 -right-32 h-[600px] w-[600px] rounded-full blur-[130px]"
        style={{
          background: isDark
            ? 'radial-gradient(circle, rgba(124,58,237,0.26) 0%, transparent 70%)'
            : 'radial-gradient(circle, rgba(124,58,237,0.13) 0%, transparent 72%)',
        }}
      />

      {/* Soft top-center ambient glow behind the KOVA mark */}
      <div
        className="absolute top-6 left-1/2 -translate-x-1/2 h-[340px] w-[640px] rounded-full blur-[100px]"
        style={{
          background: isDark
            ? 'radial-gradient(circle, rgba(59,130,246,0.16) 0%, transparent 70%)'
            : 'radial-gradient(circle, rgba(59,130,246,0.11) 0%, transparent 70%)',
        }}
      />

      {/* Crisp hairline architectural dot grid masked around edges */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: isDark
            ? 'radial-gradient(rgba(255,255,255,0.12) 1px, transparent 1px)'
            : 'radial-gradient(rgba(15,23,42,0.085) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
          maskImage:
            'radial-gradient(ellipse 75% 70% at 50% 45%, black 20%, transparent 100%)',
          WebkitMaskImage:
            'radial-gradient(ellipse 75% 70% at 50% 45%, black 20%, transparent 100%)',
        }}
      />

      {/* Clean sweeping geometric orbital arcs inspired by KOVA 06-abstract artwork */}
      <svg
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full"
        style={{ opacity: isDark ? 0.35 : 0.42 }}
      >
        <defs>
          <linearGradient id={arcGradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#06B6D4" stopOpacity={isDark ? '0.45' : '0.32'} />
            <stop offset="50%" stopColor="#3B82F6" stopOpacity={isDark ? '0.35' : '0.26'} />
            <stop offset="100%" stopColor="#8B5CF6" stopOpacity={isDark ? '0.45' : '0.32'} />
          </linearGradient>
          <radialGradient id={maskId} cx="50%" cy="50%" r="55%">
            <stop offset="55%" stopColor="white" stopOpacity="1" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </radialGradient>
        </defs>
        <g stroke={`url(#${arcGradId})`} fill="none" strokeWidth="1.15">
          <circle cx="1180" cy="450" r="320" />
          <circle cx="1210" cy="450" r="395" />
          <circle cx="1245" cy="450" r="470" />
          <circle cx="220" cy="470" r="410" strokeOpacity="0.45" />
        </g>
      </svg>
    </div>
  );
}

