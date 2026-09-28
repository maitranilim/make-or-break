// Regenerates the link preview image (og.png) and the README GIF from a fixed seed.
// Run with `npm run media` (needs Playwright's Chromium, plus Python 3 with Pillow for the GIF).
// Set CHROMIUM_PATH to use an already-installed Chromium.
import http from 'node:http';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const root = new URL('../', import.meta.url);
const html = await readFile(new URL('index.html', root));
// A fixed challenge link, so the same round is captured every time
const QUERY = '?seed=brick&breaker=420&builder=400&time=20&chaos=10';
const FPS = 15;
const SIM_STEP = 0.2;   // Seconds of simulation per GIF frame (3x real speed at 15 fps)
const HOLD_FRAMES = 20; // Hold the final grid before the GIF loops

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 900 }, deviceScaleFactor: 1 });
    // Skip the first-run tour so the Start panel is the only overlay
    await page.addInitScript(() => localStorage.setItem('mob_onboarded_v1', '1'));
    await page.goto(base + QUERY);
    await page.waitForFunction(() => bricks.length > 0);

    // Drive the simulation by hand at a fixed step so frames do not depend on machine speed
    const frames = await page.evaluate(({ step, hold }) => {
        startSimulation();
        state.running = false; // Stop the rAF loop from advancing the round on its own
        const grab = () => canvas.toDataURL('image/png');
        const out = [grab()];
        while (!state.gameOver) {
            for (let t = 0; t < step && !state.gameOver; t += 1 / 60) update(1 / 60);
            draw();
            out.push(grab());
        }
        for (let i = 0; i < hold; i++) out.push(out[out.length - 1]);
        return out;
    }, { step: SIM_STEP, hold: HOLD_FRAMES });

    // og.png: a mid-round frame on a 1200x627 card with the title
    const mid = frames[Math.floor((frames.length - HOLD_FRAMES) / 2)];
    const card = await browser.newPage({ viewport: { width: 1200, height: 627 }, deviceScaleFactor: 1 });
    await card.setContent(`<!doctype html><html><body style="margin:0">
        <div style="width:1200px;height:627px;box-sizing:border-box;padding:48px 56px;display:flex;gap:48px;align-items:center;
            background:radial-gradient(circle at 20% 20%,#1c2142,#0b0d16 70%);font-family:'DejaVu Sans',system-ui,sans-serif;color:#eaeaf0">
            <div style="flex:0 0 420px">
                <div style="font-size:22px;letter-spacing:4px;text-transform:uppercase;color:#888999">Brickflux</div>
                <div style="font-size:64px;font-weight:800;line-height:1.05;margin:18px 0 22px">
                    <span style="color:#4dff88">Order</span> vs<br><span style="color:#ff5c5c">Chaos</span></div>
                <div style="font-size:26px;line-height:1.4;color:#c9cad6">Set the rules, start the round, and see who holds the grid.</div>
                <div style="margin-top:28px;font-size:20px;color:#888999">Play free in your browser</div>
            </div>
            <img src="${mid}" style="width:640px;border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.6);border:1px solid #2a2f52">
        </div></body></html>`);
    await card.screenshot({ path: new URL('og.png', root).pathname });
    console.log('wrote og.png');

    // brickflux.gif: every frame, scaled down and quantized by Pillow
    const dir = await mkdtemp(join(tmpdir(), 'brickflux-'));
    try {
        for (let i = 0; i < frames.length; i++) {
            await writeFile(join(dir, `f${String(i).padStart(4, '0')}.png`), Buffer.from(frames[i].split(',')[1], 'base64'));
        }
        execFileSync('python3', ['-c', `
import glob, sys
from PIL import Image
files = sorted(glob.glob(sys.argv[1] + '/f*.png'))
imgs = []
for f in files:
    im = Image.open(f).convert('RGB')
    im = im.resize((600, round(600 * im.height / im.width)), Image.LANCZOS)
    imgs.append(im.quantize(colors=64, method=Image.MEDIANCUT, dither=Image.NONE))
imgs[0].save(sys.argv[2], save_all=True, append_images=imgs[1:], duration=round(1000 / ${FPS}), loop=0, optimize=True)
`, dir, new URL('brickflux.gif', root).pathname], { stdio: 'inherit' });
        console.log(`wrote brickflux.gif (${frames.length} frames)`);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
} finally {
    await browser.close();
    server.close();
}
