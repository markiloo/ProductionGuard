import { useEffect, useState } from 'react';
import { todayDate } from '../lib/format.js';
import { useSheetDialog } from '../hooks/useSheetDialog.js';
import { DeliveryAmounts, DeliveryReceiptLinks } from '../components/DeliveryDetails.jsx';
import { remainingQuantity } from '../lib/delivery.js';

export function DeliveryDialog({ draft, skuOptions, busy, onClose, onSave, onCloseBalance }) {
  const dialogRef = useSheetDialog(onClose);
  const editing = Boolean(draft.id);
  const received = editing && draft.status !== 'incoming';
  const hasBatches = draft.receivedQuantity > 0;
  const [itemSku, setItemSku] = useState(draft.itemSku || '');
  const [quantity, setQuantity] = useState(String(draft.quantity ?? 1));
  const [unit, setUnit] = useState(draft.unit || 'units');
  const [expectedArrival, setExpectedArrival] = useState(draft.expectedArrival || todayDate());
  const [supplier, setSupplier] = useState(draft.supplier || '');
  const [notes, setNotes] = useState(draft.notes || '');
  const [correctionNote, setCorrectionNote] = useState('');
  const [formError, setFormError] = useState('');
  const [proofFile, setProofFile] = useState(null);
  const [proofPreview, setProofPreview] = useState('');
  const [proofError, setProofError] = useState('');
  const [closing, setClosing] = useState(false);
  const [closeReason, setCloseReason] = useState('');

  useEffect(() => () => { if (proofPreview) globalThis.URL.revokeObjectURL(proofPreview); }, [proofPreview]);

  function chooseSku(value) {
    const option = skuOptions.find((item) => item.sku.toLowerCase() === value.toLowerCase());
    setItemSku(value);
    if (option) setUnit(option.unit);
  }

  function chooseProof(event) {
    const file = event.target.files?.[0] || null;
    setProofError('');
    if (!file) {
      setProofFile(null);
      setProofPreview('');
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setProofError('Choose a JPEG, PNG, or WebP picture.');
      event.target.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setProofError('Proof pictures must be 5 MB or smaller.');
      event.target.value = '';
      return;
    }
    setProofFile(file);
    setProofPreview(globalThis.URL.createObjectURL(file));
  }

  async function submit(event) {
    event.preventDefault();
    setFormError('');
    setProofError('');
    if (received && !proofFile) {
      setProofError('Choose a new proof picture to save.');
      return;
    }
    if (!received && !editing && !draft.poId && !proofFile) {
      setProofError('Upload a picture of proof that the delivery is incoming.');
      return;
    }
    if (!received && editing && expectedArrival !== draft.expectedArrival && !correctionNote.trim()) {
      setFormError('Enter a note for the delivery date change.');
      return;
    }
    try {
      await onSave({ itemSku, quantity: Number(quantity), unit, expectedArrival, supplier, notes }, proofFile, correctionNote);
    } catch (failure) {
      setFormError(failure.message);
    }
  }

  async function closeBalance(event) {
    event.preventDefault();
    if (busy || received) return;
    setFormError('');
    try {
      await onCloseBalance(draft, closeReason);
    } catch (failure) {
      setFormError(failure.message);
    }
  }

  const title = closing ? 'Close delivery balance' : received ? 'Delivery proof' : editing ? 'Edit delivery' : 'Add delivery';
  const proofUrl = draft.proof
    ? (draft.poId
      ? `/api/pos/${encodeURIComponent(draft.poId)}/proof?v=${encodeURIComponent(draft.proof.createdAt)}`
      : `/api/deliveries/${encodeURIComponent(draft.id)}/proof?v=${encodeURIComponent(draft.proof.createdAt)}`)
    : '';

  return (
    <dialog ref={dialogRef} className="detail delivery-dialog" aria-labelledby="delivery-dialog-title">
      <header className="detail-head">
        <div><p className="eyebrow">Incoming supply</p><h2 id="delivery-dialog-title">{title}</h2></div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close delivery form" disabled={busy}>×</button>
      </header>
      {closing ? (
        <form className="detail-body" onSubmit={closeBalance}>
          <p className="field-hint">{draft.itemSku}{draft.poId ? ` · ${draft.poId}` : ''}</p>
          <DeliveryAmounts delivery={draft} />
          <p className="field-hint">{received ? 'This delivery has no open balance.' : `Closing removes ${remainingQuantity(draft)} ${draft.unit} from expected supply. Recorded receipts stay in stock.`}</p>
          <div className="field">
            <label htmlFor="delivery-close-reason">Reason for closing</label>
            <textarea id="delivery-close-reason" value={closeReason} onChange={(event) => setCloseReason(event.target.value)} maxLength={500} rows={3} required autoFocus disabled={received || busy} />
          </div>
          {formError ? <p className="form-error" role="alert">{formError}</p> : null}
          <div className="dialog-actions">
            <button type="button" className="button button-secondary" onClick={received ? onClose : () => { setClosing(false); setFormError(''); }} disabled={busy}>{received ? 'Close' : 'Back'}</button>
            <button type="submit" className="button button-danger-ghost" disabled={received || busy || !closeReason.trim()}>{busy ? 'Closing…' : 'Close balance'}</button>
          </div>
        </form>
      ) : <form className="detail-body" onSubmit={submit}>
        {editing ? <DeliveryAmounts delivery={draft} /> : null}
        {editing ? <DeliveryReceiptLinks delivery={draft} /> : null}
        <div className="form-grid">
          <div className="field field-wide">
            <label htmlFor="delivery-sku">Item SKU</label>
            <select id="delivery-sku" value={itemSku} onChange={(event) => chooseSku(event.target.value)} required autoFocus={!editing} disabled={received || hasBatches || Boolean(draft.poId)}>
              <option value="">Choose SKU</option>
              {skuOptions.map((option) => <option key={option.id} value={option.sku}>{option.sku} — {option.item}</option>)}
            </select>
            {draft.poId ? <p className="field-hint">Linked to {draft.poId}; the item SKU stays fixed.</p> : null}
          </div>
          <div className="field">
            <label htmlFor="delivery-quantity">Planned quantity</label>
            <input id="delivery-quantity" type="number" min="1" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} required disabled={received || hasBatches} />
            {hasBatches && !received ? <p className="field-hint">Planned quantity, SKU, and unit are fixed after the first receipt.</p> : null}
          </div>
          <div className="field">
            <label htmlFor="delivery-unit">Unit</label>
            <input id="delivery-unit" value={unit} onChange={(event) => setUnit(event.target.value)} maxLength={20} required disabled={received || hasBatches} />
          </div>
          <div className="field">
            <label htmlFor="delivery-arrival">{hasBatches && !received ? 'Expected arrival of remaining balance' : 'Expected arrival'}</label>
            <input id="delivery-arrival" type="date" value={expectedArrival} onChange={(event) => setExpectedArrival(event.target.value)} required disabled={received} />
            {draft.scheduleNote ? <p className="field-hint">Last schedule note: {draft.scheduleNote}</p> : null}
          </div>
          <div className="field">
            <label htmlFor="delivery-supplier">Supplier</label>
            <input id="delivery-supplier" value={supplier} onChange={(event) => setSupplier(event.target.value)} maxLength={120} placeholder="Optional" disabled={received} />
          </div>
          <div className="field field-wide">
            <label htmlFor="delivery-notes">Notes</label>
            <textarea id="delivery-notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} rows={2} disabled={received} />
          </div>
          {editing && !received && expectedArrival !== draft.expectedArrival ? (
            <div className="field field-wide">
              <label htmlFor="delivery-correction">Correction note</label>
              <input id="delivery-correction" value={correctionNote} onChange={(event) => setCorrectionNote(event.target.value)} maxLength={500} required />
              {draft.poId ? <p className="field-hint">Saved in the PO review history.</p> : null}
            </div>
          ) : null}
          <div className="field field-wide">
            <label htmlFor="delivery-proof">Incoming proof{!editing ? ' (required)' : ''}</label>
            {proofPreview ? (
              <img className="proof-preview" src={proofPreview} alt="Selected proof preview" />
            ) : proofUrl ? (
              <img className="proof-image" src={proofUrl} alt="Proof that the order is incoming" />
            ) : <p className="muted">No proof picture yet.</p>}
            <input id="delivery-proof" type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseProof} required={!editing} />
            <p className="field-hint">
              {!draft.poId
                ? (proofUrl ? 'Choose a new picture to replace the current proof.' : 'Upload proof that this manual delivery is incoming.')
                : (received ? 'Choose a new picture to correct the existing proof.' : 'Choose a new picture to replace the current proof.')}
            </p>
            {proofError ? <p className="form-error" role="alert">{proofError}</p> : null}
          </div>
        </div>
        {formError ? <p className="form-error" role="alert">{formError}</p> : null}
        <div className="dialog-actions">
          {editing && !received ? <button type="button" className="button button-danger-ghost dialog-delete" onClick={() => { setClosing(true); setFormError(''); }} disabled={busy}>Close balance…</button> : null}
          <button type="button" className="button button-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="button button-primary" disabled={busy || (received && !proofFile)}>
            {busy ? 'Saving…' : received ? 'Save proof' : editing ? 'Save changes' : 'Add delivery'}
          </button>
        </div>
      </form>}
    </dialog>
  );
}
