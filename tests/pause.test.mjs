// Pause button: freezes the round, resumes it, and stays out of the way when no round is running. Run with `npm test`.
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

async function startRound(page) {
    await page.click('#btn-onb-skip');
    await page.click('#btn-start');
}

const snapshot = page => page.evaluate(() => ({
    timeLeft: state.timeLeft,
    balls: balls.map(b => [b.x, b.y].join()).join('|')
}));

test('the pause button is disabled until the round starts', async () => {
    const { page, context } = await open();
    assert.equal(await page.isDisabled('#btn-pause'), true);
    await startRound(page);
    assert.equal(await page.isDisabled('#btn-pause'), false);
    await context.close();
});

test('pausing freezes the timer and both balls, and resuming continues them', async () => {
    const { page, context, errors } = await open();
    await startRound(page);
    await page.waitForTimeout(200);

    await page.click('#btn-pause');
    assert.equal(await page.getAttribute('#btn-pause', 'aria-label'), 'Resume');
    assert.equal(await page.isVisible('#overlay-paused'), true);
    const frozen = await snapshot(page);
    await page.waitForTimeout(400);
    assert.deepEqual(await snapshot(page), frozen);

    await page.click('#btn-pause');
    assert.equal(await page.getAttribute('#btn-pause', 'aria-label'), 'Pause');
    assert.equal(await page.isVisible('#overlay-paused'), false);
    await page.waitForTimeout(300);
    const after = await snapshot(page);
    assert.notEqual(after.balls, frozen.balls);
    assert.ok(after.timeLeft < frozen.timeLeft);
    assert.deepEqual(errors, []);
    await context.close();
});

test('the Resume button on the board continues the round', async () => {
    const { page, context } = await open();
    await startRound(page);
    await page.click('#btn-pause');
    await page.click('#btn-resume');
    assert.equal(await page.evaluate(() => state.paused), false);
    assert.equal(await page.isVisible('#overlay-paused'), false);
    await context.close();
});

test('the P key toggles pause, but not while the history panel is open', async () => {
    const { page, context } = await open();
    await startRound(page);
    await page.keyboard.press('p');
    assert.equal(await page.evaluate(() => state.paused), true);
    await page.keyboard.press('P');
    assert.equal(await page.evaluate(() => state.paused), false);

    await page.click('#btn-menu');
    await page.keyboard.press('p');
    assert.equal(await page.evaluate(() => state.paused), false);
    await context.close();
});

test('P does nothing before the round starts', async () => {
    const { page, context } = await open();
    await page.keyboard.press('p');
    assert.equal(await page.evaluate(() => state.paused), false);
    assert.equal(await page.isVisible('#overlay-paused'), false);
    await context.close();
});

test('restarting while paused starts a running round', async () => {
    const { page, context } = await open();
    await startRound(page);
    await page.click('#btn-pause');
    await page.click('#btn-reset');
    assert.equal(await page.evaluate(() => state.paused), false);
    assert.equal(await page.isVisible('#overlay-paused'), false);
    assert.equal(await page.getAttribute('#btn-pause', 'aria-label'), 'Pause');
    const before = await snapshot(page);
    await page.waitForTimeout(300);
    assert.notEqual((await snapshot(page)).balls, before.balls);
    await context.close();
});

test('the pause button is disabled once the round is over', async () => {
    const { page, context } = await open();
    await startRound(page);
    await page.evaluate(() => { state.timeLeft = 0.05; });
    await page.waitForSelector('#overlay-result', { state: 'visible' });
    assert.equal(await page.isDisabled('#btn-pause'), true);
    assert.equal(await page.isVisible('#overlay-paused'), false);
    await page.keyboard.press('p');
    assert.equal(await page.evaluate(() => state.paused), false);
    await context.close();
});

test('hiding the tab pauses the round', async () => {
    const { page, context } = await open();
    await startRound(page);
    await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
        document.dispatchEvent(new Event('visibilitychange'));
    });
    assert.equal(await page.evaluate(() => state.paused), true);
    assert.equal(await page.isVisible('#overlay-paused'), true);
    await context.close();
});
