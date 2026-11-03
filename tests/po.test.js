import test from 'node:test';
import assert from 'node:assert/strict';
import { isPoSubject, parseEtaDays, parsePo } from '../server/po.js';

test('PO subject is exact, case-insensitive, and trimmed', () => {
  assert.equal(isPoSubject(' po '), true);
  assert.equal(isPoSubject('Purchase Order'), false);
  assert.equal(isPoSubject('PO 123'), false);
});

test('PO fields parse with case and whitespace variations', () => {
  const po = parsePo(' item : Bolts\r\n QUANTITY: 12 \r\n UNIT : UNITS\r\n eta : 2 WEEKS\r\n SUPPLIER: Acme Supply');
  assert.deepEqual(po, { item: 'Bolts', quantity: 12, unit: 'units', eta: '2 weeks', supplier: 'Acme Supply', poStatus: 'valid', poError: null });
  assert.deepEqual(parsePo('ITEM: Steel\nQUANTITY: 3\nUNIT: kg\nETA: 5 days\nSUPPLIER: Acme'), {
    item: 'Steel', quantity: 3, unit: 'kg', eta: '5 days', supplier: 'Acme', poStatus: 'valid', poError: null,
  });
});

test('ETA durations convert whole days and weeks', () => {
  assert.equal(parseEtaDays('5 days'), 5);
  assert.equal(parseEtaDays('1 week'), 7);
  assert.equal(parseEtaDays('2 Weeks'), 14);
  assert.equal(parseEtaDays('soon'), null);
  assert.equal(parseEtaDays('0 days'), null);
});

test('multiple-item emails stay reviewable instead of being combined', () => {
  const po = parsePo('ITEM: Bolts\nQUANTITY: 1\nUNIT: kg\nETA: 1 week\nSUPPLIER: Acme\nITEM: Nuts\nQUANTITY: 2\nUNIT: kg\nETA: 1 week\nSUPPLIER: Acme');
  assert.equal(po.poStatus, 'needs_review');
  assert.match(po.poError, /separate email for each item/i);
});

test('malformed PO fields remain reviewable', () => {
  const po = parsePo('ITEM: Bolts\nQuantity: zero\nUnit: boxes\nETA: soon');
  assert.equal(po.poStatus, 'needs_review');
  assert.match(po.poError, /Quantity/);
  assert.match(po.poError, /ETA/);
  assert.match(po.poError, /supplier/i);
  assert.equal(parsePo('ITEM: Bolts\nQUANTITY: 1\nUNIT: kg\nETA: 1 week\nSUPPLIER:   ').poStatus, 'needs_review');
  assert.equal(parsePo('Quantity: 1\nITEM: Bolts\nUnit: kg\nETA: 1 week\nSUPPLIER: Acme').poStatus, 'valid');
  assert.equal(parsePo('ITEM: Bolts\nQuantity: 999999999999999999999999\nUnit: kg\nETA: 1 week\nSUPPLIER: Acme').poStatus, 'needs_review');
  assert.equal(parsePo('ITEM: Bolts\nQUANTITY: 1\nUNIT: kg\nSUPPLIER: Acme\nETA: 1 week').poStatus, 'valid');
});
