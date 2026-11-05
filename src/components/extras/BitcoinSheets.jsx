import { useState } from 'react';
import { confirmTwice } from '../../lib/confirm';
import { newKey, patchPath, setPath } from '../../lib/db';
import { SATS_PER_BTC, commas, parseBotPaste, resolveCoinId, today } from '../../lib/crypto';
import Modal from '../Modal';

const num = (v) => (String(v).trim() === '' ? null : parseFloat(String(v).replace(/,/g, '')));
const okDate = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? d : today());

function Actions({ onRemove, onClose, saveLabel }) {
  return (
    <div className="row-gap end">
      {onRemove && (
        <button type="button" className="btn danger-outline sm" onClick={onRemove}>
          Remove
        </button>
      )}
      <button type="button" className="btn ghost" onClick={onClose}>
        Cancel
      </button>
      <button className="btn primary">{saveLabel}</button>
    </div>
  );
}

// ZBD: the wallet's whole balance in sats (not what was added). Its SGD value
// is worked out from the live price now and kept as it was at the time.
export function BalanceSheet({ path, entry, currentSats, btcPrice, onSaved, onClose }) {
  const [date, setDate] = useState(entry?.date || today());
  const [sats, setSats] = useState(entry?.sats != null ? String(entry.sats) : '');
  const [error, setError] = useState('');

  async function save(e) {
    e.preventDefault();
    const v = num(sats);
    if (v == null || Number.isNaN(v)) return setError('Enter an amount in sats.');
    const total = Math.round(v);
    const d = okDate(date);
    if (entry) {
      // Corrects this entry only; its SGD value stays as it was at the time.
      await patchPath(`${path}/zbd/${entry.id}`, { date: d, sats: total });
    } else {
      await setPath(`${path}/zbd/${newKey(`${path}/zbd`)}`, {
        date: d,
        sats: total,
        sgd: btcPrice != null ? Math.round((total / SATS_PER_BTC) * btcPrice * 100) / 100 : null,
        added: total - currentSats,
        at: Date.now(),
      });
    }
    onSaved?.(d);
    onClose();
  }
  const remove = async () => {
    if (!confirmTwice(`Remove the ${commas(entry.sats)} sats balance from ${entry.date}?`, 'this balance')) return;
    await setPath(`${path}/zbd/${entry.id}`, null);
    onClose();
  };

  return (
    <Modal title={entry ? 'Edit balance' : 'Add balance'} onClose={onClose}>
      <form className="sheet drive-form" onSubmit={save}>
        <p className="muted small">{entry ? 'Correct the total recorded on this date — this fixes this entry, it doesn’t add to your balance.' : 'Enter your ZBD wallet’s current total balance. Its SGD value is worked out from the live BTC price.'}</p>
        <div className="drive-grid">
          <label className="field">
            <span>Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="field">
            <span>{entry ? 'Balance then (sats)' : 'Total balance (sats)'}</span>
            <input inputMode="numeric" value={sats} onChange={(e) => setSats(e.target.value)} placeholder="125000" autoFocus={!entry} />
          </label>
        </div>
        {error && <p className="error">{error}</p>}
        <Actions onRemove={entry ? remove : null} onClose={onClose} saveLabel={entry ? 'Save changes' : 'Save balance'} />
      </form>
    </Modal>
  );
}

// Crypto.com: one buy — SGD paid, BTC received, and optionally the total
// holding the app shows (a checkpoint the running total snaps to).
export function BuySheet({ path, buy, onSaved, onClose }) {
  const s = (v) => (v == null ? '' : String(v));
  const [form, setForm] = useState({ date: buy?.date || today(), paid: s(buy?.paid), received: s(buy?.received), holding: s(buy?.holding) });
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function save(e) {
    e.preventDefault();
    const paid = num(form.paid);
    const received = num(form.received);
    const holding = num(form.holding);
    if (paid == null && received == null && holding == null) return setError('Enter at least one value before saving.');
    const d = okDate(form.date);
    const data = { date: d, paid, received, holding, at: buy?.at || Date.now() };
    await setPath(`${path}/buys/${buy?.id || newKey(`${path}/buys`)}`, data);
    onSaved?.(d);
    onClose();
  }
  const remove = async () => {
    if (!confirmTwice(`Remove the buy from ${buy.date}?`, 'this buy')) return;
    await setPath(`${path}/buys/${buy.id}`, null);
    onClose();
  };

  return (
    <Modal title={buy ? 'Edit purchase' : 'Add purchase'} onClose={onClose}>
      <form className="sheet drive-form" onSubmit={save}>
        <div className="drive-grid">
          <label className="field full">
            <span>Date</span>
            <input type="date" value={form.date} onChange={set('date')} />
          </label>
          <label className="field">
            <span>Paid (SGD)</span>
            <input inputMode="decimal" value={form.paid} onChange={set('paid')} placeholder="50.00" autoFocus={!buy} />
          </label>
          <label className="field">
            <span>Received (BTC)</span>
            <input inputMode="decimal" value={form.received} onChange={set('received')} placeholder="0.00042" />
          </label>
          <label className="field full">
            <span>
              Total holding (BTC) <span className="muted small">optional — what Crypto.com shows now</span>
            </span>
            <input inputMode="decimal" value={form.holding} onChange={set('holding')} placeholder="Leave blank to work it out" />
          </label>
        </div>
        {error && <p className="error">{error}</p>}
        <Actions onRemove={buy ? remove : null} onClose={onClose} saveLabel={buy ? 'Save changes' : 'Save purchase'} />
      </form>
    </Modal>
  );
}

// Add, rename or delete a wallet or a bot.
export function NameSheet({ path, kind, item, nextOrder, onClose }) {
  const [name, setName] = useState(item?.name || '');
  const [error, setError] = useState('');
  const folder = kind === 'bot' ? 'bots' : 'wallets';
  async function save(e) {
    e.preventDefault();
    if (!name.trim()) return setError(`Give the ${kind} a name.`);
    if (item) await patchPath(`${path}/${folder}/${item.id}`, { name: name.trim() });
    else await setPath(`${path}/${folder}/${newKey(`${path}/${folder}`)}`, { name: name.trim(), order: nextOrder, ...(kind === 'bot' ? { coins: [] } : {}) });
    onClose();
  }
  const remove = async () => {
    if (!confirmTwice(`Delete “${item.name}” and every coin in it?`, `“${item.name}”`)) return;
    await setPath(`${path}/${folder}/${item.id}`, null);
    onClose();
  };
  return (
    <Modal title={item ? `Rename ${kind}` : `Add ${kind}`} onClose={onClose}>
      <form className="sheet drive-form" onSubmit={save}>
        <label className="field">
          <span>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === 'bot' ? 'e.g. Pionex grid' : 'e.g. Ledger, Binance'} autoFocus />
        </label>
        {error && <p className="error">{error}</p>}
        <Actions onRemove={item ? remove : null} onClose={onClose} saveLabel={item ? 'Save changes' : `Save ${kind}`} />
      </form>
    </Modal>
  );
}

// A coin in a wallet: its symbol (looked up for live pricing) and amount.
export function CoinSheet({ path, walletId, holding, onClose }) {
  const [symbol, setSymbol] = useState(holding?.symbol || '');
  const [amount, setAmount] = useState(holding?.amount != null ? String(holding.amount) : '');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  async function save(e) {
    e.preventDefault();
    const a = num(amount);
    if (!symbol.trim()) return setStatus('Enter a crypto name or symbol.');
    if (!(a > 0)) return setStatus('Enter an amount greater than 0.');
    setBusy(true);
    setStatus(`Looking up ${symbol.trim().toUpperCase()}…`);
    const coinId = await resolveCoinId(symbol); // saved anyway if unknown — shows "price unknown"
    await setPath(`${path}/wallets/${walletId}/holdings/${holding?.id || newKey(`${path}/wallets/${walletId}/holdings`)}`, { symbol: symbol.trim().toUpperCase(), amount: a, coinId: coinId || null });
    setBusy(false);
    onClose();
  }
  const remove = async () => {
    if (!confirmTwice(`Remove ${holding.symbol} from this wallet?`, holding.symbol)) return;
    await setPath(`${path}/wallets/${walletId}/holdings/${holding.id}`, null);
    onClose();
  };
  return (
    <Modal title={holding ? 'Edit coin' : 'Add coin'} onClose={onClose}>
      <form className="sheet drive-form" onSubmit={save}>
        <div className="drive-grid">
          <label className="field">
            <span>Coin</span>
            <input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="BTC, ETH, SOL…" autoFocus={!holding} />
          </label>
          <label className="field">
            <span>Amount</span>
            <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.5" />
          </label>
        </div>
        {status && <p className="muted small">{status}</p>}
        <div className="row-gap end">
          {holding && (
            <button type="button" className="btn danger-outline sm" onClick={remove}>
              Remove
            </button>
          )}
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy}>
            {holding ? 'Save changes' : 'Save coin'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// Paste a bot's coins (replaces its list): one "INJ 43.366" per line works best.
export function BotPasteSheet({ path, bot, onClose }) {
  const [text, setText] = useState('');
  const [status, setStatus] = useState(bot.coins?.length ? `Replaces the ${bot.coins.length} coin${bot.coins.length === 1 ? '' : 's'} already logged for this bot.` : '');
  const found = parseBotPaste(text);
  async function save(e) {
    e.preventDefault();
    if (!found.length) return setStatus('Nothing readable yet — try one coin per line, like “INJ 43.366”.');
    await patchPath(`${path}/bots/${bot.id}`, { coins: found });
    onClose();
  }
  return (
    <Modal title={`Paste coins · ${bot.name}`} onClose={onClose}>
      <form className="sheet drive-form" onSubmit={save}>
        <p className="muted small">Copy the coin list from the bot’s screen (symbol and its value in USDT) and paste it here.</p>
        <textarea className="import-text" rows={7} value={text} onChange={(e) => setText(e.target.value)} placeholder={'INJ 43.366\nSOL 120.5\nETH 88.02'} autoFocus />
        {found.length > 0 && (
          <p className="muted small">
            Found {found.length}: {found.map((c) => `${c.symbol} ${c.valueUsdt}`).join(', ')}
          </p>
        )}
        {status && <p className="muted small">{status}</p>}
        <Actions onClose={onClose} saveLabel="Save coins" />
      </form>
    </Modal>
  );
}
