import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../../lib/data';
import { PART_NAMES, SCOPE_NAMES, examTests, formatClock, grade, practiceSets, questionsOf, scopeMinutes, setsInScope } from '../../lib/exam';
import { listAttempts, loadDraft, loadPractice, loadPracticePosition, wrongInPractice } from '../../lib/storage';
import { dayOf, dueCount, loadActivity, loadCards, streak } from '../../lib/progress';
import type { Bundle, Scope } from '../../lib/types';

interface Step {
  title: string;
  /** one line: why this step, from the learner's own data */
  why: string;
  to: string;
  cta: string;
}

const SCOPES: Scope[] = ['full', 'listening', 'reading'];
const dateVi = (ts: number) => new Date(ts).toLocaleDateString('vi-VN', { day: 'numeric', month: 'numeric' });

/**
 * The candidate next steps, most useful first. The rules are deliberately simple:
 * 1. an exam left half-done; 2. first visit: the mini test; 3. many wrong practice answers;
 * 4. the weakest part of the last attempt; 5. flashcards due; 6. a few wrong practice answers;
 * 7. a part left mid-way; 8. a full test after only short ones; 9. start the flashcards.
 */
function nextSteps(data: Bundle): Step[] {
  const steps: Step[] = [];
  // Only attempts on a timed exam count; a stored attempt that names a practice
  // bank (part-drill) or an unknown test is ignored.
  const exams = examTests(data);
  const attempts = listAttempts().filter((a) => exams.some((t) => t.id === a.testId));
  const practice = loadPractice();
  const cards = loadCards();
  const mini = data.tests.find((t) => t.test_type === 'mini');
  const full = data.tests.find((t) => t.test_type === 'full');

  // 1. newest unfinished exam
  let draft: { testId: string; title: string; scope: Scope; startedAt: number; remainingSec: number; done: number; count: number } | null = null;
  for (const t of examTests(data))
    for (const scope of SCOPES) {
      const d = loadDraft(t.id, scope, scopeMinutes(t, scope) * 60);
      if (!d || (draft && draft.startedAt >= d.startedAt)) continue;
      const qs = questionsOf(setsInScope(t, scope));
      draft = { testId: t.id, title: t.title, scope, startedAt: d.startedAt, remainingSec: d.remainingSec, done: qs.filter((q) => d.answers[q.id]).length, count: qs.length };
    }
  if (draft)
    steps.push({
      title: `Làm tiếp ${draft.title}`,
      why: `${SCOPE_NAMES[draft.scope]} đang làm dở: đã trả lời ${draft.done}/${draft.count} câu, còn ${formatClock(draft.remainingSec)}.`,
      to: `/de/${draft.testId}/lam-bai/${draft.scope}`,
      cta: 'Làm tiếp',
    });

  // 2. nothing done yet anywhere
  const fresh = attempts.length === 0 && Object.keys(practice).length === 0;
  const miniStep = (why: string): Step | null =>
    mini ? { title: 'Làm Mini Test để biết trình độ', why, to: `/de/${mini.id}`, cta: 'Làm Mini Test' } : null;
  if (fresh && !draft) {
    const m = miniStep('Bạn chưa làm bài nào. Đề rút gọn đủ 7 phần cho biết bạn đang ở mức điểm nào.');
    if (m) steps.push(m);
  }

  // practice answers still wrong, per part
  const wrongByPart = [1, 2, 3, 4, 5, 6, 7]
    .map((part) => {
      const ids = practiceSets(data, part).flatMap((x) => x.set.questions.map((q) => q.id));
      return { part, n: wrongInPractice(ids, practice).length };
    })
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n || a.part - b.part);
  const wrongTotal = wrongByPart.reduce((s, x) => s + x.n, 0);
  const wrongStep = (): Step => {
    const w = wrongByPart[0];
    const others = wrongTotal - w.n;
    return {
      title: `Làm lại ${w.n} câu sai ở Part ${w.part}`,
      why: `Câu làm sai khi luyện chưa được làm đúng lại${others > 0 ? ` (các Part khác còn ${others} câu)` : ''}. Mở Part ${w.part}, chọn “Luyện lại câu sai”.`,
      to: `/luyen-tap/part-${w.part}`,
      cta: 'Làm lại câu sai',
    };
  };
  // 3.
  if (wrongTotal >= 5) steps.push(wrongStep());

  // 4. weakest part of the newest attempt
  const last = attempts[0];
  if (last) {
    const test = exams.find((t) => t.id === last.testId)!;
    const weak = grade(data, test, last.scope, last.answers)
      .byPart.filter((p) => p.correct < p.total)
      .sort((a, b) => a.correct / a.total - b.correct / b.total || a.part - b.part)[0];
    if (weak)
      steps.push({
        title: `Luyện Part ${weak.part}: ${PART_NAMES[weak.part]}`,
        why: `Bài gần nhất (${dateVi(last.finishedAt)}) bạn đúng ${weak.correct}/${weak.total} câu Part ${weak.part}, thấp nhất trong các phần.`,
        to: `/luyen-tap/part-${weak.part}`,
        cta: `Luyện Part ${weak.part}`,
      });
  }

  // 5. flashcards due
  const due = dueCount(data.vocabulary, cards);
  if (due > 0)
    steps.push({
      title: `Ôn ${due} thẻ từ vựng đến hạn`,
      why: 'Ôn đúng lúc sắp quên giúp nhớ lâu hơn học dồn một lần.',
      to: '/tu-vung/the',
      cta: 'Ôn thẻ',
    });

  // 6.
  if (wrongTotal > 0 && wrongTotal < 5) steps.push(wrongStep());

  // 7. a part left mid-way (the lowest part number with a saved position past its first set)
  for (const part of [1, 2, 3, 4, 5, 6, 7]) {
    const saved = loadPracticePosition(part);
    if (!saved) continue;
    // same sets and order as the practice page, so "nhóm X/Y" matches what it shows
    const sets = practiceSets(data, part).map((x) => x.set);
    const at = sets.findIndex((s) => s.id === saved);
    if (at <= 0) continue;
    steps.push({
      title: `Học tiếp Part ${part}: ${PART_NAMES[part]}`,
      why: `Bạn đang ở nhóm ${at + 1}/${sets.length} của Part ${part}.`,
      to: `/luyen-tap/part-${part}`,
      cta: 'Học tiếp',
    });
    break;
  }

  // 8. only short tests so far
  if (full && attempts.length > 0 && !attempts.some((a) => a.testId === full.id && a.scope === 'full'))
    steps.push({
      title: `Làm ${full.title}`,
      why: 'Bạn mới làm đề rút gọn hoặc một phần. Đề đầy đủ cho điểm ước tính sát với đề thật hơn.',
      to: `/de/${full.id}`,
      cta: 'Xem đề',
    });

  // 9. never opened the flashcards
  if (cards.size === 0)
    steps.push({
      title: 'Học từ vựng bằng thẻ',
      why: 'Mỗi lượt 10 từ mới; thẻ tự quay lại đúng lúc bạn sắp quên.',
      to: '/tu-vung/the',
      cta: 'Bắt đầu học thẻ',
    });

  // nothing else to suggest: test again
  if (steps.length === 0) {
    const m = miniStep('Làm lại một đề để xem điểm đã tiến bộ thế nào.');
    if (m) steps.push(m);
  }

  // one step per destination
  return steps.filter((s, i) => steps.findIndex((x) => x.to === s.to) === i);
}

function streakDays(): Set<number> {
  const days = loadActivity();
  for (const a of listAttempts()) days.add(dayOf(a.finishedAt));
  return days;
}

export function StudyNext() {
  const data = useData();
  // computed once per visit (practice answers mark their day themselves, in Practice)
  const [{ steps, run, due }] = useState(() => ({ steps: nextSteps(data), run: streak(streakDays()), due: dueCount(data.vocabulary) }));
  const [main, ...rest] = steps;
  if (!main) return null;
  const alts = rest.slice(0, 2);
  // Due flashcards appear once: as a step when one is shown, otherwise as a link here.
  const dueLink = due > 0 && ![main, ...alts].some((s) => s.to === '/tu-vung/the');

  return (
    <section className="next" aria-labelledby="next-title">
      <div className="next__main">
        <h2 id="next-title" className="next__label">
          Học tiếp
        </h2>
        <p className="next__title">{main.title}</p>
        <p className="next__why">{main.why}</p>
        <div>
          <Link className="btn btn--ink" to={main.to}>
            {main.cta}
          </Link>
        </div>
      </div>
      <div className="next__side">
        <p className="next__stats">
          <span className="next__streak">
            {run.count > 0 ? (
              <>
                <strong>{run.count}</strong> ngày liên tiếp
              </>
            ) : (
              'Chưa có chuỗi ngày học'
            )}
          </span>
          <span className="small muted">
            {run.count === 0 ? 'Học một chút mỗi ngày để bắt đầu chuỗi.' : run.activeToday ? 'Hôm nay bạn đã học.' : 'Học hôm nay để giữ chuỗi.'}
          </span>
          {dueLink && (
            <Link className="next__due" to="/tu-vung/the">
              Ôn {due} thẻ từ vựng đến hạn
            </Link>
          )}
        </p>
        {alts.length > 0 && (
          <div>
            <h3 className="next__alt-head small muted">Hoặc</h3>
            <ul className="next__alts">
              {alts.map((s) => (
                <li key={s.to}>
                  <Link to={s.to}>{s.title}</Link>
                  <span className="small muted">{s.why}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
