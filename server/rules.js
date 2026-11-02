/** Normalize an exact email address for case-insensitive allowlist matching. */
export function normalizeSender(value) { return String(value || '').trim().toLowerCase(); }

/** Validate a single email address without accepting a display name or domain wildcard. */
export function isValidSender(value) {
  const address = String(value || '').trim();
  return address.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address);
}

