import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Reproduce: open /production_runs before and after loading; the heading
// previously read "Today?s" and the loading message ended with a question mark.
test('production floor copy has readable schedule and loading messages', () => {
  const source = readFileSync(new URL('../client/src/main.jsx', import.meta.url), 'utf8');
  const page = source.slice(source.indexOf('function ProductionRunsApp()'));
  assert.ok(page.includes("'Daily schedule'"));
  assert.ok(page.includes('No runs on the floor'));
  assert.ok(page.includes('Loading production runs...'));
  assert.ok(!page.includes('Today?s'));
  assert.ok(!page.includes('Loading production runs?'));
});

test('production floor lists in-progress and scheduled-today runs in one section', () => {
  const source = readFileSync(new URL('../client/src/main.jsx', import.meta.url), 'utf8');
  const page = source.slice(source.indexOf('function ProductionRunsApp()'));
  assert.ok(page.includes('No runs are scheduled today or currently in progress.'));
  assert.ok(!page.includes("title: 'In progress'"));
  assert.ok(!page.includes("title: 'Scheduled today'"));
  assert.equal((page.match(/<ProductionProgressRow /g) || []).length, 1);
});

test('production floor uses the shared panel, summary, and empty-state layout', () => {
  const source = readFileSync(new URL('../client/src/main.jsx', import.meta.url), 'utf8');
  const page = source.slice(source.indexOf('function ProductionRunsApp()'));
  assert.ok(page.includes('className="panel record-panel production"'));
  assert.ok(page.includes('className="record-summary"'));
  assert.ok(page.includes('className="empty"'));
  assert.ok(!page.includes('floor-overview'));
});

test('production floor reports action results as a toast instead of an inline alert', () => {
  const source = readFileSync(new URL('../client/src/main.jsx', import.meta.url), 'utf8');
  const page = source.slice(source.indexOf('function ProductionRunsApp()'));
  assert.ok(page.includes('<ToastStack'));
  assert.ok(page.includes('onNotify={setNotice}'));
  assert.ok(!page.includes('className="alert"'));
});

test('production floor opens a completed-units form from an edit button', () => {
  const source = readFileSync(new URL('../client/src/main.jsx', import.meta.url), 'utf8');
  const dialog = source.slice(source.indexOf('function FloorProgressDialog'), source.indexOf('function ProductionProgressRow'));
  const row = source.slice(source.indexOf('function ProductionProgressRow'), source.indexOf('function ProductionRunsApp'));
  assert.ok(dialog.includes('Units completed'));
  assert.ok(dialog.includes('completedQuantity'));
  assert.ok(dialog.includes('Reaching the planned quantity marks the run Completed'));
  assert.ok(!dialog.includes('Run status'));
  assert.ok(!dialog.includes('<select'));
  assert.ok(row.includes('onEdit'));
  assert.ok(row.includes('FloorProgressDialog'));
  assert.ok(!row.includes('<input'));
  assert.ok(!row.includes('<form'));
});
