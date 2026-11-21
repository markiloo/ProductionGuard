import { useEffect, useRef, useState } from 'react';
import { useSheetDialog } from '../hooks/useSheetDialog.js';
import { scheduleDate } from '../lib/format.js';
import { remainingQuantity } from '../lib/delivery.js';

export function ReceiveDeliveryDialog({ delivery: initialDelivery, busy, onClose, onConfirm }) {
  const dialogRef = useSheetDialog(onClose);
  const [delivery, setDelivery] = useState(initialDelivery);
  const remaining = remainingQuantity(delivery);
  const [quantity, setQuantity] = useState(String(remaining));
  const [proofFile, setProofFile] = useState(null);
  const [proofPreview, setProofPreview] = useState('');
  const [formError, setFormError] = useState('');
  const attempt = useRef(null);
  const closed = delivery.status !== 'incoming';
  const overage = Number(quantity) - remaining;

  useEffect(() => () => { if (proofPreview) globalThis.URL.revokeObjectURL(proofPreview); }, [proofPreview]);

  function chooseProof(event) {
    const file = event.target.files?.[0] || null;
    setFormError('');
    setProofFile(null);
    setProofPreview('');
    if (!file) {
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setFormError('Choose a JPEG, PNG, or WebP picture.');
      event.target.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setFormError('Receipt pictures must be 5 MB or smaller.');
      event.target.value = '';
      return;
    }
    setProofFile(file);
    setProofPreview(globalThis.URL.createObjectURL(file));
  }

  async function submit(event) {
    event.preventDefault();
    if (closed || busy) return;
    setFormError('');
    const received = Number(quantity);
    if (!Number.isInteger(received) || received <= 0 || received > 1_000_000_000) {
      setFormError('Enter a whole batch quantity from 1 to 1,000,000,000.');
      return;
    }
    if (!proofFile) {
      setFormError('Upload a picture of proof that the delivery was received.');
      return;
    }
    if (attempt.current?.quantity !== received || attempt.current?.file !== proofFile) {
      attempt.current = { id: globalThis.crypto.randomUUID(), quantity: received, file: proofFile };
    }
    try {
      await onConfirm(delivery, received, proofFile, attempt.current.id);
    } catch (failure) {
      const updated = failure.data?.delivery;
      if (updated) {
        attempt.current = null;
        setDelivery(updated);
        setQuantity(String(remainingQuantity(updated)));
      }
      setFormError(failure.message);
    }
  }

  return (
    <dialog ref={dialogRef} className="detail delivery-dialog" aria-labelledby="receive-dialog-title">
      <header className="detail-head">
        <div><p className="eyebrow">Incoming supply</p><h2 id="receive-dialog-title">Receive delivery</h2></div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close receive form" disabled={busy}>×</button>
      </header>
      <form className="detail-body" onSubmit={submit}>
        <p className="field-hint">Enter the quantity in this batch. Any remaining balance stays open at the current expected date.</p>
        <dl className="po-grid" aria-label="Delivery being received">
          <div className="po-field"><dt>Item SKU</dt><dd className="mono">{delivery.itemSku}</dd></div>
          <div className="po-field"><dt>Planned quantity</dt><dd>{delivery.quantity} {delivery.unit}</dd></div>
          <div className="po-field"><dt>Received so far</dt><dd>{delivery.receivedQuantity ?? 0} {delivery.unit}</dd></div>
          <div className="po-field"><dt>Remaining quantity</dt><dd>{remaining} {delivery.unit}</dd></div>
          <div className="po-field"><dt>Supplier</dt><dd>{delivery.supplier || '—'}</dd></div>
          <div className="po-field"><dt>Expected arrival</dt><dd>{scheduleDate(delivery.expectedArrival)}</dd></div>
          {delivery.poId ? <div className="po-field"><dt>PO</dt><dd className="mono">{delivery.poId}</dd></div> : null}
        </dl>
        <div className="form-grid">
          <div className="field field-wide">
            <label htmlFor="receive-quantity">Quantity in this batch ({delivery.unit})</label>
            <input id="receive-quantity" type="number" min="1" max="1000000000" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} required autoFocus disabled={closed || busy} aria-describedby="receive-quantity-result" />
            <p className="field-hint" id="receive-quantity-result" aria-live="polite">
              {!closed && overage > 0 ? `This batch exceeds the remaining balance by ${overage} ${delivery.unit}. Inventory will include the full count.` : ''}
            </p>
          </div>
          <div className="field field-wide">
            <label htmlFor="receive-proof">Receipt picture</label>
            <input id="receive-proof" type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseProof} required disabled={closed || busy} />
            <p className="field-hint">JPEG, PNG, or WebP up to 5 MB. Stored locally as proof of receipt.</p>
            {proofPreview ? <img className="proof-preview" src={proofPreview} alt="Selected receipt preview" /> : null}
          </div>
        </div>
        {formError ? <p className="form-error" role="alert">{formError}</p> : null}
        <div className="dialog-actions">
          <button type="button" className="button button-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="button button-primary" disabled={closed || busy}>{busy ? 'Receiving…' : 'Confirm receipt'}</button>
        </div>
      </form>
    </dialog>
  );
}
