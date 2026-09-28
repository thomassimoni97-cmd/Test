// End-to-end smoke test of the main user journey against a running app in LOCAL demo mode.
// Usage: npm run build && npm start   (in another terminal)   then   npm run e2e
// Requires Playwright + Chromium (npx playwright install chromium) or PW_CHROMIUM=/path/to/chrome.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const api = async (path, init) => (await fetch(BASE + path, init)).json();
const task = async (id) => (await api('/api/snapshot')).tasks.find((t) => t.Task_ID === id);
const step = (name) => console.log(`✓ ${name}`);

await api('/api/admin/reset', { method: 'POST' });
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

try {
  // 1. Store SAL — 5-second read
  await page.goto(`${BASE}/stores/AMS`);
  await page.getByRole('heading', { name: /Amsterdam Airport/i }).waitFor();
  const header = await page.locator('main header').first().innerText();
  for (const s of ['05 Mar 2027', 'DAYS TO OPENING', 'OVERALL COMPLETION', 'RISK LEVEL']) assert.ok(header.toUpperCase().includes(s.toUpperCase()), `header shows ${s}`);
  step('Store SAL header');

  // 2. Indicator filters the action log
  await page.getByRole('button', { name: /^Overdue\s*4$/ }).click();
  await page.getByText(/^4 tasks/).waitFor();
  await page.getByRole('button', { name: /^Overdue\s*4$/ }).click();
  step('Indicator → action log filter');

  // 3. Drawer: note + status change
  await page.getByRole('button', { name: /Airport IT integration requirements/ }).first().click();
  const drawer = page.getByRole('dialog');
  await drawer.getByPlaceholder(/What happened\?/).fill('E2E: Schiphol IT confirmed call on Friday');
  await drawer.getByRole('button', { name: 'Save note' }).click();
  await drawer.getByText('E2E: Schiphol IT confirmed call on Friday').waitFor();
  await drawer.locator('select').first().selectOption('In Progress');
  await page.waitForTimeout(800);
  const it2 = await task('AMS-IT-002');
  assert.equal(it2.Status, 'In Progress');
  const hist = (await api('/api/snapshot')).history.filter((h) => h.Task_ID === 'AMS-IT-002');
  assert.ok(hist.some((h) => h.Field_Changed === 'Note' && /^\[\d{2} \w{3} \d{4}\]: E2E/.test(h.New_Value)), 'note stored with date prefix');
  assert.ok(hist.some((h) => h.Field_Changed === 'Status' && h.Previous_Value === 'Blocked' && h.New_Value === 'In Progress'), 'status history');
  await page.keyboard.press('Escape');
  step('Task drawer note + status → Sheets + history');

  // 4. Action Log inline edit (progress)
  await page.goto(`${BASE}/actions`);
  await page.getByPlaceholder('Filter…').fill('AMS-HR-003');
  await page.getByRole('row').filter({ hasText: 'AMS-HR-003' }).getByRole('cell').nth(10).click();
  const num = page.locator('input[type=number]').first();
  await num.fill('35');
  await num.press('Enter');
  await page.waitForTimeout(800);
  assert.equal((await task('AMS-HR-003')).Progress_Percentage, 35);
  assert.equal((await task('AMS-HR-003')).Status, 'In Progress', 'progress > 0 starts the task');
  await page.getByPlaceholder('Filter…').fill('');
  step('Action Log inline edit');

  // 5. Kanban drag & drop
  await page.goto(`${BASE}/kanban`);
  await page.locator('select[aria-label="Store"]').selectOption('AMS');
  const card = page.locator('[aria-roledescription="draggable"]').first();
  const cardId = (await card.getAttribute('aria-label')).split(' ')[0];
  const target = page.locator('span', { hasText: /^In Progress$/ }).first();
  const cb = await card.boundingBox();
  const tb = await target.boundingBox();
  await page.mouse.move(cb.x + 30, cb.y + 20);
  await page.mouse.down();
  await page.mouse.move(cb.x + 50, cb.y + 40, { steps: 5 });
  await page.mouse.move(tb.x + tb.width / 2, tb.y + 60, { steps: 20 });
  await page.mouse.up();
  await page.waitForTimeout(1000);
  assert.equal((await task(cardId)).Status, 'In Progress', `${cardId} moved to In Progress`);
  const kh = (await api('/api/snapshot')).history.filter((h) => h.Task_ID === cardId && h.Field_Changed === 'Status');
  assert.ok(kh.some((h) => h.Previous_Value === 'Not Started' && h.New_Value === 'In Progress'), 'drag creates history');
  await page.locator('select[aria-label="Store"]').selectOption('');
  step('Kanban drag & drop');

  // 6. Global search finds notes
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+k');
  const search = page.getByPlaceholder(/Task ID, title, store/);
  await search.waitFor();
  await search.fill('Schiphol Telecom');
  await page.getByText('Internet line activation').first().waitFor();
  await search.press('Enter');
  await page.getByRole('dialog').filter({ hasText: 'AMS-NET-001' }).waitFor();
  await page.keyboard.press('Escape');
  step('Global search (notes)');

  // 7. Presentation mode + keyboard navigation between areas
  await page.goto(`${BASE}/stores/AMS`);
  await page.getByRole('heading', { name: /Amsterdam Airport/i }).waitFor();
  await page.keyboard.press('Shift+P');
  assert.ok(await page.evaluate(() => document.documentElement.classList.contains('presentation')));
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('select[aria-label="Area"]').inputValue(), 'CORP');
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('select[aria-label="Area"]').inputValue(), 'CON');
  await page.keyboard.press('Escape');
  await page.locator('select[aria-label="Area"]').selectOption('');
  step('Presentation mode + ← → areas');

  // 8. Meeting minutes: preview → edit → confirm → new baseline
  await page.goto(`${BASE}/stores/AMS/minutes`);
  await page.getByRole('button', { name: 'Confirm meeting minutes' }).waitFor();
  const salsBefore = (await api('/api/snapshot')).sals.filter((s) => s.Store_ID === 'AMS').length;
  const preview = await page.locator('textarea').nth(2).inputValue();
  assert.ok(preview.length > 10);
  assert.equal((await api('/api/snapshot')).sals.filter((s) => s.Store_ID === 'AMS').length, salsBefore, 'preview does not create a baseline');
  await page.getByPlaceholder(/Additional comments/).fill('E2E comment: next SAL on 5 Oct');
  await page.getByRole('button', { name: 'Confirm meeting minutes' }).click();
  await page.getByText(/new baseline created/i).waitFor();
  const sals = (await api('/api/snapshot')).sals.filter((s) => s.Store_ID === 'AMS');
  assert.equal(sals.length, salsBefore + 1);
  const last = sals[sals.length - 1];
  assert.ok(last.Final_Minutes.includes('E2E comment: next SAL on 5 Oct'));
  assert.ok(last.Final_Minutes.includes('Recruiting store team'));
  assert.ok(last.Snapshot_JSON.includes('AMS-HR-002'));
  step('Minutes preview → confirm → SAL_HISTORY + baseline');

  // 9. Next preview starts from the new baseline
  await page.goto(`${BASE}/stores/AMS/minutes`);
  await page.getByRole('button', { name: 'Confirm meeting minutes' }).waitFor();
  assert.ok((await page.locator('body').innerText()).includes('No relevant changes detected'));
  step('Next SAL compares from the new baseline');

  // 10. Minutes history
  await page.goto(`${BASE}/minutes?store=AMS`);
  await page.getByText('E2E comment: next SAL on 5 Oct').waitFor();
  step('Minutes history');

  // 11. Remaining pages render without runtime errors
  for (const p of ['/', '/areas', '/areas/LOG', '/calendar', '/timeline', '/history', '/settings?section=quality', '/settings?section=sheets']) {
    await page.goto(BASE + p);
    await page.waitForLoadState('networkidle');
  }
  assert.deepEqual(errors, []);
  step('All pages render without runtime errors');
} finally {
  await browser.close();
  await api('/api/admin/reset', { method: 'POST' });
}
console.log('\nSmoke test passed.');
