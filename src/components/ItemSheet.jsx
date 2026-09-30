import { FREQS, compareItem, findItem, groupCatLabel, inView, itemCats, monthlyOf, setAsideOf, yearOf, yearlyOf } from '../lib/budget';
import { duplicateItems, ordersAfter, splitItem, trashItem, updateItemField } from '../lib/db';
import { formatMoney, parseAmount } from '../lib/format';
import CatField, { GroupCat } from './CatField';
import { ChangeBadge, FreqPill } from './ChangeBadge';
import PotIcon from './PotIcon';
import LiveInput from './LiveInput';
import Modal from './Modal';
import PartsList from './PartsList';
import SavingsTracker from './SavingsTracker';

// Pull-up card for one item: details, merged breakdown, savings tracking.
export default function ItemSheet(props) {
  const { ledgerId, base, pk, tabId, tabName, itemId, item, periods, prevPeriod, prevLabel } = props;
  const { tracks, categories, currency, username, view, siblings, onOpenItem, onClose, tab, onTrashed } = props;
  const path = `${base}/items/${tabId}/${itemId}`;
  const key = (f) => `${pk}:item:${itemId}:${f}`;
  const save = (field) => (value) => updateItemField(base, tabId, itemId, field, value, username);
  const isGroup = Boolean(item.parts);
  const freq = item.freq === 'yearly' ? 'yearly' : 'monthly';
  const before = prevPeriod ? findItem(prevPeriod, itemId) : null;

  // Deleting moves the item to the bin (restorable for 7 days), with Undo.
  async function remove() {
    onClose();
    const trashId = await trashItem(ledgerId, pk, { id: tabId, ...tab, name: tab?.name ?? tabName }, itemId, item, username);
    onTrashed?.(trashId, item.name || 'Item');
  }

  async function duplicate() {
    const [id] = await duplicateItems(base, tabId, [{ id: itemId, ...item }], ordersAfter(siblings, [itemId]), username);
    onOpenItem(id);
  }

  async function split() {
    if (!window.confirm(`Split “${item.name}” back into ${Object.keys(item.parts).length} separate items?`)) return;
    onClose();
    await splitItem(base, tabId, itemId, item, username);
  }

  return (
    <Modal title={tabName || 'Item'} onClose={onClose}>
      <div className="sheet">
        <div className="sheet-title-row">
          <LiveInput className="sheet-title" fieldKey={key('name')} value={item.name || ''} onSave={save('name')} placeholder="Item name" />
          {item.track && <PotIcon size={22} />}
        </div>

        <div className="sheet-grid">
          <div className="field">
            <span>Categories</span>
            {isGroup ? (
              <>
                <GroupCat label={groupCatLabel(item) || '—'} cats={itemCats(item)} />
                <span className="muted small">Set each part’s category in the breakdown below.</span>
              </>
            ) : (
              <>
                <CatField fieldKey={key('category')} value={item.category} onSave={save('category')} listId="sheet-categories" className="sheet-cat" />
                <span className="muted small">For more than one, separate with commas: Insurance, Kids</span>
              </>
            )}
            <datalist id="sheet-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          {!isGroup && (
            <label className="field">
              <span>Amount</span>
              <div className="amt-line">
                <LiveInput
                  className="ep-amount"
                  inputMode="decimal"
                  fieldKey={key('amount')}
                  value={item.amount}
                  format={(v) => (v ? String(v) : '')}
                  parse={parseAmount}
                  display={(v) => formatMoney(v, currency)}
                  onSave={save('amount')}
                  placeholder="0.00"
                />
                <FreqPill freq={freq} onChange={save('freq')} />
              </div>
            </label>
          )}
        </div>

        <label className="field">
          <span>Notes / remarks</span>
          <LiveInput className="sheet-note" fieldKey={key('note')} value={item.note || ''} onSave={save('note')} placeholder="Add a note" multiline />
        </label>

        <div className="sheet-summary">
          <span>
            <b>{formatMoney(monthlyOf(item), currency)}</b>
            <span className="muted small">/mo</span>
          </span>
          <span>
            <b>{formatMoney(yearlyOf(item, itemId, { year: yearOf(pk), tracks, periods }), currency)}</b>
            <span className="muted small">{item.track ? ` saved in ${yearOf(pk)}` : '/yr'}</span>
          </span>
          {setAsideOf(item) > 0 && (
            <span className="set-aside-chip" title="Yearly bills in this item, spread over 12 months">
              Set aside {formatMoney(setAsideOf(item), currency)}/mo
            </span>
          )}
          {before && (
            <span className="muted small">
              {prevLabel}: {formatMoney(inView(monthlyOf(before.item), view), currency)}
              {FREQS[view].short}
            </span>
          )}
          <ChangeBadge change={compareItem(item, itemId, prevPeriod)} prevLabel={prevLabel} currency={currency} view={view} />
        </div>

        {isGroup && <PartsList path={path} lockPrefix={`${pk}:part:${itemId}`} item={item} currency={currency} globalView={view} listId="sheet-categories" />}

        <section className="sheet-section">
          <label className="switch-row">
            <input type="checkbox" checked={Boolean(item.track)} onChange={(e) => save('track')(e.target.checked || null)} />
            <span>
              <b>Track as savings pot</b> <PotIcon size={16} />{' '}
              <span className="muted small">— see how much has built up month by month</span>
            </span>
          </label>
          {item.track && (
            <SavingsTracker
              ledgerId={ledgerId}
              itemId={itemId}
              year={yearOf(pk)}
              log={tracks?.[itemId]?.log}
              periods={periods}
              currency={currency}
              name={item.name}
            />
          )}
        </section>

        <div className="sheet-actions">
          <button className="btn glass sm" onClick={duplicate}>
            Duplicate
          </button>
          {isGroup && (
            <button className="btn glass sm" onClick={split}>
              Split into separate items
            </button>
          )}
          <button className="btn danger sm" onClick={remove}>
            Delete item
          </button>
        </div>
      </div>
    </Modal>
  );
}
