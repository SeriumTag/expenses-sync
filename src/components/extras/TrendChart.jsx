import { useEffect, useState } from 'react';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortD = (s) => `${Number(s.slice(8, 10))} ${MONTHS[Number(s.slice(5, 7)) - 1]}`;

// A line chart over dated rows with a metric picker; tap a point to pin its
// value. metrics: [{ key, label, color, format(v) }]; rows: [{ date, [key]: number }].
// focus: { metric, date } — after saving, jump to that point and pulse it.
export default function TrendChart({ metrics, rows, focus, emptyText = 'Log at least two entries to see a trend.' }) {
  const [active, setActive] = useState(metrics[0].key);
  const [pinned, setPinned] = useState(null);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    if (!focus) return;
    if (focus.metric) setActive(focus.metric);
    setPinned(focus.date);
    setPulse(true);
    const t = setTimeout(() => setPulse(false), 3300);
    return () => clearTimeout(t);
  }, [focus]);

  const def = metrics.find((m) => m.key === active) || metrics[0];
  const points = rows.filter((r) => r[def.key] != null && !Number.isNaN(Number(r[def.key]))).map((r) => ({ date: r.date, v: Number(r[def.key]) }));
  const fmt = def.format || ((v) => String(Math.round(v * 10) / 10));

  const picker = (
    <div className="trend-pick" role="group" aria-label="What to chart">
      {metrics.map((m) => (
        <button
          key={m.key}
          className={m.key === def.key ? 'on' : ''}
          style={m.key === def.key ? { background: m.color, borderColor: m.color } : undefined}
          onClick={() => {
            setActive(m.key);
            setPinned(null);
          }}
        >
          {m.label}
        </button>
      ))}
    </div>
  );

  if (points.length < 2) {
    return (
      <>
        {metrics.length > 1 && picker}
        <p className="muted small">{emptyText}</p>
      </>
    );
  }

  const w = 440;
  const h = 150;
  const [padL, padR, padT, padB] = [52, 12, 30, 20];
  const vals = points.map((p) => p.v);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const step = (w - padL - padR) / (points.length - 1);
  const xy = points.map((p, i) => ({ ...p, x: padL + i * step, y: padT + (h - padT - padB) * (1 - (p.v - min) / range) }));
  const pi = pinned ? xy.findIndex((p) => p.date === pinned) : -1;
  const sel = xy[pi];
  const label = sel ? `${fmt(sel.v)} · ${shortD(sel.date)}` : '';
  const lw = Math.max(64, label.length * 6.4 + 16);
  const lx = sel ? Math.max(padL - 4, Math.min(w - padR - lw + 4, sel.x - lw / 2)) : 0;

  return (
    <>
      {metrics.length > 1 && picker}
      <svg className="trend-chart" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${def.label} over time`}>
        {[0, 0.5, 1].map((f) => (
          <line key={f} className="pc-grid" x1={padL} x2={w - padR} y1={padT + f * (h - padT - padB)} y2={padT + f * (h - padT - padB)} />
        ))}
        <polyline className="tc-line" style={{ stroke: def.color }} points={xy.map((p) => `${p.x},${p.y}`).join(' ')} />
        {xy.map((p, i) => (
          <g key={`${p.date}-${i}`} onClick={() => setPinned(p.date)} style={{ cursor: 'pointer' }}>
            <circle cx={p.x} cy={p.y} r={i === pi ? 5 : 3.5} style={{ fill: def.color }} className="tc-dot" />
            <circle cx={p.x} cy={p.y} r="12" fill="transparent" />
          </g>
        ))}
        {sel && pulse && (
          <circle cx={sel.x} cy={sel.y} r="4" fill="none" stroke={def.color} strokeWidth="2">
            <animate attributeName="r" values="4;16;4" dur="1.6s" repeatCount="2" />
            <animate attributeName="opacity" values="0.7;0;0.7" dur="1.6s" repeatCount="2" />
          </circle>
        )}
        {sel && (
          <g>
            <rect x={lx} y={Math.max(2, sel.y - 34)} width={lw} height="22" rx="11" style={{ fill: def.color }} />
            <text className="tc-pin" x={lx + lw / 2} y={Math.max(2, sel.y - 34) + 15} textAnchor="middle">
              {label}
            </text>
          </g>
        )}
        <text className="pc-axis" x="0" y={padT + 4}>
          {fmt(max)}
        </text>
        <text className="pc-axis" x="0" y={h - padB + 4}>
          {fmt(min)}
        </text>
        <text className="pc-axis" x={padL} y={h - 2}>
          {shortD(points[0].date)}
        </text>
        <text className="pc-axis" x={w - padR} y={h - 2} textAnchor="end">
          {shortD(points[points.length - 1].date)}
        </text>
      </svg>
    </>
  );
}

// A tiny inline sparkline.
export function Sparkline({ values, color }) {
  if (values.length < 2) return <span className="spark" />;
  const w = 100;
  const h = 28;
  const min = Math.min(...values);
  const range = Math.max(...values) - min || 1;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * (w - 4) + 2).toFixed(1)},${(h - 2 - ((v - min) / range) * (h - 4)).toFixed(1)}`).join(' ');
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <polyline points={pts} style={{ stroke: color }} />
    </svg>
  );
}
