import { useState } from 'react';

export const PAGE_SIZE = 6;

export function paginate(items, page) {
  const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const currentPage = Math.max(0, Math.min(page, pages - 1));
  return { pages, currentPage, visible: items.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE) };
}

export function usePagination(items) {
  const [page, setPage] = useState(0);
  const result = paginate(items || [], page);
  if (page !== result.currentPage) setPage(result.currentPage);
  return { ...result, setPage };
}
