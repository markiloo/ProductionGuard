import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { updateProductionProgress, listActiveProductionRuns, parseProductionInput, listProductionRuns, createProductionRun, updateProductionRun, deleteProductionRun, nextProductionRunNumber } from '../server/production.js';

function store() {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE production_runs(
    account_id TEXT NOT NULL,
    id TEXT NOT NULL,
    run_number TEXT NOT NULL,
    item TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    completed_quantity INTEGER NOT NULL DEFAULT 0,
    unit TEXT NOT NULL,
    status TEXT NOT NULL,
    scheduled_date TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    production_item_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY(account_id, id)
  );
  CREATE UNIQUE INDEX production_runs_number ON production_runs(account_id, run_number COLLATE NOCASE);`);
  return db;
}

const now = '2026-11-03T09:00:00.000Z';

test('production input trims fields, normalizes status, and accepts a valid date', () => {
  assert.deepEqual(parseProductionInput({
    runNumber: ' PR-1042 ',
    item: ' Bearings ',
    quantity: '12',
    unit: ' units ',
    status: 'In progress',
    scheduledDate: '2026-11-05',
    notes: ' line 2 ',
  }), {
    runNumber: 'PR-1042',
    item: 'Bearings',
    quantity: 12,
    unit: 'units',
    status: 'in_progress',
    scheduledDate: '2026-11-05',
    notes: 'line 2',
  });
  assert.equal(parseProductionInput({ runNumber: 'PR-1', item: 'Bolts', quantity: 1, unit: 'kg', scheduledDate: '2024-02-29' }).status, 'scheduled');
});

test('production input rejects missing, malformed, or impossible values', () => {
  const invalid = [
    {},
    { runNumber: '', item: 'Bolts', quantity: 1, unit: 'units', scheduledDate: '2026-11-05' },
    { runNumber: 'PR-1', item: '', quantity: 1, unit: 'units', scheduledDate: '2026-11-05' },
    { runNumber: 'PR-1', item: 'Bolts', quantity: 0, unit: 'units', scheduledDate: '2026-11-05' },
    { runNumber: 'PR-1', item: 'Bolts', quantity: -1, unit: 'units', scheduledDate: '2026-11-05' },
    { runNumber: 'PR-1', item: 'Bolts', quantity: 1.5, unit: 'units', scheduledDate: '2026-11-05' },
    { runNumber: 'PR-1', item: 'Bolts', quantity: 1, unit: '', scheduledDate: '2026-11-05' },
    { runNumber: 'PR-1', item: 'Bolts', quantity: 1, unit: 'units', status: 'paused', scheduledDate: '2026-11-05' },
    { runNumber: 'PR-1', item: 'Bolts', quantity: 1, unit: 'units', scheduledDate: '' },
    { runNumber: 'PR-1', item: 'Bolts', quantity: 1, unit: 'units', scheduledDate: '2026-02-31' },
    { runNumber: 'PR-1', item: 'Bolts', quantity: 1, unit: 'units', scheduledDate: '2026-13-01' },
  ];
  for (const body of invalid) assert.throws(() => parseProductionInput(body));
});

test('production runs are account-scoped, ordered, and editable', () => {
  const db = store();
  try {
    assert.equal(nextProductionRunNumber(db, 'acct-a'), 'PR-0001');
    const scheduled = createProductionRun(db, 'acct-a', parseProductionInput({
      runNumber: 'PR-200', item: 'Bearings', quantity: 40, unit: 'units', scheduledDate: '2026-11-10', notes: ' line 3 ',
    }), now);
    const active = createProductionRun(db, 'acct-a', parseProductionInput({
      runNumber: 'PR-100', item: 'Steel', quantity: 5, unit: 'kg', status: 'in_progress', scheduledDate: '2026-11-07',
    }), now);
    createProductionRun(db, 'acct-a', parseProductionInput({
      runNumber: 'PR-050', item: 'Copper', quantity: 2, unit: 'kg', status: 'completed', scheduledDate: '2026-11-01',
    }), now);
    createProductionRun(db, 'acct-b', parseProductionInput({
      runNumber: 'PR-100', item: 'Other account', quantity: 1, unit: 'units', scheduledDate: '2026-11-05',
    }), now);

    assert.deepEqual(listProductionRuns(db, 'acct-a').map((run) => run.runNumber), ['PR-100', 'PR-200', 'PR-050']);
    assert.deepEqual(listProductionRuns(db, 'acct-b').map((run) => run.item), ['Other account']);
    assert.equal(nextProductionRunNumber(db, 'acct-a'), 'PR-0201');
    assert.equal(nextProductionRunNumber(db, 'acct-b'), 'PR-0101');

    assert.throws(
      () => createProductionRun(db, 'acct-a', parseProductionInput({
        runNumber: 'pr-100', item: 'Duplicate', quantity: 1, unit: 'units', scheduledDate: '2026-11-09',
      }), now),
      (failure) => failure.status === 409 && /already in use/.test(failure.message),
    );

    const updated = updateProductionRun(db, 'acct-a', active.id, parseProductionInput({
      runNumber: 'PR-100', item: 'Steel', quantity: 8, unit: 'kg', status: 'completed', scheduledDate: '2026-11-08', notes: ' done ',
    }), '2026-11-04T09:00:00.000Z');
    assert.equal(updated.quantity, 8);
    assert.equal(updated.status, 'completed');
    assert.equal(updated.notes, 'done');
    assert.equal(updated.updatedAt, '2026-11-04T09:00:00.000Z');
    assert.equal(updated.createdAt, active.createdAt);

    assert.equal(updateProductionRun(db, 'acct-b', active.id, parseProductionInput({
      runNumber: 'PR-999', item: 'Stolen', quantity: 1, unit: 'units', scheduledDate: '2026-11-09',
    }), now), null);
    assert.equal(deleteProductionRun(db, 'acct-b', active.id), false);
    assert.equal(deleteProductionRun(db, 'acct-a', active.id), true);
    assert.equal(listProductionRuns(db, 'acct-a').some((run) => run.id === active.id), false);
    assert.equal(deleteProductionRun(db, 'acct-a', active.id), false);
  } finally {
    db.close();
  }
});

test('production floor includes today scheduled work and all in-progress runs only for this account', () => {
  const db = store();
  try {
    const insert = db.prepare('INSERT INTO production_runs(account_id,id,run_number,item,quantity,unit,status,scheduled_date,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)');
    for (const [id, status, date, account] of [
      ['today', 'scheduled', '2026-11-05', 'a'], ['past', 'scheduled', '2026-11-04', 'a'],
      ['future', 'scheduled', '2026-11-06', 'a'], ['active', 'in_progress', '2026-11-04', 'a'],
      ['done', 'completed', '2026-11-05', 'a'], ['held', 'on_hold', '2026-11-05', 'a'],
      ['other', 'in_progress', '2026-11-05', 'b'],
    ]) insert.run(account, id, id, 'Assembly', 1, 'units', status, date, now, now);
    assert.deepEqual(listActiveProductionRuns(db, 'a', '2026-11-05').map(run => run.id), ['active', 'today']);
    assert.deepEqual(listActiveProductionRuns(db, 'a', '2026-11-06').map(run => run.id), ['active', 'future']);
  } finally { db.close(); }
});

test('floor progress persists status and completed units without changing the plan', () => {
  const db = store();
  try {
    const run = createProductionRun(db, 'a', parseProductionInput({ runNumber: 'PR-1', item: 'A', quantity: 10, unit: 'units', status: 'scheduled', scheduledDate: '2026-11-05' }), now);
    const updated = updateProductionProgress(db, 'a', run.id, { status: 'in_progress', completedQuantity: 4 }, now);
    assert.equal(updated.status, 'in_progress');
    assert.equal(updated.completedQuantity, 4);
    assert.equal(updated.quantity, 10);
    assert.equal(updateProductionProgress(db, 'b', run.id, { status: 'completed', completedQuantity: 10 }, now), null);
    for (const quantity of [-1, 11, 1.5, null, '4']) assert.throws(() => updateProductionProgress(db, 'a', run.id, { status: 'in_progress', completedQuantity: quantity }, now), /Completed units must/);
    assert.throws(() => updateProductionProgress(db, 'a', run.id, { status: 'bad', completedQuantity: 4 }, now), /valid production status/);
    const finished = updateProductionProgress(db, 'a', run.id, { status: 'completed', completedQuantity: 10 }, now);
    assert.equal(finished.completedQuantity, 10);
    assert.deepEqual(listActiveProductionRuns(db, 'a', '2026-11-05'), []);
  } finally { db.close(); }
});
