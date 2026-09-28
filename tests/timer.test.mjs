// Round timer: the Time slider applies to the round in progress and the countdown stays readable. Run with `npm test`.
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

// Moves the Time slider the way a user drag does: set the value, then fire input
async function setTime(page, seconds) {
    await page.evaluate(v => {
        const s = document.getElementById('slider-time');
        s.value = v;
        s.dispatchEvent(new Event('input', { bubbles: true }));
    }, seconds);
}

test('raising the Time slider mid-round extends the running timer', async () => {
    const { page, context, errors } = await open();
    await page.evaluate(() => { state.timeLeft = 50; }); // 10s of a 60s round played
    await setTime(page, 90);
    const s = await page.evaluate(() => ({ left: state.timeLeft, shown: parseInt(timerDisplay.innerText) }));
    assert.ok(s.left > 75 && s.left <= 80, `expected ~80s left, got ${s.left}`);
    assert.ok(s.shown > 75 && s.shown <= 80, `expected ~80 shown, got ${s.shown}`);
    assert.deepEqual(errors, []);
    await context.close();
});

test('lowering the Time slider below the time played leaves a moment before the round ends', async () => {
    const { page, context, errors } = await open();
    await page.evaluate(() => { state.timeLeft = 20; }); // 40s played
    await setTime(page, 30);
    const s = await page.evaluate(() => ({ left: state.timeLeft, over: state.gameOver }));
    assert.ok(s.left > 0 && s.left <= 1, `expected under a second left, got ${s.left}`);
    assert.equal(s.over, false);
    await page.waitForFunction(() => state.gameOver, null, { polling: 50, timeout: 5000 });
    assert.deepEqual(errors, []);
    await context.close();
});

test('the next round uses the slider value', async () => {
    const { page, context, errors } = await open();
    await setTime(page, 30);
    await page.evaluate(() => document.getElementById('btn-reset').click());
    const s = await page.evaluate(() => ({ left: state.timeLeft, length: state.roundLength }));
    assert.equal(s.length, 30);
    assert.ok(s.left > 29 && s.left <= 30);
    assert.deepEqual(errors, []);
    await context.close();
});

test('the countdown is readable', async () => {
    const { page, context } = await open();
    const alpha = await page.evaluate(() => {
        const m = getComputedStyle(timerDisplay).color.match(/rgba?\(([^)]+)\)/)[1].split(',').map(Number);
        return m.length === 4 ? m[3] : 1;
    });
    assert.ok(alpha >= 0.4, `countdown alpha ${alpha} is too faint`);
    await context.close();
});
