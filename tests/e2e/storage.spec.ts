import { expect, test } from './fixtures';

// Stored values are untrusted (older app versions, extensions, hand editing).
// With every onta.* key corrupted, no route may crash, log an error or show the error screen.
const KEYS = [
  'onta.attempts.v1',
  'onta.draft.v1.mini-test-01.full',
  'onta.draft.v1.mini-test-01.listening',
  'onta.flags.v1.mini-test-01.full',
  'onta.practice.v1',
  'onta.practice.pos.v1',
  'onta.vocab.learned.v1',
  'onta.cards.v1',
  'onta.activity.v1',
];

const VALUES: Record<string, string> = {
  'broken JSON': '{',
  null: 'null',
  'empty array': '[]',
  string: '"x"',
  'huge number': '1e999',
  'proto pollution': '{"__proto__":{"polluted":1},"constructor":{"prototype":{"x":1}}}',
  'attempt with bad answer': '[{"id":"a","testId":"mini-test-01","scope":"full","answers":{"x":"Z"},"startedAt":1,"finishedAt":2,"elapsedSec":3}]',
  'draft of wrong types': '{"answers":[],"startedAt":"x","remainingSec":null,"current":-1}',
  'flags of wrong types': '{"startedAt":1,"flagged":"abc","strict":"yes","played":{}}',
  'cards of wrong types': '{"w|n|t":{"box":99,"due":"x","reps":-1},"":{"box":1,"due":1,"reps":0}}',
  'array of junk': '[1,"x",null,{},[]]',
};

const ROUTES = [
  '#/',
  '#/de/mini-test-01',
  '#/de/mini-test-01/lam-bai/full',
  '#/ket-qua/a',
  '#/luyen-tap',
  '#/luyen-tap/part-5',
  '#/tu-vung',
  '#/tu-vung/the',
  '#/ngu-phap',
  '#/ky-thi',
];

test.describe('storage robustness', () => {
  for (const [name, value] of Object.entries(VALUES)) {
    test(`every onta.* key = ${name}: no route crashes`, async ({ page }) => {
      await page.goto('/#/');
      await page.evaluate(
        ([keys, v]) => {
          localStorage.clear();
          for (const k of keys) localStorage.setItem(k, v);
        },
        [KEYS, value] as const,
      );
      for (const route of ROUTES) {
        await page.goto(`/${route}`);
        // Read storage on a fresh page load, not only on route change. 'domcontentloaded', not
        // the default 'load': over the internet Firefox sometimes never fires `load` within
        // the timeout; the assertions below wait for the app itself.
        await page.reload({ waitUntil: 'domcontentloaded' });
        await expect(page.locator('main h1, main .empty, .exam-bar').first(), route).toBeAttached();
        await expect(page.locator('.loading'), route).toHaveCount(0); // data loaded: the page really rendered with the stored values
        await expect(page.getByText('Trang gặp lỗi khi hiển thị.'), route).toHaveCount(0);
      }
      expect(await page.evaluate(() => ({} as Record<string, unknown>).polluted)).toBeUndefined();
    });
  }
});
