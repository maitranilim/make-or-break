// Browser tests for the top bar. Run with `npm test` (needs Playwright's Chromium).
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

async function open(width = 1280, height = 800) {
    const context = await browser.newContext({ viewport: { width, height } });
    // Keep tests offline: only the page itself is served
    await context.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e));
    await page.goto(base);
    await page.waitForFunction(() => bricks.length > 0);
    return { page, context, errors };
}

// Starts the game loop running if a start screen is holding it
const run = page => page.evaluate(() => { state.running = true; state.gameOver = false; });

const boxes = page => page.evaluate(() =>
    ['header', '.controls-group', '.btn-group', ...[...document.querySelectorAll('.slider-container')].map((_, i) => `.slider-container:nth-child(${i + 1})`)]
        .map(sel => { const r = document.querySelector(sel).getBoundingClientRect(); return [sel, r.x, r.y, r.width, r.height].join(' '); })
);

async function setSlider(page, id, value) {
    await page.evaluate(([id, value]) => {
        const el = document.getElementById(id);
        el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
    }, [id, value]);
    // Let a few frames run so anything the game loop writes has landed
    await page.waitForTimeout(80);
}

for (const [name, width] of [['desktop', 1280], ['tablet', 900], ['small tablet', 740], ['phone', 390], ['small phone', 320]]) {
    test(`top bar layout does not move when values change (${name})`, async () => {
        const { page, context, errors } = await open(width);
        await run(page);
        const before = await boxes(page);
        // Push every value to its widest and narrowest text
        for (const [id, lo, hi] of [['slider-red', 100, 800], ['slider-green', 100, 800], ['slider-time', 10, 120], ['slider-chaos', 0, 50]]) {
            await setSlider(page, id, hi);
            assert.deepEqual(await boxes(page), before, `${id} at max moved the bar`);
            await setSlider(page, id, lo);
            assert.deepEqual(await boxes(page), before, `${id} at min moved the bar`);
        }
        await page.waitForTimeout(300);
        assert.deepEqual(await boxes(page), before, 'running the game moved the bar');
        // Nothing in the bar may spill past the screen edge (the bar clips, so check each control)
        const spill = await page.evaluate(() => [...document.querySelectorAll('header *')]
            .filter(el => { const r = el.getBoundingClientRect(); return r.width && (r.right > innerWidth + 0.5 || r.left < -0.5); })
            .map(el => el.id || el.className));
        assert.deepEqual(spill, []);
        assert.deepEqual(errors, []);
        await context.close();
    });
}

test('the game loop does not touch the top bar DOM', async () => {
    const { page, context } = await open();
    await run(page);
    const mutations = await page.evaluate(() => new Promise(resolve => {
        let count = 0;
        const obs = new MutationObserver(list => { count += list.length; });
        obs.observe(document.querySelector('header'), { subtree: true, childList: true, characterData: true, attributes: true });
        setTimeout(() => { obs.disconnect(); resolve(count); }, 500);
    }));
    assert.equal(mutations, 0);
    await context.close();
});

test('the timer only rewrites its text when the second changes', async () => {
    const { page, context } = await open();
    await run(page);
    const writes = await page.evaluate(() => new Promise(resolve => {
        let count = 0;
        const obs = new MutationObserver(list => { count += list.length; });
        obs.observe(timerDisplay, { subtree: true, childList: true, characterData: true });
        setTimeout(() => { obs.disconnect(); resolve(count); }, 500);
    }));
    // ~30 frames in half a second; at most one second boundary is crossed
    assert.ok(writes <= 2, `timer text written ${writes} times in 0.5s`);
    await context.close();
});

test('slider labels and track fill update even when the round is over', async () => {
    const { page, context } = await open();
    await page.evaluate(() => endGame());
    await setSlider(page, 'slider-red', 800);
    await setSlider(page, 'slider-chaos', 25);
    await setSlider(page, 'slider-time', 120);
    const s = await page.evaluate(() => ({
        red: document.getElementById('val-red').textContent,
        chaos: document.getElementById('val-chaos').textContent,
        time: document.getElementById('val-time').textContent,
        fill: sliderRed.parentElement.style.getPropertyValue('--fill'),
        chaosFill: sliderChaos.parentElement.style.getPropertyValue('--fill')
    }));
    assert.deepEqual(s, { red: '2.0x', chaos: '25%', time: '120s', fill: '100%', chaosFill: '50%' });
    await context.close();
});

test('on a phone the game area hugs the canvas instead of leaving empty space', async () => {
    const { page, context } = await open(390, 844);
    const gap = await page.evaluate(() =>
        document.getElementById('game-wrapper').getBoundingClientRect().height - document.getElementById('gameCanvas').getBoundingClientRect().height
    );
    assert.ok(gap < 8, `${gap}px of empty space around the canvas`);
    await context.close();
});
