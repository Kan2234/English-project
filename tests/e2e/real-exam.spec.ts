import type { Page } from '@playwright/test';
import { MINI, examPosition, expect, exam, readStorage, startExam, test } from './fixtures';

const FLAGS = `onta.flags.v1.${MINI}.full`;
const DRAFT = `onta.draft.v1.${MINI}.full`;

interface AudioState {
  file: string;
  paused: boolean;
  t: number;
  duration: number;
}
const audio = (page: Page) =>
  page.evaluate((): AudioState | null => {
    const a = document.querySelector('audio');
    return a ? { file: a.src.split('?')[0].split('/').pop()!, paused: a.paused, t: a.currentTime, duration: a.duration } : null;
  });
const fileOf = (url: string | null | undefined) => url!.split('?')[0].split('/').pop()!;

/** Waits until the <audio> for `file` is really playing (time moves forward). */
async function expectPlaying(page: Page, file: string) {
  await expect
    .poll(async () => {
      const a = await audio(page);
      return !!a && a.file === file && !a.paused && a.t > 0.2;
    }, { timeout: 15_000 })
    .toBe(true);
}

test.describe('real-exam mode @slow', () => {
  test('audio plays once; external pause and seek are undone; played sets show "đã phát"', async ({ page, data, browserName }) => {
    const sets = exam(data).sets;
    const [s1, s2] = sets;
    await startExam(page, { strict: true });
    await expect(page.locator('.exam-bar__title')).toContainText('Thi thật');

    // one press starts the audio; there is no way to pause, seek or change speed
    await page.locator('.player-start').click();
    await expectPlaying(page, fileOf(s1.audio_url));
    if (browserName === 'firefox') await page.waitForFunction(() => document.querySelector('audio')?.error, null, { timeout: 1_500 }).catch(() => {});
    const sinkError = await page.evaluate(() => document.querySelector('audio')?.error?.message ?? '');
    test.fixme(
      sinkError.includes('MediaSink'),
      'No audio output device: Firefox in the Playwright Docker image has no PulseAudio, so playback stops with ' +
        'NS_ERROR_DOM_MEDIA_MEDIASINK_ERR and the player shows "Không phát được file audio này". Runs where Firefox has audio.',
    );
    await expect(page.locator('.player__play')).toBeDisabled();
    await expect(page.locator('.player__track')).toBeDisabled();
    await expect(page.locator('.player__speed')).toHaveCount(0);
    await expect.poll(async () => (await readStorage<{ played: string[] }>(page, FLAGS))?.played).toEqual([s1.id]);

    // a pause from outside the page (media key, DevTools, extension) is undone
    const before = (await audio(page))!.t;
    await page.evaluate(() => document.querySelector('audio')!.pause());
    await expect.poll(async () => (await audio(page))?.paused, { timeout: 5_000 }).toBe(false);
    expect((await audio(page))!.t).toBeGreaterThanOrEqual(before);

    // a seek from outside the page is undone: the position stays near where playback was
    const at = (await audio(page))!.t;
    await page.evaluate(() => {
      const a = document.querySelector('audio')!;
      a.currentTime = Math.max(0, a.duration - 0.5);
    });
    await expect.poll(async () => (await audio(page))!.t, { timeout: 5_000 }).toBeLessThan(at + 3);
    const back = (await audio(page))!;
    expect(back.paused).toBe(false);
    expect(back.t).toBeLessThan(back.duration - 1);

    // → next set autoplays; ← back to set 1 shows the "already played" notice, no player
    await page.locator('.set-head h2').click();
    await page.keyboard.press('ArrowRight');
    await expect(examPosition(page)).toHaveText(`2/${sets.length}`);
    await expectPlaying(page, fileOf(s2.audio_url));
    await expect.poll(async () => (await readStorage<{ played: string[] }>(page, FLAGS))?.played).toEqual([s1.id, s2.id]);

    await page.keyboard.press('ArrowLeft');
    await expect(examPosition(page)).toHaveText(`1/${sets.length}`);
    const spent = page.locator('.audio-spent');
    await expect(spent).toContainText('Audio nhóm này đã phát');
    await expect(page.locator('audio')).toHaveCount(0);

    // answers on a played set can still be changed
    await page.keyboard.press('b');
    await expect.poll(async () => (await readStorage<{ answers: Record<string, string> }>(page, DRAFT))?.answers[s1.questions[0].id]).toBe('B');

    // after a reload the played set still never plays again, and the mode is kept
    await page.reload();
    await expect(page.locator('.exam-bar__title')).toContainText('Thi thật');
    await expect(spent).toBeVisible();
    await expect(page.locator('audio')).toHaveCount(0);
    // the notice's own button moves on; set 2 was played too, so it shows the notice as well
    await spent.getByRole('button').click();
    await expect(examPosition(page)).toHaveText(`2/${sets.length}`);
    await expect(spent).toBeVisible();
    await expect(page.locator('audio')).toHaveCount(0);
  });
});
