import { createRoot } from 'react-dom/client';
import './style.css';
import { DashboardApp } from './DashboardApp.jsx';
import { ReceivingApp } from './apps/ReceivingApp.jsx';
import { ProductionRunsApp } from './apps/ProductionRunsApp.jsx';

const pagePath = (globalThis.location?.pathname || '').replace(/\/+$/, '');
createRoot(document.getElementById('root')).render(
  pagePath === '/production_runs'
    ? <ProductionRunsApp />
    : pagePath === '/deliveries'
      ? <ReceivingApp />
      : <DashboardApp />,
);
