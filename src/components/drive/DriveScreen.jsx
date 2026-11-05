import { useMemo, useRef, useState } from 'react';
import { confirmTwice } from '../../lib/confirm';
import { patchPath } from '../../lib/db';
import {
  GRAB_NET_RATE,
  carTargetOf,
  computePetrolStats,
  cycleForPeriod,
  cycleTotals,
  dailyNet,
  dayReport,
  driveSpan,
  fmtDate,
  grabNet,
  itemsOf,
  parseBodyLogBackup,
  petrolCostPerHour,
  ridesOf,
} from '../../lib/drive';
import { formatMoney, parseAmount } from '../../lib/format';
import { periodLabel } from '../../lib/budget';
import Modal from '../Modal';
import EntrySheet from './EntrySheet';
import GrabBadge from './GrabBadge';
import RideSheet from './RideSheet';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortD = (s) => `${Number(s.slice(8, 10))} ${MONTHS[Number(s.slice(5, 7)) - 1]}`;
const longD = (s) => new Date(`${s}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long' });
const timeLabel = (t) => {
  const [h, m] = (t || '12:00').split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
};
const today = () => fmtDate(new Date());

// The Drive page for one person's Grab income: the car-payment cycle for the
// month being shown, a calendar with each day's report, daily earnings,
// petrol stats and everything logged.
export default function DriveScreen({ ledgerId, pk, personId, personName, drive, currency, onBack }) {
  const path = `ledgers/${ledgerId}/drive/${personId}`;
  const money = (n) => formatMoney(n || 0, currency);
  const rides = useMemo(() => ridesOf(drive), [drive]);
  const items = useMemo(() => itemsOf(drive), [drive]);
  const carTarget = carTargetOf(drive);
  const monthly = /^\d{4}-\d{2}$/.test(pk);
  const { start, end } = cycleForPeriod(monthly ? pk : `${pk}-12`);
  const c = cycleTotals(rides, items, start, end);
  const petrol = useMemo(() => computePetrolStats(rides, items), [rides, items]);
  const petrolHr = petrolCostPerHour(rides, petrol);

  // Calendar: starts on the month with today in this cycle, else the cycle's last month.
  const t = today();
  const [calKey, setCalKey] = useState(() => (t >= start && t <= end ? t : end).slice(0, 7));
  const [selDay, setSelDay] = useState(() => (t >= start && t <= end ? t : null));
  const [rideSheet, setRideSheet] = useState(null); // { ride?, date }
  const [entrySheet, setEntrySheet] = useState(null); // { item?, type, date }
  const [menu, setMenu] = useState(false);
  const [importing, setImporting] = useState(false);

  // ── The car-payment card (as in Body Log) ──
  const covered = c.net + c.fuelSavings + c.erp; // ERP collected counts in the headline only
  const pct = Math.min(100, Math.max(0, (covered / carTarget) * 100));
  const short = carTarget - covered;
  const bracket = c.earnNet - c.fuel - c.others;
  const pctOfNet = (v) => (c.earnNet > 0 ? ` · ${((v / c.earnNet) * 100).toFixed(1)}%` : '');
  const span = driveSpan(rides, start, end);
  const netHr = span.hours > 0 ? grabNet(span.gross) / span.hours : null;
  const netHrAfter = netHr != null && petrolHr != null ? netHr - petrolHr : null;

  const editTarget = () => {
    const v = window.prompt('Car payment each cycle', String(carTarget));
    const n = v == null ? null : parseAmount(v);
    if (n > 0) patchPath(`${path}/settings`, { carTarget: n });
    setMenu(false);
  };

  // ── Calendar ──
  const byDate = {};
  for (const it of items) {
    const d = (byDate[it.date] ||= {});
    d[it.type === 'earn' ? 'ride' : it.type] = true;
  }
  for (const r of rides) (byDate[r.date] ||= {}).ride = true;
  const [cy, cm] = calKey.split('-').map(Number);
  const firstDow = new Date(cy, cm - 1, 1).getDay();
  const daysIn = new Date(cy, cm, 0).getDate();
  const stepCal = (dir) => {
    const d = new Date(cy, cm - 1 + dir, 1);
    setCalKey(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };
  const report = selDay ? dayReport(rides, items, selDay) : null;

  // ── Daily chart ──
  const days = dailyNet(rides, items, start, end);
  const maxDay = Math.max(...days.map((d) => d.value), 1);

  // ── History ──
  const history = [
    ...rides.map((r) => ({ key: `r${r.id}`, sort: r.dateTime || r.date, date: r.date, text: `🚗 Ride ${money(r.amount)} · ${timeLabel(r.time)}${r.erp ? ` · ERP ${money(r.erp)}` : ''}${r.note ? ` · ${r.note}` : ''}`, open: () => setRideSheet({ ride: r, date: r.date }) })),
    ...items.map((it) => ({ key: `i${it.id}`, sort: `${it.date}T99`, date: it.date, text: itemText(it, money), open: () => setEntrySheet({ item: it, date: it.date }) })),
  ]
    .sort((a, b) => b.sort.localeCompare(a.sort))
    .slice(0, 15);

  return (
    <div className="drive">
      <div className="drive-head">
        <button className="btn ghost sm back" onClick={onBack}>
          ‹ Back
        </button>
        <span className="list-menu-wrap">
          <button className="btn ghost sm" onClick={() => setMenu((o) => !o)} aria-expanded={menu} aria-label="Drive options">
            ⋯
          </button>
          {menu && (
            <>
              <div className="menu-scrim" onClick={() => setMenu(false)} />
              <div className="list-menu right" role="menu">
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenu(false);
                    setImporting(true);
                  }}
                >
                  <span className="menu-ico">📥</span> Import from Body Log backup
                </button>
                <button role="menuitem" onClick={editTarget}>
                  <span className="menu-ico">🚙</span> Car payment amount ({money(carTarget)})
                </button>
              </div>
            </>
          )}
        </span>
      </div>
      <div className="drive-title">
        <GrabBadge />
        <div>
          <h1 className="screen-title">Drive</h1>
          <span className="muted small">{personName ? `${personName}’s Grab driving` : 'Grab driving'}</span>
        </div>
      </div>

      {/* Car payment cycle */}
      <section className="home-card drive-hero">
        <div className="dh-label">
          <span>
            Car payment cycle · {shortD(start)} to {shortD(end)}
          </span>
          <button className="btn primary sm" onClick={() => setRideSheet({ date: t >= start && t <= end ? t : end })} aria-label="Add a Grab ride">
            🚗＋
          </button>
        </div>
        <div className="dh-amount">
          <b>{money(covered)}</b>
          {c.earnNet > 0 && <span className="dh-tag">{((covered / c.earnNet) * 100).toFixed(1)}% of net</span>}
          <span className="dh-bracket">
            ({money(bracket)}
            {pctOfNet(bracket)})
          </span>
        </div>
        <span className="dh-bar">
          <i style={{ width: `${pct}%` }} />
        </span>
        <p className="dh-note">
          {short > 0 ? (
            <>
              <b>{money(short)}</b> to go toward the{' '}
              <button className="link-btn" onClick={editTarget}>
                {money(carTarget)}
              </button>{' '}
              car payment
            </>
          ) : (
            <>
              Car payment covered, <b>{money(-short)}</b> clear
            </>
          )}
          <span className="muted small"> · after Grab’s cut ({((1 - GRAB_NET_RATE) * 100).toFixed(1)}%) and petrol</span>
        </p>
        <div className="dh-split">
          <Cell k="Grab net" v={money(c.earnNet)} cls="grab" />
          <Cell k="Grab gross" v={money(c.earn)} cls="muted" />
          <Cell k="Petrol (Grab)" v={money(c.fuelGrab)} cls="petrol" />
          <Cell k="Days driven" v={c.days} />
          <Cell k="Avg net / day" v={c.days ? money(c.earnNet / c.days) : '–'} cls="grab" />
          <Cell k={netHrAfter != null ? 'Avg / hr after petrol' : 'Avg net / hr'} v={netHrAfter != null ? money(netHrAfter) : netHr != null ? money(netHr) : '–'} cls="grab" />
          <Cell k="CPF" v={money(c.earn - c.earnNet)} cls="muted" />
          <Cell k="ERP total" v={money(c.erp)} cls="grab" />
          {c.others > 0 && <Cell k="Others" v={money(c.others)} cls="coral" />}
          {c.fuelSavings > 0 && <Cell k="Petrol via savings" v={money(c.fuelSavings)} cls="coral" />}
          {c.fuelSavings > 0 && <Cell k="Total petrol" v={money(c.fuel)} cls="petrol" />}
        </div>
        <p className="muted small dh-income">
          {monthly ? (
            <>
              <b>{money(c.net)}</b> (Grab net after petrol) is {personName || 'this person'}’s Grab income for {periodLabel(pk)}.
            </>
          ) : (
            <>Showing December’s cycle. Each month’s Grab income is that month’s cycle.</>
          )}
        </p>
      </section>

      {/* Calendar and the day's report */}
      <section className="home-card drive-cal">
        <div className="home-card-head">
          <h2>Calendar</h2>
          <span className="row-gap">
            <button className="btn ghost sm" onClick={() => stepCal(-1)} aria-label="Previous month">
              ‹
            </button>
            <b className="cal-month">
              {MONTHS[cm - 1]} {cy}
            </b>
            <button className="btn ghost sm" onClick={() => stepCal(1)} aria-label="Next month">
              ›
            </button>
          </span>
        </div>
        <div className="cal-grid">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
            <span key={i} className="cal-dow">
              {d}
            </span>
          ))}
          {Array.from({ length: firstDow }, (_, i) => (
            <span key={`b${i}`} />
          ))}
          {Array.from({ length: daysIn }, (_, i) => {
            const ds = `${calKey}-${String(i + 1).padStart(2, '0')}`;
            const info = byDate[ds] || {};
            return (
              <button
                key={ds}
                className={`cal-cell ${ds === t ? 'today' : ''} ${ds === selDay ? 'sel' : ''} ${ds >= start && ds <= end ? 'in-cycle' : ''}`}
                onClick={() => setSelDay(selDay === ds ? null : ds)}
                aria-label={longD(ds)}
                aria-pressed={ds === selDay}
              >
                <span className="dnum">{i + 1}</span>
                <span className="cal-dots">
                  {info.ride && <i className="car">🚗</i>}
                  {info.petrol && <i className="p" />}
                  {info.other && <i className="o" />}
                </span>
              </button>
            );
          })}
        </div>
        <div className="cal-legend muted small">
          <span>🚗 Grab</span>
          <span>
            <i className="p" /> Petrol
          </span>
          <span>
            <i className="o" /> Other
          </span>
          <span>
            <i className="cyc" /> This cycle
          </span>
        </div>

        {report ? (
          <div className="day-report">
            <div className="dr-head">
              <b>📅 {longD(selDay)}</b>
              <span className="row-gap">
                <button className="btn glass sm" onClick={() => setRideSheet({ date: selDay })}>
                  ＋ Ride
                </button>
                <button className="btn ghost sm" onClick={() => setEntrySheet({ type: 'petrol', date: selDay })}>
                  ＋ Cost
                </button>
              </span>
            </div>
            {report.petrol.map((p) => (
              <button key={p.id} className="dr-line" onClick={() => setEntrySheet({ item: p, date: p.date })}>
                ⛽ Petrol <b>{money(p.amount)}</b>
                {petrolSource(p, money)}
              </button>
            ))}
            {report.other.map((o) => (
              <button key={o.id} className="dr-line" onClick={() => setEntrySheet({ item: o, date: o.date })}>
                🔧 {o.category || 'Other'} <b>{money(o.amount)}</b>
                {o.note ? ` — ${o.note}` : ''}
              </button>
            ))}
            <p className="section-label">Grab earnings report</p>
            {report.rides.length === 0 && report.legacy.length === 0 ? (
              <p className="muted small">No Grab earnings recorded for this day.</p>
            ) : (
              <>
                <div className="dr-stats">
                  <Cell k="Trips" v={report.trips} />
                  <Cell k="Avg net" v={money(report.avgNet)} />
                  <Cell k="Net / hr" v={report.netPerHour != null ? money(petrolHr != null ? report.netPerHour - petrolHr : report.netPerHour) : '—'} />
                  <Cell k="Net" v={money(report.net)} cls="grab" />
                </div>
                <p className="muted small">
                  Gross {money(report.gross)}, less Grab’s {((1 - GRAB_NET_RATE) * 100).toFixed(1)}% cut, so <b>{money(report.net)}</b> lands.
                  {report.netPerHour != null &&
                    (petrolHr != null ? ` Net / hr is ${money(report.netPerHour)} less petrol of ${money(petrolHr)} / hr.` : ' Net / hr is before petrol; log the odometer on two fills in a row to take petrol off.')}
                  {report.erp > 0 && ` ERP today: ${money(report.erp)}.`}
                </p>
                <div className="ride-rows">
                  {report.legacy.map((it) => (
                    <button key={it.id} className="ride-row" onClick={() => setEntrySheet({ item: it, date: it.date })}>
                      <span className="rr-t">Day</span>
                      <b className="rr-a">{money(it.amount)}</b>
                      <span className="rr-n muted small">{it.jobs ? `${it.jobs} jobs` : 'day total'}</span>
                      <span className="rr-e">✎</span>
                    </button>
                  ))}
                  {report.rides.map((r) => (
                    <button key={r.id} className="ride-row" onClick={() => setRideSheet({ ride: r, date: r.date })}>
                      <span className="rr-t">{timeLabel(r.time)}</span>
                      <b className="rr-a">{money(r.amount)}</b>
                      <span className="rr-n muted small">{[r.note, r.erp ? `ERP ${money(r.erp)}` : '', r.gap ? `+${r.gap}` : ''].filter(Boolean).join(' · ')}</span>
                      <span className="rr-e">✎</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
          <p className="muted small center-text">Tap a day to see what was logged.</p>
        )}
      </section>

      {/* Grab earnings per day, this cycle */}
      <section className="home-card">
        <div className="home-card-head">
          <h2>Grab earnings per day</h2>
          <span className="muted small">net, this cycle</span>
        </div>
        {days.some((d) => d.value > 0) ? (
          <div className="day-bars">
            {days.map((d) => (
              <button key={d.date} className={`day-bar-col ${d.date === selDay ? 'picked' : ''}`} onClick={() => {
                setSelDay(d.date);
                setCalKey(d.date.slice(0, 7));
              }} aria-label={`${longD(d.date)}: ${money(d.value)}`}>
                <span className="db-v">{d.value > 0 ? Math.round(d.value) : ''}</span>
                <span className="db-wrap">
                  <i style={{ height: `${Math.max(2, (d.value / maxDay) * 100)}%`, opacity: d.value ? 1 : 0.2 }} />
                </span>
                <span className="db-l">{d.date.slice(8)}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="muted small">Log a Grab ride and each day’s total appears here.</p>
        )}
      </section>

      {/* Petrol */}
      <section className="home-card">
        <div className="home-card-head">
          <h2>Petrol</h2>
          <button className="btn glass sm" onClick={() => setEntrySheet({ type: 'petrol', date: t })}>
            ＋ Fill
          </button>
        </div>
        {!petrol ? (
          <p className="muted small">Log a petrol fill (with litres and odometer, when you have them) to see these stats.</p>
        ) : (
          <>
            <div className="dh-split four">
              <Cell k="Avg price / litre" v={petrol.avgPricePerLitre != null ? money(petrol.avgPricePerLitre) : '—'} cls="petrol" />
              <Cell k="Avg spend / day" v={petrol.avgSpendPerDay != null ? money(petrol.avgSpendPerDay) : '—'} cls="petrol" />
              <Cell k="Days between fills" v={petrol.avgDaysBetween != null ? petrol.avgDaysBetween.toFixed(1) : '—'} />
              <Cell k="Avg km / fill" v={petrol.avgKmPerFill != null ? `${Math.round(petrol.avgKmPerFill).toLocaleString()} km` : '—'} />
            </div>
            {petrol.fuel ? (
              <>
                <p className="section-label">Fuel vs earnings · per tank, from the odometer</p>
                <div className="dh-split four">
                  <Cell k="Price / litre" v={money(petrol.fuel.pricePerLitre)} cls="petrol" />
                  <Cell k="Earn / litre" v={money(petrol.fuel.earnPerLitre)} cls="grab" />
                  <Cell k="Km / litre" v={petrol.fuel.kmPerLitre.toFixed(1)} />
                  <Cell k="Net P/L" v={`${petrol.fuel.pnlPerLitre >= 0 ? '+' : '−'}${money(Math.abs(petrol.fuel.pnlPerLitre))}/L`} cls={petrol.fuel.pnlPerLitre >= 0 ? 'grab' : 'coral'} />
                </div>
                <p className="muted small">
                  Across {petrol.cycles.length} tank{petrol.cycles.length === 1 ? '' : 's'}: {Math.round(petrol.fuel.km).toLocaleString()} km on {petrol.fuel.litres.toFixed(1)}L, {money(petrol.fuel.cost)} spent against {money(petrol.fuel.earned)} earned
                  {petrol.fuel.margin != null ? ` (${petrol.fuel.margin.toFixed(0)}% kept after fuel)` : ''}.
                </p>
                <div className="tank-rows">
                  {petrol.cycles
                    .slice(-5)
                    .reverse()
                    .map((tk) => (
                      <div key={tk.from} className="tank-row">
                        <span>{tankSpan(tk.from, tk.to)}</span>
                        <span className="muted">
                          {Math.round(tk.km).toLocaleString()}km · {tk.litres}L
                        </span>
                        <span>
                          {money(tk.pricePerLitre)}→{money(tk.earnPerLitre)}/L
                        </span>
                        <b className={tk.pnlPerLitre >= 0 ? 'pos' : 'neg'}>
                          {tk.pnlPerLitre >= 0 ? '+' : '−'}
                          {money(Math.abs(tk.pnlPerLitre))}/L
                        </b>
                      </div>
                    ))}
                </div>
              </>
            ) : (
              <p className="muted small">Log the odometer on two fills in a row, with litres on the earlier one, to see what each tank earned.</p>
            )}
            <PriceChart entries={petrol.entries} money={money} />
            <p className="section-label">Fills</p>
            <div className="history">
              {[...petrol.entries]
                .reverse()
                .slice(0, 15)
                .map((e) => (
                  <button key={e.id} className="history-row" onClick={() => setEntrySheet({ item: e, date: e.date })}>
                    <span className="hr-d">{shortD(e.date)}</span>
                    <span className="hr-v">{[money(e.amount), e.litres ? `${e.litres}L` : '', e.odometer ? `${e.odometer.toLocaleString()}km` : ''].filter(Boolean).join(' · ')}</span>
                    <span className="rr-e">✎</span>
                  </button>
                ))}
            </div>
          </>
        )}
      </section>

      {/* Everything, latest first */}
      <section className="home-card">
        <div className="home-card-head">
          <h2>History</h2>
          <button className="btn glass sm" onClick={() => setEntrySheet({ type: 'other', date: t })}>
            ＋ Other cost
          </button>
        </div>
        {history.length === 0 ? (
          <p className="muted small">Nothing logged yet. Tap 🚗＋ to log a ride, or import from Body Log (⋯ at the top).</p>
        ) : (
          <div className="history">
            {history.map((h) => (
              <button key={h.key} className="history-row" onClick={h.open}>
                <span className="hr-d">{shortD(h.date)}</span>
                <span className="hr-v">{h.text}</span>
                <span className="rr-e">✎</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {rideSheet && <RideSheet path={path} ride={rideSheet.ride} date={rideSheet.date} onClose={() => setRideSheet(null)} />}
      {entrySheet && <EntrySheet path={path} item={entrySheet.item} type={entrySheet.type} date={entrySheet.date} currency={currency} onClose={() => setEntrySheet(null)} />}
      {importing && <ImportBackup path={path} drive={drive} onClose={() => setImporting(false)} />}
    </div>
  );
}

function Cell({ k, v, cls = '' }) {
  return (
    <div className="dh-cell">
      <span className="dh-k">{k}</span>
      <b className={`dh-v ${cls}`}>{v}</b>
    </div>
  );
}

function petrolSource(p, money) {
  const src = [];
  if (p.fromGrab) src.push(`${money(p.fromGrab)} Grab`);
  if (p.fromSavings) src.push(`${money(p.fromSavings)} savings`);
  return src.length ? ` — ${src.join(' + ')}` : '';
}

function itemText(it, money) {
  if (it.type === 'petrol') return `⛽ Petrol ${money(it.amount)}${petrolSource(it, money)}${it.litres ? ` · ${it.litres}L` : ''}`;
  if (it.type === 'other') return `🔧 ${it.category || 'Other'} ${money(it.amount)}${it.note ? ` · ${it.note}` : ''}`;
  return `🚗 Day total ${money(it.amount)}${it.jobs ? ` · ${it.jobs} jobs` : ''}`;
}

// "1-8 Sep" inside one month, "28 Aug-3 Sep" across two.
function tankSpan(from, to) {
  const a = new Date(`${from}T00:00:00`);
  const b = new Date(`${to}T00:00:00`);
  return a.getMonth() === b.getMonth() ? `${a.getDate()}-${b.getDate()} ${MONTHS[b.getMonth()]}` : `${a.getDate()} ${MONTHS[a.getMonth()]}-${b.getDate()} ${MONTHS[b.getMonth()]}`;
}

// Price per litre over time; tap a dot to see it.
function PriceChart({ entries, money }) {
  const [pick, setPick] = useState(null);
  const points = entries.filter((e) => e.litres > 0).map((e) => ({ date: e.date, v: e.amount / e.litres }));
  if (points.length < 2) return <p className="muted small">Log litres on at least two fills to see the price per litre trend.</p>;
  const w = 440;
  const h = 150;
  const [padL, padR, padT, padB] = [46, 12, 28, 20];
  const vals = points.map((p) => p.v);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const step = (w - padL - padR) / (points.length - 1);
  const xy = points.map((p, i) => ({ ...p, x: padL + i * step, y: padT + (h - padT - padB) * (1 - (p.v - min) / range) }));
  const sel = xy[pick];
  return (
    <>
      <p className="section-label">Price per litre</p>
      <svg className="price-chart" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Petrol price per litre over time">
        {[0, 0.5, 1].map((f) => (
          <line key={f} className="pc-grid" x1={padL} x2={w - padR} y1={padT + f * (h - padT - padB)} y2={padT + f * (h - padT - padB)} />
        ))}
        <polyline className="pc-line" points={xy.map((p) => `${p.x},${p.y}`).join(' ')} />
        {xy.map((p, i) => (
          <g key={p.date + i} onClick={() => setPick(i)} style={{ cursor: 'pointer' }}>
            <circle className="pc-dot" cx={p.x} cy={p.y} r={i === pick ? 5 : 3.5} />
            <circle cx={p.x} cy={p.y} r="12" fill="transparent" />
          </g>
        ))}
        {sel && (
          <text className="pc-pin" x={Math.min(w - padR - 4, Math.max(padL + 4, sel.x))} y={Math.max(12, sel.y - 12)} textAnchor="middle">
            {money(sel.v)}/L · {shortD(sel.date)}
          </text>
        )}
        <text className="pc-axis" x="0" y={padT + 4}>
          {money(max)}
        </text>
        <text className="pc-axis" x="0" y={h - padB + 4}>
          {money(min)}
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

// Bring Grab rides, petrol and other costs over from a Body Log backup
// (📤 Export backup there). Merges by id, so importing twice adds nothing.
function ImportBackup({ path, drive, onClose }) {
  const [text, setText] = useState('');
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  async function run(raw) {
    setError('');
    setResult('');
    try {
      const { rides, items } = parseBodyLogBackup(raw);
      const newRides = Object.keys(rides).filter((id) => !drive?.rides?.[id]);
      const newItems = Object.keys(items).filter((id) => !drive?.items?.[id]);
      const count = (type) => newItems.filter((id) => items[id].type === type).length;
      const total = newRides.length + newItems.length;
      const n = (k, one, many) => `${k} ${k === 1 ? one : many}`;
      const summary = `${n(newRides.length, 'ride', 'rides')}, ${n(count('petrol'), 'petrol fill', 'petrol fills')} and ${n(count('other') + count('earn'), 'other entry', 'other entries')}`;
      if (!total) return setResult('Everything in that backup is already here — nothing new to add.');
      if (!confirmTwice(`Add ${summary}?`, 'these entries')) return;
      const patch = {};
      newRides.forEach((id) => (patch[`rides/${id}`] = rides[id]));
      newItems.forEach((id) => (patch[`items/${id}`] = items[id]));
      await patchPath(path, patch);
      setResult(`Imported ${summary}.`);
    } catch (e) {
      setError(e.message || 'Couldn’t import that.');
    }
  }

  function pickFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    file.text().then(run);
  }

  return (
    <Modal title="Import from Body Log" onClose={onClose}>
      <div className="sheet">
        <p className="muted small">In Body Log, tap 📤 Export backup and save the file. Then choose it here, or paste its text. Only Grab rides, petrol and other car costs are brought over — nothing else.</p>
        <input ref={fileRef} type="file" accept="application/json,.json,.txt" hidden onChange={pickFile} />
        <button className="btn primary" onClick={() => fileRef.current?.click()}>
          Choose backup file
        </button>
        <textarea className="import-text" value={text} onChange={(e) => setText(e.target.value)} placeholder="…or paste the backup text here" rows={5} />
        {text.trim() && (
          <button className="btn glass" onClick={() => run(text)}>
            Import pasted text
          </button>
        )}
        {result && <p className="pos">{result}</p>}
        {error && <p className="error">{error}</p>}
        <div className="row-gap end">
          <button className="btn ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}

