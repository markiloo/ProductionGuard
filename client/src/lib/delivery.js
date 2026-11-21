import { api } from './api.js';

export function remainingQuantity(delivery) {
  return delivery.remainingQuantity ?? (delivery.status === 'incoming'
    ? Math.max(0, delivery.quantity - (delivery.receivedQuantity ?? 0)) : 0);
}

export function recordDeliveryReceipt(delivery, quantity, file, requestId) {
  return api(`/api/deliveries/${encodeURIComponent(delivery.id)}/receive`, {
    method: 'POST',
    headers: {
      'Content-Type': file.type,
      'X-File-Name': encodeURIComponent(file.name || 'receipt'),
      'X-Received-Quantity': String(quantity),
      'X-Expected-Received-Quantity': String(delivery.receivedQuantity ?? 0),
      'X-Receipt-Request-ID': requestId,
      ...(delivery.updatedAt && { 'X-Delivery-Updated-At': delivery.updatedAt }),
    },
    body: file,
  });
}
