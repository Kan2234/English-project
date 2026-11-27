// Shared Playwright fixtures for the On-TA E2E suite.
//
// Every test fails if the page logs a console error, throws an uncaught error,
// opens a JS dialog or triggers a Content-Security-Policy violation.
import { test as base, expect, type Locator, type Page } from '@playwright/test';
import type { Bundle, Label, Question, QuestionSet, Test } from '../../src/lib/types';

export { expect };

interface Fixtures {
  /** problems collected while the test ran; checked automatically at the end */
  problems: string[];
}
interface WorkerFixtures {
  data: Bundle;
}

/**
 * Chromium logs that it ignored Cross-Origin-Opener-Policy when the site is plain HTTP on
 * a host that is not localhost (e.g. http://host.docker.internal:8081 from the Docker image).
 * That is a property of the test setup, not of the app: on 127.0.0.1 or HTTPS it never appears.
 */
function isUntrustedOriginNotice(url: string, text: string) {
  const u = new URL(url);
  const trustworthy = u.protocol === 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
  return !trustworthy && text.startsWith("The Cross-Origin-Opener-Policy header has been ignored, because the URL's origin was untrustworthy.");
}

export const test = base.extend<Fixtures, WorkerFixtures>({
  data: [
    async ({ playwright }, use, workerInfo) => {
      const ctx = await playwright.request.newContext({ baseURL: workerInfo.project.use.baseURL });
      const res = await ctx.get('data/toeic.json');
      expect(res.ok(), 'toeic.json must load').toBe(true);
      await use((await res.json()) as Bundle);
      await ctx.dispose();
    },
    { scope: 'worker' },
  ],
  problems: [
    async ({ page }, use) => {
      const problems: string[] = [];
      await page.addInitScript(() => {
        document.addEventListener('securitypolicyviolation', (e) => {
          console.error(`CSP-VIOLATION ${e.violatedDirective} ${e.blockedURI}`);
        });
      });
      page.on('pageerror', (e) => problems.push(`pageerror @${page.url()}: ${e.message}`));
      page.on('console', (m) => {
        if (m.type() !== 'error' || isUntrustedOriginNotice(page.url(), m.text())) return;
        problems.push(`console.error @${page.url()}: ${m.text()}`);
      });
      page.on('dialog', (d) => {
        problems.push(`dialog @${page.url()}: ${d.type()} ${d.message()}`);
        void d.dismiss().catch(() => {});
      });
      await use(problems);
      expect(problems, 'console errors, page errors, dialogs or CSP violations').toEqual([]);
    },
    { auto: true },
  ],
});

// ------------------------------------------------------------------ data helpers

export const MINI = 'mini-test-01';
export const exam = (data: Bundle, id = MINI): Test => data.tests.find((t) => t.id === id)!;
export const allQuestions = (data: Bundle): Question[] => data.tests.flatMap((t) => t.sets.flatMap((s) => s.questions));
export const wrongLabel = (q: Question): Label => (Object.keys(q.choices) as Label[]).find((l) => l !== q.answer)!;

/** Practice order for one part: practice bank first, then the mini test (never the full test). */
export function practiceOrder(data: Bundle, part: number): { set: QuestionSet; test: Test }[] {
  const rank = { 'part-drill': 0, mini: 1 } as Record<string, number | undefined>;
  return data.tests
    .filter((t) => rank[t.test_type] !== undefined)
    .sort((a, b) => rank[a.test_type]! - rank[b.test_type]!)
    .flatMap((t) => t.sets.filter((s) => s.part === part).map((set) => ({ set, test: t })));
}

/** A saved attempt in the app's own storage format. */
export function attemptFor(data: Bundle, id: string, accuracy: number, finishedAt: number, testId = MINI) {
  const t = exam(data, testId);
  const qs = t.sets.flatMap((s) => s.questions);
  const answers = Object.fromEntries(qs.map((q, i) => [q.id, (i * 37) % 100 < accuracy * 100 ? q.answer : wrongLabel(q)]));
  return { id, testId, scope: 'full', answers, startedAt: finishedAt - 3_000_000, finishedAt, elapsedSec: 3000 };
}

// ------------------------------------------------------------------ page helpers

/** Loads the app once, then writes localStorage entries (values are JSON-encoded unless already strings). */
export async function seed(page: Page, entries: Record<string, unknown>) {
  await page.goto('/#/');
  await page.locator('.site-header').waitFor();
  await page.evaluate((e) => {
    localStorage.clear();
    for (const [k, v] of Object.entries(e)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
  }, entries);
}

export const readStorage = <T>(page: Page, key: string) =>
  page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null') as unknown, key) as Promise<T>;

/** The page never scrolls sideways (elements may overflow inside their own scroll boxes). */
export async function expectNoHorizontalScroll(page: Page) {
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  expect(sw, `scrollWidth ${sw} > innerWidth ${iw}`).toBeLessThanOrEqual(iw);
}

/** Tap on touch projects, click elsewhere. */
export async function press(page: Page, loc: Locator) {
  if (test.info().project.use.hasTouch) await loc.tap();
  else await loc.click();
}

export const isTouch = () => !!test.info().project.use.hasTouch;

/** Starts a scope of a test from its intro page. */
export async function startExam(page: Page, opts: { testId?: string; scope?: 0 | 1 | 2; strict?: boolean } = {}) {
  await page.goto(`/#/de/${opts.testId ?? MINI}`);
  await page.locator('.toc li').first().waitFor();
  if (opts.strict) await press(page, page.locator('.mode-pick__opt').nth(1));
  await press(page, page.locator('.toc li').nth(opts.scope ?? 0).locator('button').last());
  await expect(page.locator('.exam-bar')).toBeVisible();
}

export const examPosition = (page: Page) => page.locator('.exam__nav .small');

/** At ≤980px the answer sheet is a bottom panel behind a toggle; open it when it is. */
export async function openSheetIfPanel(page: Page) {
  const toggle = page.locator('.sheet-toggle');
  if (!(await toggle.isVisible())) return;
  await press(page, toggle);
  await expect(page.locator('.exam__aside')).toHaveClass(/is-open/);
}
