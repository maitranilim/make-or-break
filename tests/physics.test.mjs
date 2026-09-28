// Physics tests: a fast ball on a slow frame bounces off the first brick it meets instead of tunneling through rows.
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

for (const type of ['breaker', 'builder']) {
    test(`a ${type} at top speed on a 0.1s frame only changes the first brick it hits`, async () => {
        const { page, context, errors } = await open();
        const r = await page.evaluate(type => {
            // Drive update() by hand so the animation loop can't move anything in between
            state.running = false;
            checkMulti.checked = false;
            sliderRed.value = sliderRed.max;
            sliderGreen.value = sliderGreen.max;
            sliderChaos.value = 0;
            // Breakers can hit active bricks, builders inactive ones: fill the grid with what this ball hits
            bricks.forEach(b => b.active = type === 'breaker');
            const speed = parseInt(sliderRed.max);
            const bottom = bricks[bricks.length - 1];
            const ball = createBall(bottom.x + bottom.w / 2, bottom.y + bottom.h + 15, '#fff', type);
            ball.vx = 0;
            ball.vy = -speed;
            balls = [ball];
            update(0.1);
            const changed = bricks.filter(b => b.active !== (type === 'breaker'));
            return { changed: changed.map(b => [b.r, b.c]), vy: ball.vy, y: ball.y, lastRow: rows - 1, bottomEdge: bottom.y + bottom.h };
        }, type);
        assert.deepEqual(r.changed.map(([row]) => row), [r.lastRow], 'only one brick in the bottom row should change');
        assert.ok(r.vy > 0, 'the ball should be heading back down');
        assert.ok(r.y - 10 >= r.bottomEdge, 'the ball should be clear of the brick it hit');
        assert.deepEqual(errors, []);
        await context.close();
    });
}
