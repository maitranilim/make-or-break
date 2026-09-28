// History panel: opening it pauses the round; Esc, the backdrop and ✕ all close it. Run with `npm test`.
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
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
});

after(async () => {
    await browser?.close();
    server?.close();
});

async function open() {
    const context = await browser.newContext();
    await context.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e));
    await page.goto(base);
    await page.waitForFunction(() => bricks.length > 0, null, { polling: 50 });
    return { page, context, errors };
}

const isOpen = page => page.evaluate(() => document.getElementById('side-menu').classList.contains('open'));

async function openMenu(page) {
    await page.click('#btn-menu');
    assert.equal(await isOpen(page), true);
    // Let the slide-in transition finish so the backdrop is clickable beside the panel
    await page.waitForTimeout(350);
}

test('opening the History panel pauses the round', async () => {
    const { page, context, errors } = await open();
    await openMenu(page);
    const before = await page.evaluate(() => [state.timeLeft, balls.map(b => [b.x, b.y]).join()]);
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => [state.timeLeft, balls.map(b => [b.x, b.y]).join()]);
    assert.deepEqual(after, before);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const resumed = await page.evaluate(() => state.timeLeft);
    assert.ok(resumed < before[0]);
    assert.deepEqual(errors, []);
    await context.close();
});

test('Esc closes the History panel', async () => {
    const { page, context, errors } = await open();
    await openMenu(page);
    await page.keyboard.press('Escape');
    assert.equal(await isOpen(page), false);
    assert.deepEqual(errors, []);
    await context.close();
});

test('clicking outside the History panel closes it', async () => {
    const { page, context, errors } = await open();
    await openMenu(page);
    await page.mouse.click(20, 300);
    assert.equal(await isOpen(page), false);
    assert.deepEqual(errors, []);
    await context.close();
});

test('the ✕ button still closes the History panel', async () => {
    const { page, context, errors } = await open();
    await openMenu(page);
    await page.click('#btn-close-menu');
    assert.equal(await isOpen(page), false);
    assert.deepEqual(errors, []);
    await context.close();
});
