/** Clamp public pagination inputs before using them in parameterized SQL. */
export function parsePagination(limitValue, offsetValue) {
  return {
    limit: Math.max(1, Math.min(100, Number.parseInt(limitValue, 10) || 25)),
    offset: Math.max(0, Math.min(1_000_000, Number.parseInt(offsetValue, 10) || 0)),
  };
}
