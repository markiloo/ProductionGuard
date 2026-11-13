import { OrderNav } from '../views/OrdersView.jsx';
import { RunStrip } from './RunStrip.jsx';

export function OrdersTopbar({ status, counts, stateFilter, setStateFilter, setOffset }) {
  return (
    <div className="orders-topbar">
      <RunStrip status={status} />
      <OrderNav counts={counts} stateFilter={stateFilter} setStateFilter={setStateFilter} setOffset={setOffset} />
    </div>
  );
}
