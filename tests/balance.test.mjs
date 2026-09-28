// Balance test: plays many full rounds headlessly and checks neither side is heavily favoured. Run with `npm test`.
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
    // Seeded Math.random so the result is the same on every run
    await page.addInitScript(() => {
        let s = 20260928;
        Math.random = () => {
            s = (s + 0x6D2B79F5) | 0;
            let t = Math.imul(s ^ (s >>> 15), 1 | s);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    });
    await page.goto(base);
    await page.waitForFunction(() => bricks.length > 0, null, { polling: 50 });
    return { page, context };
}

// Plays `rounds` full rounds at a fixed 60fps step and returns how many the Builder won
function playRounds(page, rounds, chaos) {
    return page.evaluate(({ rounds, chaos }) => {
        sliderChaos.value = chaos;
        let builderWins = 0;
        for (let i = 0; i < rounds; i++) {
            resetSimulation();
            state.running = false; // keep the live loop from stepping this round too
            while (!state.gameOver) update(1 / 60);
            if (bricks.filter(b => b.active).length > bricks.length / 2) builderWins++;
        }
        return builderWins;
    }, { rounds, chaos });
}

test('the grid starts exactly half active', async () => {
    const { page, context } = await open();
    const s = await page.evaluate(() => ({ active: bricks.filter(b => b.active).length, total: bricks.length }));
    assert.equal(s.active, s.total / 2);
    await context.close();
});

for (const chaos of [0, 25]) {
    test(`Builder and Breaker win at roughly even odds at ${chaos}% chaos`, async () => {
        const { page, context } = await open();
        const rounds = 100;
        const builderWins = await playRounds(page, rounds, chaos);
        assert.ok(builderWins >= 35 && builderWins <= 65, `Builder won ${builderWins}/${rounds} rounds`);
        await context.close();
    });
}
