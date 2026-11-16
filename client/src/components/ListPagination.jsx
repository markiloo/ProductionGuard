export function ListPagination({ pages, currentPage, setPage, label }) {
  if (pages <= 1) return null;
  return (
    <nav className="pagination" aria-label={label}>
      <button type="button" className="button button-secondary button-small" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button>
      <span role="status">Page {currentPage + 1} of {pages}</span>
      <button type="button" className="button button-secondary button-small" disabled={currentPage === pages - 1} onClick={() => setPage(currentPage + 1)}>Next</button>
    </nav>
  );
}
