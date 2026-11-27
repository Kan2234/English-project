import type { Page } from '@playwright/test';
import type { Label, Question } from '../../src/lib/types';
import { expect, practiceOrder, press, readStorage, test, wrongLabel } from './fixtures';

/** The start of a translation's first line (enough to identify it, no line breaks). */
const firstLine = (text: string | undefined) => text!.split(/\r?\n/)[0].slice(0, 20);
const pick = (page: Page, q: Question, l: Label) => press(page, page.locator(`#q-${q.id} [role="radio"][aria-label^="${l}. "]`));

test.describe('practice by part', () => {
  test('bank first, explanations, translation, resume, wrong-answer mode, reset', async ({ page, data }) => {
    const order = practiceOrder(data, 3);
    const first = order[0];
    expect(first.test.test_type).toBe('part-drill');
    await page.goto('/#/luyen-tap/part-3');

    // the practice bank comes first, never the full test
    await expect(page.locator('p.study-gap').first()).toContainText(`Nhóm 1/${order.length}, lấy từ ${first.test.title}`);
    await expect(page.locator('.question').first()).toHaveAttribute('id', `q-${first.set.questions[0].id}`);
    await expect(page.locator('.vi-toggle__btn')).toHaveCount(0); // translation only after answering

    // answer the first question wrong, the others right
    const [q1, ...rest] = first.set.questions;
    await pick(page, q1, wrongLabel(q1));
    for (const q of rest) await pick(page, q, q.answer);

    const block = page.locator(`#q-${q1.id}`);
    await expect(block.locator('.explain__verdict')).toHaveText(`Sai: bạn chọn ${wrongLabel(q1)}, đáp án đúng là ${q1.answer}`);
    await expect(block.locator('.explain__vi')).toBeVisible();
    // why-wrong list: one line per wrong choice, the learner's pick marked
    const why = block.locator('.why-wrong li');
    await expect(why).toHaveCount(Object.keys(q1.why_wrong_vi ?? {}).length);
    await expect(block.locator('.why-wrong li.is-picked')).toContainText('(bạn chọn)');
    await expect(page.locator(`#q-${rest[0].id} .explain__verdict`)).toHaveText(`Đúng: ${rest[0].answer}`);

    // translation of the transcript, on request
    const toggle = page.locator('.vi-toggle__btn').first();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await press(page, toggle);
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.vi-panel').first()).toBeVisible();
    await expect(page.locator('.vi-panel').first()).toContainText(firstLine(first.set.transcript_vi));

    const wrongTab = page.getByRole('tab', { name: /Luyện lại câu sai/ });
    await expect(wrongTab).toHaveText('Luyện lại câu sai (1)');

    // move on, reload: practice resumes at set 2
    await press(page, page.getByRole('button', { name: 'Nhóm tiếp theo' }));
    await expect(page.locator('p.study-gap').first()).toContainText(`Nhóm 2/${order.length}`);
    await expect.poll(() => readStorage<Record<string, string>>(page, 'onta.practice.pos.v1')).toEqual({ 3: order[1].set.id });
    await page.reload();
    await expect(page.getByText('Bạn đang học tiếp từ nhóm 2.')).toBeVisible();
    await expect(page.locator('.question').first()).toHaveAttribute('id', `q-${order[1].set.questions[0].id}`);

    // wrong-answer mode shows only the question answered wrong
    await press(page, wrongTab);
    await expect(wrongTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.question')).toHaveCount(1);
    await expect(page.locator('.question')).toHaveAttribute('id', `q-${q1.id}`);
    await pick(page, q1, q1.answer);
    await expect(page.locator(`#q-${q1.id} .explain__verdict`)).toHaveText(`Đúng: ${q1.answer}`);
    await expect(wrongTab).toHaveText('Luyện lại câu sai (0)');
    await press(page, page.getByRole('button', { name: 'Xong, về tất cả nhóm' }));
    await expect(page.getByRole('tab', { name: /Tất cả nhóm/ })).toHaveAttribute('aria-selected', 'true');

    // reset forgets this part only
    await page.evaluate(() => {
      const p = JSON.parse(localStorage.getItem('onta.practice.v1') ?? '{}') as Record<string, boolean>;
      localStorage.setItem('onta.practice.v1', JSON.stringify({ ...p, 'other-part-q': false }));
    });
    await press(page, page.getByRole('button', { name: 'Xóa tiến độ Part 3' }));
    await press(page, page.getByRole('button', { name: 'Xóa tiến độ', exact: true }));
    await expect(page.getByRole('status').filter({ hasText: 'Đã xóa tiến độ Part 3' })).toBeVisible();
    await expect(page.locator('p.study-gap').filter({ hasText: 'Nhóm 1/' })).toBeVisible();
    expect(await readStorage(page, 'onta.practice.v1')).toEqual({ 'other-part-q': false });
  });

  test('Part 7 passages have a translation after answering', async ({ page, data }) => {
    const [first] = practiceOrder(data, 7);
    await page.goto('/#/luyen-tap/part-7');
    for (const q of first.set.questions) await pick(page, q, q.answer);
    const toggle = page.locator('.vi-toggle__btn').first();
    await press(page, toggle);
    await expect(page.locator('.vi-panel').first()).toContainText(firstLine(first.set.passages![0].text_vi));
  });
});
