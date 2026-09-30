// Lead-change chart: the recorded lit-brick history, who led and when, and the chart on the result screen. Run with `npm test`.
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

async function open(width = 1280, height = 800) {
    const context = await browser.newContext({ viewport: { width, height } });
    await context.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e));
    await page.goto(base + '?seed=brick&breaker=420&chaos=10');
    await page.waitForFunction(() => bricks.length > 0, null, { polling: 50 });
    return { page, context, errors };
}

async function startRound(page) {
    await page.click('#btn-onb-skip');
    await page.click('#btn-start');
}

// Plays `seconds` of the round at once, then ends it and waits for the result screen
async function playAndFinish(page, seconds = 25) {
    await page.evaluate(s => { for (let i = 0; i < s * 60; i++) update(1 / 60); state.timeLeft = 0.001; }, seconds);
    await page.waitForSelector('#overlay-result', { state: 'visible' });
}

test('analyzeLead finds each change of lead and how long each side was ahead', async () => {
    const { page, context } = await open();
    const r = await page.evaluate(() => analyzeLead([
        { t: 0, lit: 140 }, { t: 5, lit: 150 }, { t: 10, lit: 130 }, { t: 15, lit: 135 }, { t: 20, lit: 141 }, { t: 30, lit: 141 }
    ], 280));
    assert.deepEqual(r, {
        changes: [{ t: 10, to: 'Chaos' }, { t: 20, to: 'Order' }],
        orderTime: 15,
        chaosTime: 10
    });
    await context.close();
});

test('a lead that passes through a level count still counts as a change', async () => {
    const { page, context } = await open();
    const r = await page.evaluate(() => analyzeLead([
        { t: 0, lit: 140 }, { t: 5, lit: 150 }, { t: 10, lit: 140 }, { t: 15, lit: 130 }, { t: 20, lit: 130 }
    ], 280));
    assert.deepEqual(r.changes, [{ t: 15, to: 'Chaos' }]);
    assert.equal(r.orderTime, 5);
    assert.equal(r.chaosTime, 5);
    await context.close();
});

test('a round with one leader has no changes, and a single point has no time', async () => {
    const { page, context } = await open();
    const steady = await page.evaluate(() => analyzeLead([{ t: 0, lit: 140 }, { t: 10, lit: 150 }, { t: 20, lit: 160 }], 280));
    assert.deepEqual(steady.changes, []);
    const single = await page.evaluate(() => analyzeLead([{ t: 0, lit: 140 }], 280));
    assert.deepEqual(single, { changes: [], orderTime: 0, chaosTime: 0 });
    await context.close();
});

test('litAt holds the count until the next change', async () => {
    const { page, context } = await open();
    const r = await page.evaluate(() => {
        const h = [{ t: 0, lit: 140 }, { t: 5, lit: 150 }, { t: 10, lit: 130 }];
        return [-1, 0, 4.9, 5, 9.99, 10, 99].map(t => litAt(h, t));
    });
    assert.deepEqual(r, [140, 140, 140, 150, 150, 130, 130]);
    await context.close();
});

test('the history starts at half the grid and records only real changes', async () => {
    const { page, context, errors } = await open();
    assert.deepEqual(await page.evaluate(() => state.litHistory), [{ t: 0, lit: 140 }]);
    await startRound(page);
    await playAndFinish(page);
    const h = await page.evaluate(() => state.litHistory);
    assert.ok(h.length > 2, 'expected the lit count to change during the round');
    for (let i = 1; i < h.length - 1; i++) assert.notEqual(h[i].lit, h[i - 1].lit);
    for (let i = 1; i < h.length; i++) assert.ok(h[i].t >= h[i - 1].t);
    // The last point is the result shown to the player
    const shown = await page.evaluate(() => [state.lastResult.green, (state.litHistory.at(-1).lit / bricks.length * 100).toFixed(1)]);
    assert.equal(shown[0], shown[1]);
    assert.deepEqual(errors, []);
    await context.close();
});

test('a paused round records nothing', async () => {
    const { page, context } = await open();
    await startRound(page);
    await page.waitForTimeout(300);
    await page.click('#btn-pause');
    const before = await page.evaluate(() => JSON.stringify(state.litHistory));
    await page.waitForTimeout(400);
    assert.equal(await page.evaluate(() => JSON.stringify(state.litHistory)), before);
    await context.close();
});

test('the result screen shows the chart with one marker per lead change', async () => {
    const { page, context } = await open();
    await startRound(page);
    await playAndFinish(page);
    assert.equal(await page.isVisible('#lead-chart'), true);
    const r = await page.evaluate(() => {
        const a = analyzeLead(state.litHistory, bricks.length);
        return {
            changes: a.changes.length,
            markers: document.querySelectorAll('#lead-chart .lc-marker').length,
            summary: document.getElementById('lead-chart-summary').textContent,
            label: document.querySelector('#lead-chart svg').getAttribute('aria-label')
        };
    });
    assert.equal(r.markers, r.changes);
    assert.match(r.summary, /lead/i);
    assert.ok(r.label.includes(r.summary));
    await context.close();
});

test('the chart is hidden when no time was played', async () => {
    const { page, context } = await open();
    await page.evaluate(() => endGame());
    assert.equal(await page.isVisible('#lead-chart'), false);
    await context.close();
});

test('replaying the grid starts a fresh history', async () => {
    const { page, context } = await open();
    await startRound(page);
    await playAndFinish(page);
    await page.click('#btn-replay');
    assert.deepEqual(await page.evaluate(() => state.litHistory), [{ t: 0, lit: 140 }]);
    assert.equal(await page.isVisible('#overlay-result'), false);
    await context.close();
});

test('pointer and arrow keys read values from the chart', async () => {
    const { page, context } = await open();
    await startRound(page);
    await playAndFinish(page);
    assert.equal(await page.isVisible('#lead-chart-tip'), false);

    const box = await page.locator('#lead-chart svg').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    assert.equal(await page.isVisible('#lead-chart-tip'), true);
    assert.match(await page.textContent('#lead-chart-tip'), /^\d+\.\ds · \d+\.\d% lit · (Order ahead|Chaos ahead|Level)$/);

    await page.mouse.move(0, 0);
    assert.equal(await page.isVisible('#lead-chart-tip'), false);

    await page.focus('#lead-chart svg');
    await page.keyboard.press('End');
    const atEnd = await page.textContent('#lead-chart-tip');
    await page.keyboard.press('ArrowLeft');
    assert.notEqual(await page.textContent('#lead-chart-tip'), atEnd);
    await page.keyboard.press('Home');
    assert.match(await page.textContent('#lead-chart-tip'), /^0\.0s · 50\.0% lit/);
    await page.keyboard.press('End');
    assert.equal(await page.textContent('#lead-chart-tip'), atEnd);
    await context.close();
});

for (const width of [320, 360, 390, 430]) {
    test(`the result, chart and buttons fit on a ${width}px phone without scrolling`, async () => {
        const { page, context } = await open(width, 740);
        await startRound(page);
        await playAndFinish(page);
        const r = await page.evaluate(() => {
            const o = document.getElementById('overlay-result');
            const wr = document.getElementById('game-wrapper').getBoundingClientRect();
            const clipped = [...o.querySelectorAll('h2, div, button, p, svg')]
                .filter(el => el.getClientRects().length > 0)
                .filter(el => { const b = el.getBoundingClientRect(); return b.top < wr.top - 0.5 || b.bottom > wr.bottom + 0.5; })
                .map(el => el.id || el.className.baseVal || el.className);
            return { overflow: o.scrollHeight - o.clientHeight, clipped, summary: document.getElementById('lead-chart-summary').textContent };
        });
        assert.ok(r.overflow <= 1, `the result screen scrolls by ${r.overflow}px`);
        assert.deepEqual(r.clipped, []);
        assert.ok(r.summary.length > 0, 'the lead summary should show even when the chart does not fit');
        await context.close();
    });
}

test('resizing while the result is showing redraws the chart to fit', async () => {
    const { page, context, errors } = await open(1280, 800);
    await startRound(page);
    await playAndFinish(page);
    const wide = await page.evaluate(() => document.querySelector('#lead-chart svg')?.getAttribute('width'));
    await page.setViewportSize({ width: 400, height: 800 });
    await page.waitForFunction(w => document.querySelector('#lead-chart svg')?.getAttribute('width') !== w, wide);
    assert.deepEqual(errors, []);
    await context.close();
});
