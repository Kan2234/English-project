import { useMemo, useState } from 'react';
import { NavLink, useParams } from 'react-router-dom';
import { useData } from '../lib/data';
import { practiceSets } from '../lib/exam';
import type { Answers, Label } from '../lib/types';
import { QuestionBlock } from '../components/QuestionBlock';
import NotFound from './NotFound';

// grammar topic slug -> question tags that belong to it
const TAGS: Record<string, string[]> = {
  'word-form': ['grammar:word-form', 'grammar:adverb'],
  'verb-tense': ['grammar:verb-tense', 'grammar:present-perfect', 'grammar:past-perfect'],
  'passive-voice': ['grammar:passive', 'grammar:passive-perfect'],
  preposition: ['grammar:preposition'],
  'conjunction-vs-preposition': ['grammar:conjunction-vs-preposition', 'grammar:conjunction', 'grammar:conjunctive-adverb'],
  'relative-clause': ['grammar:relative-clause'],
  conditional: ['grammar:conditional', 'grammar:inversion'],
  'subject-verb-agreement': ['grammar:subject-verb-agreement'],
  pronoun: ['grammar:pronoun'],
  'gerund-infinitive': ['grammar:gerund', 'grammar:infinitive'],
  comparison: ['grammar:comparative'],
  'paired-conjunction': ['grammar:paired-conjunction'],
  subjunctive: ['grammar:subjunctive'],
};

export default function GrammarPage() {
  const { slug } = useParams();
  const data = useData();
  const topics = [...data.grammar_topics].sort((a, b) => a.order_index - b.order_index);
  const topic = slug ? topics.find((t) => t.slug === slug) : topics[0];
  if (!topic) return <NotFound />;

  return (
    <div className="page">
      <div className="page-head">
        <h1>Ngữ pháp trọng tâm</h1>
        <p>Những chủ điểm ra nhiều nhất ở Part 5 và Part 6, kèm bẫy hay gặp và câu hỏi để luyện ngay.</p>
      </div>
      <div className="split">
        <nav aria-label="Chủ điểm ngữ pháp">
          <ul className="side-list">
            {topics.map((t) => (
              <li key={t.slug}>
                <NavLink to={`/ngu-phap/${t.slug}`} className={() => (t.slug === topic.slug ? 'active' : '')}>
                  {t.title_vi}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <TopicView key={topic.slug} slug={topic.slug} />
      </div>
    </div>
  );
}

function TopicView({ slug }: { slug: string }) {
  const data = useData();
  const topic = data.grammar_topics.find((t) => t.slug === slug)!;
  const [answers, setAnswers] = useState<Answers>({});
  const related = useMemo(() => {
    const tags = TAGS[slug] ?? [];
    // practice questions only: Full Test questions stay unseen for the real timed attempt
    return practiceSets(data, 5)
      .flatMap((x) => x.set.questions)
      .filter((q) => q.tags?.some((tag) => tags.includes(tag)))
      .slice(0, 5);
  }, [data, slug]);

  return (
    <article className="stack" style={{ gap: 36 }}>
      <header className="stack" style={{ gap: 8 }}>
        <h2 style={{ fontSize: 'var(--t-2xl)' }}>{topic.title_vi}</h2>
        <span className="muted small">
          {topic.title_en}. Xuất hiện ở Part {topic.parts.join(', ')}.
        </span>
        <p style={{ maxWidth: '66ch' }}>{topic.summary_vi}</p>
      </header>

      <section>
        <h3 style={{ marginBottom: 12 }}>Quy tắc</h3>
        <ul className="rules">
          {topic.rules.map((r) => (
            <li key={r.rule}>
              <span>{r.rule}</span>
              <span className="eg">{r.example}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 style={{ marginBottom: 12 }}>Bẫy thường gặp</h3>
        <ul className="traps">
          {topic.common_traps_vi.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </section>

      {related.length > 0 && (
        <section>
          <h3 style={{ marginBottom: 4 }}>Luyện ngay</h3>
          <p className="muted small" style={{ marginBottom: 8 }}>
            Câu Part 5 trong phần luyện tập có dùng chủ điểm này.
          </p>
          {related.map((q, i) => (
            <QuestionBlock
              key={q.id}
              q={{ ...q, number: i + 1 }}
              part={5}
              mode="practice"
              selected={answers[q.id]}
              revealed={!!answers[q.id]}
              onSelect={(l: Label) => setAnswers((a) => (a[q.id] ? a : { ...a, [q.id]: l }))}
            />
          ))}
        </section>
      )}
    </article>
  );
}
