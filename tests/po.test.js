import test from 'node:test';
import assert from 'node:assert/strict';
import { isPoSubject, parsePo } from '../server/po.js';

test('PO subject is exact, case-insensitive, and trimmed', () => {
  assert.equal(isPoSubject(' po '), true);
  assert.equal(isPoSubject('Purchase Order'), false);
  assert.equal(isPoSubject('PO 123'), false);
});

test('PO fields parse with case and whitespace variations', () => {
  const po = parsePo(' item : Bolts\r\n QUANTITY: 12 \r\n UNIT : UNITS\r\n eta : 2 WEEKS\r\n SUPPLIER: Acme Supply');
  assert.deepEqual(po, { item: 'Bolts', quantity: 12, unit: 'units', eta: '2 weeks', supplier: 'Acme Supply', poStatus: 'valid', poError: null });
});

test('malformed PO fields remain reviewable', () => {
  const po = parsePo('ITEM: Bolts\nQuantity: 0\nUnit: boxes\nETA: 3 weeks');
  assert.equal(po.poStatus, 'needs_review');
  assert.match(po.poError, /Quantity/);
  assert.match(po.poError, /Unit/);
  assert.match(po.poError, /ETA/);
  assert.match(po.poError, /supplier/i);
  assert.equal(parsePo('ITEM: Bolts\nQUANTITY: 1\nUNIT: kg\nETA: 1 week\nSUPPLIER:   ').poStatus, 'needs_review');
  assert.equal(parsePo('ITEM: Bolts\nITEM: Nuts\nQuantity: 1\nUnit: kg\nETA: 1 week').poStatus, 'needs_review');
  assert.equal(parsePo('Quantity: 1\nITEM: Bolts\nUnit: kg\nETA: 1 week').poStatus, 'needs_review');
  assert.equal(parsePo('ITEM: Bolts\nQuantity: 999999999999999999999999\nUnit: kg\nETA: 1 week').poStatus, 'needs_review');
  assert.equal(parsePo('ITEM: Bolts\nQUANTITY: 1\nUNIT: kg\nSUPPLIER: Acme\nETA: 1 week').poStatus, 'needs_review');
});
