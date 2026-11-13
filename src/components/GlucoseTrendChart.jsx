import { useMemo, useState } from 'react';
import {
  classifyGlucoseLevel,
  READING_SLOTS,
  SLOT_MAP,
} from '../utils/glucose.js';

export function GlucoseTrendChart({ readings, title = 'Glucose trend' }) {
  const [hoveredId, setHoveredId] = useState(null);

  const ordered = useMemo(() => {
    return [...readings].sort((a, b) => {
      if (a.readingDate !== b.readingDate) {
        return a.readingDate.localeCompare(b.readingDate);
      }
      return (
        READING_SLOTS.findIndex((s) => s.id === a.slot) -
        READING_SLOTS.findIndex((s) => s.id === b.slot)
      );
    });
  }, [readings]);

  if (ordered.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-emerald-100 p-6">
        <h3 className="text-sm font-semibold text-slate-900 mb-1">{title}</h3>
        <p className="text-sm text-slate-500 py-10 text-center">
          No readings in this window to plot yet.
        </p>
      </div>
    );
  }

  const width = 760;
  const height = 240;
  const padLeft = 44;
  const padRight = 20;
  const padTop = 18;
  const padBottom = 32;
  const innerW = width - padLeft - padRight;
  const innerH = height - padTop - padBottom;

  const maxVal = Math.max(260, ...ordered.map((r) => r.value + 20));
  const minVal = Math.min(50, ...ordered.map((r) => Math.max(40, r.value - 15)));
  const span = Math.max(60, maxVal - minVal);

  const yFor = (val) => padTop + ((maxVal - val) / span) * innerH;
  const xFor = (idx) =>
    ordered.length === 1
      ? padLeft + innerW / 2
      : padLeft + (idx / (ordered.length - 1)) * innerW;

  const bandTop = yFor(180);
  const bandBottom = yFor(70);

  const polylinePoints = ordered
    .map((r, i) => `${xFor(i).toFixed(1)},${yFor(r.value).toFixed(1)}`)
    .join(' ');

  const hovered = ordered.find((r) => r.id === hoveredId) ?? ordered[ordered.length - 1];
  const gridLevels = [70, 130, 180, 250].filter((lvl) => lvl >= minVal && lvl <= maxVal);

  return (
    <div className="bg-white rounded-2xl border border-emerald-100 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Target zone 70–180 mg/dL shaded in soft mint
          </p>
        </div>
        {hovered && (
          <div className="text-xs text-slate-600 font-mono tabular-nums">
            {hovered.readingDate} · {SLOT_MAP[hovered.slot].shortLabel} ·{' '}
            <span className="font-semibold text-slate-900">{hovered.value} mg/dL</span>
          </div>
        )}
      </div>

      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full min-w-[480px] h-56 select-none"
          role="img"
          aria-label={title}
        >
          {/* Target Range Band */}
          <rect
            x={padLeft}
            y={bandTop}
            width={innerW}
            height={Math.max(0, bandBottom - bandTop)}
            fill="#ecfdf5"
          />

          {/* Reference Grid Lines */}
          {gridLevels.map((lvl) => {
            const y = yFor(lvl);
            return (
              <g key={lvl}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={width - padRight}
                  y2={y}
                  stroke="#e2e8f0"
                  strokeDasharray="3 3"
                  strokeWidth={1}
                />
                <text
                  x={padLeft - 8}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-slate-400 text-[10px] font-mono"
                >
                  {lvl}
                </text>
              </g>
            );
          })}

          {/* Connecting Line */}
          {ordered.length > 1 && (
            <polyline
              fill="none"
              stroke="#059669"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              points={polylinePoints}
            />
          )}

          {/* Points */}
          {ordered.map((r, i) => {
            const cx = xFor(i);
            const cy = yFor(r.value);
            const cls = classifyGlucoseLevel(r.value, r.slot);
            const fill =
              cls.level === 'in_range'
                ? '#059669'
                : cls.level === 'high'
                ? '#dc2626'
                : '#d97706';
            const isActive = hovered?.id === r.id;

            return (
              <g key={r.id}>
                <circle
                  cx={cx}
                  cy={cy}
                  r={isActive ? 6 : 4}
                  fill={fill}
                  stroke="#ffffff"
                  strokeWidth={2}
                  className="cursor-pointer transition-all"
                  onMouseEnter={() => setHoveredId(r.id)}
                  onFocus={() => setHoveredId(r.id)}
                  tabIndex={0}
                  aria-label={`${r.readingDate} ${SLOT_MAP[r.slot].label}: ${r.value} mg/dL`}
                />
              </g>
            );
          })}

          {/* First and Last X Labels */}
          <text
            x={padLeft}
            y={height - 8}
            textAnchor="start"
            className="fill-slate-400 text-[10px] font-mono"
          >
            {ordered[0].readingDate}
          </text>
          {ordered.length > 1 && (
            <text
              x={width - padRight}
              y={height - 8}
              textAnchor="end"
              className="fill-slate-400 text-[10px] font-mono"
            >
              {ordered[ordered.length - 1].readingDate}
            </text>
          )}
        </svg>
      </div>
    </div>
  );
}
