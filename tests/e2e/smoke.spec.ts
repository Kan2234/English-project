import { attemptFor, expect, expectNoHorizontalScroll, seed, test } from './fixtures';

// Every main route renders its heading (or its "not found" panel), without console/CSP errors (fixture) and
// without sideways scrolling.
const ROUTES: [name: string, hash: string, heading: RegExp | null][] = [
  ['home', '#/', /./],
  ['test intro (mini)', '#/de/mini-test-01', /Mini Test 01/],
  ['test intro (full)', '#/de/full-test-01', /Full Test 01/],
  ['result', '#/ket-qua/smoke-1', /Kết quả/],
  ['practice index', '#/luyen-tap', /Luyện/],
  ['practice part 1', '#/luyen-tap/part-1', /Part 1/],
  ['practice part 3', '#/luyen-tap/part-3', /Part 3/],
  ['practice part 5', '#/luyen-tap/part-5', /Part 5/],
  ['practice part 7', '#/luyen-tap/part-7', /Part 7/],
  ['vocabulary', '#/tu-vung', /Từ vựng/],
  ['flashcards', '#/tu-vung/the', /Thẻ từ vựng/],
  ['grammar', '#/ngu-phap', /Ngữ pháp/],
  ['grammar topic', '#/ngu-phap/word-form', /./],
  ['about the exam', '#/ky-thi', /./],
  ['not found', '#/khong-co-trang-nay', null],
];

test.describe('smoke', () => {
  for (const [name, hash, heading] of ROUTES) {
    test(`${name} renders`, async ({ page, data }) => {
      await seed(page, { 'onta.attempts.v1': [attemptFor(data, 'smoke-1', 0.6, Date.now() - 60_000)] });
      await page.goto(`/${hash}`);
      if (heading) await expect(page.locator('main h1').first()).toHaveText(heading);
      else await expect(page.locator('main .empty')).toBeVisible();
      await expect(page.locator('.loading')).toHaveCount(0);
      await expect(page.getByRole('alert').filter({ hasText: 'Trang gặp lỗi' })).toHaveCount(0);
      if (name === 'not found') await expect(page.locator('body')).toContainText('Không có trang này');
      else await expect(page.locator('body')).not.toContainText('Không có trang này');
      await expectNoHorizontalScroll(page);
    });
  }

  test('main navigation reaches every section', async ({ page }) => {
    await page.goto('/#/');
    const links = page.locator('.site-header .nav a');
    await expect(links).toHaveCount(5);
    for (let i = 0; i < 5; i++) {
      const link = links.nth(i);
      const href = (await link.getAttribute('href'))!;
      await link.click();
      await expect(page).toHaveURL(new RegExp(`${href.replace(/[#/]/g, '\\$&')}$`));
      await expect(link).toHaveAttribute('aria-current', 'page');
    }
  });

  test('opening an exam URL directly does not start the clock', async ({ page }) => {
    await page.goto('/#/de/mini-test-01/lam-bai/full');
    await expect(page).toHaveURL(/#\/de\/mini-test-01$/);
    await expect(page.getByRole('status')).toContainText('chưa bắt đầu');
    await expect(page.locator('.exam-bar')).toHaveCount(0);
  });

  test('loose practice slugs are not pages', async ({ page }) => {
    for (const slug of ['part-3.0', 'part-0x5', 'part-8', 'Part-3', 'part-03', '3']) {
      await page.goto(`/#/luyen-tap/${slug}`);
      await expect(page.locator('body'), slug).toContainText('Không có trang này');
    }
  });

  test('audio is served with Range support', async ({ request, data }) => {
    const url = data.tests[1].sets.find((s) => s.audio_url)!.audio_url!;
    const res = await request.get(`data/${url}`, { headers: { Range: 'bytes=0-99' } });
    expect(res.status()).toBe(206);
    expect(res.headers()['content-range']).toMatch(/^bytes 0-99\/\d+$/);
    expect((await res.body()).length).toBe(100);
  });
});
