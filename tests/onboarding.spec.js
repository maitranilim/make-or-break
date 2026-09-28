const { test, expect } = require('@playwright/test');

// Keep the ad script out of tests: it is slow, flaky offline, and irrelevant here
test.beforeEach(async ({ page }) => {
    await page.route('**/pagead2.googlesyndication.com/**', route => route.abort());
});

const isRunning = page => page.evaluate(() => state.running);
const timeLeft = page => page.evaluate(() => state.timeLeft);

test('first visit shows the tour and the simulation waits for Start', async ({ page }) => {
    await page.goto('/index.html');

    await expect(page.locator('#onboarding')).toBeVisible();
    await expect(page.locator('#onb-count')).toHaveText('1 of 3');
    await page.waitForTimeout(400);
    expect(await isRunning(page)).toBe(false);
    expect(await timeLeft(page)).toBe(60);

    await page.click('#btn-onb-next');
    await expect(page.locator('#onb-count')).toHaveText('2 of 3');
    await page.click('#btn-onb-next');
    await expect(page.locator('#btn-onb-next')).toHaveText('Start simulation');
    await page.click('#btn-onb-next');

    await expect(page.locator('#overlay-start')).toBeHidden();
    expect(await isRunning(page)).toBe(true);
    await expect.poll(() => timeLeft(page)).toBeLessThan(60);
    expect(await page.evaluate(() => localStorage.getItem('mob_onboarded_v1'))).toBe('1');
});

test('returning visitor skips the tour but still has to press Start', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('mob_onboarded_v1', '1'));
    await page.goto('/index.html');

    await expect(page.locator('#onboarding')).toBeHidden();
    await expect(page.locator('#btn-start')).toBeVisible();
    await expect(page.locator('#btn-start')).toBeFocused();
    await page.waitForTimeout(300);
    expect(await isRunning(page)).toBe(false);

    await page.keyboard.press('Enter');
    await expect(page.locator('#overlay-start')).toBeHidden();
    expect(await isRunning(page)).toBe(true);
});

test('Skip remembers the tour was seen without starting the round', async ({ page }) => {
    await page.goto('/index.html');
    await page.click('#btn-onb-skip');

    await expect(page.locator('#start-panel')).toBeVisible();
    expect(await isRunning(page)).toBe(false);

    await page.reload();
    await expect(page.locator('#onboarding')).toBeHidden();
    await expect(page.locator('#start-panel')).toBeVisible();
});

test('How it works reopens the tour from the start panel', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('mob_onboarded_v1', '1'));
    await page.goto('/index.html');
    await page.click('#btn-how');

    await expect(page.locator('#onboarding')).toBeVisible();
    await expect(page.locator('#onb-count')).toHaveText('1 of 3');
});

test('sliders update before the round starts', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('mob_onboarded_v1', '1'));
    await page.goto('/index.html');

    await page.locator('#slider-time').fill('30');
    await expect(page.locator('#val-time')).toHaveText('30s');
    await expect(page.locator('#timer-display')).toHaveText('30');
    await page.locator('#slider-red').fill('800');
    await expect(page.locator('#val-red')).toHaveText('2.0x');
    expect(await isRunning(page)).toBe(false);
});

test('Restart before Start keeps the simulation paused', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('mob_onboarded_v1', '1'));
    await page.goto('/index.html');

    await page.evaluate(() => document.getElementById('btn-reset').click());
    await page.waitForTimeout(300);
    expect(await isRunning(page)).toBe(false);
    await expect(page.locator('#overlay-start')).toBeVisible();
});

test('Play Again after a finished round starts immediately', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('mob_onboarded_v1', '1'));
    await page.goto('/index.html');
    await page.click('#btn-start');

    await page.evaluate(() => { state.timeLeft = 0.01; });
    await expect(page.locator('#overlay-result')).toBeVisible();
    await page.click('#btn-play-again');

    await expect(page.locator('#overlay-result')).toBeHidden();
    expect(await isRunning(page)).toBe(true);
    await expect(page.locator('#overlay-start')).toBeHidden();
});

test('works when storage is blocked: tour shows and Start still runs', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => {
        Object.defineProperty(window, 'localStorage', {
            get() { throw new DOMException('blocked', 'SecurityError'); },
        });
    });
    await page.goto('/index.html');

    await expect(page.locator('#onboarding')).toBeVisible();
    await page.click('#btn-onb-skip');
    await page.click('#btn-start');
    expect(await isRunning(page)).toBe(true);
    expect(errors).toEqual([]);
});
