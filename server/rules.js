/** Normalize an exact email address for case-insensitive allowlist matching. */
export function normalizeSender(value) { return String(value || '').trim().toLowerCase(); }

/** Validate a single email address without accepting a display name or domain wildcard. */
export function isValidSender(value) {
  const address = String(value || '').trim();
  return address.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address);
}

/** Validate a Microsoft application GUID before initializing MSAL. */
export function isValidClientId(value) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || '').trim()); }

/** Match the actual sender address and require a strictly newer received timestamp. */
export function isEligibleMessage(message, senderAddresses, cutoff) {
  if (!message?.receivedDateTime || !message?.from?.emailAddress?.address) return false;
  const received = Date.parse(message.receivedDateTime);
  const threshold = Date.parse(cutoff);
  return Number.isFinite(received) && Number.isFinite(threshold) && received > threshold && senderAddresses.map(normalizeSender).includes(normalizeSender(message.from.emailAddress.address));
}
