import { expect, isTouch, press, readStorage, test } from './fixtures';

interface Card {
  box: number;
  due: number;
  reps: number;
}

test.describe('flashcards', () => {
  test('flip, rate, "Chưa nhớ" comes back, end screen', async ({ page }) => {
    await page.goto('/#/tu-vung/the');
    const word = page.locator('.fc__word');
    const stats = page.locator('.fc-stats');
    await expect(stats).toContainText('còn 10 thẻ trong lượt này');
    const firstWord = (await word.textContent())!;

    const flip = page.getByRole('button', { name: /Lật thẻ/ });
    const rateBtn = (label: RegExp) => page.locator('.fc__rate').getByRole('button', { name: label });

    // flip shows the back and the three ratings with their next interval
    await press(page, flip);
    await expect(page.locator('.fc__rate')).toBeVisible();
    await expect(page.locator('.fc__side[aria-live] .fc__meaning')).toBeVisible();
    await expect(rateBtn(/Chưa nhớ/)).toContainText('gặp lại ngay');
    await expect(rateBtn(/Nhớ mờ/)).toContainText('ngày mai');
    await expect(rateBtn(/Nhớ rõ/)).toContainText('3 ngày nữa');

    // "Chưa nhớ" sends the card to the end of this session
    await press(page, rateBtn(/Chưa nhớ/));
    await expect(word).not.toHaveText(firstWord);
    await expect(stats).toContainText('còn 10 thẻ trong lượt này');

    for (let i = 0; i < 10; i++) {
      await press(page, flip);
      await press(page, rateBtn(/Nhớ rõ/));
    }

    const done = page.locator('.fc-done');
    await expect(done).toContainText('Xong lượt này: bạn đã ôn 11 lần.');
    await expect(done.getByRole('button', { name: /Học thêm 10 từ mới/ })).toBeVisible();

    const cards = (await readStorage<Record<string, Card>>(page, 'onta.cards.v1'))!;
    expect(Object.keys(cards)).toHaveLength(10);
    const firstKey = Object.keys(cards).find((k) => k.startsWith(`${firstWord}|`))!;
    expect(cards[firstKey]).toMatchObject({ box: 2, reps: 2 });
    expect(Object.values(cards).every((c) => c.box === 2)).toBe(true);
    expect((await readStorage<number[]>(page, 'onta.activity.v1'))!.length).toBe(1);

    // "Học thêm" starts the next 10 new words
    await press(page, done.getByRole('button', { name: /Học thêm/ }));
    await expect(stats).toContainText('còn 10 thẻ trong lượt này');
    await expect(stats).toContainText('đã học 10');
  });

  test('keyboard: Space flips, 1-3 rate', async ({ page }) => {
    test.skip(isTouch(), 'keyboard shortcuts are a desktop feature');
    await page.goto('/#/tu-vung/the');
    const word = page.locator('.fc__word');
    const first = (await word.textContent())!;
    await page.locator('h1').click();
    await page.keyboard.press('2'); // ignored before flipping
    await expect(word).toHaveText(first);
    await page.keyboard.press('Space');
    await expect(page.locator('.fc__rate')).toBeVisible();
    await page.keyboard.press('2');
    await expect(word).not.toHaveText(first);
    await expect(page.locator('.fc__flip')).toBeVisible();
  });
});
