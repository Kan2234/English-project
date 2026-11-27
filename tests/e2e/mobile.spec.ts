import { attemptFor, examPosition, expect, expectNoHorizontalScroll, exam, isTouch, seed, startExam, test } from './fixtures';

// Touch layouts only (mobile-375 and tablet-768 projects).
test.beforeEach(() => {
  test.skip(!isTouch(), 'touch/mobile layout only');
});

test.describe('mobile', () => {
  test('answer sheet panel: toggle, close button, backdrop, jump', async ({ page, data }) => {
    const sets = exam(data).sets;
    await startExam(page);
    const aside = page.locator('.exam__aside');
    const toggle = page.locator('.sheet-toggle');

    // the exam bar stays on one row and the keyboard hint is hidden on touch screens
    const tops = await page.locator('.exam-bar__inner > *').evaluateAll((els) =>
      els.filter((e) => getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0).map((e) => Math.round(e.getBoundingClientRect().top)),
    );
    expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(12);
    await expect(page.locator('.exam__keys')).toBeHidden();

    await toggle.tap();
    await expect(aside).toHaveClass(/is-open/);
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const close = page.getByRole('button', { name: 'Đóng phiếu trả lời' });
    await expect(close).toBeInViewport();
    await close.tap();
    await expect(aside).not.toHaveClass(/is-open/);
    await expect(toggle).toBeFocused();

    // a tap on the dimmed area above the panel closes it
    await toggle.tap();
    await expect(aside).toHaveClass(/is-open/);
    const panelTop = (await page.locator('.exam__panel').boundingBox())!.y;
    const barBottom = await page.locator('.exam-bar').evaluate((e) => e.getBoundingClientRect().bottom);
    const viewport = page.viewportSize()!;
    await page.touchscreen.tap(viewport.width / 2, Math.round((panelTop + barBottom) / 2));
    await expect(aside).not.toHaveClass(/is-open/);

    // tapping a question number jumps there and closes the panel
    const p7 = sets.filter((s) => s.part === 7).at(-1)!;
    await toggle.tap();
    await page.locator(`.sheet__row[data-qid="${p7.questions[0].id}"] .sheet__n`).tap();
    await expect(aside).not.toHaveClass(/is-open/);
    await expect(examPosition(page)).toHaveText(`${sets.indexOf(p7) + 1}/${sets.length}`);
    await expectNoHorizontalScroll(page);
  });

  test('site header: scrolls away on phones, stays on tablets', async ({ page }) => {
    await page.goto('/#/');
    const header = page.locator('.site-header');
    await expect(header.locator('.nav a')).toHaveCount(5);
    for (const a of await header.locator('.nav a').all()) await expect(a).toBeInViewport({ ratio: 1 });
    await page.evaluate(() => window.scrollTo(0, 600));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    const bottom = await header.evaluate((e) => e.getBoundingClientRect().bottom);
    if (page.viewportSize()!.width <= 640) expect(bottom, 'phone header scrolls away').toBeLessThanOrEqual(0);
    else expect(bottom, 'tablet header stays sticky').toBeGreaterThan(0);
  });

  test('score chart: the first tap selects the tapped attempt', async ({ page, data }) => {
    const DAY = 86_400_000;
    const now = Date.now();
    const attempts = [0.3, 0.5, 0.7, 0.9].map((acc, i) => attemptFor(data, `c${i}`, acc, now - (4 - i) * DAY, 'full-test-01'));
    await seed(page, { 'onta.attempts.v1': attempts });
    await page.reload({ waitUntil: 'domcontentloaded' }); // not 'load' (see storage.spec.ts)
    const plot = page.locator('.sc__plot');
    await plot.scrollIntoViewIfNeeded();
    const box = (await plot.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);

    const dates = await page.evaluate((ts) => ts.map((t) => new Date(t).toLocaleDateString('vi-VN')), attempts.map((a) => a.finishedAt));
    const head = page.locator('.sc__tip-head');
    await page.touchscreen.tap(box.x + box.width * 0.12, box.y + box.height / 2);
    await expect(head).toContainText(dates[0]); // the oldest point, not the newest (keyboard default)
    const tip = (await page.locator('.sc__tip').boundingBox())!;
    expect(tip.x).toBeGreaterThanOrEqual(0);
    expect(tip.x + tip.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    await page.touchscreen.tap(box.x + box.width * 0.97, box.y + box.height / 2);
    await expect(head).toContainText(dates[3]);
    await expectNoHorizontalScroll(page);
  });
});
