// Bitcoin: a ZBD wallet (sats balances), Crypto.com weekly buys, wallets of
// any coins, and trading bots. Ported from the Body Log app's Bitcoin tab.
//
// bitcoin = { zbd: { id: { date, sats, sgd, added } },
//             buys: { id: { date, paid, received, holding, at } },
//             wallets: { id: { name, order, holdings: { id: { symbol, amount, coinId } } } },
//             bots: { id: { name, order, coins: [{ symbol, valueUsdt }] } },
//             walletSnaps: { 'YYYY-MM-DD': btc } }

import { useEffect, useState } from 'react';

export const SATS_PER_BTC = 100000000;
export const today = () => new Date().toLocaleDateString('en-CA');
export const btcStr = (n) => (n == null || Number.isNaN(n) ? '—' : n.toFixed(8).replace(/0+$/, '').replace(/\.$/, '') || '0');
export const sgdStr = (n) => Number(n || 0).toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const commas = (n) => Math.round(n).toLocaleString('en-US');

const list = (obj) => Object.entries(obj || {}).map(([id, v]) => ({ id, ...v }));
export const zbdOf = (b) => list(b?.zbd).sort((x, y) => x.date.localeCompare(y.date) || (x.at || 0) - (y.at || 0) || x.id.localeCompare(y.id));
export const buysOf = (b) => list(b?.buys).sort((x, y) => x.date.localeCompare(y.date) || (x.at || 0) - (y.at || 0) || x.id.localeCompare(y.id));
export const walletsOf = (b) => list(b?.wallets).sort((x, y) => (x.order || 0) - (y.order || 0));
export const holdingsOf = (w) => list(w?.holdings);
export const botsOf = (b) => list(b?.bots).sort((x, y) => (x.order || 0) - (y.order || 0));

// ── ZBD: each entry is the wallet's whole balance at that time ──
export const currentSats = (zbd) => (zbd.length ? zbd[zbd.length - 1].sats || 0 : 0);
// The latest entry from before today, as the "yesterday" baseline.
export function priorBefore(rows, day = today()) {
  for (let i = rows.length - 1; i >= 0; i--) if (rows[i].date < day) return rows[i];
  return null;
}

// ── Crypto.com: the running holding, recomputed every time. A typed-in
// holding is a checkpoint: the total snaps to it, then keeps adding. ──
export function withHoldings(buys) {
  let running = 0;
  return buys.map((b) => {
    running = b.holding != null ? b.holding : running + (b.received || 0);
    running = Math.round(running * 1e8) / 1e8;
    return { ...b, eff: running };
  });
}

// Weekly buy on Wednesdays: overdue from Thursday 6am until one is logged since that Wednesday.
export function isBuyOverdue(buys, now = new Date()) {
  const wed = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() - 3 + 7) % 7));
  const wedStr = wed.toLocaleDateString('en-CA');
  const start = new Date(wed.getFullYear(), wed.getMonth(), wed.getDate() + 1, 6);
  return now >= start && !buys.some((b) => b.date >= wedStr);
}

// ── Wallets and bots ──
export const walletsBtc = (wallets) => wallets.reduce((s, w) => s + holdingsOf(w).filter((h) => h.coinId === 'bitcoin').reduce((t, h) => t + (Number(h.amount) || 0), 0), 0);
export const botUsdt = (bot) => (bot.coins || []).reduce((s, c) => s + (Number(c.valueUsdt) || 0), 0);

// Reads a bot's pasted coin list: one "SYMBOL VALUE" per line (e.g. "INJ 43.366"),
// or a bot screen's layout (symbol line, optional change % line, then the USDT value).
export function parseBotPaste(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const header = new Set(['COIN', 'CHANGE', 'ASSETS', 'ASSETS (USDT)', 'ASSETS(USDT)', 'PROFIT', 'PRICE', 'AVG', 'AVG.', 'AVG. BUY PRICE', 'BUY', 'TARGET', 'CURRENT', 'COLLAPSE', 'EXPAND', 'USDT']);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const one = lines[i].match(/^([A-Za-z]{2,6})\s+\$?([\d,]+\.?\d*)\s*(?:USDT)?$/i);
    if (one && !header.has(one[1].toUpperCase())) {
      out.push({ symbol: one[1].toUpperCase(), valueUsdt: parseFloat(one[2].replace(/,/g, '')) });
      continue;
    }
    const tok = lines[i].toUpperCase();
    if (!/^[A-Z]{2,6}$/.test(tok) || header.has(tok)) continue;
    let j = i + 1;
    if (j < lines.length && /^[+-]?\d+(\.\d+)?%/.test(lines[j])) j++;
    while (j < lines.length && j <= i + 4 && !/\d/.test(lines[j])) j++;
    if (j < lines.length && j <= i + 4) {
      const m = lines[j].match(/^-?[\d,]+\.?\d*/);
      const val = m && m[0] !== '-' ? parseFloat(m[0].replace(/,/g, '')) : NaN;
      if (!Number.isNaN(val)) {
        out.push({ symbol: tok, valueUsdt: val });
        i = j;
      }
    }
  }
  return out;
}

// ── Live prices (CoinGecko's free public API, in SGD), cached on this device ──
const PRICE_KEY = 'expense-sync:cache-coin-prices'; // { coinId: { sgd, fetchedAt } }
const LOOKUP_KEY = 'expense-sync:cache-coin-ids'; // { symbol: coinId | null }
const FRESH_MS = 5 * 60000;
const readJson = (k) => {
  try {
    return JSON.parse(localStorage.getItem(k)) || {};
  } catch {
    return {};
  }
};
const writeJson = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* storage full or blocked: prices just aren't cached */
  }
};
let prices = readJson(PRICE_KEY);
let priceError = null;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn({}));
const inFlight = new Set();

export async function fetchPrices(ids, force = false) {
  const want = [...new Set(ids.filter(Boolean))].filter((id) => force || !prices[id] || Date.now() - new Date(prices[id].fetchedAt).getTime() > FRESH_MS).filter((id) => !inFlight.has(id));
  if (!want.length) return;
  want.forEach((id) => inFlight.add(id));
  notify();
  try {
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${want.map(encodeURIComponent).join(',')}&vs_currencies=sgd`, { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status === 429 ? 'Price service is busy — try again in a minute.' : `Price service error ${res.status}`);
    const json = await res.json();
    const fetchedAt = new Date().toISOString();
    want.forEach((id) => {
      if (typeof json[id]?.sgd === 'number') prices = { ...prices, [id]: { sgd: json[id].sgd, fetchedAt } };
    });
    priceError = null;
    writeJson(PRICE_KEY, prices);
  } catch (e) {
    priceError = e.message || 'Live prices unavailable right now.';
  } finally {
    want.forEach((id) => inFlight.delete(id));
    notify();
  }
}

// Prices for these coins (refreshed when older than 5 minutes), plus whether
// any are loading and the last error. price(id) → SGD or null.
export function usePrices(ids) {
  const [, rerender] = useState(null);
  const key = [...new Set(ids.filter(Boolean))].sort().join(',');
  useEffect(() => {
    listeners.add(rerender);
    return () => listeners.delete(rerender);
  }, []);
  useEffect(() => {
    if (key) fetchPrices(key.split(','));
  }, [key]);
  return {
    price: (id) => prices[id]?.sgd ?? null,
    fetchedAt: (id) => prices[id]?.fetchedAt || null,
    busy: key.split(',').some((id) => inFlight.has(id)),
    error: priceError,
    refresh: () => fetchPrices(key.split(','), true),
  };
}

export function relTime(iso) {
  if (!iso) return '';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  return hrs < 24 ? `${hrs}h ago` : `${Math.round(hrs / 24)}d ago`;
}

// Common tickers straight to their CoinGecko id; anything else is searched once and remembered.
const COIN_ID_MAP = {
  btc: 'bitcoin', xbt: 'bitcoin', eth: 'ethereum', sol: 'solana', xrp: 'ripple', ada: 'cardano', doge: 'dogecoin', ltc: 'litecoin', bnb: 'binancecoin',
  usdt: 'tether', usdc: 'usd-coin', matic: 'matic-network', pol: 'matic-network', dot: 'polkadot', avax: 'avalanche-2', trx: 'tron', link: 'chainlink',
  atom: 'cosmos', xlm: 'stellar', shib: 'shiba-inu', ton: 'the-open-network', near: 'near', apt: 'aptos', arb: 'arbitrum', op: 'optimism', sui: 'sui',
  bch: 'bitcoin-cash', etc: 'ethereum-classic', xmr: 'monero', fil: 'filecoin', icp: 'internet-computer', hbar: 'hedera-hashgraph', vet: 'vechain',
  algo: 'algorand', egld: 'elrond-erd-2', uni: 'uniswap', ldo: 'lido-dao', render: 'render-token', inj: 'injective-protocol', pepe: 'pepe',
};
export async function resolveCoinId(symbol) {
  const s = String(symbol || '').trim().toLowerCase();
  if (!s) return null;
  if (COIN_ID_MAP[s]) return COIN_ID_MAP[s];
  const lookup = readJson(LOOKUP_KEY);
  if (Object.prototype.hasOwnProperty.call(lookup, s)) return lookup[s];
  let id = null;
  try {
    const res = await fetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(s)}`, { cache: 'no-store' });
    if (res.ok) {
      const coins = (await res.json()).coins || [];
      id = (coins.find((c) => (c.symbol || '').toLowerCase() === s) || coins.find((c) => c.id === s) || coins[0])?.id || null;
    }
  } catch {
    id = null;
  }
  writeJson(LOOKUP_KEY, { ...lookup, [s]: id });
  return id;
}

// ── Import from a Body Log backup ──
const key = (id) => String(id).replace(/[.#$/[\]]/g, '_');
const okDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '');
const num = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const idTime = (id) => Number(/-(\d+)$/.exec(String(id))?.[1]) || 0;

export function parseBitcoinBackup(stores) {
  const out = { zbd: {}, buys: {}, wallets: {}, bots: {}, walletSnaps: {} };
  (stores['body-log-sats'] || []).forEach((b) => {
    if (okDate(b?.date) && num(b.sats) != null) out.zbd[key(b.id ?? `${b.date}-${b.sats}`)] = { date: b.date, sats: num(b.sats), sgd: num(b.sgd), added: num(b.added), at: idTime(b.id) };
  });
  (stores['body-log-crypto'] || []).forEach((b) => {
    if (okDate(b?.date)) out.buys[key(b.id ?? `${b.date}-${b.paid}`)] = { date: b.date, paid: num(b.paid), received: num(b.received), holding: num(b.holding), at: idTime(b.id) };
  });
  (stores['body-log-wallets'] || []).forEach((w, i) => {
    if (!w?.name) return;
    const holdings = {};
    (w.holdings || []).forEach((h) => {
      if (h?.symbol && num(h.amount) != null) holdings[key(h.id ?? h.symbol)] = { symbol: String(h.symbol).toUpperCase(), amount: num(h.amount), coinId: h.coinId || null };
    });
    out.wallets[key(w.id ?? w.name)] = { name: w.name, order: i + 1, holdings };
  });
  (stores['body-log-bots'] || []).forEach((b, i) => {
    if (b?.name) out.bots[key(b.id ?? b.name)] = { name: b.name, order: i + 1, coins: (b.coins || []).filter((c) => c?.symbol && num(c.valueUsdt) != null).map((c) => ({ symbol: String(c.symbol).toUpperCase(), valueUsdt: num(c.valueUsdt) })) };
  });
  (stores['body-log-wallet-btc-snapshots'] || []).forEach((s) => {
    if (okDate(s?.date) && num(s.btc) != null) out.walletSnaps[s.date] = num(s.btc);
  });
  if (!Object.values(out).some((v) => Object.keys(v).length)) throw new Error('No Bitcoin data found in that backup.');
  return out;
}
