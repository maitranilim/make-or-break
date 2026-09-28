// Browser tests for shareable challenge links. Run with `npm test` (needs Playwright's Chromium).
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

async function open(query = '') {
    const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
    // Keep tests offline: only the page itself is served
    await context.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
    // Freeze the game loop so the grid stays exactly as the seed built it
    await context.addInitScript(() => { window.requestAnimationFrame = () => 0; });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e));
    await page.goto(base + query);
    await page.waitForFunction(() => bricks.length > 0, null, { polling: 50 });
    // Rounds wait for Start: skip the first-visit tour, then press it
    await page.click('#btn-onb-skip');
    await page.click('#btn-start');
    return { page, context, errors };
}

const gridOf = page => page.evaluate(() => bricks.map(b => b.active ? 1 : 0).join(''));

test('the same seed always builds the same starting grid', async () => {
    const a = await open('?seed=abc123');
    const b = await open('?seed=abc123');
    const c = await open('?seed=zz9');
    assert.equal(await gridOf(a.page), await gridOf(b.page));
    assert.notEqual(await gridOf(a.page), await gridOf(c.page));
    for (const x of [a, b, c]) await x.context.close();
});

test('a challenge link applies its settings', async () => {
    const { page, context, errors } = await open('?seed=1&breaker=560&builder=300&time=30&chaos=15&multi=1');
    const s = await page.evaluate(() => ({
        red: sliderRed.value, green: sliderGreen.value, time: sliderTime.value,
        chaos: sliderChaos.value, multi: checkMulti.checked, seed: state.seed,
        label: document.getElementById('val-red').textContent,
        toast: document.getElementById('toast').textContent
    }));
    assert.deepEqual(s, {
        red: '560', green: '300', time: '30', chaos: '15', multi: true, seed: 1,
        label: '1.4x', toast: 'Playing a shared challenge. Same grid, same settings.'
    });
    assert.deepEqual(errors, []);
    await context.close();
});

test('out-of-range or junk params are clamped or ignored', async () => {
    const { page, context, errors } = await open('?seed=5&breaker=99999&builder=abc&time=-4&chaos=');
    const s = await page.evaluate(() => [sliderRed.value, sliderGreen.value, sliderTime.value, sliderChaos.value]);
    assert.deepEqual(s, ['800', '400', '10', '0']);
    assert.deepEqual(errors, []);
    await context.close();
});

test('an invalid seed falls back to a normal random round', async () => {
    const { page, context, errors } = await open('?seed=!!!');
    assert.equal(await page.evaluate(() => document.getElementById('toast').textContent), '');
    assert.deepEqual(errors, []);
    await context.close();
});

test('sharing after a round copies text and a link that reproduces it', async () => {
    const { page, context, errors } = await open();
    await page.evaluate(() => { sliderRed.value = 600; updateLabels(); endGame(); });
    await page.click('#btn-share-result');
    // Poll on a timer: the default polling uses requestAnimationFrame, which open() freezes
    await page.waitForFunction(() => document.getElementById('toast').textContent.includes('copied'), null, { polling: 50 });
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    assert.match(copied, /^(Order won|Chaos won) my Brickflux round.*Breaker 1\.5x vs Builder 1\.0x, 60s\)\. Can you (break|flip) it\? http/);

    const url = new URL(copied.slice(copied.indexOf('http')));
    assert.equal(url.searchParams.get('breaker'), '600');
    const original = await gridOf(page);
    const replay = await open(url.search);
    assert.equal(await gridOf(replay.page), original);
    assert.deepEqual(errors, []);
    await context.close();
    await replay.context.close();
});

test('Replay This Grid keeps the seed and New Round changes it', async () => {
    const { page, context } = await open('?seed=' + (42).toString(36));
    const grid = await gridOf(page);
    await page.evaluate(() => endGame());
    await page.click('#btn-replay');
    assert.equal(await page.evaluate(() => state.seed), 42);
    assert.equal(await gridOf(page), grid);

    await page.evaluate(() => endGame());
    await page.click('#btn-play-again');
    assert.notEqual(await page.evaluate(() => state.seed), 42);
    assert.equal(await page.evaluate(() => location.search), '');
    await context.close();
});

test('the game still runs when storage is blocked', async () => {
    const context = await browser.newContext();
    await context.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
    await context.addInitScript(() => {
        Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } });
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e));
    await page.goto(base);
    await page.evaluate(() => endGame());
    assert.equal(await page.isVisible('#overlay-result'), true);
    assert.deepEqual(errors, []);
    await context.close();
});
