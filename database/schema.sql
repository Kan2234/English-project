-- TOEIC database schema (SQLite; also portable to PostgreSQL/MySQL with minor type changes)
-- Source of truth: JSON files in database/data/. Build with: node database/build.mjs

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------
-- Exam information
-- ---------------------------------------------------------------
CREATE TABLE exam_formats (
  code              TEXT PRIMARY KEY,          -- 'LR', 'SW', 'LR_ADAPTIVE', 'BRIDGE'
  name              TEXT NOT NULL,
  skills            TEXT NOT NULL,             -- comma list: listening,reading,...
  total_questions   INTEGER,
  duration_minutes  INTEGER,
  score_min         INTEGER,
  score_max         INTEGER,
  score_step        INTEGER,
  description_vi    TEXT,
  notes             TEXT,
  status            TEXT NOT NULL DEFAULT 'current'  -- current | announced | unverified
);

CREATE TABLE exam_sections (
  id                INTEGER PRIMARY KEY,
  format_code       TEXT NOT NULL REFERENCES exam_formats(code),
  name              TEXT NOT NULL,             -- 'Listening', 'Reading', 'Speaking', 'Writing'
  question_count    INTEGER,
  duration_minutes  INTEGER,
  score_min         INTEGER,
  score_max         INTEGER
);

CREATE TABLE exam_parts (
  id                INTEGER PRIMARY KEY,
  format_code       TEXT NOT NULL REFERENCES exam_formats(code),
  section           TEXT NOT NULL,
  part_number       INTEGER NOT NULL,
  name_en           TEXT NOT NULL,
  name_vi           TEXT NOT NULL,
  question_count    INTEGER,
  question_range    TEXT,                      -- e.g. '1-6' or 'Q1-2'
  choices_per_question INTEGER,
  description_vi    TEXT,
  skills_tested     TEXT,                      -- JSON array
  UNIQUE (format_code, section, part_number)
);

-- Approximate raw-score -> scaled-score table (ETS does not publish an official fixed table)
CREATE TABLE score_conversion (
  section           TEXT NOT NULL,             -- 'listening' | 'reading'
  correct_answers   INTEGER NOT NULL,
  scaled_score      INTEGER NOT NULL,
  PRIMARY KEY (section, correct_answers)
);

CREATE TABLE score_levels (
  id                INTEGER PRIMARY KEY,
  min_score         INTEGER NOT NULL,
  max_score         INTEGER NOT NULL,
  cefr              TEXT,
  label_vi          TEXT NOT NULL,
  description_vi    TEXT
);

-- ---------------------------------------------------------------
-- Practice tests (original TOEIC-style content)
-- ---------------------------------------------------------------
CREATE TABLE tests (
  id                TEXT PRIMARY KEY,          -- 'mini-test-01'
  title             TEXT NOT NULL,
  test_type         TEXT NOT NULL,             -- mini | full | part-drill
  format_code       TEXT NOT NULL REFERENCES exam_formats(code),
  year              INTEGER,
  duration_minutes  INTEGER,
  description_vi    TEXT,
  origin            TEXT NOT NULL DEFAULT 'original'  -- original = written for this project
);

-- A question set groups questions that share a stimulus (photo, conversation, talk, passage).
-- Part 2 and Part 5 have one question per set.
CREATE TABLE question_sets (
  id                TEXT PRIMARY KEY,          -- 'mt01-p3-s01'
  test_id           TEXT NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  part_number       INTEGER NOT NULL,
  order_index       INTEGER NOT NULL,
  title             TEXT,
  passage_type      TEXT,                      -- photo, conversation, talk, email, article, notice...
  passages          TEXT,                      -- JSON array of {type,title,text} (Part 6/7)
  transcript        TEXT,                      -- Listening script (Part 1-4)
  image_description TEXT,                      -- Part 1 photo description / graphic for Part 3-4
  graphic           TEXT,                      -- JSON for tables/charts in Part 3/4/7
  audio_url         TEXT,                      -- relative to database/, e.g. 'audio/full-test-01/ft01-p3-s01.mp3'
  audio_duration_sec REAL,
  image_url         TEXT,
  image_credit      TEXT                       -- JSON {text,url} when a free-licensed photo needs attribution
);

CREATE TABLE questions (
  id                TEXT PRIMARY KEY,          -- 'mt01-q001'
  set_id            TEXT NOT NULL REFERENCES question_sets(id) ON DELETE CASCADE,
  test_id           TEXT NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  part_number       INTEGER NOT NULL,
  number            INTEGER NOT NULL,          -- question number inside the test
  prompt            TEXT,                      -- question stem (null for Part 1/2 where it is audio-only)
  answer            TEXT NOT NULL,             -- 'A' | 'B' | 'C' | 'D'
  explanation_vi    TEXT,
  difficulty        INTEGER CHECK (difficulty BETWEEN 1 AND 5),
  tags              TEXT,                      -- JSON array: ['grammar:verb-tense', 'inference']
  UNIQUE (test_id, number)
);

CREATE TABLE choices (
  question_id       TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  label             TEXT NOT NULL,             -- 'A'..'D'
  text              TEXT NOT NULL,
  PRIMARY KEY (question_id, label)
);

-- ---------------------------------------------------------------
-- Study materials
-- ---------------------------------------------------------------
CREATE TABLE vocabulary (
  id                INTEGER PRIMARY KEY,
  word              TEXT NOT NULL,
  part_of_speech    TEXT,
  ipa               TEXT,
  meaning_vi        TEXT NOT NULL,
  example_en        TEXT,
  example_vi        TEXT,
  topic             TEXT NOT NULL,
  level             TEXT,                      -- target score band: '450', '650', '850'
  collocations      TEXT,                      -- JSON array
  UNIQUE (word, part_of_speech, topic)
);

CREATE TABLE grammar_topics (
  slug              TEXT PRIMARY KEY,
  title_vi          TEXT NOT NULL,
  title_en          TEXT,
  parts             TEXT,                      -- JSON array of relevant parts, e.g. [5,6]
  summary_vi        TEXT,
  rules             TEXT,                      -- JSON array of {rule, example}
  common_traps_vi   TEXT,                      -- JSON array
  order_index       INTEGER
);

CREATE TABLE strategies (
  id                INTEGER PRIMARY KEY,
  part_number       INTEGER,                   -- null = general strategy
  section           TEXT,
  title_vi          TEXT NOT NULL,
  content_vi        TEXT NOT NULL,
  order_index       INTEGER
);

-- ---------------------------------------------------------------
-- News / timeline (2025-2026) and sources
-- ---------------------------------------------------------------
CREATE TABLE updates (
  id                INTEGER PRIMARY KEY,
  date              TEXT,                      -- ISO date
  title_vi          TEXT NOT NULL,
  summary_vi        TEXT,
  source_id         TEXT REFERENCES sources(id),
  verified          INTEGER NOT NULL DEFAULT 0 -- 1 = confirmed by official source
);

CREATE TABLE fees (
  id                INTEGER PRIMARY KEY,
  country           TEXT NOT NULL,
  format_code       TEXT NOT NULL REFERENCES exam_formats(code),
  candidate_type    TEXT,                      -- student | general
  amount            INTEGER,
  currency          TEXT,
  effective_year    INTEGER,
  source_id         TEXT REFERENCES sources(id),
  verified          INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE sources (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  url               TEXT,
  source_type       TEXT,                      -- official | prep-site | book
  note_vi           TEXT
);

-- ---------------------------------------------------------------
-- Indexes and views for the website
-- ---------------------------------------------------------------
CREATE INDEX idx_questions_part ON questions(part_number);
CREATE INDEX idx_questions_set ON questions(set_id);
CREATE INDEX idx_sets_test_part ON question_sets(test_id, part_number);
CREATE INDEX idx_vocab_topic ON vocabulary(topic);

-- One row per question with its choices as JSON — handy for API endpoints
CREATE VIEW v_questions_full AS
SELECT q.id, q.test_id, q.part_number, q.number, q.prompt, q.answer,
       q.explanation_vi, q.difficulty, q.tags, q.set_id,
       s.passage_type, s.transcript, s.passages, s.image_description, s.graphic,
       s.audio_url, s.audio_duration_sec, s.image_url, s.image_credit,
       (SELECT json_group_array(json_object('label', c.label, 'text', c.text))
          FROM (SELECT * FROM choices WHERE question_id = q.id ORDER BY label) c) AS choices
FROM questions q JOIN question_sets s ON s.id = q.set_id;
