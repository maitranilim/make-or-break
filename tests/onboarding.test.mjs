// First-run onboarding and the Start button. Run with `npm test` (needs Playwright's Chromium).
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

// onboarded: pretend the tour was already seen; blockStorage: make every localStorage access throw
async function open({ onboarded = false, blockStorage = false, query = '' } = {}) {
    const context = await browser.newContext();
    await context.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
    if (onboarded) await context.addInitScript(() => localStorage.setItem('mob_onboarded_v1', '1'));
    if (blockStorage) {
        await context.addInitScript(() => {
            Object.defineProperty(window, 'localStorage', {
                get() { throw new DOMException('blocked', 'SecurityError'); }
            });
        });
    }
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e));
    await page.goto(base + query);
    await page.waitForFunction(() => bricks.length > 0, null, { polling: 50 });
    return { page, context, errors };
}

const running = page => page.evaluate(() => state.running);
const visible = (page, sel) => page.isVisible(sel);

test('first visit shows the tour and nothing moves until Start', async () => {
    const { page, context, errors } = await open();
    assert.ok(await visible(page, '#onboarding'));
    assert.equal(await page.textContent('#onb-count'), '1 of 3');

    const ballsBefore = await page.evaluate(() => balls.map(b => [b.x, b.y]).join());
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => balls.map(b => [b.x, b.y]).join()), ballsBefore);
    assert.equal(await page.evaluate(() => state.timeLeft), 60);

    await page.click('#btn-onb-next');
    assert.equal(await page.textContent('#onb-count'), '2 of 3');
    await page.click('#btn-onb-next');
    assert.equal(await page.textContent('#btn-onb-next'), 'Start simulation');
    await page.click('#btn-onb-next');

    assert.ok(!(await visible(page, '#overlay-start')));
    assert.equal(await running(page), true);
    await page.waitForFunction(() => state.timeLeft < 60, null, { polling: 50 });
    assert.equal(await page.evaluate(() => localStorage.getItem('mob_onboarded_v1')), '1');
    assert.deepEqual(errors, []);
    await context.close();
});

test('returning visitor skips the tour but still presses Start', async () => {
    const { page, context, errors } = await open({ onboarded: true });
    assert.ok(!(await visible(page, '#onboarding')));
    assert.ok(await visible(page, '#btn-start'));
    assert.equal(await page.evaluate(() => document.activeElement.id), 'btn-start');
    await page.waitForTimeout(200);
    assert.equal(await running(page), false);

    await page.keyboard.press('Enter');
    assert.ok(!(await visible(page, '#overlay-start')));
    assert.equal(await running(page), true);
    assert.deepEqual(errors, []);
    await context.close();
});

test('Skip remembers the tour without starting the round', async () => {
    const { page, context, errors } = await open();
    await page.click('#btn-onb-skip');
    assert.ok(await visible(page, '#start-panel'));
    assert.equal(await running(page), false);

    await page.reload();
    await page.waitForFunction(() => bricks.length > 0, null, { polling: 50 });
    assert.ok(!(await visible(page, '#onboarding')));
    assert.ok(await visible(page, '#start-panel'));
    assert.deepEqual(errors, []);
    await context.close();
});

test('How it works reopens the tour', async () => {
    const { page, context } = await open({ onboarded: true });
    await page.click('#btn-how');
    assert.ok(await visible(page, '#onboarding'));
    assert.equal(await page.textContent('#onb-count'), '1 of 3');
    await context.close();
});

test('the Time slider previews the round length before Start', async () => {
    const { page, context } = await open({ onboarded: true });
    await page.fill('#slider-time', '30');
    assert.equal(await page.textContent('#val-time'), '30s');
    assert.equal(await page.textContent('#timer-display'), '30');
    await page.fill('#slider-red', '800');
    assert.equal(await page.textContent('#val-red'), '2.0x');
    assert.equal(await running(page), false);
    await context.close();
});

test('Restart before Start keeps everything paused', async () => {
    const { page, context } = await open({ onboarded: true });
    await page.evaluate(() => document.getElementById('btn-reset').click());
    await page.waitForTimeout(200);
    assert.equal(await running(page), false);
    assert.ok(await visible(page, '#overlay-start'));
    await context.close();
});

test('Play Again after a finished round starts right away', async () => {
    const { page, context } = await open({ onboarded: true });
    await page.click('#btn-start');
    await page.evaluate(() => { state.timeLeft = 0.01; });
    await page.waitForSelector('#overlay-result', { state: 'visible' });
    await page.click('#btn-play-again');
    assert.ok(!(await visible(page, '#overlay-result')));
    assert.ok(!(await visible(page, '#overlay-start')));
    assert.equal(await running(page), true);
    await context.close();
});

test('blocked storage: the tour still shows and Start still works', async () => {
    const { page, context, errors } = await open({ blockStorage: true });
    assert.ok(await visible(page, '#onboarding'));
    await page.click('#btn-onb-skip');
    await page.click('#btn-start');
    assert.equal(await running(page), true);
    assert.deepEqual(errors, []);
    await context.close();
});

test('pressing Start on a challenge link keeps the shared grid', async () => {
    const { page, context, errors } = await open({ onboarded: true, query: '?seed=abc123&time=30' });
    const before = await page.evaluate(() => [state.seed, bricks.map(b => b.active ? 1 : 0).join('')]);
    assert.equal(before[0], parseInt('abc123', 36));
    await page.click('#btn-start');
    const after = await page.evaluate(() => [state.seed, bricks.map(b => b.active ? 1 : 0).join('')]);
    assert.deepEqual(after, before);
    assert.equal(await page.evaluate(() => state.roundLength), 30);
    assert.equal(await running(page), true);
    assert.deepEqual(errors, []);
    await context.close();
});

test('every tour step fits inside the game area on small phones', async () => {
    for (const width of [320, 390]) {
        const context = await browser.newContext({ viewport: { width, height: 760 } });
        await context.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
        const page = await context.newPage();
        await page.goto(base);
        await page.waitForFunction(() => bricks.length > 0, null, { polling: 50 });
        for (let step = 0; step < 3; step++) {
            const fits = await page.evaluate(() => {
                const area = document.getElementById('overlay-start').getBoundingClientRect();
                const card = document.querySelector('.start-card').getBoundingClientRect();
                return card.top >= area.top && card.bottom <= area.bottom;
            });
            assert.ok(fits, `step ${step + 1} overflows at ${width}px`);
            if (step < 2) await page.click('#btn-onb-next');
        }
        await context.close();
    }
});
