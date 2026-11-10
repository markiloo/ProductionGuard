import { useEffect, useState } from 'react';
import { AssessmentChip, StateChip } from '../components/Chips.jsx';
import { FLAG_LABEL, PO_STATES } from '../lib/constants.js';
import { fullDate, metricDate, scheduleDate, warningText } from '../lib/format.js';
import { useSheetDialog } from '../hooks/useSheetDialog.js';

export function PoDetailDialog({ po, loading, error, busy, message, skuOptions, onClose, onAction, onOrder, onUpdateProof, onReschedule, onCorrect }) {
  const dialogRef = useSheetDialog(onClose);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [correcting, setCorrecting] = useState(false);
  const [draft, setDraft] = useState(null);
  const [formError, setFormError] = useState('');
  const [ordering, setOrdering] = useState(false);
  const [replacingProof, setReplacingProof] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const [scheduleValue, setScheduleValue] = useState('');
  const [scheduleNote, setScheduleNote] = useState('');
  const [scheduleError, setScheduleError] = useState('');
  const [proofFile, setProofFile] = useState(null);
  const [proofPreview, setProofPreview] = useState('');
  const [proofError, setProofError] = useState('');

  useEffect(() => () => { if (proofPreview) globalThis.URL.revokeObjectURL(proofPreview); }, [proofPreview]);

  useEffect(() => {
    if (!po) return;
    setDraft({
      item: po.item || '',
      mappedSku: po.mappedSku || po.sku || '',
      quantity: String(po.quantity ?? ''),
      unit: po.unit || '',
      etaDays: String(po.etaDays ?? ''),
      supplier: po.supplier || '',
    });
  }, [po?.poId, po?.item, po?.mappedSku, po?.sku, po?.quantity, po?.unit, po?.etaDays, po?.supplier]);

  const assessment = po?.assessment;

  async function submitReject(event) {
    event.preventDefault();
    setFormError('');
    if (!reason.trim()) { setFormError('Enter a rejection reason.'); return; }
    try {
      const ok = await onAction('reject', { reason });
      if (ok === false) return;
      setRejecting(false);
      setReason('');
    } catch (failure) {
      setFormError(failure.message);
    }
  }

  async function submitCorrection(event) {
    event.preventDefault();
    setFormError('');
    try {
      const updated = await onCorrect({
        item: draft.item,
        mappedSku: draft.mappedSku,
        quantity: Number(draft.quantity),
        unit: draft.unit,
        etaDays: Number(draft.etaDays),
        supplier: draft.supplier,
      });
      if (updated?.poError) {
        setFormError(updated.poError);
        return;
      }
      setCorrecting(false);
    } catch (failure) {
      setFormError(failure.message);
    }
  }

  function chooseSku(value) {
    const option = skuOptions.find((item) => item.sku.toLowerCase() === value.toLowerCase());
    setDraft((current) => ({ ...current, mappedSku: value, unit: option?.unit || current.unit }));
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

  async function submitOrder(event) {
    event.preventDefault();
    setProofError('');
    if (!proofFile) {
      setProofError('Choose a picture of proof that this order is incoming.');
      return;
    }
    try {
      await onOrder(proofFile);
      setOrdering(false);
      setProofFile(null);
      setProofPreview('');
    } catch (failure) {
      setProofError(failure.message);
    }
  }

  async function submitProof(event) {
    event.preventDefault();
    setProofError('');
    if (!proofFile) {
      setProofError('Choose a replacement proof picture.');
      return;
    }
    try {
      await onUpdateProof(proofFile);
      setReplacingProof(false);
      setProofFile(null);
      setProofPreview('');
    } catch (failure) {
      setProofError(failure.message);
    }
  }

  function openReschedule() {
    setRescheduling(true);
    setOrdering(false);
    setReplacingProof(false);
    setRejecting(false);
    setCorrecting(false);
    setScheduleValue(po.state === 'approved' ? String(po.etaDays ?? '') : po.expectedArrival || '');
    setScheduleNote('');
    setScheduleError('');
  }

  async function submitSchedule(event) {
    event.preventDefault();
    setScheduleError('');
    const note = scheduleNote.trim();
    if (!note) {
      setScheduleError('Enter a note for the schedule change.');
      return;
    }
    try {
      await onReschedule(po.state === 'approved'
        ? { etaDays: Number(scheduleValue), note }
        : { expectedArrival: scheduleValue, note });
      setRescheduling(false);
      setScheduleNote('');
    } catch (failure) {
      setScheduleError(failure.message);
    }
  }

  return (
    <dialog ref={dialogRef} className="detail" aria-labelledby="po-detail-title">
      <header className="detail-head">
        <div>
          <p className="eyebrow">{po?.poId || 'Purchase order'}</p>
          <h2 id="po-detail-title">{po?.item || 'Order details'}</h2>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close details">×</button>
      </header>
      {po ? (
        <div className="detail-body">
          <div className="detail-flags">
            <StateChip state={po.state} />
            <AssessmentChip assessment={assessment} />
            {po.poError ? <p className="review-note">{po.poError}</p> : null}
          </div>
          {message ? <p className="form-success" role="status">{message}</p> : null}

          <dl className="po-grid" aria-label="Purchase order">
            <div className="po-field"><dt>Quantity</dt><dd className="mono">{po.quantity ?? '—'}</dd></div>
            <div className="po-field"><dt>Unit</dt><dd>{po.unit || '—'}</dd></div>
            <div className="po-field"><dt>ETA</dt><dd>{po.eta || '—'}{po.etaDays ? ` (${po.etaDays} days)` : ''}</dd></div>
            <div className="po-field"><dt>SKU</dt><dd className="mono">{po.sku || 'Unmapped'}</dd></div>
            <div className="po-field po-field-wide"><dt>Supplier</dt><dd>{po.supplier || '—'}</dd></div>
          </dl>

          <section className="assessment" aria-labelledby="assessment-title">
            <div className="panel-head">
              <div><p className="eyebrow">Assessment</p><h3 id="assessment-title">{assessment?.decision}</h3></div>
              <span className={`assessment-chip flag-${assessment?.flag}`}>{FLAG_LABEL[assessment?.flag] || assessment?.decision}</span>
            </div>
            {assessment?.status === 'manual' ? (
              <p className="review-note">{assessment.note}</p>
            ) : (
              <>
                <dl className="assessment-grid">
                  <div><dt>Net requirement</dt><dd>{assessment?.requirement ?? '—'}</dd></div>
                  <div><dt>Quantity difference</dt><dd>{assessment?.difference == null ? '—' : `${assessment.difference >= 0 ? '+' : ''}${assessment.difference}`}</dd></div>
                  <div><dt>Expected arrival</dt><dd>{assessment?.arrival || '—'} <small>{assessment?.provisional ? 'provisional' : 'fixed'}</small></dd></div>
                  <div><dt>Need date</dt><dd>{assessment?.needDate || '—'}{assessment?.daysEarly > 1 ? ` (${assessment.daysEarly} days early)` : assessment?.daysEarly === 1 ? ' (arriving one day early)' : ''}</dd></div>
                  <div><dt>Planning end</dt><dd>{assessment?.planningEnd || '—'}</dd></div>
                  <div><dt>Inventory updated</dt><dd>{assessment?.inventory ? metricDate(assessment.inventory.updatedAt) : '—'}</dd></div>
                </dl>
                <p className="assessment-note">{assessment?.note}</p>
                {assessment?.warnings?.length ? (
                  <ul className="warning-list">
                    {assessment.warnings.map((warning, index) => <li key={`${warning.type}-${index}`}>{warningText(warning)}</li>)}
                  </ul>
                ) : null}
                <div className="assessment-columns">
                  <div>
                    <h4>Projected balance</h4>
                    <table className="breakdown-table">
                      <thead><tr><th>Date</th><th>Before this PO</th><th>After this PO</th></tr></thead>
                      <tbody>
                        {assessment?.balances?.map((entry) => (
                          <tr key={entry.date} className={entry.after < 0 ? 'is-negative' : ''}>
                            <td>{scheduleDate(entry.date)}</td>
                            <td>{entry.before}</td>
                            <td>{entry.after}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div>
                    <h4>Current stock</h4>
                    <p className="assessment-stock">{assessment?.inventory ? `${assessment.inventory.quantity} ${assessment.inventory.unit}` : 'Unmapped'}</p>
                    <h4>Incoming deliveries</h4>
                    {assessment?.deliveries?.length ? (
                      <ul className="supply-list">
                        {assessment.deliveries.map((delivery) => (
                          <li key={delivery.id}><span>{delivery.expectedArrival}</span><span>{delivery.quantity} {delivery.unit}</span></li>
                        ))}
                      </ul>
                    ) : <p className="muted">None</p>}
                    {assessment?.coverage?.length ? (
                      <>
                        <h4>Provisional coverage</h4>
                        <ul className="supply-list">
                          {assessment.coverage.map((coverage) => (
                            <li key={coverage.poId}><span>{coverage.poId} · {PO_STATES[coverage.state]}</span><span>{coverage.quantity} due {coverage.arrival}</span></li>
                          ))}
                        </ul>
                      </>
                    ) : null}
                    <h4>Outstanding demand</h4>
                    {assessment?.demand?.length ? (
                      <ul className="supply-list">
                        {assessment.demand.map((demand) => (
                          <li key={demand.id}><span>{demand.runNumber} · {demand.scheduledDate}</span><span>{demand.quantity} {demand.unit}</span></li>
                        ))}
                      </ul>
                    ) : <p className="muted">None</p>}
                  </div>
                </div>
              </>
            )}
          </section>

          {po.events?.length ? (
            <section aria-labelledby="history-title">
              <h4 id="history-title">Review history</h4>
              <ul className="history-list">
                {po.events.map((event) => <li key={event.id}><strong>{event.type}</strong> · {fullDate(event.createdAt)}{event.reason ? ` — ${event.reason}` : ''}</li>)}
              </ul>
            </section>
          ) : null}

          {po.delivery ? (
            <p className="review-note">Linked delivery: {po.delivery.quantity} {po.delivery.unit} due {po.delivery.expectedArrival} ({po.delivery.status}).</p>
          ) : null}

          {po.proof || po.state === 'ordered' ? (
            <section aria-labelledby="proof-title">
              <h4 id="proof-title">Incoming proof</h4>
              {po.proof ? (
                <img
                  className="proof-image"
                  src={`/api/pos/${encodeURIComponent(po.poId)}/proof?v=${encodeURIComponent(po.proof.createdAt)}`}
                  alt="Proof that the order is incoming"
                />
              ) : <p className="muted">No proof picture on file.</p>}
            </section>
          ) : null}

          {formError ? <p className="form-error" role="alert">{formError}</p> : null}

          {correcting && draft ? (
            <form className="correction-form" onSubmit={submitCorrection}>
              <h4>Correct PO fields</h4>
              <div className="form-grid">
                <div className="field field-wide">
                  <label htmlFor="correction-item">Item</label>
                  <input id="correction-item" value={draft.item} onChange={(event) => setDraft({ ...draft, item: event.target.value })} maxLength={120} required />
                </div>
                <div className="field field-wide">
                  <label htmlFor="correction-sku">Inventory SKU</label>
                  <select id="correction-sku" value={draft.mappedSku} onChange={(event) => chooseSku(event.target.value)}>
                    <option value="">Unmapped</option>
                    {skuOptions.map((option) => <option key={option.id} value={option.sku}>{option.sku} — {option.item}</option>)}
                  </select>
                </div>
                <div className="field"><label htmlFor="correction-qty">Quantity</label><input id="correction-qty" type="number" min="1" step="1" value={draft.quantity} onChange={(event) => setDraft({ ...draft, quantity: event.target.value })} required /></div>
                <div className="field"><label htmlFor="correction-unit">Unit</label><input id="correction-unit" value={draft.unit} onChange={(event) => setDraft({ ...draft, unit: event.target.value })} maxLength={20} required /></div>
                <div className="field"><label htmlFor="correction-eta">ETA days</label><input id="correction-eta" type="number" min="1" step="1" value={draft.etaDays} onChange={(event) => setDraft({ ...draft, etaDays: event.target.value })} required /></div>
                <div className="field"><label htmlFor="correction-supplier">Supplier</label><input id="correction-supplier" value={draft.supplier} onChange={(event) => setDraft({ ...draft, supplier: event.target.value })} maxLength={120} required /></div>
              </div>
              <div className="dialog-actions">
                <button type="button" className="button button-secondary button-small" onClick={() => setCorrecting(false)}>Cancel</button>
                <button type="submit" className="button button-primary button-small" disabled={busy}>Save correction</button>
              </div>
            </form>
          ) : null}

          {rejecting ? (
            <form className="correction-form" onSubmit={submitReject}>
              <h4>Reject this PO</h4>
              <div className="field">
                <label htmlFor="reject-reason">Reason</label>
                <textarea id="reject-reason" value={reason} onChange={(event) => setReason(event.target.value)} rows={2} maxLength={500} required autoFocus />
              </div>
              <div className="dialog-actions">
                <button type="button" className="button button-secondary button-small" onClick={() => setRejecting(false)}>Cancel</button>
                <button type="submit" className="button button-danger button-small" disabled={busy}>Reject PO</button>
              </div>
            </form>
          ) : null}

          {ordering ? (
            <form className="correction-form" onSubmit={submitOrder}>
              <h4>Mark as Ordered / Incoming</h4>
              <p className="field-hint">Upload a picture of proof that this order is incoming. JPEG, PNG, or WebP up to 5 MB.</p>
              <div className="field">
                <label htmlFor="order-proof">Proof picture</label>
                <input id="order-proof" type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseProof} required />
              </div>
              {proofPreview ? <img className="proof-preview" src={proofPreview} alt="Selected proof preview" /> : null}
              {proofError ? <p className="form-error" role="alert">{proofError}</p> : null}
              <div className="dialog-actions">
                <button type="button" className="button button-secondary button-small" onClick={() => { setOrdering(false); setProofError(''); setProofFile(null); setProofPreview(''); }}>Cancel</button>
                <button type="submit" className="button button-primary button-small" disabled={busy}>Confirm incoming</button>
              </div>
            </form>
          ) : null}

          {replacingProof ? (
            <form className="correction-form" onSubmit={submitProof}>
              <h4>{po.proof ? 'Replace incoming proof' : 'Add incoming proof'}</h4>
              <p className="field-hint">Choose a JPEG, PNG, or WebP picture up to 5 MB to correct the proof.</p>
              <div className="field">
                <label htmlFor="replace-proof">Proof picture</label>
                <input id="replace-proof" type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseProof} required />
              </div>
              {proofPreview ? <img className="proof-preview" src={proofPreview} alt="Selected proof preview" /> : null}
              {proofError ? <p className="form-error" role="alert">{proofError}</p> : null}
              <div className="dialog-actions">
                <button type="button" className="button button-secondary button-small" onClick={() => { setReplacingProof(false); setProofError(''); setProofFile(null); setProofPreview(''); }}>Cancel</button>
                <button type="submit" className="button button-primary button-small" disabled={busy}>Save proof</button>
              </div>
            </form>
          ) : null}

          {rescheduling ? (
            <form className="correction-form" onSubmit={submitSchedule}>
              <h4>{po.state === 'approved' ? 'Revise ETA' : 'Reschedule delivery'}</h4>
              <div className="field">
                <label htmlFor="schedule-value">{po.state === 'approved' ? 'ETA days' : 'Expected delivery date'}</label>
                {po.state === 'approved' ? (
                  <input id="schedule-value" type="number" min="1" step="1" value={scheduleValue} onChange={(event) => setScheduleValue(event.target.value)} required />
                ) : (
                  <input id="schedule-value" type="date" value={scheduleValue} onChange={(event) => setScheduleValue(event.target.value)} required />
                )}
                <p className="field-hint">{po.state === 'approved' ? `Current ETA: ${po.etaDays} days` : `Current delivery date: ${po.expectedArrival}`}</p>
              </div>
              <div className="field">
                <label htmlFor="schedule-note">Correction note</label>
                <textarea id="schedule-note" value={scheduleNote} onChange={(event) => setScheduleNote(event.target.value)} rows={2} maxLength={500} required placeholder="e.g. Supplier delay" autoFocus />
                <p className="field-hint">Saved in the PO review history.</p>
              </div>
              {scheduleError ? <p className="form-error" role="alert">{scheduleError}</p> : null}
              <div className="dialog-actions">
                <button type="button" className="button button-secondary button-small" onClick={() => { setRescheduling(false); setScheduleError(''); }}>Cancel</button>
                <button type="submit" className="button button-primary button-small" disabled={busy}>Save schedule</button>
              </div>
            </form>
          ) : null}

          <details className="source">
            <summary>{po.manual ? 'Manual PO details' : 'Original email text'}</summary>
            <pre>{po.body || po.preview || '(No text body)'}</pre>
          </details>

          <div className="dialog-actions po-actions">
            {po.state === 'pending_review' ? (
              <>
                <button type="button" className="button button-secondary button-small" onClick={() => { setCorrecting(true); setRejecting(false); }}>Correct fields</button>
                <button type="button" className="button button-danger-ghost button-small" onClick={() => { setRejecting(true); setCorrecting(false); }}>Reject…</button>
                <button type="button" className="button button-primary" onClick={() => onAction('approve')} disabled={busy}>Approve</button>
              </>
            ) : null}
            {po.state === 'approved' ? (
              <>
                <button type="button" className="button button-danger-ghost button-small" onClick={() => setRejecting(true)}>Reject…</button>
                <button type="button" className="button button-secondary button-small" onClick={openReschedule} disabled={busy}>Revise ETA…</button>
                <button type="button" className="button button-primary" onClick={() => { setOrdering(true); setReplacingProof(false); setRescheduling(false); setRejecting(false); setCorrecting(false); setProofError(''); setProofFile(null); setProofPreview(''); }} disabled={busy}>Set Ordered / Incoming…</button>
              </>
            ) : null}
            {po.state === 'rejected' || po.state === 'unverified' ? (
              <button type="button" className="button button-secondary button-small" onClick={() => setCorrecting(true)}>Correct fields</button>
            ) : null}
            {po.state === 'rejected' ? (
              <button type="button" className="button button-primary" onClick={() => onAction('resubmit')} disabled={busy || po.poStatus !== 'valid'}>Resubmit for review</button>
            ) : null}
            {po.state === 'ordered' ? (
              <>
                {po.delivery?.status === 'received' ? null : (
                  <button type="button" className="button button-secondary button-small" onClick={openReschedule} disabled={busy}>Reschedule delivery…</button>
                )}
                <button type="button" className="button button-secondary button-small" onClick={() => { setReplacingProof(true); setOrdering(false); setRescheduling(false); setProofError(''); setProofFile(null); setProofPreview(''); }}>
                  {po.proof ? 'Replace proof…' : 'Add proof…'}
                </button>
              </>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="detail-body"><p className="detail-loading" role="status"><span className="spinner" aria-hidden="true" />{error || loading ? 'Loading order details…' : 'Order details unavailable.'}</p></div>
      )}
    </dialog>
  );
}
