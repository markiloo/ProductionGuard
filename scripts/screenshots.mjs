// Deterministic documentation screenshots. Drives the read-only fixture preview
// in a real installed browser, so no database, Gmail account, or credentials are
// touched. Run: npm run screenshots
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright-core';

const BASE = 'http://127.0.0.1:5180';
const OUT = path.resolve('docs/screenshots');
const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

const CANDIDATES = [
  { channel: 'msedge' },
  { channel: 'chrome' },
  { executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' },
  { executablePath: 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe' },
  { executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' },
];

const CLICK_ORDERS = { role: 'button', name: 'Orders' };

const shots = [
  { file: 'home-light.png', theme: 'light', wait: '.projection-tile' },
  { file: 'home-dark.png', theme: 'dark', wait: '.projection-tile' },
  { file: 'home-calendar-light.png', theme: 'light', clicks: [{ role: 'button', name: 'Calendar' }], wait: '.calendar-run' },
  { file: 'orders-light.png', theme: 'light', clicks: [CLICK_ORDERS], wait: '#orders .po-row' },
  { file: 'orders-dark.png', theme: 'dark', clicks: [CLICK_ORDERS], wait: '#orders .po-row' },
  { file: 'po-detail-light.png', theme: 'light', clicks: [CLICK_ORDERS, { selector: '.po-row', hasText: 'PO-0001' }], wait: 'dialog.po-detail[open] .assessment', crop: 'viewport' },
  { file: 'settings-light.png', theme: 'light', clicks: [{ role: 'button', name: 'Settings' }], wait: '#settings .settings-grid' },
  { file: 'inventory-dialog-dark.png', theme: 'dark', clicks: [{ role: 'button', name: 'Inventory' }, { role: 'button', name: 'Edit Stainless steel mounting plate' }], wait: 'dialog.inventory-dialog[open] .inventory-form', crop: 'viewport' },
  { file: 'receiving-dark.png', theme: 'dark', url: '/deliveries', wait: '.delivery-row' },
  { file: 'production-floor-light.png', theme: 'light', url: '/production_runs', wait: '.production-row' },
  { file: 'orders-mobile.png', theme: 'light', size: MOBILE, clicks: [CLICK_ORDERS], wait: '#orders .po-row' },
  { file: 'po-detail-mobile.png', theme: 'light', size: MOBILE, clicks: [CLICK_ORDERS, { selector: '.po-row', hasText: 'PO-0001' }], wait: 'dialog.po-detail[open] .assessment', crop: 'viewport' },
  { file: 'inventory-mobile.png', theme: 'light', size: MOBILE, clicks: [{ role: 'button', name: 'Inventory' }], wait: '.inventory-row' },
  { file: 'deliveries-mobile.png', theme: 'light', size: MOBILE, clicks: [{ role: 'button', name: 'Deliveries' }], wait: '.delivery-row' },
  { file: 'production-mobile.png', theme: 'light', size: MOBILE, clicks: [{ role: 'button', name: 'Production' }], wait: '.production-row' },
  { file: 'assemblies-mobile.png', theme: 'light', size: MOBILE, clicks: [{ role: 'button', name: 'Assemblies' }], wait: '.definition-row' },
];

async function waitForServer() {
  for (let attempt = 0; attempt < 160; attempt += 1) {
    try {
      const response = await fetch(`${BASE}/api/status`);
      if (response.ok) return await response.json();
    } catch { /* not listening yet */ }
    await delay(250);
  }
  throw new Error(`The fixture preview did not start on ${BASE}`);
}

async function launchBrowser() {
  const failures = [];
  for (const candidate of CANDIDATES) {
    if (candidate.executablePath && !existsSync(candidate.executablePath)) continue;
    try {
      return await chromium.launch({ headless: true, ...candidate });
    } catch (error) {
      failures.push(`${JSON.stringify(candidate)}: ${String(error.message).split('\n')[0]}`);
    }
  }
  throw new Error(`No installed Chrome or Edge could be launched.\n${failures.join('\n')}`);
}

/** Height of the active view, so hidden taller views or a short page do not add empty space. */
function contentHeight(page) {
  return page.evaluate(() => {
    const active = document.querySelector('.dashboard-view[data-active="true"]');
    const shell = document.querySelector('main.shell');
    const bottom = active
      ? active.getBoundingClientRect().bottom + window.scrollY
      : shell
        ? shell.getBoundingClientRect().bottom + window.scrollY
        : document.documentElement.scrollHeight;
    return Math.ceil(Math.min(bottom + 24, document.documentElement.scrollHeight));
  });
}

async function capture(browser, shot, now) {
  const size = shot.size || DESKTOP;
  const context = await browser.newContext({
    viewport: size,
    deviceScaleFactor: shot.size === MOBILE ? 2 : 1,
    locale: 'en-US',
    reducedMotion: 'reduce',
  });
  try {
    await context.addInitScript(({ theme, frozenNow }) => {
      try { localStorage.setItem('po-checker-theme', theme); } catch { /* Storage can be unavailable. */ }
      // Pin the page clock to the fixture stamp so "last updated" and relative
      // dates agree with the fixture data no matter when the capture runs.
      const RealDate = Date;
      const fixed = new RealDate(frozenNow).getTime();
      class FrozenDate extends RealDate {
        constructor(...args) { if (args.length === 0) super(fixed); else super(...args); }
        static now() { return fixed; }
      }
      globalThis.Date = FrozenDate;
    }, { theme: shot.theme, frozenNow: now });
    const page = await context.newPage();
    await page.goto(`${BASE}${shot.url || '/'}`, { waitUntil: 'domcontentloaded' });

    for (const click of shot.clicks || []) {
      if (click.selector) {
        await page.locator(click.selector, { hasText: click.hasText }).first().click();
      } else {
        await page.getByRole(click.role, { name: click.name, exact: true }).first().click();
      }
    }

    await page.waitForSelector(shot.wait, { state: 'visible', timeout: 20000 });
    await page.evaluate(() => document.fonts.ready);

    if (shot.crop !== 'viewport') {
      const height = Math.max(320, await contentHeight(page));
      await page.setViewportSize({ width: size.width, height });
      await page.evaluate(() => document.fonts.ready);
    }
    await delay(150);

    const file = path.join(OUT, shot.file);
    await page.screenshot({ path: file });
    console.log(`saved ${shot.file}`);
  } finally {
    await context.close();
  }
}

mkdirSync(OUT, { recursive: true });
const server = spawn(process.execPath, ['scripts/visual-preview.mjs'], { stdio: 'ignore', windowsHide: true });
let browser;
try {
  const status = await waitForServer();
  const now = status.collection.cutoff;
  browser = await launchBrowser();
  for (const shot of shots) await capture(browser, shot, now);
} finally {
  await browser?.close();
  server.kill();
}
