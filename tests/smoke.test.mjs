// Smoke tests: the page boots cleanly and its core controls respond. Run with `npm test` (needs Playwright's Chromium).
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

test('the page boots without script errors and builds the brick grid', async () => {
    const { page, context, errors } = await open();
    const s = await page.evaluate(() => ({
        bricks: bricks.length,
        canvas: document.getElementById('gameCanvas').width > 0
    }));
    assert.ok(s.bricks > 0);
    assert.ok(s.canvas);
    assert.deepEqual(errors, []);
    await context.close();
});

test('the simulation loop advances once started', async () => {
    const { page, context, errors } = await open();
    // The round waits for Start; first-time visitors get the tour, so skip it first
    await page.click('#btn-onb-skip');
    await page.click('#btn-start');
    const before = await page.evaluate(() => balls.map(b => [b.x, b.y]).join());
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => balls.map(b => [b.x, b.y]).join());
    assert.ok(before.length > 0);
    assert.notEqual(before, after);
    assert.deepEqual(errors, []);
    await context.close();
});

test('moving the timer slider updates its label', async () => {
    const { page, context, errors } = await open();
    await page.evaluate(() => {
        sliderTime.value = 30;
        sliderTime.dispatchEvent(new Event('input', { bubbles: true }));
    });
    assert.equal(await page.textContent('#val-time'), '30s');
    assert.deepEqual(errors, []);
    await context.close();
});

test('the page carries no ad slot or ad script', async () => {
    const { page, context } = await open();
    const s = await page.evaluate(() => ({
        slots: document.querySelectorAll('.adsbygoogle, .ad-container').length,
        scripts: [...document.scripts].filter(x => /googlesyndication/.test(x.src)).length
    }));
    assert.deepEqual(s, { slots: 0, scripts: 0 });
    await context.close();
});
