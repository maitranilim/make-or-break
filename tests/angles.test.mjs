// Browser tests that balls never travel on (or settle into) a flat, near-axis path. Run with `npm test`.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const html = await readFile(new URL('../index.html', import.meta.url));
let server, browser, page;

before(async () => {
    server = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${server.address().port}/`;
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
    const context = await browser.newContext();
    await context.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
    // Freeze the game loop so the tests drive physics by hand
    await context.addInitScript(() => { window.requestAnimationFrame = () => 0; });
    page = await context.newPage();
    await page.goto(base);
    await page.waitForFunction(() => bricks.length > 0, null, { polling: 50 });
});

after(async () => {
    await browser?.close();
    server?.close();
});

// Smallest angle (degrees) between a velocity and either axis
const axisGap = `(b) => { const a = Math.atan2(Math.abs(b.vy), Math.abs(b.vx)) * 180 / Math.PI; return Math.min(a, 90 - a); }`;

test('launch angles stay clear of the horizontal and vertical axes', async () => {
    const worst = await page.evaluate(gap => {
        const f = eval(gap);
        let min = 90;
        // Sweep the whole circle, including exact axis hits
        for (let i = 0; i <= 3600; i++) {
            rng = () => i / 3600;
            min = Math.min(min, f(createBall(100, 100, '#fff', 'breaker')));
        }
        return min;
    }, axisGap);
    assert.ok(worst >= 14.9, `a ball launched ${worst.toFixed(2)}° off an axis`);
});

test('a ball pushed onto a flat path is steered off it, keeping speed and direction', async () => {
    const out = await page.evaluate(gap => {
        const f = eval(gap);
        const b = balls[0];
        const speed = parseInt(sliderRed.value);
        Object.assign(b, { x: LOGICAL_WIDTH / 2, y: 20, vx: -speed, vy: 0 });
        update(1 / 60);
        return { gap: f(b), speed: Math.hypot(b.vx, b.vy), target: speed, vx: b.vx };
    }, axisGap);
    assert.ok(out.gap >= 14.9, `ball stayed ${out.gap.toFixed(2)}° off the axis`);
    assert.ok(Math.abs(out.speed - out.target) < 1e-6);
    assert.ok(out.vx < 0, 'horizontal direction was flipped');
});
