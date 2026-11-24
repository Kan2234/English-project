// Build the TOEIC database from JSON sources.
//   node database/build.mjs
// Outputs:
//   database/toeic.db    – SQLite database (schema.sql)
//   database/toeic.json  – single JSON bundle for front-end / seeding another DB
// Requires Node.js >= 22.5 (built-in node:sqlite). No npm dependencies.

import { readFileSync, readdirSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';

const ROOT = dirname(fileURLToPath(import.meta.url));
const DATA = join(ROOT, 'data');
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const errors = [];
const fail = (msg) => errors.push(msg);
// Media URLs keep their path but get ?v=<8 hex of the file's sha256>, so a replaced
// photo or MP3 gets a new URL and browsers holding the old copy (max-age=86400)
// fetch it again. Paths are relative to database/ (= public/data/ after sync-data).
const versioned = (rel) => {
  if (!rel || /^[a-z][a-z0-9+.-]*:|[?#]/i.test(rel) || !existsSync(join(ROOT, rel))) return rel;
  return `${rel}?v=${createHash('sha256').update(readFileSync(join(ROOT, rel))).digest('hex').slice(0, 8)}`;
};

// ---------------------------------------------------------------- load
const info = readJson(join(DATA, 'exam_info.json'));
const vocabulary = readJson(join(DATA, 'vocabulary.json'));
const grammar = readJson(join(DATA, 'grammar.json'));
const strategies = readJson(join(DATA, 'strategies.json'));
const manifestPath = join(ROOT, 'audio', 'manifest.json');
const audioManifest = existsSync(manifestPath) ? readJson(manifestPath) : {};
// Provenance of Part 1 photos; entries with `attribution` ({text,url}) must be credited on the page.
const creditsPath = join(ROOT, 'images', 'credits.json');
const imageCredits = Object.fromEntries((existsSync(creditsPath) ? readJson(creditsPath) : []).map((c) => [c.set_id, c]));

// Test files: data/tests/*.json, merged by test.id in file-name order
const testFiles = readdirSync(join(DATA, 'tests')).filter((f) => f.endsWith('.json')).sort();
const tests = new Map();
const setFile = new Map(); // set object -> source file name (for per-file translation warnings)
for (const f of testFiles) {
  const doc = readJson(join(DATA, 'tests', f));
  const id = doc.test?.id;
  if (!id) { fail(`${f}: missing test.id`); continue; }
  const t = tests.get(id) ?? { meta: {}, sets: [] };
  Object.assign(t.meta, doc.test);
  for (const s of doc.sets ?? []) setFile.set(s, f);
  t.sets.push(...(doc.sets ?? []));
  tests.set(id, t);
}

// ---------------------------------------------------------------- Vietnamese translations (all optional)
//   set.transcript_vi, passages[].text_vi, passages[].title_vi, question.prompt_vi, question.why_wrong_vi { label: reason }
// Malformed values fail the build; missing ones are only reported (per source file) so content can be added gradually.
const missingVi = new Map(); // file -> [ids]
const noteMissing = (file, id) => missingVi.set(file, [...(missingVi.get(file) ?? []), id]);
const isText = (v) => typeof v === 'string' && v.trim() !== '';
function checkSetVi(s, setId, file) {
  if (s.transcript_vi !== undefined) {
    if (!isText(s.transcript_vi)) fail(`${setId}: transcript_vi must be a non-empty string`);
    if (!s.transcript) fail(`${setId}: transcript_vi without transcript`);
  } else if (s.transcript) noteMissing(file, `${setId} transcript`);
  (s.passages ?? []).forEach((p, i) => {
    if (p.title_vi !== undefined && !(isText(p.title_vi) && p.title)) fail(`${setId}: passages[${i}].title_vi must be a non-empty string next to a title`);
    if (p.text_vi === undefined) noteMissing(file, `${setId} passage ${i + 1}`);
    else if (!isText(p.text_vi)) fail(`${setId}: passages[${i}].text_vi must be a non-empty string`);
  });
}
function checkQuestionVi(q, qid, labels, file) {
  if (q.prompt_vi !== undefined && q.prompt_vi !== null) {
    if (!isText(q.prompt_vi)) fail(`${qid}: prompt_vi must be a non-empty string or null`);
    if (!q.prompt) fail(`${qid}: prompt_vi without prompt`);
  } else if (q.prompt_vi === undefined && q.prompt && !/^\(\d+\)$/.test(q.prompt)) noteMissing(file, `${qid} prompt`); // Part 6 "(131)" needs none
  const wrong = labels.filter((l) => l !== q.answer);
  const w = q.why_wrong_vi;
  if (w === undefined) { noteMissing(file, `${qid} why_wrong`); return; }
  if (typeof w !== 'object' || w === null || Array.isArray(w)) { fail(`${qid}: why_wrong_vi must be an object { label: reason }`); return; }
  for (const [l, reason] of Object.entries(w)) {
    if (l === q.answer) fail(`${qid}: why_wrong_vi explains the correct answer ${l}`);
    else if (!labels.includes(l)) fail(`${qid}: why_wrong_vi has unknown label ${l}`);
    if (!isText(reason)) fail(`${qid}: why_wrong_vi.${l} must be a non-empty string`);
  }
  const uncovered = wrong.filter((l) => !(l in w));
  if (uncovered.length) noteMissing(file, `${qid} why_wrong ${uncovered.join('')}`);
}

// ---------------------------------------------------------------- normalize + validate tests
const PART_ORDER = [1, 2, 3, 4, 5, 6, 7];
const testRows = [];
for (const [testId, t] of tests) {
  const prefix = testId.replace(/^mini-test-/, 'mt').replace(/^full-test-/, 'ft');
  // keep authoring order inside a part, but enforce part order 1..7
  const sets = PART_ORDER.flatMap((p) => t.sets.filter((s) => s.part === p));
  if (sets.length !== t.sets.length) fail(`${testId}: set with invalid part number`);
  let qNo = 0;
  const partCounters = {};
  const outSets = sets.map((s) => {
    partCounters[s.part] = (partCounters[s.part] ?? 0) + 1;
    const setId = `${prefix}-p${s.part}-s${String(partCounters[s.part]).padStart(2, '0')}`;
    const questions = (s.questions ?? []).map((q) => {
      qNo += 1;
      const qid = `${prefix}-q${String(qNo).padStart(3, '0')}`;
      const labels = Object.keys(q.choices ?? {});
      const expected = s.part === 2 ? ['A', 'B', 'C'] : ['A', 'B', 'C', 'D'];
      if (labels.join() !== expected.join()) fail(`${qid}: choices must be ${expected.join('')}, got ${labels.join('')}`);
      if (!labels.includes(q.answer)) fail(`${qid}: answer ${q.answer} not in choices`);
      if (!q.explanation_vi) fail(`${qid}: missing explanation_vi`);
      checkQuestionVi(q, qid, labels, setFile.get(s));
      return { id: qid, number: qNo, ...q };
    });
    if (!questions.length) fail(`${setId}: no questions`);
    if (s.part <= 4 && !s.transcript) fail(`${setId}: listening set needs transcript`);
    if (s.part >= 6 && !s.passages?.length) fail(`${setId}: reading set needs passages`);
    checkSetVi(s, setId, setFile.get(s));
    // Audio generated by tts/generate-audio.mjs (only linked when the file really exists)
    const audio = audioManifest[setId];
    const audioOk = audio && existsSync(join(ROOT, audio.file));
    // Part 1 photos / illustrations: database/images/<set-id>.(jpg|webp|png|svg).
    // Photos win over the drawn SVG fallback (illustrations/part1.mjs) if both exist.
    const image = ['jpg', 'webp', 'png', 'svg'].map((ext) => `images/${setId}.${ext}`).find((f) => existsSync(join(ROOT, f)));
    if (s.part === 1 && !s.image_url && !image) console.warn(`  note: ${setId} has no image yet`);
    const credit = image && !image.endsWith('.svg') ? imageCredits[setId]?.attribution : undefined;
    if (credit && !(credit.text && /^https:\/\//.test(credit.url))) fail(`${setId}: image attribution needs text and an https url`);
    return {
      id: setId, ...s,
      image_url: versioned(s.image_url ?? image ?? null),
      image_credit: s.image_credit ?? credit ?? null,
      audio_url: versioned(s.audio_url ?? (audioOk ? audio.file : null)),
      audio_duration_sec: s.audio_duration_sec ?? (audioOk ? audio.duration_sec : null),
      questions,
    };
  });
  testRows.push({ id: testId, meta: t.meta, sets: outSets, questionCount: qNo });

  // A full test must match the official per-part question counts exactly
  if (t.meta.test_type === 'full') {
    for (const p of info.exam_parts.filter((x) => x.format_code === t.meta.format_code)) {
      const got = outSets.filter((s) => s.part === p.part_number).reduce((sum, s) => sum + s.questions.length, 0);
      if (got !== p.question_count) fail(`${testId}: part ${p.part_number} has ${got} questions, expected ${p.question_count}`);
    }
  }
}

// ---------------------------------------------------------------- score conversion (interpolated estimate)
function interpolate(anchors, max) {
  const rows = [];
  for (let x = 0; x <= max; x++) {
    let i = anchors.findIndex(([ax]) => ax >= x);
    if (anchors[i][0] === x) { rows.push([x, anchors[i][1]]); continue; }
    const [x0, y0] = anchors[i - 1];
    const [x1, y1] = anchors[i];
    const y = y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    rows.push([x, Math.min(495, Math.max(5, Math.round(y / 5) * 5))]);
  }
  return rows;
}
const conv = info.score_conversion_anchors;
const scoreConversion = [
  ...interpolate(conv.listening, 100).map(([c, s]) => ({ section: 'listening', correct_answers: c, scaled_score: s })),
  ...interpolate(conv.reading, 100).map(([c, s]) => ({ section: 'reading', correct_answers: c, scaled_score: s })),
];

// ---------------------------------------------------------------- other validations
const sourceIds = new Set(info.sources.map((s) => s.id));
for (const u of [...info.updates, ...info.fees]) {
  if (u.source_id && !sourceIds.has(u.source_id)) fail(`unknown source_id ${u.source_id}`);
}
const vocabKeys = new Set();
for (const v of vocabulary) {
  const k = `${v.word}|${v.pos}|${v.topic}`;
  if (vocabKeys.has(k)) fail(`duplicate vocabulary: ${k}`);
  vocabKeys.add(k);
  if (!v.word || !v.meaning_vi || !v.topic) fail(`vocabulary missing fields: ${v.word}`);
}

for (const [file, ids] of missingVi) {
  const more = ids.length > 6 ? ` … (+${ids.length - 6})` : '';
  console.warn(`  note: ${file} is missing ${ids.length} Vietnamese translation(s): ${ids.slice(0, 6).join(', ')}${more}`);
}

if (errors.length) {
  console.error(`Validation failed (${errors.length}):\n - ` + errors.join('\n - '));
  process.exit(1);
}

// ---------------------------------------------------------------- write SQLite
const dbPath = join(ROOT, 'toeic.db');
if (existsSync(dbPath)) rmSync(dbPath);
const db = new DatabaseSync(dbPath);
db.exec(readFileSync(join(ROOT, 'schema.sql'), 'utf8'));

const json = (v) => (v === undefined || v === null ? null : JSON.stringify(v));
const n = (v) => (v === undefined ? null : v);
function insertAll(table, rows, cols) {
  const stmt = db.prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`);
  for (const r of rows) stmt.run(...cols.map((c) => n(r[c])));
}

db.exec('BEGIN');
insertAll('sources', info.sources, ['id', 'name', 'url', 'source_type', 'note_vi']);
insertAll('exam_formats', info.exam_formats, ['code', 'name', 'skills', 'total_questions', 'duration_minutes', 'score_min', 'score_max', 'score_step', 'description_vi', 'notes', 'status']);
insertAll('exam_sections', info.exam_sections, ['format_code', 'name', 'question_count', 'duration_minutes', 'score_min', 'score_max']);
insertAll('exam_parts', info.exam_parts.map((p) => ({ ...p, skills_tested: json(p.skills_tested) })),
  ['format_code', 'section', 'part_number', 'name_en', 'name_vi', 'question_count', 'question_range', 'choices_per_question', 'description_vi', 'skills_tested']);
insertAll('score_conversion', scoreConversion, ['section', 'correct_answers', 'scaled_score']);
insertAll('score_levels', info.score_levels, ['min_score', 'max_score', 'cefr', 'label_vi', 'description_vi']);
insertAll('fees', info.fees, ['country', 'format_code', 'candidate_type', 'amount', 'currency', 'effective_year', 'source_id', 'verified']);
insertAll('updates', info.updates, ['date', 'title_vi', 'summary_vi', 'source_id', 'verified']);

insertAll('vocabulary', vocabulary.map((v) => ({ ...v, part_of_speech: v.pos, collocations: json(v.collocations) })),
  ['word', 'part_of_speech', 'ipa', 'meaning_vi', 'example_en', 'example_vi', 'topic', 'level', 'collocations']);
insertAll('grammar_topics', grammar.map((g) => ({ ...g, parts: json(g.parts), rules: json(g.rules), common_traps_vi: json(g.common_traps_vi) })),
  ['slug', 'title_vi', 'title_en', 'parts', 'summary_vi', 'rules', 'common_traps_vi', 'order_index']);
insertAll('strategies', strategies, ['part_number', 'section', 'title_vi', 'content_vi', 'order_index']);

const insTest = db.prepare('INSERT INTO tests (id,title,test_type,format_code,year,duration_minutes,description_vi,origin) VALUES (?,?,?,?,?,?,?,?)');
const insSet = db.prepare('INSERT INTO question_sets (id,test_id,part_number,order_index,title,passage_type,passages,transcript,transcript_vi,image_description,graphic,audio_url,audio_duration_sec,image_url,image_credit) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
const insQ = db.prepare('INSERT INTO questions (id,set_id,test_id,part_number,number,prompt,prompt_vi,answer,explanation_vi,why_wrong_vi,difficulty,tags) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
const insC = db.prepare('INSERT INTO choices (question_id,label,text) VALUES (?,?,?)');
for (const t of testRows) {
  const m = t.meta;
  insTest.run(t.id, m.title, m.test_type, m.format_code, n(m.year), n(m.duration_minutes), n(m.description_vi), m.origin ?? 'original');
  t.sets.forEach((s, i) => {
    insSet.run(s.id, t.id, s.part, i + 1, n(s.title), n(s.passage_type), json(s.passages), n(s.transcript), n(s.transcript_vi),
      n(s.image_description), json(s.graphic), n(s.audio_url), n(s.audio_duration_sec), n(s.image_url), json(s.image_credit));
    for (const q of s.questions) {
      insQ.run(q.id, s.id, t.id, s.part, q.number, n(q.prompt), n(q.prompt_vi), q.answer, q.explanation_vi, json(q.why_wrong_vi), n(q.difficulty), json(q.tags));
      for (const [label, text] of Object.entries(q.choices)) insC.run(q.id, label, text);
    }
  });
}
db.exec('COMMIT');

// ---------------------------------------------------------------- write JSON bundle
const bundle = {
  generated_at: new Date().toISOString(),
  exam_formats: info.exam_formats,
  exam_sections: info.exam_sections,
  exam_parts: info.exam_parts,
  score_levels: info.score_levels,
  score_conversion: scoreConversion,
  fees: info.fees,
  updates: info.updates,
  sources: info.sources,
  tests: testRows.map((t) => ({ ...t.meta, question_count: t.questionCount, sets: t.sets })),
  vocabulary,
  grammar_topics: grammar,
  strategies,
};
writeFileSync(join(ROOT, 'toeic.json'), JSON.stringify(bundle, null, 2));

// ---------------------------------------------------------------- report
const count = (sql) => db.prepare(sql).get().c;
console.log('Built database/toeic.db and database/toeic.json');
for (const tbl of ['exam_formats', 'exam_parts', 'tests', 'question_sets', 'questions', 'choices', 'vocabulary', 'grammar_topics', 'strategies', 'score_conversion', 'updates', 'sources']) {
  console.log(`  ${tbl.padEnd(18)} ${count(`SELECT COUNT(*) AS c FROM ${tbl}`)}`);
}
for (const r of db.prepare('SELECT test_id, part_number, COUNT(*) AS c FROM questions GROUP BY 1,2 ORDER BY 1,2').all()) {
  console.log(`  ${r.test_id} part ${r.part_number}: ${r.c} questions`);
}
const dist = db.prepare('SELECT answer, COUNT(*) AS c FROM questions GROUP BY answer').all().map((r) => `${r.answer}=${r.c}`).join(' ');
console.log(`  answer distribution: ${dist}`);
db.close();
