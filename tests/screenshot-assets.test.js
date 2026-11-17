import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const PNG_SIGNATURE = '89504e470d0a1a0a';
const DESKTOP = 1440;
const MOBILE = 780;

// Desktop captures are 1440 CSS px wide at DPR 1; mobile captures are 390 CSS px at DPR 2.
const SCREENSHOTS = {
  'home-light.png': DESKTOP,
  'home-dark.png': DESKTOP,
  'home-calendar-light.png': DESKTOP,
  'orders-light.png': DESKTOP,
  'orders-dark.png': DESKTOP,
  'po-detail-light.png': DESKTOP,
  'settings-light.png': DESKTOP,
  'inventory-dialog-dark.png': DESKTOP,
  'receiving-dark.png': DESKTOP,
  'production-floor-light.png': DESKTOP,
  'orders-mobile.png': MOBILE,
  'po-detail-mobile.png': MOBILE,
  'inventory-mobile.png': MOBILE,
  'deliveries-mobile.png': MOBILE,
  'production-mobile.png': MOBILE,
  'assemblies-mobile.png': MOBILE,
};

const directory = path.join('docs', 'screenshots');

test('documentation screenshots are committed PNG files at the intended sizes', () => {
  const present = fs.readdirSync(directory).filter((file) => file.endsWith('.png')).sort();
  assert.deepEqual(present, Object.keys(SCREENSHOTS).sort(), 'docs/screenshots must match the documented set');

  for (const [file, expectedWidth] of Object.entries(SCREENSHOTS)) {
    const buffer = fs.readFileSync(path.join(directory, file));
    assert.equal(buffer.subarray(0, 8).toString('hex'), PNG_SIGNATURE, `${file} must be a PNG, not a renamed JPEG`);
    assert.equal(buffer.readUInt32BE(16), expectedWidth, `${file} width`);
    assert.ok(buffer.readUInt32BE(20) > 400, `${file} height`);
    assert.ok(buffer.length > 10_000, `${file} is suspiciously small`);
  }
});
