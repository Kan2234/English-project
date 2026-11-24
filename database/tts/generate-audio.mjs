// Generate MP3 audio for every Listening set (Part 1-4) with offline Windows TTS voices.
//
//   node database/build.mjs                 # builds toeic.json (question numbers are assigned there)
//   node database/tts/generate-audio.mjs    # synthesizes audio, then rebuilds so audio_url is filled in
//
// Options:
//   --test <id>       only one test (e.g. full-test-01)
//   --force           regenerate even when the script/text has not changed
//   --pause <sec>     answer time after each Part 3/4 question (default 8, like the real test; graphic questions +4)
//   --no-questions    do not read the Part 3/4 questions aloud (conversation/talk only)
//
// Requirements: Windows 10/11 with the built-in voices Microsoft David, Zira, Mark; ffmpeg in PATH (or FFMPEG_PATH).
// Output: database/audio/<test-id>/<set-id>.mp3 and database/audio/manifest.json (hash + duration per set).

import { readFileSync, writeFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const AUDIO = join(ROOT, 'audio');
const MANIFEST = join(AUDIO, 'manifest.json');

// ---------------------------------------------------------------- options
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const onlyTest = opt('--test');
const force = args.includes('--force');
const answerPause = Number(opt('--pause') ?? 8);
const readQuestions = !args.includes('--no-questions');
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';

// ---------------------------------------------------------------- voices
// Offline OneCore voices. Two extra "characters" are made by changing pitch/rate.
const V = {
  narrator: { name: 'Microsoft Mark', rate: '-5%' },
  man: { name: 'Microsoft David' },
  woman: { name: 'Microsoft Zira' },
  man2: { name: 'Microsoft Mark' },
  woman2: { name: 'Microsoft Zira', pitch: '+14%', rate: '+4%' },
};
const SPEAKER_VOICE = { M: V.man, W: V.woman, M1: V.man, M2: V.man2, W1: V.woman, W2: V.woman2 };
const ROTATION = [V.woman, V.man, V.woman2, V.man2]; // for single-speaker parts

const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function say(voice, text) {
  const attrs = [voice.pitch && `pitch="${voice.pitch}"`, voice.rate && `rate="${voice.rate}"`].filter(Boolean).join(' ');
  const body = attrs ? `<prosody ${attrs}>${xml(text)}</prosody>` : xml(text);
  return `<voice name="${voice.name}">${body}</voice>`;
}
// The OneCore engine already appends ~0.85 s of silence after every <voice> element,
// so a requested pause only adds the remainder. Measured with ffmpeg silencedetect.
const VOICE_TAIL_SEC = 0.85;
const pause = (sec) => {
  const extra = sec - VOICE_TAIL_SEC;
  return extra > 0.05 ? `<break time="${Math.round(extra * 1000)}ms"/>` : '';
};
const speak = (parts) => `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">${parts.join('')}</speak>`;

// ---------------------------------------------------------------- script builders per part
const TALK_TYPE = {
  broadcast: 'broadcast', voicemail: 'telephone message', announcement: 'announcement', talk: 'talk',
  meeting: 'excerpt from a meeting', advertisement: 'advertisement', news: 'news report', introduction: 'introduction',
};
const graphicWord = (g) => (g?.type === 'bar-chart' ? 'chart' : g ? 'table' : null);
const choiceLines = (q) => Object.entries(q.choices).map(([label, text]) => [label, text]);

function part1(set, idx) {
  const q = set.questions[0];
  const voice = ROTATION[idx % ROTATION.length];
  const parts = [say(V.narrator, `Number ${q.number}. Look at the picture marked number ${q.number} in your test book.`), pause(1.2)];
  for (const [label, text] of choiceLines(q)) parts.push(say(voice, `${label}. ${text}`), pause(1.3));
  return parts;
}

function part2(set, idx) {
  const q = set.questions[0];
  const question = set.transcript.split('\n')[0];
  const asker = ROTATION[idx % ROTATION.length];
  const responder = ROTATION[(idx + 1) % ROTATION.length]; // always the other gender
  const parts = [say(V.narrator, `Number ${q.number}.`), pause(0.6), say(asker, question), pause(1.2)];
  for (const [label, text] of choiceLines(q)) parts.push(say(responder, `${label}. ${text}`), pause(1.2));
  return parts;
}

function questionReadings(set) {
  if (!readQuestions) return [];
  const extra = set.graphic ? 4 : 0;
  return set.questions.flatMap((q) => [say(V.narrator, `Number ${q.number}. ${q.prompt}`), pause(answerPause + extra)]);
}

function part3(set) {
  const first = set.questions[0].number;
  const last = set.questions.at(-1).number;
  const lines = set.transcript.split('\n').map((l) => l.match(/^(M1|M2|W1|W2|M|W):\s*(.+)$/));
  if (lines.some((m) => !m)) throw new Error(`${set.id}: every Part 3 line must start with M:, W:, M1:, ...`);
  const speakers = new Set(lines.map((m) => m[1]));
  const kind = speakers.size >= 3 ? 'conversation with three speakers' : 'conversation';
  const g = graphicWord(set.graphic);
  const intro = `Questions ${first} through ${last} refer to the following ${kind}${g ? ` and ${g}` : ''}.`;
  const parts = [say(V.narrator, intro), pause(1)];
  for (const [, who, text] of lines) parts.push(say(SPEAKER_VOICE[who], text), pause(0.45));
  parts.push(pause(1), ...questionReadings(set));
  return parts;
}

function part4(set, idx) {
  const first = set.questions[0].number;
  const last = set.questions.at(-1).number;
  const g = graphicWord(set.graphic);
  const kind = TALK_TYPE[set.passage_type] ?? 'talk';
  const intro = `Questions ${first} through ${last} refer to the following ${kind}${g ? ` and ${g}` : ''}.`;
  const voice = ROTATION[idx % ROTATION.length];
  return [say(V.narrator, intro), pause(1), say(voice, set.transcript), pause(1), ...questionReadings(set)];
}

// ---------------------------------------------------------------- helpers
function wavDuration(file) {
  const b = readFileSync(file);
  let off = 12, byteRate = 0;
  while (off + 8 <= b.length) {
    const id = b.toString('ascii', off, off + 4);
    const size = b.readUInt32LE(off + 4);
    if (id === 'fmt ') byteRate = b.readUInt32LE(off + 16);
    if (id === 'data') return byteRate ? Math.min(size, b.length - off - 8) / byteRate : 0;
    off += 8 + size + (size % 2);
  }
  return 0;
}
function run(cmd, cmdArgs, label) {
  const r = spawnSync(cmd, cmdArgs, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.error) throw new Error(`${label}: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`${label} failed (exit ${r.status}):\n${r.stderr || r.stdout}`);
  return r.stdout;
}

// ---------------------------------------------------------------- main
const bundlePath = join(ROOT, 'toeic.json');
if (!existsSync(bundlePath)) { console.error('database/toeic.json not found. Run: node database/build.mjs'); process.exit(1); }
const bundle = JSON.parse(readFileSync(bundlePath, 'utf8'));
const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : {};

const jobs = [];
for (const test of bundle.tests) {
  if (onlyTest && test.id !== onlyTest) continue;
  const counters = {};
  for (const set of test.sets) {
    if (set.part > 4) continue;
    const idx = (counters[set.part] = (counters[set.part] ?? -1) + 1);
    const build = { 1: part1, 2: part2, 3: part3, 4: part4 }[set.part];
    const ssml = speak(build(set, idx));
    const hash = createHash('sha1').update(ssml).digest('hex').slice(0, 16);
    const rel = `audio/${test.id}/${set.id}.mp3`;
    const fresh = manifest[set.id]?.hash === hash && existsSync(join(ROOT, rel));
    if (fresh && !force) continue;
    jobs.push({ id: set.id, ssml, hash, rel, testId: test.id });
  }
}

if (!jobs.length) {
  console.log('All audio is up to date. Use --force to regenerate.');
} else {
  console.log(`Synthesizing ${jobs.length} listening set(s)...`);
  const work = mkdtempSync(join(tmpdir(), 'toeic-tts-'));
  try {
    const jobsFile = join(work, 'jobs.json');
    writeFileSync(jobsFile, JSON.stringify(jobs.map(({ id, ssml }) => ({ id, ssml }))), 'utf8');
    run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', join(HERE, 'synthesize.ps1'), '-JobsFile', jobsFile, '-OutDir', work], 'TTS');

    for (const job of jobs) {
      const wav = join(work, `${job.id}.wav`);
      const trimmed = join(work, `${job.id}.trim.wav`);
      const mp3 = join(ROOT, job.rel);
      mkdirSync(dirname(mp3), { recursive: true });
      // Trim leading/trailing silence, then add 0.3 s padding at both ends
      const trim = 'silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse,adelay=300,apad=pad_dur=0.3';
      run(FFMPEG, ['-y', '-loglevel', 'error', '-i', wav, '-af', trim, trimmed], `ffmpeg trim ${job.id}`);
      run(FFMPEG, ['-y', '-loglevel', 'error', '-i', trimmed, '-ac', '1', '-codec:a', 'libmp3lame', '-b:a', '48k', mp3], `ffmpeg mp3 ${job.id}`);
      manifest[job.id] = { test_id: job.testId, file: job.rel, hash: job.hash, duration_sec: Math.round(wavDuration(trimmed) * 10) / 10 };
      console.log(`  ${job.rel}  ${manifest[job.id].duration_sec}s`);
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  const sorted = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(MANIFEST, JSON.stringify(sorted, null, 2) + '\n');
}

// Rebuild so audio_url is written into toeic.db / toeic.json
console.log('Rebuilding database...');
process.stdout.write(run(process.execPath, [join(ROOT, 'build.mjs')], 'build').split('\n').slice(0, 1).join('\n') + '\n');
