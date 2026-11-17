# Implementation verification

The completed checklist is covered by the offline Node test suites. Tests use in-memory SQLite or temporary DATA_DIR directories; no real Gmail account or production database is used.

- Assessment: exact worked-shortage, T-02 through T-05 quantity/timing/coverage examples; provisional day changes and fixed ordered arrivals; invalid and unit-mismatched records excluded from coverage.
- PO lifecycle: approval, rejection, resubmission, proof-required ordering, exactly one linked delivery, schedule corrections, and receipt idempotency.
- Collector: cutoff/restart behavior, sender case and exact-address matching, misleading display names, empty/multiple allowlists, add/remove during downloads, sign-out/account switches, clear races, delayed visibility, stable-ID deduplication, text-only MIME downloads, transient retries and credential recovery.
- API/storage: validation, origin rejection, account isolation, pagination bounds, account-scoped record lookup, DPAPI protection, migrations, and persistence.
- Rendering: actual PO detail markup contains Recommended and “arriving one day early”, escapes hostile message HTML, and formats timestamps with the local locale.
- Browser smoke check: isolated empty test instance on loopback port 4189; dashboard setup, receiving disconnected state, and production-floor disconnected notification load successfully.
- Final commands: npm test (63 passing), npm run lint, npm run build, git diff --check.

One-calendar-day early arrivals show descriptive text without an Arriving Early warning; quantity-matching POs remain Recommended. Arrivals more than one day early retain the existing warning.

Live Gmail connectivity and connected browser workflows were not exercised. Collector and business workflows were verified through injected IMAP clients, API tests, temporary databases, and component rendering.

## Monochrome interface revision — 2026-11-13

- Shared styles now apply the monochrome palette, square geometry, Lato typography, and blueprint shield across dashboard, receiving, production floor, and dialogs. Existing layouts and workflows are retained.
- Passed `npm run lint`, `npm test` (64 passing), `npm run build`, and `git diff --check`. Sandbox subprocess restrictions initially blocked the build and three tests; the unrestricted reruns passed.
- Production output includes locally bundled Lato 400, 700, and 900 font files; the app does not request Google Fonts.
- Calculated contrast for primary, secondary, muted, positive, warning, and primary-button text pairs, including hover: minimum 5.13:1 in light theme and 6.26:1 in dark theme. These are token checks, not a browser accessibility audit.
- Visible focus rules, responsive layouts, image sizing, and modal behavior are retained. Reduced motion now disables animations and transitions; the loading spinner retains circular geometry.
- New visual screenshots, connected sample-data browser walkthroughs, keyboard interaction, 200% zoom, and narrow-screen rendering have not been verified for this revision. Earlier browser smoke-check results above predate this restyle.

## Inventory stock history
- Added starting balances, transactional quantity edits and delivery receipts, and per-item history sheets.
- Passed lint, all 64 tests, and production build. Receipt tests cover exact stock snapshots, duplicate receiving, manual edits, unchanged quantities, and account isolation.
- Browser keyboard and responsive checks have not been performed.

## Operational visual refinement ? 2026-11-13

- Preserved monochrome/Lato identity and both themes; revised shared typography, spacing, navigation, records, touch controls and dialog hierarchy. PO decisions now lead the detail sheet, evidence/history/proof use disclosure, and review actions remain outside the scrolling body. Clear saved is under More actions.
- Isolated browser preview: `node scripts/visual-preview.mjs` on loopback 5180. Fixtures cover dashboard work areas, receiving and production floor without importing database/auth modules. Writes return a read-only error. `?preview=setup|empty|error|loading` exercises presentation states.
- Inspected populated Orders, Inventory, Deliveries, Production, Assemblies, Settings, receiving and floor surfaces; representative inventory, assembly, manual PO, receipt, progress and PO-detail forms. Checked light and dark presentation, 768px tablet and 375/320px narrow layouts. Measured no document overflow on sampled views. Browser zoom keys reached a 2x pixel ratio; viewport tooling retained the CSS viewport, so the 768px reflow check supplies the equivalent narrowed-layout evidence rather than a formal native zoom audit.
- Keyboard Tab reaches labeled inputs with a visible solid outline; Escape closes native dialogs. Correct fields scrolls and focuses the first input. At 375px the PO action footer spans x=0..375 and remains at the viewport bottom. Reduced-motion, contrast and transparency preference rules remain present; assistive-technology and OS preference emulation were not performed.
- Restored the production floor date accidentally hidden by the generic category-label rule. Added a regression test, observed its expected failure before the fix, then passed it after the fix. Floor browser AX and screenshot show Fri, 13 Nov above the title.
- Passed lint, all 66 tests, and production build after final changes. Source detector and whitespace checks run separately. Screenshots in `docs/screenshots/` document representative fixture screens; they do not imply live Gmail testing. Reliability changes from the critique remain outside this visual pass.
- Final detector: no findings; git diff --check passed. Temporary fixture server and review tabs were closed after verification.

## Orders status strip ? 2026-11-13

- Reduced the Orders collector strip from four metrics (Collector, Next inbox check, Last complete check, Saved) to one compact inline line showing the last complete check timestamp. The run-count caption and the live 15-second countdown were removed.
- A collector failure now shows a red "Check failed — retrying" note in the strip with the full message in its hover title; the existing error toasts are unchanged.
- Consolidated `.run-strip` and `.metric` into a single flex row and removed the obsolete four-column grid, column borders, and breakpoint overrides.
- Passed `npm run lint`, `npm test` (67 passing, including the new `tests/run-strip-render.test.js`), and `npm run build`.

## Orders queue bar ? 2026-11-13

- Moved the queue navigation from the left column to a full-width grey bar above the Orders list, keeping the `--surface-2` background for separation.
- The bar holds the six queue tabs with counts plus the "New POs appear after the next inbox check." hint; the redundant "Queues / Orders" heading block was removed.
- Tabs wrap instead of using the old 3-column and 2-column responsive grids; the active tab keeps its black fill.
- Added `tests/order-nav-render.test.js` covering all six labels, counts, the active `aria-current`, the hint, and the removed heading.
- Passed `npm run lint`, `npm test` (68 passing), and `npm run build`. Browser position and wrap behavior were rendered from SSR markup only; no visual browser pass was performed for this change.

## Orders topbar ? 2026-11-13

- Moved the last complete check marker onto the same row as the queue bar: the marker sits at the left and the grey queue bar fills the remaining width.
- The hint is right-aligned and hidden below 1200px; below 1100px the row stacks with the marker above the wrapped tabs.
- Added `OrdersTopbar` and `tests/orders-topbar-render.test.js` covering the shared row, marker-before-tabs order, all six queues, counts, active state, and the hint.
- Moved **All orders** to the leftmost edge of the queue bar, followed by Pending review, Unverified, Approved, Ordered / Incoming, and Rejected, with the hint right-aligned after the tabs. The hint is hidden below 1200px.
- Made **All orders** the default Orders selection through `DEFAULT_ORDER_FILTER = 'all'`; the client requests `state=all` on first load, while the API default stays `pending_review`.
- Updated the order-nav and topbar tests to assert the leftmost, default-selected All orders tab and the default constant.
- Passed `npm run lint`, `npm test` (69 passing), and `npm run build`. Position and responsive stacking were verified from SSR markup and compiled CSS; no visual browser pass was performed.

## Home view ? 2026-11-13

- Added a blank **Home** dashboard view as the first tab and the landing view after load, connect, and sign-out; the body is an empty heading panel ready for summary content.
- The skip link now targets `#home`, and the view-tab underline measures the new first tab without extra styling.
- Added `tests/home-view-render.test.js` covering the accessible heading, `#home` target, and absence of Orders/inventory controls.
- Updated the `AGENTS.md` view list and the README Home section.
- Passed `npm run lint`, `npm test` (70 passing), and `npm run build`. No visual browser pass was performed.

## Home dashboard visualizations ? 2026-11-13

- Added per-account `dashboard_widgets` (migration 21) with CRUD endpoints plus `GET /api/dashboard` for the Home payload.
- Home now loads saved inventory projections, the next three unreceived deliveries, and in-progress or scheduled-today run progress; visualizations are added/edited/removed through a sheet dialog and persisted per account.
- Projection uses confirmed supply only: on-hand stock plus unreceived deliveries, minus outstanding demand from non-completed runs, with overdrawn balances shown as stockout days. Unit-mismatched records are skipped and counted.
- Added a dependency-free SVG chart with an accessible summary, reorder-level line, and stockout markers.
- Reset clears Home visualizations; deleting an inventory SKU is blocked while a visualization uses it.
- Added `tests/dashboard.test.js`, `tests/dashboard-render.test.js`, API route coverage, reset cleanup coverage, and migration assertions.
- Passed `npm run lint`, `npm test` (77 passing), and `npm run build`. No visual browser pass was performed.

## Assembly finished-goods stock ? 2026-11-13

- Migration 22 adds `sku` and `inventory_id` to assemblies, links each assembly to one finished-good Inventory item, and backfills existing assemblies with generated `ASM-<NAME>` SKUs and zero-stock history.
- Creating an assembly creates its Inventory item at zero stock; editing syncs the name/unit while keeping the SKU fixed, and unit changes are blocked while stock remains.
- Recording completed units adds or removes the delta from assembly stock and writes `Assembly completed` / `Completion corrected` history. Below-zero corrections are rejected with 409, and lowering a completed run reopens it.
- Status `completed` fills the remaining planned units and stocks them; reopening keeps produced stock, and deleting a run leaves it intact.
- Assemblies with stock, runs, or other references cannot be deleted; zero-stock unreferenced assemblies remove their Inventory row.
- Added `tests/assembly-stock.test.js` and a migration backfill/version assertion; updated API, README, and type docs.
- Passed `npm run lint`, `npm test` (84 passing), and `npm run build`. No visual browser pass was performed.

## Production tag alignment ? 2026-11-14

- Keep the run status tag immediately after the run name, matching the earlier row layout; no auto-margin or main-column inset.
- Material `Outstanding`/`Consumed` tags now sit in a compact left-packed group after the SKU and quantity. The requirement list uses shared `max-content` SKU and quantity columns with a fixed 104px tag column, and each row uses a subgrid, so tags align without being pushed to the far right.
- Added `tests/production-render.test.js` covering the rendered tag classes, the subgrid alignment CSS, and the absence of the run-tag auto-margin/inset.
- Passed `npm run lint`, `npm test` (85 passing), and `npm run build`. No visual browser pass was performed.

## Inventory history table fit ? 2026-11-14

- Fixed the history sheet being narrowed by the generic `.detail` width: `.detail.inventory-history-dialog` now keeps the intended 960px sheet and its grid track is `minmax(0, 1fr)`.
- Made the history table fluid with `table-layout: fixed`, percentage columns, and wrapping cells instead of a 700px minimum width, so it stays inside the card at any dialog width.
- History timestamps use the compact `metricDate` format (for example `Nov 14, 10:00 PM`) with the full timestamp in the `title`.
- Extended `tests/inventory-history-render.test.js` with compact-date markup and CSS fit assertions.
- Passed `npm run lint`, `npm test` (84 passing), and `npm run build`. No visual browser pass was performed.

## Compact dashboard navigation - 2026-11-14
- Removed dashboard branding and the separate header; Settings stays at the right of the view navigation.
- Moved connected account, theme selection, and sign out into Settings.
- Passed lint, production build, and all 86 tests. No browser visual pass performed.

## Incoming delivery window - 2026-11-14
- Added configurable days/weeks window (default two weeks), including overdue arrivals, with three deliveries per page and Previous/Next controls.
- Dashboard API returns all account-scoped incoming deliveries.
- Lint, all 87 tests, and build passed. No browser visual pass performed.

## Home production calendar
Home offers Overview and Calendar. Calendar shows unfinished runs for 30 days including plant-local today, with a weekly desktop grid and mobile agenda. Selecting a run opens read-only details. Lint and production build passed; browser visual verification remains outstanding.

## Home copy, date formatting, and the Prod. Guard name — 2026-11-17

- Removed the last three mojibake strings from Home: the empty-supplier cell renders an em dash, and the refresh and loading copy use real ellipses. A repository sweep for double-encoded text now finds only the detection pattern inside the regression test.
- Incoming deliveries reads "Next 2 weeks" / "Next 1 week" again, and the window count chip removed during the queue-topbar refactor is restored as `{rows.length}` with screen-reader text "N deliveries in this window". The existing `class="count">4<` assertion had been masked by the earlier copy failure.
- Every date in the PO detail sheet now goes through `scheduleDate`: assessment arrival, need date, and planning end; incoming deliveries, provisional coverage, outstanding demand, the linked delivery line, and the reschedule hint. `warningText` formats the early-arrival, timing-conflict, and stockout run dates, and the receive sheet formats the expected arrival. Extracted render output shows 0 ISO dates and readable dates such as "Thu, 19 Nov" and "need date Sun, 22 Nov, 3 days early".
- The product name is **Prod. Guard** in the wordmark, setup copy, receiving screen, README, DESIGN.md, AGENTS.md, `launch.bat`, `design_plan/preview.html`, the demo dataset title, and the server's second-instance error. The DPAPI entropy string, `po-checker.db`, `po-checker-theme`, and the package name are unchanged so saved credentials and preferences keep working; `server/auth.js` documents why.
- Added `tests/brand-render.test.js` and extended `tests/dashboard-render.test.js` and `tests/order-render.test.js` with regression assertions for the mojibake, the window copy and count, formatted assessment dates, and all three dated warning branches.
- Passed `npm run lint`, `npm test` (102 passing), and `npm run build`.

## Documentation screenshots and mobile navigation — 2026-11-17

- `scripts/visual-preview.mjs` now serves `/api/dashboard` (widgets, incoming, active runs, and the 30-day production calendar) and gained a third incoming delivery, so the Home overview and Calendar can be captured without a database. Fixture `today` stays pinned at `2026-11-13`; the capture script pins the page clock to the fixture cutoff, so "Last updated" and relative timestamps agree with the data.
- Added `scripts/screenshots.mjs` and `npm run screenshots`: it starts the fixture preview, drives an installed Edge or Chrome through `playwright-core` (no browser download), clicks into each view, and writes deterministic PNGs. The active view's height sets the crop, so dashboard shots do not inherit the shared height of hidden views and standalone routes no longer carry 900px of empty space.
- Replaced all twelve documentation screenshots with real PNGs. The previous files were JPEG data stored under `.png` names. The set is now sixteen: Home light and dark, Home Calendar, Orders light and dark, PO detail, Settings, inventory sheet in dark, the receiving station, the production floor, and six 390px mobile screens.
- The capture surfaced two layout defects, both fixed: below 700px the signed-in label wrapped the account address and squeezed the tab strip, so the label is hidden there and the account stays in Settings; and the standalone routes kept a full-viewport blank area below short content, now cropped.
- Fixture purchase orders now vary item, SKU, quantity, and supplier instead of repeating one item in five rows.
- Added `tests/screenshot-assets.test.js`, which asserts the exact sixteen files exist and that each is a real PNG at 1440px or 780px wide.
- Passed `npm run lint`, `npm test` (103 passing), and `npm run build`.

