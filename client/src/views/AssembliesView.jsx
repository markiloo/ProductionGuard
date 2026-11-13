

export function AssembliesView({ assemblies, onAdd, onEdit }) {
  return (
    <section className="panel record-panel definitions" id="assemblies" tabIndex={-1} aria-labelledby="assemblies-title">
      <header className="panel-head record-head">
        <div><p className="eyebrow">Assembly master</p><h2 id="assemblies-title">Assemblies</h2></div>
        <div className="record-actions">
          <span className="count">{assemblies ? `${assemblies.length} ${assemblies.length === 1 ? 'assembly' : 'assemblies'}` : '—'}</span>
          <button type="button" className="button button-primary button-small" onClick={onAdd}>Add assembly</button>
        </div>
      </header>
      {assemblies === null ? (
        <div className="record-loading" role="status"><span className="spinner" aria-hidden="true" />Loading assemblies…</div>
      ) : (
        <>
          <p className="definition-intro">Define what the plant assembles and the materials each unit needs, selected from Inventory. Each assembly creates its own finished-good Inventory item, and completed production units add to that stock. Production runs scale the per-unit materials by the planned quantity and lock the result.</p>
          <div className="record-list">
            {assemblies.map((item) => <ProductionItemRow key={item.id} item={item} onEdit={onEdit} />)}
            {!assemblies.length ? (
              <div className="empty">
                <span className="empty-mark" aria-hidden="true">AS</span>
                <strong>No assemblies defined</strong>
                <p>Add an assembly and choose its materials from Inventory.</p>
                <button type="button" className="button button-secondary button-small" onClick={onAdd}>Add your first assembly</button>
              </div>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}

function ProductionItemRow({ item, onEdit }) {
  const requirements = item.requirements || [];
  return (
    <div className="definition-row">
      <div className="definition-main">
        <div className="definition-top">
          <strong className="definition-name">{item.name}</strong>
          {item.sku ? <span className="definition-sku">{item.sku}</span> : null}
          <span className="definition-unit">{item.unit}</span>
          <span className="definition-stock">{item.stock ?? 0} in stock</span>
        </div>
        {item.notes ? <span className="definition-meta">{item.notes}</span> : null}
        {requirements.length ? (
          <ul className="requirement-list">
            {requirements.map((requirement) => (
              <li key={requirement.id}>
                <span className="requirement-sku">{requirement.itemSku}</span>
                <span className="requirement-qty">{requirement.quantity} {requirement.unit} / unit</span>
              </li>
            ))}
          </ul>
        ) : <span className="definition-meta">No materials defined</span>}
      </div>
      <button type="button" className="button button-ghost button-small" onClick={() => onEdit(item)} aria-label={`Edit ${item.name}`}>Edit</button>
    </div>
  );
}
