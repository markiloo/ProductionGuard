import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('preview Action heading aligns with the left edge of Review buttons', () => {
  const html = readFileSync(new URL('../design_plan/preview.html', import.meta.url), 'utf8');
  const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
  assert.match(html, /<th scope="col">Action<\/th>/);
  assert.match(html, /<td><button[^>]+data-demo="Review /);

  // Resolve the preview's table alignment declarations in source order,
  // including inherited table alignment and last-column overrides.
  const alignment = { th: undefined, td: undefined };
  for (const [, selectors, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const value = body.match(/text-align\s*:\s*(\w+)/)?.[1];
    if (!value) continue;
    for (const selector of selectors.split(',').map(part => part.trim())) {
      for (const tag of ['th', 'td']) {
        if (['table', tag, `${tag}:last-child`].includes(selector)) alignment[tag] = value;
      }
    }
  }
  assert.equal(alignment.th, 'left', 'Action heading should be left-aligned');
  assert.equal(alignment.td, 'left', 'Review buttons should share the heading alignment');
});
