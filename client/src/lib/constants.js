export const PRODUCTION_STATUS = {
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  completed: 'Completed',
  on_hold: 'On hold',
};

export const PO_STATES = {
  pending_review: 'Pending review',
  unverified: 'Unverified',
  approved: 'Approved',
  ordered: 'Ordered / Incoming',
  rejected: 'Rejected',
};

export const ORDER_FILTERS = [
  { value: 'all', label: 'All orders' },
  { value: 'pending_review', label: 'Pending review' },
  { value: 'unverified', label: 'Unverified' },
  { value: 'approved', label: 'Approved' },
  { value: 'ordered', label: 'Ordered / Incoming' },
  { value: 'rejected', label: 'Rejected' },
];

export const DEFAULT_ORDER_FILTER = 'all';

export const FLAG_LABEL = {
  recommended: 'Recommended',
  redundant: 'Redundant / Overstock',
  adjust: 'Adjust Quantity',
  manual: 'Manual Review Required',
};

export const WARNING_LABEL = {
  timing: 'Timing Conflict / Expedite Needed',
  early: 'Arriving Early',
  duplicate: 'Potential Duplicate',
  stockout: 'Projected Stockout',
};
