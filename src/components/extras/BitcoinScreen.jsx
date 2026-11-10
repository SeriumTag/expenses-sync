import { useEffect, useMemo, useState } from 'react';
import { patchPath } from '../../lib/db';
import {
  SATS_PER_BTC,
  botUsdt,
  botsOf,
  btcStr,
  buysOf,
  commas,
  currentSats,
  holdingsOf,
  isBuyOverdue,
  parseBitcoinBackup,
  priorBefore,
  relTime,
  sgdStr,
  today,
  usePrices,
  walletsBtc,
  walletsOf,
  withHoldings,
  zbdInvested,
  zbdOf,
} from '../../lib/crypto';
import { prefs } from '../../lib/session';
import { BalanceSheet, BotPasteSheet, BuySheet, CoinSheet, NameSheet } from './BitcoinSheets';
import ImportBackup, { backupStores, countText } from './ImportBackup';
import TrendChart from './TrendChart';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortD = (s) => `${Number(s.slice(8, 10))} ${MONTHS[Number(s.slice(5, 7)) - 1]}`;
const signed = (n, f) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${f(Math.abs(n))}`;
const tone = (n) => (n == null ? 'muted' : n > 0 ? 'grab' : n < 0 ? 'coral' : '');

// One person's Bitcoin: everything held across the ZBD wallet, Crypto.com
// buys and wallets (plus bots), valued live in SGD.
export default function BitcoinScreen({ ledgerId, personId, personName, data, onBack, onRemove }) {
  const path = `ledgers/${ledgerId}/bitcoin/${personId}`;
  const zbd = useMemo(() => zbdOf(data), [data]);
  const buys = useMemo(() => withHoldings(buysOf(data)), [data]);
  const wallets = useMemo(() => walletsOf(data), [data]);
  const bots = useMemo(() => botsOf(data), [data]);
  const [sub, setSubState] = useState(() => prefs.get('btcSub') || 'zbd');
  const setSub = (s) => {
    setSubState(s);
    prefs.set('btcSub', s);
  };
  const [sheet, setSheet] = useState(null); // { kind, ... }
  const [open, setOpen] = useState(() => new Set()); // wallet / bot cards opened
  const [menu, setMenu] = useState(false);
  const [importing, setImporting] = useState(false);
  const [focus, setFocus] = useState(null);

  // Prices: Bitcoin, every coin held in a wallet, and USDT when a bot has coins.
  const coinIds = ['bitcoin', ...wallets.flatMap((w) => holdingsOf(w).map((h) => h.coinId)), ...(bots.some((b) => b.coins?.length) ? ['tether'] : [])];
  const px = usePrices(coinIds);
  const btcPrice = px.price('bitcoin');
  const usdtRate = px.price('tether');

  // ── Totals ──
  const t = today();
  const sats = currentSats(zbd);
  const zCost = zbdInvested(zbd);
  const zValue = btcPrice != null ? (sats / SATS_PER_BTC) * btcPrice : null;
  const zGain = zValue != null ? zValue - zCost.invested : null;
  const zPct = zGain != null && zCost.invested > 0 ? (zGain / zCost.invested) * 100 : null;
  const holding = buys.length ? buys[buys.length - 1].eff : 0;
  const walletBtc = walletsBtc(wallets);
  const totalBtc = sats / SATS_PER_BTC + holding + walletBtc;
  const otherValue = wallets.reduce((s, w) => s + holdingsOf(w).filter((h) => h.coinId !== 'bitcoin').reduce((v, h) => v + (px.price(h.coinId) != null ? h.amount * px.price(h.coinId) : 0), 0), 0);
  const botsValue = usdtRate != null ? bots.reduce((s, b) => s + botUsdt(b), 0) * usdtRate : 0;
  const liveValue = btcPrice != null || otherValue || botsValue ? (btcPrice != null ? totalBtc * btcPrice : 0) + otherValue + botsValue : null;

  // What changed since before today. Wallets have no dated history, so one
  // snapshot of their BTC is kept per day.
  const snaps = data?.walletSnaps || {};
  useEffect(() => {
    if (wallets.length && snaps[t] === undefined) patchPath(`${path}/walletSnaps`, { [t]: Math.round(walletBtc * 1e8) / 1e8 });
  }, [wallets.length, t]); // eslint-disable-line react-hooks/exhaustive-deps
  const zPrev = priorBefore(zbd);
  const cPrev = priorBefore(buys);
  const wPrevDay = Object.keys(snaps).filter((d) => d < t).sort().pop();
  const delta =
    zPrev || cPrev || wPrevDay
      ? Math.round(((zPrev ? (sats - zPrev.sats) / SATS_PER_BTC : 0) + (cPrev ? holding - cPrev.eff : 0) + (wPrevDay ? walletBtc - snaps[wPrevDay] : 0)) * 1e8) / 1e8
      : null;

  function planImport(raw) {
    const found = parseBitcoinBackup(backupStores(raw));
    const patch = {};
    const counts = {};
    for (const [folder, items] of Object.entries(found)) {
      for (const [id, v] of Object.entries(items)) {
        if (data?.[folder]?.[id] !== undefined) continue;
        patch[`${folder}/${id}`] = v;
        counts[folder] = (counts[folder] || 0) + 1;
      }
    }
    const parts = [
      counts.zbd && countText(counts.zbd, 'ZBD balance', 'ZBD balances'),
      counts.buys && countText(counts.buys, 'Crypto.com buy', 'Crypto.com buys'),
      counts.wallets && countText(counts.wallets, 'wallet', 'wallets'),
      counts.bots && countText(counts.bots, 'bot', 'bots'),
    ].filter(Boolean);
    return { patch, summary: parts.join(', ') || 'wallet history' };
  }

  const overdue = isBuyOverdue(buys);
  const toggle = (id) =>
    setOpen((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const priceLine = (
    <span className="muted small">
      {px.busy ? 'Fetching prices…' : btcPrice != null ? `BTC $${sgdStr(btcPrice)} SGD · ${relTime(px.fetchedAt('bitcoin'))}` : px.error || 'Live price unavailable.'}{' '}
      {!px.busy && (
        <button className="link-btn" onClick={px.refresh}>
          refresh
        </button>
      )}
    </span>
  );

  return (
    <div className="drive extra-page">
      <div className="drive-head">
        <button className="btn ghost sm back" onClick={onBack}>
          ‹ Back
        </button>
        <span className="list-menu-wrap">
          <button className="btn ghost sm" onClick={() => setMenu((o) => !o)} aria-expanded={menu} aria-label="Bitcoin options">
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
              </div>
            </>
          )}
        </span>
      </div>
      <div className="drive-title">
        <span className="extra-badge btc">₿</span>
        <div>
          <h1 className="screen-title">Bitcoin</h1>
          <span className="muted small">{personName ? `${personName}’s holdings` : 'Holdings'}</span>
        </div>
      </div>

      {/* Everything together */}
      <section className="btc-strip">
        <div className="bs-row">
          <span className="bs-k">Total BTC</span>
          <b className="bs-v">{totalBtc.toFixed(8)}</b>
          <span className={`bs-d ${tone(delta)}`}>{delta == null ? '—' : delta === 0 ? '0' : signed(delta, btcStr)}</span>
        </div>
        <div className="bs-row">
          <span className="bs-k">Live value</span>
          <b className="bs-v">{liveValue != null ? `$${sgdStr(liveValue)} SGD` : 'Price unavailable'}</b>
          <span className={`bs-d ${tone(delta)}`}>{delta != null && btcPrice != null ? signed(Math.round(delta * btcPrice * 100) / 100, (v) => `$${v.toFixed(2)}`) : '—'}</span>
        </div>
      </section>

      <div className="seg btc-seg" role="tablist">
        {[
          ['zbd', 'ZBD wallet'],
          ['crypto', 'Crypto.com'],
          ['wallets', 'Wallets'],
        ].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={sub === k} className={sub === k ? 'on' : ''} onClick={() => setSub(k)}>
            {l}
            {k === 'crypto' && overdue && <i className="red-dot" aria-label="This week’s buy isn’t logged yet" />}
          </button>
        ))}
      </div>

      {sub === 'zbd' && (
        <>
          <section className="home-card">
            <div className="home-card-head">
              <h2>Bitcoin holdings</h2>
              <button className="btn primary sm" onClick={() => setSheet({ kind: 'balance' })}>
                ＋ Balance
              </button>
            </div>
            {!zbd.length ? (
              <p className="muted small">No balance yet. Tap ＋ Balance and enter your wallet’s current total in sats — the SGD value is worked out for you.</p>
            ) : (
              <>
                <div className="dh-amount">
                  <b className="btc-num">{commas(sats)}</b>
                  <span className="muted">sats</span>
                </div>
                <p className="muted small">{(sats / SATS_PER_BTC).toFixed(8)} BTC</p>
                {/* Current value against what went in */}
                <div className="dh-split three zbd-pl">
                  <Cell k="Total invested" v={`$${sgdStr(zCost.invested)}`} />
                  <Cell k="Current value" v={zValue != null ? `$${sgdStr(zValue)}` : '—'} cls="swim" />
                  <Cell k={zGain == null ? 'Gain / loss' : zGain >= 0 ? 'Gain' : 'Loss'} v={
                      zGain != null ? (
                        <>
                          {signed(Math.round(zGain * 100) / 100, (v) => `$${sgdStr(v)}`)}
                          {zPct != null && <span className="zbd-pct">{`${zPct >= 0 ? '+' : '−'}${Math.abs(zPct).toFixed(1)}%`}</span>}
                        </>
                      ) : (
                        '—'
                      )
                    } cls={tone(zGain)} />
                </div>
                {zCost.unpriced > 0 && <p className="muted small">{commas(zCost.unpriced)} sats were added without an SGD value, so they aren’t counted in Total invested.</p>}
                <div className="dh-split">
                  <Cell k="Since yesterday" v={zPrev ? `${signed(sats - zPrev.sats, commas)} sats` : '—'} cls={tone(zPrev ? sats - zPrev.sats : null)} />
                  <Cell
                    k="Value change"
                    v={zPrev?.sgd != null && btcPrice != null ? signed((sats / SATS_PER_BTC) * btcPrice - zPrev.sgd, (v) => `$${v.toFixed(2)}`) : '—'}
                    cls={tone(zPrev?.sgd != null && btcPrice != null ? (sats / SATS_PER_BTC) * btcPrice - zPrev.sgd : null)}
                  />
                </div>
                <p className="muted small">Last added {shortD(zbd[zbd.length - 1].date)}</p>
              </>
            )}
            {priceLine}
          </section>
          <section className="home-card">
            <div className="home-card-head">
              <h2>Trend</h2>
              <span className="muted small">tap a point to pin it</span>
            </div>
            <TrendChart
              metrics={[
                { key: 'sats', label: 'Sats', color: 'var(--peach)', format: commas },
                { key: 'sgd', label: 'SGD value', color: 'var(--mint)', format: (v) => `$${v.toFixed(2)}` },
              ]}
              rows={zbd}
              focus={focus}
              emptyText="Log at least two balances to see a trend."
            />
          </section>
          <History
            rows={[...zbd].reverse().slice(0, 15)}
            text={(b) => [b.sats != null && `${commas(b.sats)} sats`, b.sgd != null && `$${b.sgd.toFixed(2)}`].filter(Boolean).join(' · ')}
            onOpen={(b) => setSheet({ kind: 'balance', entry: b })}
          />
        </>
      )}

      {sub === 'crypto' && (
        <>
          {overdue && <p className="btc-reminder">🔔 This week’s Wednesday buy isn’t logged yet.</p>}
          <CryptoHero buys={buys} btcPrice={btcPrice} priceLine={priceLine} onAdd={() => setSheet({ kind: 'buy' })} onRecalc={() => recalc(path, buys)} />
          <section className="home-card">
            <div className="home-card-head">
              <h2>Trend</h2>
              <span className="muted small">tap a point to pin it</span>
            </div>
            <TrendChart
              metrics={[
                { key: 'eff', label: 'Holding', color: 'var(--pink)', format: btcStr },
                { key: 'received', label: 'Received', color: 'var(--peach)', format: btcStr },
                { key: 'paid', label: 'Paid', color: 'var(--mint)', format: (v) => `$${v.toFixed(2)}` },
              ]}
              rows={buys}
              focus={focus}
              emptyText="Log at least two purchases to see a trend."
            />
          </section>
          <History
            rows={[...buys].reverse().slice(0, 15)}
            text={(b) => [b.received != null && `+${btcStr(b.received)}`, b.paid != null && `$${b.paid.toFixed(2)}`, `held ${btcStr(b.eff)}${b.holding != null ? '' : ' (calc)'}`].filter(Boolean).join(' · ')}
            onOpen={(b) => setSheet({ kind: 'buy', buy: b })}
          />
        </>
      )}

      {sub === 'wallets' && (
        <>
          <WalletsHero wallets={wallets} bots={bots} px={px} usdtRate={usdtRate} />
          {wallets.map((w) => {
            const hs = holdingsOf(w);
            const value = hs.reduce((s, h) => s + (px.price(h.coinId) != null ? h.amount * px.price(h.coinId) : 0), 0);
            const isOpen = open.has(w.id) || !hs.length;
            return (
              <section key={w.id} className="home-card fold-card">
                <button className="fold-head" onClick={() => toggle(w.id)} aria-expanded={isOpen}>
                  <b>{w.name}</b>
                  <span className="muted small">
                    ${sgdStr(value)} · {countText(hs.length, 'coin', 'coins')}
                  </span>
                  <span className="fold-chev">{isOpen ? '▾' : '▸'}</span>
                </button>
                {isOpen && (
                  <>
                    {hs.length === 0 && <p className="muted small">No coins in this wallet yet.</p>}
                    <div className="history">
                      {hs.map((h) => (
                        <button key={h.id} className="history-row coin-row" onClick={() => setSheet({ kind: 'coin', walletId: w.id, holding: h })}>
                          <b className="hr-d">{h.symbol}</b>
                          <span className="hr-v">{coinText(h, px)}</span>
                          <span className="rr-e">✎</span>
                        </button>
                      ))}
                    </div>
                    <div className="row-gap">
                      <button className="btn glass sm" onClick={() => setSheet({ kind: 'coin', walletId: w.id })}>
                        ＋ Add coin
                      </button>
                      <button className="btn ghost sm" onClick={() => setSheet({ kind: 'name', type: 'wallet', item: w })}>
                        Rename / delete
                      </button>
                    </div>
                  </>
                )}
              </section>
            );
          })}
          <button className="btn glass" onClick={() => setSheet({ kind: 'name', type: 'wallet', nextOrder: wallets.length + 1 })}>
            ＋ Add wallet
          </button>

          <p className="section-label">Bots · a rebalancing bot holding several coins</p>
          {bots.map((b) => {
            const usdt = botUsdt(b);
            const total = usdtRate != null ? `$${sgdStr(usdt * usdtRate)}` : `${usdt.toFixed(2)} USDT`;
            const isOpen = open.has(b.id) || !b.coins?.length;
            return (
              <section key={b.id} className="home-card fold-card">
                <button className="fold-head" onClick={() => toggle(b.id)} aria-expanded={isOpen}>
                  <b>{b.name}</b>
                  <span className="muted small">
                    {total} · {countText(b.coins?.length || 0, 'coin', 'coins')}
                  </span>
                  <span className="fold-chev">{isOpen ? '▾' : '▸'}</span>
                </button>
                {isOpen && (
                  <>
                    {!b.coins?.length && <p className="muted small">No coins yet — tap Paste coins.</p>}
                    <div className="history">
                      {(b.coins || []).map((c, i) => (
                        <div key={`${c.symbol}-${i}`} className="history-row coin-row static">
                          <b className="hr-d">{c.symbol}</b>
                          <span className="hr-v">
                            {c.valueUsdt.toLocaleString(undefined, { maximumFractionDigits: 3 })} USDT{usdtRate != null ? ` · $${(c.valueUsdt * usdtRate).toFixed(2)} SGD` : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="row-gap">
                      <button className="btn glass sm" onClick={() => setSheet({ kind: 'paste', bot: b })}>
                        📋 Paste coins
                      </button>
                      <button className="btn ghost sm" onClick={() => setSheet({ kind: 'name', type: 'bot', item: b })}>
                        Rename / delete
                      </button>
                    </div>
                  </>
                )}
              </section>
            );
          })}
          <button className="btn glass" onClick={() => setSheet({ kind: 'name', type: 'bot', nextOrder: bots.length + 1 })}>
            ＋ Add bot
          </button>
        </>
      )}

      <button className="link-btn extra-remove" onClick={onRemove}>
        Remove Bitcoin from {personName || 'this person'}
      </button>

      {sheet?.kind === 'balance' && (
        <BalanceSheet path={path} entry={sheet.entry} currentSats={sats} btcPrice={btcPrice} onSaved={(date) => setFocus({ metric: 'sats', date, at: Date.now() })} onClose={() => setSheet(null)} />
      )}
      {sheet?.kind === 'buy' && <BuySheet path={path} buy={sheet.buy} onSaved={(date) => setFocus({ metric: 'eff', date, at: Date.now() })} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'name' && <NameSheet path={path} kind={sheet.type} item={sheet.item} nextOrder={sheet.nextOrder} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'coin' && <CoinSheet path={path} walletId={sheet.walletId} holding={sheet.holding} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'paste' && <BotPasteSheet path={path} bot={sheet.bot} onClose={() => setSheet(null)} />}
      {importing && <ImportBackup path={path} what="your ZBD balances, Crypto.com buys, wallets and bots" plan={planImport} onClose={() => setImporting(false)} />}
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

function History({ rows, text, onOpen }) {
  return (
    <section className="home-card">
      <div className="home-card-head">
        <h2>History</h2>
      </div>
      {!rows.length ? (
        <p className="muted small">Nothing logged yet.</p>
      ) : (
        <div className="history">
          {rows.map((r) => (
            <button key={r.id} className="history-row" onClick={() => onOpen(r)}>
              <span className="hr-d">{shortD(r.date)}</span>
              <span className="hr-v">{text(r)}</span>
              <span className="rr-e">✎</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function coinText(h, px) {
  const p = px.price(h.coinId);
  return p != null ? `${h.amount} · $${sgdStr(p)}/unit · $${(h.amount * p).toFixed(2)}` : `${h.amount} · price unknown`;
}

// Clear every typed-in holding so the total is rebuilt purely from what was received.
function recalc(path, buys) {
  const sum = buys.reduce((s, b) => s + (b.received || 0), 0);
  if (!window.confirm(`This clears every typed-in “Total holding” and rebuilds it from your received amounts (${btcStr(Math.round(sum * 1e8) / 1e8)} total). Paid and received aren’t touched. Continue?`)) return;
  const patch = {};
  buys.forEach((b) => b.holding != null && (patch[`buys/${b.id}/holding`] = null));
  patchPath(path, patch);
}

function CryptoHero({ buys, btcPrice, priceLine, onAdd, onRecalc }) {
  const last = buys[buys.length - 1];
  const invested = buys.reduce((s, b) => s + (b.paid || 0), 0);
  const holding = last?.eff ?? 0;
  // A stored checkpoint that's far from the plain sum of everything received
  // is likely an old mistake rather than a real reconciliation.
  const pureSum = Math.round(buys.reduce((s, b) => s + (b.received || 0), 0) * 1e8) / 1e8;
  const mismatch = pureSum > 0 && Math.abs(holding - pureSum) / pureSum > 0.02;
  const worth = btcPrice != null ? holding * btcPrice : null;
  const pl = worth != null ? worth - invested : null;
  return (
    <section className="home-card">
      <div className="home-card-head">
        <h2>Total holding</h2>
        <button className="btn primary sm" onClick={onAdd}>
          ＋ Purchase
        </button>
      </div>
      {!buys.length ? (
        <p className="muted small">No purchases logged. Tap ＋ Purchase after your weekly buy.</p>
      ) : (
        <>
          <div className="dh-amount">
            <b className="btc-num">{btcStr(holding)}</b>
            <span className="muted">BTC</span>
          </div>
          {worth != null && (
            <p className="btc-worth">
              <b>${sgdStr(worth)}</b>{' '}
              <span className={`btc-pl ${pl >= 0 ? 'pos' : 'neg'}`}>
                {pl >= 0 ? '+' : '−'}${sgdStr(Math.abs(pl))} · {pl >= 0 ? '+' : '−'}
                {invested > 0 ? Math.abs((pl / invested) * 100).toFixed(1) : '0.0'}%
              </span>
            </p>
          )}
          <div className="dh-split three">
            <Cell k="Invested" v={`$${invested.toFixed(2)}`} cls="grab" />
            <Cell k="Buys" v={buys.length} />
            <Cell k="Avg per buy" v={`$${sgdStr(invested / buys.length)}`} />
          </div>
          <p className="muted small">Last buy {shortD(last.date)}</p>
          {mismatch && (
            <p className="small btc-warn">
              Your stored holding ({btcStr(holding)}) doesn’t match the sum of everything received ({btcStr(pureSum)}) — likely an old leftover, not a real loss.{' '}
              <button className="link-btn" onClick={onRecalc}>
                recalculate
              </button>
            </p>
          )}
        </>
      )}
      {priceLine}
    </section>
  );
}

function WalletsHero({ wallets, bots, px, usdtRate }) {
  const coins = {};
  wallets.forEach((w) =>
    holdingsOf(w).forEach((h) => {
      const k = h.coinId || `?${h.symbol}`;
      coins[k] ||= { symbol: h.symbol, coinId: h.coinId, amount: 0 };
      coins[k].amount += Number(h.amount) || 0;
    }),
  );
  const rows = Object.values(coins)
    .map((c) => ({ ...c, value: px.price(c.coinId) != null ? c.amount * px.price(c.coinId) : null }))
    .sort((a, b) => (b.value ?? -1) - (a.value ?? -1));
  const liveBots = bots.filter((b) => b.coins?.length);
  if (!rows.length && !liveBots.length) {
    return (
      <section className="home-card">
        <p className="muted small">No wallets yet. Add a wallet, then what’s in it — BTC, ETH or any other coin — and its live SGD value works itself out.</p>
      </section>
    );
  }
  const total = rows.reduce((s, r) => s + (r.value || 0), 0) + (usdtRate != null ? liveBots.reduce((s, b) => s + botUsdt(b), 0) * usdtRate : 0);
  return (
    <section className="home-card">
      <div className="home-card-head">
        <h2>All wallets{liveBots.length ? ' & bots' : ''}</h2>
      </div>
      <div className="dh-amount">
        <b className="btc-num">${sgdStr(total)}</b>
        <span className="muted">SGD</span>
      </div>
      <div className="history">
        {rows.map((c) => (
          <div key={c.coinId || c.symbol} className="history-row coin-row static">
            <b className="hr-d">{c.symbol}</b>
            <span className="hr-v">{coinText(c, px)}</span>
          </div>
        ))}
        {liveBots.map((b) => (
          <div key={b.id} className="history-row coin-row static">
            <b className="hr-d">{b.name}</b>
            <span className="hr-v">bot · {usdtRate != null ? `$${sgdStr(botUsdt(b) * usdtRate)}` : `${botUsdt(b).toFixed(2)} USDT (rate unknown)`}</span>
          </div>
        ))}
      </div>
      <span className="muted small">
        {px.busy ? 'Fetching prices…' : px.error ? `${px.error} ` : ''}
        {!px.busy && (
          <button className="link-btn" onClick={px.refresh}>
            refresh prices
          </button>
        )}
      </span>
    </section>
  );
}
