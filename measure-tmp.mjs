/* Verify docs/19 defect 11 in a real browser. Scratch file; not committed. */
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const vizRoot = '/home/user/elevator-sim/.claude/worktrees/agent-a273b1ada6cb47286/packages/viz';
const server = await createServer({ configFile: `${vizRoot}/vite.config.ts`, root: vizRoot, server: { port: 0 }, logLevel: 'silent' });
await server.listen();
const origin = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await page.goto(`${origin}/?building=midtown-office&seed=424242`, { waitUntil: 'load' });
await page.waitForFunction(() => document.querySelector('canvas')?.width !== undefined, undefined, { timeout: 30000 });
await page.keyboard.press('Escape');
await page.waitForTimeout(500);

// The rail's link: with Midtown staged and no dirty draft, the editor must open ON Midtown.
await page.click('#seg-building');
await page.waitForTimeout(200);
await page.click('#rail-open-building');
await page.waitForTimeout(400);
const editing = await page.evaluate(() => document.querySelector('#building-editing')?.textContent ?? '');
console.log('editing-after-rail-link:', JSON.stringify(editing));

// Dirty the draft, go back to run, reopen — the draft must be kept (no clobber).
await page.evaluate(() => {
  const panel = document.querySelector('#panel-building');
  const input = panel?.querySelector('input[type="range"]');
  if (input) { input.value = String(Number(input.value) + 1); input.dispatchEvent(new Event('input', { bubbles: true })); }
});
await page.waitForTimeout(200);
const dirtyLine = await page.evaluate(() => document.querySelector('#building-dirty')?.hidden);
await page.click('#tab-run');
await page.waitForTimeout(200);
await page.click('#seg-building');
await page.waitForTimeout(200);
await page.click('#rail-open-building');
await page.waitForTimeout(300);
const editingDirty = await page.evaluate(() => ({
  editing: document.querySelector('#building-editing')?.textContent ?? '',
  dirtyHidden: document.querySelector('#building-dirty')?.hidden,
}));
console.log('dirty-preserved:', JSON.stringify({ dirtyLine, editingDirty }));
await page.close();
await browser.close();
await server.close();
