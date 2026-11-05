

export function SettingsView({ status, sender, setSender, onAdd, onRemove, busy, timeZone, setTimeZone, onSaveTimeZone, onClearAllData }) {
  return (
    <section className="panel settings-panel" id="settings" tabIndex={-1} aria-labelledby="settings-title">
      <header className="panel-head record-head">
        <div>
          <p className="eyebrow">Configuration</p>
          <h2 id="settings-title">Settings</h2>
        </div>
        <span className="count">{status.auth.account?.username}</span>
      </header>
      <div className="settings-grid">
        <section className="settings-section" aria-labelledby="senders-title">
          <div className="settings-head">
            <div>
              <p className="eyebrow">Allowlist</p>
              <h3 id="senders-title">Approved senders</h3>
            </div>
            <span className="count">{status.senders.length}</span>
          </div>
          <p className="settings-copy">Only subject-PO mail from these exact addresses is collected. Other PO mail stays in the unverified queue with a reason. Adding a sender also promotes that sender's queued mail back into Pending Review.</p>
          <form className="sender-form" onSubmit={onAdd}>
            <label className="sr-only" htmlFor="sender-address">Sender email address</label>
            <input id="sender-address" type="email" value={sender} onChange={(event) => setSender(event.target.value)} placeholder="name@example.com" autoComplete="off" required />
            <button type="submit" className="button button-primary button-small" disabled={busy}>Add</button>
          </form>
          {status.senders.length > 0 ? (
            <ul className="sender-list">
              {status.senders.map((address) => (
                <li key={address}>
                  <span>{address}</span>
                  <button type="button" className="button button-ghost button-small remove" onClick={() => onRemove(address)} aria-label={`Remove ${address}`}>Remove</button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="sender-empty">No approved senders yet. Add one above to start collecting.</p>
          )}
        </section>

        <section className="settings-section" aria-labelledby="timezone-title">
          <div className="settings-head">
            <div>
              <p className="eyebrow">Calendar</p>
              <h3 id="timezone-title">Plant time zone</h3>
            </div>
            <span className="count">{status.today}</span>
          </div>
          <p className="settings-copy">Provisional ETAs, the daily assessment refresh, and every calendar-day decision use this zone. The default is <strong>Asia/Manila</strong>.</p>
          <form className="sender-form" onSubmit={onSaveTimeZone}>
            <label className="sr-only" htmlFor="plant-time-zone">Plant time zone</label>
            <input id="plant-time-zone" value={timeZone} onChange={(event) => setTimeZone(event.target.value)} placeholder="Asia/Manila" autoComplete="off" required />
            <button type="submit" className="button button-primary button-small" disabled={busy}>Save</button>
          </form>
          <p className="hint">Current plant date: {status.today}. Use an IANA zone such as Asia/Manila.</p>
        </section>
      </div>
      <section className="settings-danger" aria-labelledby="clear-data-title">
        <div>
          <p className="eyebrow">Danger zone</p>
          <h3 id="clear-data-title">Clear all data</h3>
          <p className="settings-copy">Delete all local test data for this account: PO requests and review history, incoming proof and receipt pictures, inventory, incoming deliveries, production runs and definitions, and SKUs. Your approved senders and plant time zone are kept, as is the Gmail connection. Gmail is not changed. This cannot be undone.</p>
        </div>
        <button type="button" className="button button-danger" onClick={onClearAllData} disabled={busy}>Clear all data…</button>
      </section>
    </section>
  );
}
