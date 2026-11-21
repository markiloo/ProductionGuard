import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { scheduleDate } from '../lib/format.js';

const labels = {
  delivery: 'Delivery',
  requirement: 'Production requirement',
  assembly_material: 'Assembly material',
  assembly_run: 'Finished-good run',
};
const normalized = (value) => String(value ?? '').trim().toLowerCase();

export function useInventoryUnitDependencies(id, draft, unit, quantity, fromAssembly = false) {
  const [context, setContext] = useState(null);
  const [loadError, setLoadError] = useState('');
  useEffect(() => {
    if (!id) return undefined;
    const controller = new globalThis.AbortController();
    api(`/api/inventory/${encodeURIComponent(id)}/unit-dependencies`, { signal: controller.signal })
      .then(setContext)
      .catch((failure) => { if (failure.name !== 'AbortError') setLoadError(failure.message); });
    return () => controller.abort();
  }, [id]);
  const currentUnit = fromAssembly ? draft.unit : (context?.unit ?? draft.unit);
  const changing = Boolean(id && normalized(unit) && normalized(unit) !== normalized(currentUnit));
  const blockers = changing ? (context?.dependencies || []).filter((record) => normalized(record.unit) !== normalized(unit)) : [];
  const needsZeroStock = changing && ((context?.quantity ?? draft.quantity ?? 0) !== 0 || Number(quantity) !== 0);
  const assembly = changing && !fromAssembly ? context?.assembly : null;
  return {
    changing, blockers, needsZeroStock, assembly, loadError,
    loading: changing && !context && !loadError,
    blocked: changing && (needsZeroStock || Boolean(assembly) || blockers.length > 0 || (!context && !loadError)),
    updateFromError: (failure) => {
      if (failure.data?.unitDependencies) {
        setContext(failure.data.unitDependencies);
        setLoadError('');
      }
    },
  };
}

export function InventoryUnitDependencies({ id, state }) {
  if (!state.changing) return null;
  return (
    <div className="field-hint unit-dependencies" id={id} aria-live="polite">
      {state.loading ? <p>Checking which records use this SKU…</p> : null}
      {state.loadError ? <p>Could not check unit dependencies. Saving will check them again.</p> : null}
      {state.needsZeroStock ? <p>Save the item with zero stock before changing its unit.</p> : null}
      {state.assembly ? <p>Change the finished-good unit for {state.assembly.name} in Assemblies.</p> : null}
      {state.blockers.length ? (
        <>
          <p>These records must be resolved before changing the unit.</p>
          <ul>
            {state.blockers.map((record) => (
              <li key={`${record.kind}:${record.id}`}>
                {labels[record.kind]} {record.label} · {record.quantity} {record.unit}
                {record.supplier ? ` · ${record.supplier}` : ''}
                {record.date ? ` · ${scheduleDate(record.date)}` : ''}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
