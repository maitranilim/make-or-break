// Accessibility checks: zoom, keyboard reach and accessible names. Run with `npm test` (needs Playwright's Chromium).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const html = await readFile(new URL('../index.html', import.meta.url));
let server, browser, base;

before(async () => {
    server = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${server.address().port}/`;
    // CHROMIUM_PATH lets you point at an already-installed Chromium instead of running `npx playwright install`
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
});

after(async () => {
    await browser?.close();
    server?.close();
});

async function open() {
    const context = await browser.newContext();
    // Keep tests offline: only the page itself is served
    await context.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e));
    await page.goto(base);
    await page.waitForFunction(() => bricks.length > 0, null, { polling: 50 });
    return { page, context, errors };
}

test('pinch zoom is not disabled', async () => {
    const { page, context } = await open();
    const viewport = await page.getAttribute('meta[name=viewport]', 'content');
    assert.doesNotMatch(viewport, /user-scalable\s*=\s*no|maximum-scale/);
    await context.close();
});

test('the Multi toggle is reachable and switchable by keyboard', async () => {
    const { page, context, errors } = await open();
    await page.focus('#check-multi');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'check-multi');
    await page.keyboard.press('Space');
    assert.equal(await page.isChecked('#check-multi'), true);
    assert.deepEqual(errors, []);
    await context.close();
});

test('header and menu buttons have accessible names', async () => {
    const { page, context } = await open();
    for (const name of ['Sound', 'Share this round as a challenge', 'Match history']) {
        assert.equal(await page.getByRole('button', { name, exact: true }).count(), 1, name);
    }
    for (const name of ['Breaker speed', 'Builder speed', 'Round time', 'Chaos']) {
        assert.equal(await page.getByRole('slider', { name, exact: true }).count(), 1, name);
    }
    await page.click('#btn-menu');
    assert.equal(await page.getByRole('button', { name: 'Close match history' }).count(), 1);
    await context.close();
});

test('the closed side menu is out of the tab order and Escape closes it', async () => {
    const { page, context, errors } = await open();
    const tabTo = async id => {
        for (let i = 0; i < 40; i++) {
            await page.keyboard.press('Tab');
            if (await page.evaluate(() => document.activeElement.id) === id) return true;
        }
        return false;
    };
    assert.equal(await tabTo('btn-close-menu'), false);

    await page.click('#btn-menu');
    assert.equal(await page.getAttribute('#btn-menu', 'aria-expanded'), 'true');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'btn-close-menu');

    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => document.getElementById('side-menu').classList.contains('open')), false);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'btn-menu');
    assert.equal(await page.getAttribute('#btn-menu', 'aria-expanded'), 'false');
    assert.deepEqual(errors, []);
    await context.close();
});
