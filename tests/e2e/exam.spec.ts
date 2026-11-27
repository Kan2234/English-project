import { MINI, examPosition, expect, exam, openSheetIfPanel, press, readStorage, startExam, test } from './fixtures';

const DRAFT = `onta.draft.v1.${MINI}.full`;
const FLAGS = `onta.flags.v1.${MINI}.full`;

interface Draft {
  answers: Record<string, string>;
}
interface Attempt {
  id: string;
  answers: Record<string, string>;
  elapsedSec: number;
}

test.describe('exam (mini test, free mode)', () => {
  test('answer, flag, shortcuts, submit dialog, results', async ({ page, data }) => {
    const sets = exam(data).sets;
    const [s1, s2, s3] = sets;
    await startExam(page);
    await expect(examPosition(page)).toHaveText(`1/${sets.length}`);
    await expect(page.locator('.timer')).toHaveText(/^\d{2}:\d{2}$/);

    // answer the first question by its bubble, then flag it
    await press(page, page.getByRole('radio', { name: 'Đáp án C' }).first());
    await expect.poll(async () => (await readStorage<Draft>(page, DRAFT))?.answers[s1.questions[0].id]).toBe('C');
    await press(page, page.locator('.question .flag-toggle').first());
    await expect(page.locator('.question .flag-toggle').first()).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.sheet__head')).toContainText('1 cần xem lại');
    await expect.poll(async () => (await readStorage<{ flagged: string[] }>(page, FLAGS))?.flagged).toEqual([s1.questions[0].id]);

    // keyboard shortcuts: → next set, a key answers the current question, ← back
    await page.locator('.set-head h2').click();
    await page.keyboard.press('ArrowRight');
    await expect(examPosition(page)).toHaveText(`2/${sets.length}`);
    await page.keyboard.press('b');
    await expect.poll(async () => (await readStorage<Draft>(page, DRAFT))?.answers[s2.questions[0].id]).toBe('B');
    await page.keyboard.press('ArrowRight');
    await expect(examPosition(page)).toHaveText(`3/${sets.length}`);
    await page.keyboard.press('4');
    await expect.poll(async () => (await readStorage<Draft>(page, DRAFT))?.answers[s3.questions[0].id]).toBe('D');
    await page.keyboard.press('ArrowLeft');
    await expect(examPosition(page)).toHaveText(`2/${sets.length}`);

    // the answer sheet jumps to a question
    const p5 = sets.find((s) => s.part === 5)!;
    await openSheetIfPanel(page);
    await press(page, page.locator(`.sheet__row[data-qid="${p5.questions[0].id}"] .sheet__n`));
    await expect(page.locator('.set-head')).toContainText('Part 5');

    // submit dialog: keyboard opens it, focus moves inside, Tab is trapped, Esc closes and restores focus
    const barSubmit = page.locator('.exam-bar .btn--ink');
    await barSubmit.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Nộp bài?' });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('#submit-desc')).toContainText(`còn ${sets.flatMap((s) => s.questions).length - 3} câu chưa trả lời`);
    await expect(dialog.locator('#submit-desc')).toContainText('Còn 1 câu bạn đánh dấu xem lại');
    const focusInDialog = () => page.evaluate(() => !!document.activeElement?.closest('.dialog'));
    expect(await focusInDialog()).toBe(true);
    for (const key of ['Tab', 'Tab', 'Tab', 'Shift+Tab', 'Shift+Tab', 'Shift+Tab', 'Shift+Tab']) {
      await page.keyboard.press(key);
      expect(await focusInDialog(), key).toBe(true);
    }
    // shortcuts are ignored while the dialog is open
    await page.keyboard.press('ArrowRight');
    await expect(examPosition(page)).toContainText(`${sets.indexOf(p5) + 1}/`);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(barSubmit).toBeFocused();

    // the backdrop closes it too, then submit for real
    await press(page, barSubmit);
    await expect(dialog).toBeVisible();
    await page.mouse.click(5, 5);
    await expect(dialog).toHaveCount(0);
    await press(page, barSubmit);
    await press(page, dialog.getByRole('button', { name: 'Nộp bài' }));

    await expect(page).toHaveURL(/#\/ket-qua\/[0-9a-z]+$/);
    const left = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('onta.draft') || k.startsWith('onta.flags')));
    expect(left).toEqual([]);
    const [saved] = (await readStorage<Attempt[]>(page, 'onta.attempts.v1'))!;
    expect(saved.elapsedSec).toBeGreaterThanOrEqual(0);
    expect(saved.answers).toMatchObject({ [s1.questions[0].id]: 'C', [s2.questions[0].id]: 'B', [s3.questions[0].id]: 'D' });

    // results: total out of 990, both sections with their own CEFR estimate
    await expect(page.locator('.score__of')).toHaveText('/ 990 điểm');
    const sections = page.locator('.score__sections > div').filter({ hasText: '≈' });
    await expect(sections).toHaveCount(2);
    for (const s of await sections.all()) await expect(s).toContainText(/≈ (Dưới A1|A1|A2|B1|B2|C1)/);
    await expect(page.locator('.study-total')).toContainText('/990');
    await expect(page.locator('.study-level__cefr')).toHaveCount(2);
  });

  test('a draft resumes with its answers and the clock', async ({ page, data }) => {
    const sets = exam(data).sets;
    await startExam(page, { scope: 2 }); // reading only
    await press(page, page.locator('.question .choice').first());
    await page.goto(`/#/de/${MINI}`);
    const reading = page.locator('.toc li').nth(2);
    await expect(reading).toContainText('Bài đang làm dở: 1 câu đã trả lời');
    await press(page, reading.getByRole('button', { name: 'Làm tiếp' }));
    await expect(page.locator('.sheet__head')).toContainText('1/');
    await expect(page.locator('.question [role="radio"][aria-checked="true"]')).toHaveCount(1);
    expect(sets.length).toBeGreaterThan(0);
  });
});
