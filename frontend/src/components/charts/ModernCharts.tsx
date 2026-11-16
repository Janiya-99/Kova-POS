import * as React from 'react';
import { cn } from '@/lib/utils';

/* -------------------------------------------------------------------------- */
/*  Shared Helpers                                                             */
/* -------------------------------------------------------------------------- */

function buildSmoothSvgPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  }

  let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? i : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2 < points.length ? i + 2 : i + 1];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

export function getTooltipHorizontalPosition(ratio: number): React.CSSProperties {
  if (ratio <= 0.22) return { left: '0%', transform: 'translateX(0%)' };
  if (ratio >= 0.78) return { left: '100%', transform: 'translateX(-100%)' };
  return { left: `${(ratio * 100).toFixed(2)}%`, transform: 'translateX(-50%)' };
}

/* -------------------------------------------------------------------------- */
/*  1. Glowing Dot-Matrix Column Chart (Statistic / Expected Spendings Style) */
/* -------------------------------------------------------------------------- */

export interface DotMatrixDatum {
  label: string;
  primaryValue: number;
  secondaryValue?: number;
  tertiaryValue?: number;
  primaryFormatted?: string;
  secondaryFormatted?: string;
  tertiaryFormatted?: string;
}

export interface GlowingDotMatrixChartProps {
  data: DotMatrixDatum[];
  rows?: number;
  primaryLabel?: string;
  secondaryLabel?: string;
  tertiaryLabel?: string;
  primaryColor?: string;
  secondaryColor?: string;
  className?: string;
  heightClass?: string;
}

export function GlowingDotMatrixChart({
  data,
  rows = 6,
  primaryLabel = 'Value',
  secondaryLabel,
  tertiaryLabel,
  primaryColor = 'var(--theme-accent)',
  secondaryColor = '#22C55E',
  className,
  heightClass = 'h-[190px]',
}: GlowingDotMatrixChartProps) {
  const [hoverIdx, setHoverIdx] = React.useState<number | null>(null);

  const visibleData = React.useMemo(() => {
    if (data.length <= 12) return data;
    // Downsample gracefully when > 12 points while preserving last point
    const step = Math.ceil(data.length / 12);
    const sampled: DotMatrixDatum[] = [];
    for (let i = 0; i < data.length; i += step) {
      sampled.push(data[i]);
    }
    const last = data[data.length - 1];
    if (sampled[sampled.length - 1] !== last) {
      sampled[sampled.length - 1] = last;
    }
    return sampled;
  }, [data]);

  const maxPrimary = Math.max(1, ...visibleData.map((d) => Math.max(0, d.primaryValue)));
  const activeIdx = hoverIdx !== null && visibleData[hoverIdx] ? hoverIdx : null;
  const activeDatum = activeIdx !== null ? visibleData[activeIdx] : null;
  const activeFilledCount =
    activeDatum && activeDatum.primaryValue > 0
      ? Math.max(1, Math.min(rows, Math.round((activeDatum.primaryValue / maxPrimary) * rows)))
      : 0;
  const activePeakPct = activeDatum
    ? Math.min(100, Math.round((Math.max(0, activeDatum.primaryValue) / maxPrimary) * 100))
    : 0;
  const activeColRatio =
    activeIdx !== null ? (activeIdx + 0.5) / Math.max(1, visibleData.length) : 0.5;
  const activeBottomPct = Math.min(78, Math.max(20, Math.round((activeFilledCount / Math.max(1, rows)) * 68) + 18));

  return (
    <div className={cn('relative flex flex-col justify-between select-none', heightClass, className)}>
      {/* Steady Top Legend Bar */}
      <div className="mb-2 flex min-h-[24px] items-center justify-between gap-2 text-[11px]">
        <div className="flex flex-wrap items-center gap-3 text-[10.5px] font-semibold text-ink-muted">
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: primaryColor, boxShadow: `0 0 8px ${primaryColor}` }}
            />
            {primaryLabel}
          </span>
          {secondaryLabel && (
            <span className="inline-flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: secondaryColor }}
              />
              {secondaryLabel}
            </span>
          )}
          {tertiaryLabel && (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
              {tertiaryLabel}
            </span>
          )}
        </div>
        <span className="text-[10px] font-medium text-ink-muted tabular-nums">100% scale</span>
      </div>

      {/* Matrix Grid with Y-Axis Scale Guide + Floating Modern Tooltip */}
      <div className="flex flex-1 min-h-0 items-stretch gap-2.5">
        {/* Left Percentage Scale Hints */}
        <div className="hidden sm:flex flex-col justify-between py-1 text-[9.5px] font-semibold text-ink-muted/75 tabular-nums shrink-0">
          <span>100%</span>
          <span>65%</span>
          <span>35%</span>
          <span>0%</span>
        </div>

        {/* Dot Columns */}
        <div
          className="relative grid flex-1 min-w-0 items-end gap-1.5 sm:gap-2"
          style={{ gridTemplateColumns: `repeat(${Math.max(visibleData.length, 1)}, minmax(0, 1fr))` }}
          onMouseLeave={() => setHoverIdx(null)}
        >
          {/* Interactive Floating Obsidian Glass Tooltip */}
          {activeDatum && activeIdx !== null && (
            <div
              data-testid="dot-matrix-tooltip"
              role="status"
              className="pointer-events-none absolute z-30 w-max min-w-[152px] max-w-[235px] rounded-[14px] border border-white/15 bg-[#222026]/95 px-3 py-2 text-white shadow-[0_14px_34px_-8px_rgba(34,32,38,0.45)] backdrop-blur-md transition-all duration-150 ease-out tabular-nums"
              style={{
                ...getTooltipHorizontalPosition(activeColRatio),
                bottom: `${activeBottomPct}%`,
              }}
            >
              <div className="mb-1.5 flex items-center justify-between gap-3 border-b border-white/10 pb-1">
                <span className="truncate text-[11px] font-extrabold text-white">
                  {activeDatum.label}
                </span>
                <span className="shrink-0 rounded-full bg-white/12 px-1.5 py-0.5 text-[9.5px] font-bold text-white/85">
                  {activePeakPct}%
                </span>
              </div>
              <div className="space-y-1 text-[10.5px]">
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-1.5 text-white/75">
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: primaryColor, boxShadow: `0 0 8px ${primaryColor}` }}
                    />
                    {primaryLabel}
                  </span>
                  <span className="font-extrabold text-white">
                    {activeDatum.primaryFormatted ?? activeDatum.primaryValue}
                  </span>
                </div>
                {secondaryLabel && activeDatum.secondaryValue !== undefined && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-1.5 text-white/75">
                      <span
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: secondaryColor, boxShadow: `0 0 8px ${secondaryColor}` }}
                      />
                      {secondaryLabel}
                    </span>
                    <span className="font-bold text-[#4ADE80]">
                      {activeDatum.secondaryFormatted ?? activeDatum.secondaryValue}
                    </span>
                  </div>
                )}
                {tertiaryLabel && activeDatum.tertiaryValue !== undefined && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-1.5 text-white/75">
                      <span className="h-2 w-2 rounded-full shrink-0 bg-amber-400 shadow-[0_0_8px_#FBBF24]" />
                      {tertiaryLabel}
                    </span>
                    <span className="font-bold text-amber-300">
                      {activeDatum.tertiaryFormatted ?? activeDatum.tertiaryValue}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {visibleData.map((d, colIdx) => {
            const ratio = Math.max(0, d.primaryValue) / maxPrimary;
            const filledCount =
              d.primaryValue <= 0 ? 0 : Math.max(1, Math.min(rows, Math.round(ratio * rows)));
            const isHovered = activeIdx === colIdx;
            const secRatio =
              d.secondaryValue !== undefined && d.primaryValue > 0
                ? Math.min(1, Math.max(0, d.secondaryValue) / Math.max(1, d.primaryValue))
                : 0;
            const secondaryDots =
              d.secondaryValue !== undefined && d.secondaryValue > 0
                ? Math.max(1, Math.round(secRatio * filledCount))
                : 0;

            return (
              <button
                key={`${d.label}-${colIdx}`}
                type="button"
                data-testid={`dot-matrix-col-${colIdx}`}
                onMouseEnter={() => setHoverIdx(colIdx)}
                onFocus={() => setHoverIdx(colIdx)}
                onBlur={() => setHoverIdx(null)}
                onClick={() => setHoverIdx((prev) => (prev === colIdx ? null : colIdx))}
                className={cn(
                  'group flex h-full flex-col items-center justify-end gap-1 rounded-[12px] py-1 px-0.5 transition-all duration-150 focus:outline-none cursor-pointer',
                  isHovered
                    ? 'bg-accent-soft/30 ring-1 ring-accent/25 shadow-2xs'
                    : 'hover:bg-surface-muted/65',
                )}
                aria-label={`${d.label}: ${d.primaryFormatted ?? d.primaryValue}`}
              >
                <div className="flex flex-col-reverse items-center justify-start gap-1.5 flex-1">
                  {Array.from({ length: rows }).map((_, rowIdx) => {
                    const isActive = rowIdx < filledCount;
                    const isPeak = isActive && rowIdx === filledCount - 1;
                    const isSecondaryBand = isActive && secondaryDots > 0 && rowIdx < secondaryDots && !isPeak;
                    const orbColor = isSecondaryBand ? secondaryColor : primaryColor;
                    const orbOpacity = isActive
                      ? isPeak
                        ? 1
                        : 0.48 + ((rowIdx + 1) / Math.max(1, filledCount)) * 0.45
                      : undefined;

                    return (
                      <span
                        key={rowIdx}
                        className={cn(
                          'block h-3.5 w-3.5 sm:h-4 sm:w-4 rounded-full transition-all duration-200',
                          !isActive && 'bg-ink-muted/12 dark:bg-white/10 scale-90',
                          isHovered && isActive && 'scale-115',
                        )}
                        style={
                          isActive
                            ? {
                                backgroundColor: orbColor,
                                opacity: orbOpacity,
                                boxShadow: isPeak
                                  ? `0 0 12px ${orbColor}`
                                  : isHovered
                                    ? `0 0 9px ${orbColor}`
                                    : undefined,
                              }
                            : undefined
                        }
                      />
                    );
                  })}
                </div>
                <span
                  className={cn(
                    'mt-1 truncate max-w-full text-[9.5px] font-semibold transition-colors',
                    isHovered ? 'text-ink font-bold' : 'text-ink-muted',
                  )}
                >
                  {d.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  2. Glowing Rounded-Cap Multi-Arc Radial Gauge (New Challenge Style)        */
/* -------------------------------------------------------------------------- */

export interface RadialGaugeSegment {
  id: string;
  label: string;
  value: number;
  color: string;
  formattedValue?: string;
}

export interface GlowingRadialGaugeProps {
  segments: RadialGaugeSegment[];
  centerEyebrow: string;
  centerValue: string;
  activeId?: string | null;
  onHoverId?: (id: string | null) => void;
  size?: number;
  strokeWidth?: number;
}

export function GlowingRadialGauge({
  segments,
  centerEyebrow,
  centerValue,
  activeId,
  onHoverId,
  size = 132,
  strokeWidth = 12,
}: GlowingRadialGaugeProps) {
  const filterId = React.useId().replace(/:/g, '');
  const [hoveredArcId, setHoveredArcId] = React.useState<string | null>(null);
  const total = segments.reduce((acc, s) => acc + Math.max(0, s.value), 0);
  const cx = size / 2;
  const cy = size / 2;
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;

  // Compute non-overlapping rounded-cap arc offsets
  const validSegments = segments.filter((s) => s.value > 0);
  const gapPx = validSegments.length > 1 ? 6 : 0;

  let accumFraction = 0;
  const arcs = validSegments.map((seg) => {
    const share = total > 0 ? seg.value / total : 0;
    const rawLen = share * circumference;
    const visibleLen = Math.max(4, rawLen - gapPx);
    const dashOffset = -(accumFraction * circumference);
    accumFraction += share;
    return {
      ...seg,
      share,
      visibleLen,
      dashOffset,
    };
  });

  const hoveredArc = hoveredArcId ? arcs.find((a) => a.id === hoveredArcId) || null : null;

  return (
    <div
      data-testid="radial-gauge-container"
      className="relative flex shrink-0 items-center justify-center cursor-pointer"
      style={{ width: size, height: size }}
      onMouseEnter={() => {
        if (arcs.length === 1) {
          setHoveredArcId(arcs[0].id);
          onHoverId?.(arcs[0].id);
        }
      }}
      onMouseLeave={() => {
        setHoveredArcId(null);
        onHoverId?.(null);
      }}
    >
      {hoveredArc && (
        <div
          data-testid="radial-gauge-tooltip"
          className="pointer-events-none absolute -top-2 left-1/2 z-30 w-max max-w-[200px] -translate-x-1/2 -translate-y-full rounded-[12px] border border-white/15 bg-[#222026]/95 px-2.5 py-1.5 text-white shadow-[0_12px_28px_-6px_rgba(34,32,38,0.45)] backdrop-blur-md tabular-nums"
        >
          <div className="flex items-center gap-2 text-[10.5px]">
            <span
              className="h-2 w-2 rounded-full shrink-0"
              style={{ backgroundColor: hoveredArc.color, boxShadow: `0 0 8px ${hoveredArc.color}` }}
            />
            <span className="font-bold text-white truncate max-w-[100px]">{hoveredArc.label}</span>
            <span className="font-extrabold text-white/95">
              {hoveredArc.formattedValue ?? `${(hoveredArc.share * 100).toFixed(1)}%`}
            </span>
          </div>
        </div>
      )}

      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90 overflow-visible"
        role="img"
        aria-label={`${centerEyebrow}: ${centerValue}`}
      >
        <defs>
          <filter id={`glow-${filterId}`} x="-25%" y="-25%" width="150%" height="150%">
            <feGaussianBlur stdDeviation="2.4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Frosted Track Ring */}
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke="currentColor"
          className="text-ink-muted/12 dark:text-white/10"
          strokeWidth={strokeWidth}
        />

        {arcs.map((arc, idx) => {
          const isHighlighted = activeId ? activeId === arc.id : idx === 0;
          const isDimmed = Boolean(activeId && activeId !== arc.id);
          return (
            <g key={arc.id} data-testid={`radial-gauge-arc-${idx}`}>
              <circle
                cx={cx}
                cy={cy}
                r={radius}
                fill="none"
                stroke={arc.color}
                strokeWidth={isHighlighted ? strokeWidth + 1.5 : strokeWidth}
                strokeLinecap="round"
                strokeDasharray={`${arc.visibleLen.toFixed(2)} ${circumference.toFixed(2)}`}
                strokeDashoffset={arc.dashOffset.toFixed(2)}
                filter={isHighlighted ? `url(#glow-${filterId})` : undefined}
                pointerEvents="stroke"
                className="transition-all duration-300 cursor-pointer"
                style={{ opacity: isDimmed ? 0.38 : 1 }}
              />
              {/* Wide transparent stroke hit target so hovering thin arcs triggers reliably */}
              <circle
                cx={cx}
                cy={cy}
                r={radius}
                fill="none"
                stroke="transparent"
                strokeWidth={strokeWidth + 14}
                strokeDasharray={`${arc.visibleLen.toFixed(2)} ${circumference.toFixed(2)}`}
                strokeDashoffset={arc.dashOffset.toFixed(2)}
                pointerEvents="stroke"
                className="cursor-pointer"
                onMouseEnter={() => {
                  setHoveredArcId(arc.id);
                  onHoverId?.(arc.id);
                }}
                onMouseLeave={() => {
                  setHoveredArcId(null);
                  onHoverId?.(null);
                }}
              />
            </g>
          );
        })}
      </svg>

      {/* Center Readout */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center px-3">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
          {centerEyebrow}
        </span>
        <span className="mt-0.5 text-[20px] font-extrabold leading-none text-ink tabular-nums">
          {centerValue}
        </span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  3. Segmented Proportion Capsule Bar                                        */
/* -------------------------------------------------------------------------- */

export interface SegmentedCapsuleBarProps {
  segments: Array<{
    id: string;
    label: string;
    pct: number;
    color: string;
    formattedValue?: string;
  }>;
  activeId?: string | null;
  onHoverId?: (id: string | null) => void;
  className?: string;
}

export function SegmentedCapsuleBar({
  segments,
  activeId,
  onHoverId,
  className,
}: SegmentedCapsuleBarProps) {
  const [hoveredIdx, setHoveredIdx] = React.useState<number | null>(null);
  const valid = segments.filter((s) => s.pct > 0);
  const sum = valid.reduce((acc, s) => acc + s.pct, 0) || 100;

  let accumRatio = 0;
  const positionedSegments = valid.map((seg) => {
    const shareRatio = seg.pct / sum;
    const centerRatio = accumRatio + shareRatio / 2;
    accumRatio += shareRatio;
    return {
      ...seg,
      widthPct: Math.max(4, shareRatio * 100),
      centerRatio,
    };
  });

  const hoveredSeg = hoveredIdx !== null ? positionedSegments[hoveredIdx] || null : null;

  return (
    <div
      className={cn('relative w-full', className)}
      onMouseLeave={() => {
        setHoveredIdx(null);
        onHoverId?.(null);
      }}
    >
      {hoveredSeg && (
        <div
          data-testid="capsule-bar-tooltip"
          className="pointer-events-none absolute bottom-full mb-2 z-30 w-max max-w-[220px] rounded-[12px] border border-white/15 bg-[#222026]/95 px-2.5 py-1.5 text-white shadow-[0_12px_28px_-6px_rgba(34,32,38,0.45)] backdrop-blur-md transition-all duration-150 tabular-nums"
          style={getTooltipHorizontalPosition(hoveredSeg.centerRatio)}
        >
          <div className="flex items-center gap-2 text-[10.5px]">
            <span
              className="h-2 w-2 rounded-full shrink-0"
              style={{ backgroundColor: hoveredSeg.color, boxShadow: `0 0 8px ${hoveredSeg.color}` }}
            />
            <span className="font-bold text-white truncate max-w-[115px]">{hoveredSeg.label}</span>
            <span className="font-extrabold text-white/95">
              {hoveredSeg.formattedValue
                ? `${hoveredSeg.formattedValue} (${hoveredSeg.pct.toFixed(1)}%)`
                : `${hoveredSeg.pct.toFixed(1)}%`}
            </span>
          </div>
        </div>
      )}

      <div className="flex h-2.5 w-full items-stretch gap-1 overflow-hidden rounded-full bg-surface-muted p-0.5">
        {positionedSegments.map((seg, idx) => {
          const isDimmed = Boolean(activeId && activeId !== seg.id);
          return (
            <div
              key={seg.id}
              aria-label={`${seg.label}: ${seg.pct.toFixed(1)}%`}
              onMouseEnter={() => {
                setHoveredIdx(idx);
                onHoverId?.(seg.id);
              }}
              className="h-full rounded-full transition-all duration-300 cursor-pointer"
              style={{
                width: `${seg.widthPct.toFixed(2)}%`,
                backgroundColor: seg.color,
                opacity: isDimmed ? 0.35 : 1,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  4. Glowing Cubic Area Sparkline ($21.930 Profile Card Style)              */
/* -------------------------------------------------------------------------- */

export interface SparklinePoint {
  label: string;
  value: number;
  formattedValue?: string;
  secondaryText?: string;
}

export interface GlowingAreaSparklineProps {
  points: SparklinePoint[];
  strokeColor?: string;
  height?: number;
  className?: string;
  showEndpointPulse?: boolean;
  showTooltip?: boolean;
  onHoverPoint?: (point: SparklinePoint | null) => void;
}

export function GlowingAreaSparkline({
  points,
  strokeColor = 'var(--theme-accent)',
  height = 84,
  className,
  showEndpointPulse = true,
  showTooltip = true,
  onHoverPoint,
}: GlowingAreaSparklineProps) {
  const gradId = React.useId().replace(/:/g, '');
  const [hoverIndex, setHoverIndex] = React.useState<number | null>(null);

  const width = 260;
  const padX = 8;
  const padTop = 10;
  const padBottom = 8;

  const coords = React.useMemo(() => {
    const safePts = points.length > 0 ? points : [{ label: 'Now', value: 0 }];
    const vals = safePts.map((p) => p.value);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const span = max - min || 1;
    const innerW = width - padX * 2;
    const innerH = height - padTop - padBottom;

    return safePts.map((pt, idx) => {
      const x =
        safePts.length === 1
          ? width / 2
          : padX + (idx / (safePts.length - 1)) * innerW;
      const normalized = max === min ? 0.5 : (pt.value - min) / span;
      const y = padTop + (1 - normalized) * innerH;
      return { x, y, pt };
    });
  }, [points, height]);

  const linePath = React.useMemo(() => buildSmoothSvgPath(coords), [coords]);
  const areaPath = React.useMemo(() => {
    if (coords.length === 0) return '';
    const first = coords[0];
    const last = coords[coords.length - 1];
    return `${linePath} L ${last.x.toFixed(2)} ${height} L ${first.x.toFixed(2)} ${height} Z`;
  }, [coords, linePath, height]);

  const activeCoord = hoverIndex !== null ? coords[hoverIndex] : coords[coords.length - 1];
  const hoveredCoord = hoverIndex !== null ? coords[hoverIndex] : null;
  const hoveredRatio = hoveredCoord ? hoveredCoord.x / width : 0.5;

  return (
    <div className={cn('relative w-full select-none', className)}>
      {showTooltip && hoveredCoord && (
        <div
          data-testid="sparkline-tooltip"
          className="pointer-events-none absolute bottom-full mb-1.5 z-30 w-max max-w-[210px] rounded-[12px] border border-white/15 bg-[#222026]/95 px-2.5 py-1.5 text-white shadow-[0_12px_28px_-6px_rgba(34,32,38,0.45)] backdrop-blur-md transition-all duration-150 tabular-nums"
          style={getTooltipHorizontalPosition(hoveredRatio)}
        >
          <div className="flex items-center justify-between gap-2 text-[10px] text-white/70">
            <span className="font-semibold truncate">{hoveredCoord.pt.label}</span>
            {hoveredCoord.pt.secondaryText && (
              <span className="shrink-0 text-white/60">{hoveredCoord.pt.secondaryText}</span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] font-extrabold text-white">
            <span
              className="h-2 w-2 rounded-full shrink-0"
              style={{ backgroundColor: strokeColor, boxShadow: `0 0 8px ${strokeColor}` }}
            />
            <span>{hoveredCoord.pt.formattedValue ?? hoveredCoord.pt.value}</span>
          </div>
        </div>
      )}

      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="w-full overflow-visible"
        style={{ height }}
        onMouseLeave={() => {
          setHoverIndex(null);
          onHoverPoint?.(null);
        }}
      >
        <defs>
          <linearGradient id={`area-${gradId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity="0.34" />
            <stop offset="100%" stopColor={strokeColor} stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {areaPath && <path d={areaPath} fill={`url(#area-${gradId})`} />}
        {linePath && (
          <path
            d={linePath}
            fill="none"
            stroke={strokeColor}
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Active / Hover Crosshair Guide */}
        {hoveredCoord && (
          <line
            x1={hoveredCoord.x}
            y1={hoveredCoord.y}
            x2={hoveredCoord.x}
            y2={height}
            stroke={strokeColor}
            strokeOpacity="0.45"
            strokeWidth="1.5"
            strokeDasharray="3 3"
          />
        )}

        {/* Active / Endpoint Luminous Dot */}
        {activeCoord && (showEndpointPulse || hoverIndex !== null) && (
          <g>
            <circle
              cx={activeCoord.x}
              cy={activeCoord.y}
              r="7"
              fill={strokeColor}
              opacity="0.22"
            />
            <circle
              cx={activeCoord.x}
              cy={activeCoord.y}
              r="3.5"
              fill={strokeColor}
              stroke="#FFFFFF"
              strokeWidth="1.5"
            />
          </g>
        )}

        {/* Invisible Pointer Hit Targets */}
        {coords.map((c, idx) => (
          <rect
            key={`${c.pt.label}-${idx}`}
            x={Math.max(0, c.x - width / Math.max(coords.length * 2, 2))}
            y={0}
            width={width / Math.max(coords.length, 1)}
            height={height}
            fill="transparent"
            className="cursor-pointer"
            onMouseEnter={() => {
              setHoverIndex(idx);
              onHoverPoint?.(c.pt);
            }}
          />
        ))}
      </svg>
    </div>
  );
}

