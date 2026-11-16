import test from 'node:test';
import assert from 'node:assert/strict';
import { paginate } from '../client/src/hooks/usePagination.js';

for (const count of [0, 1, 6, 7, 12, 13]) {
  test(`lists of ${count} records paginate in groups of six`, () => {
    const items = Array.from({ length: count }, (_, id) => id);
    const pages = Math.max(1, Math.ceil(count / 6));
    const combined = [];
    for (let page = 0; page < pages; page += 1) {
      const result = paginate(items, page);
      assert.equal(result.pages, pages);
      assert.equal(result.currentPage, page);
      assert.deepEqual(result.visible, items.slice(page * 6, page * 6 + 6));
      combined.push(...result.visible);
    }
    assert.deepEqual(combined, items);
    assert.equal(paginate(items, 99).currentPage, pages - 1);
  });
}
