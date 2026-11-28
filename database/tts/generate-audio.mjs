// Generate MP3 audio for every Listening set (Part 1-4).
//
//   node database/build.mjs                 # builds toeic.json (question numbers are assigned there)
//   node database/tts/generate-audio.mjs    # synthesizes audio, then rebuilds so audio_url is filled in
//
// Options:
//   --engine <name>   edge (default): Microsoft neural voices via edge-tts, four accents (US/GB/CA/AU)
//                     onecore: offline Windows voices (David/Zira/Mark), US accent only, sounds robotic
//   --test <id>       only one test (e.g. full-test-01)
//   --force           regenerate even when the script/text/voices have not changed
//   --pause <sec>     answer time after each Part 3/4 question (default 8, like the real test; graphic questions +4)
//   --no-questions    do not read the Part 3/4 questions aloud (conversation/talk only)
//   --report <file>   (edge) write per-segment stats (duration, words/s, level) as JSON, for checking
//
// Engine "edge" (default)
//   Uses the open-source edge-tts Python package, i.e. the online "Read aloud" service of Microsoft Edge.
//   Needs internet. It is an unofficial client: fine for a learning project; for commercial use switch to
//   the official Azure Speech service (same voice names). Python is not needed on the host: edge-tts runs in
//   Docker (image python:3.12-slim, package installed once into the volume "on-ta-pip"):
//     docker volume create on-ta-pip
//     docker run --rm -v on-ta-pip:/pip python:3.12-slim pip install --target /pip edge-tts==7.2.3
//   Or set EDGE_TTS_PYTHON to a local python that has edge-tts installed (no Docker then).
//   edge-tts takes one voice per request, so every spoken line is synthesized separately (tts/edge_synth.py,
//   throttled + retried because the service rate-limits), cached by text+voice in EDGE_TTS_CACHE
//   (default: database/tts/.cache/edge-tts, gitignored), trimmed, loudness-matched and joined here with exact silences.
//   Voice plan (deterministic, from the set's index within its part):
//     narrator  en-US-AndrewNeural (-5%) reads directions, question numbers and Part 3/4 questions
//     speakers  US Ava/Emma, Brian/Christopher · GB Sonia/Libby, Ryan/Thomas · CA Clara, Liam · AU Natasha, William
//               (-4% rate, -8% for the faster Brian/Ryan/Thomas/William)
//     Part 1    one voice per set; accent rotates US > GB > CA > AU, gender alternates
//     Part 2    asker and responder always differ in both accent and gender
//     Part 3    each speaker (M, W, M1, M2, W1, W2) gets a different accent, so never the same voice twice
//     Part 4    one talker per set; accent rotates; gender follows the talker's own name ("This is Sandra...")
//
// Requirements: ffmpeg in PATH (or FFMPEG_PATH); edge: Docker Desktop (or EDGE_TTS_PYTHON) + internet;
// onecore: Windows 10/11 with the built-in voices Microsoft David, Zira, Mark.
// Output: database/audio/<test-id>/<set-id>.mp3 and database/audio/manifest.json
// ({ test_id, file, hash, duration_sec, engine, voices, accents } per set; the hash covers text + voices + engine).

import { readFileSync, writeFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, renameSync } from 'node:fs';
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
const engine = opt('--engine') ?? 'edge';
const onlyTest = opt('--test');
const force = args.includes('--force');
const answerPause = Number(opt('--pause') ?? 8);
const readQuestions = !args.includes('--no-questions');
const reportFile = opt('--report');
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
if (!['edge', 'onecore'].includes(engine)) { console.error(`Unknown --engine ${engine} (use edge or onecore)`); process.exit(1); }

// ---------------------------------------------------------------- voice plan (engine independent)
// A speaker is described as { accent, gender }; each engine turns that into a concrete voice.
const ACCENTS = ['US', 'GB', 'CA', 'AU'];
// Start each part on a different accent so that, over a whole test, the four accents come out about even.
const PART_OFFSET = { 1: 0, 2: 1, 3: 3, 4: 2 };
const accentAt = (part, i) => ACCENTS[(i + PART_OFFSET[part]) % 4];
// F M F M, then M F M F, ... so the same accent does not always get the same gender.
const altGender = (i) => ((i + Math.floor(i / 4)) % 2 ? 'M' : 'F');
const otherGender = (g) => (g === 'F' ? 'M' : 'F');
// Distance between the accents of two people talking: 1, 2, 3, 1, 2, 3... (changes every 4 sets)
const pairStep = (i) => 1 + (Math.floor(i / 4) % 3);

// Part 4 talkers who say their own name must get a matching voice.
const NAME_GENDER = {
  Sandra: 'F', Priya: 'F', Laura: 'F', Hannah: 'F', Lisa: 'F', Susan: 'F', Maria: 'F', Emily: 'F', Sarah: 'F', Anna: 'F', Linda: 'F', Karen: 'F', Julia: 'F', Grace: 'F', Mei: 'F', Olivia: 'F', Rachel: 'F', Helen: 'F', Nina: 'F', Elena: 'F',
  Ben: 'M', Omar: 'M', David: 'M', Mark: 'M', James: 'M', John: 'M', Michael: 'M', Daniel: 'M', Tom: 'M', Robert: 'M', Kevin: 'M', Paul: 'M', Peter: 'M', Raj: 'M', Carlos: 'M', Ken: 'M', Alex: 'M', Sam: 'M', Brian: 'M', Steve: 'M',
  Mr: 'M', Mrs: 'F', Ms: 'F', Miss: 'F',
};
function talkerGender(set) {
  for (const m of set.transcript.matchAll(/\b(?:[Tt]his is|I'm|I am|[Mm]y name is)\s+([A-Z][a-z]+)/g)) {
    if (NAME_GENDER[m[1]]) return NAME_GENDER[m[1]];
    console.warn(`  ! ${set.id}: talker says "${m[0]}"; add "${m[1]}" to NAME_GENDER in generate-audio.mjs so the voice gender matches`);
  }
  return null;
}

const plan = {
  1: (set, i) => ({ accent: accentAt(1, i), gender: altGender(i) }),
  2: (set, i) => {
    const asker = { accent: accentAt(2, i), gender: altGender(i) };
    const responder = { accent: ACCENTS[(ACCENTS.indexOf(asker.accent) + pairStep(i)) % 4], gender: otherGender(asker.gender) };
    return [asker, responder];
  },
  // labels in order of first appearance -> { label: speaker }; every speaker gets a different accent
  3: (set, i, labels) => {
    const first = ACCENTS.indexOf(accentAt(3, i));
    const order = [first, (first + pairStep(i)) % 4];
    for (let k = 1; order.length < 4; k++) if (!order.includes((first + k) % 4)) order.push((first + k) % 4);
    return Object.fromEntries(labels.map((label, n) => [label, { accent: ACCENTS[order[n]], gender: label[0] === 'W' ? 'F' : 'M', label }]));
  },
  4: (set, i) => ({ accent: accentAt(4, i), gender: talkerGender(set) ?? altGender(i) }),
};

// ---------------------------------------------------------------- engines: speaker -> concrete voice
const EDGE_VOICES = {
  US: { F: ['en-US-AvaNeural', 'en-US-EmmaNeural'], M: ['en-US-BrianNeural', 'en-US-ChristopherNeural'] },
  GB: { F: ['en-GB-SoniaNeural', 'en-GB-LibbyNeural'], M: ['en-GB-RyanNeural', 'en-GB-ThomasNeural'] },
  CA: { F: ['en-CA-ClaraNeural'], M: ['en-CA-LiamNeural'] },
  AU: { F: ['en-AU-NatashaNeural'], M: ['en-AU-WilliamMultilingualNeural'] },
};
// Speakers talk a little slower than the voices' default so learners can follow; the naturally fast
// voices (measured ~3.2-3.5 words/s) a bit more, which brings everyone to roughly 2.6-3.1 words/s.
const EDGE_RATE = { default: '-4%', 'en-US-BrianNeural': '-8%', 'en-GB-RyanNeural': '-8%', 'en-GB-ThomasNeural': '-8%', 'en-AU-WilliamMultilingualNeural': '-8%' };
function makeCast(engineName) {
  if (engineName === 'edge') {
    const used = {}; // per test: alternate between the voices of one accent+gender
    return {
      narrator: { name: 'en-US-AndrewNeural', rate: '-5%', accent: 'US', narrator: true },
      voice({ accent, gender }) {
        const list = EDGE_VOICES[accent][gender];
        const k = `${accent}${gender}`;
        used[k] = (used[k] ?? -1) + 1;
        const name = list[used[k] % list.length];
        return { name, rate: EDGE_RATE[name] ?? EDGE_RATE.default, accent };
      },
    };
  }
  // OneCore: US voices only. Two extra "characters" are made by changing pitch/rate.
  const V = {
    man: { name: 'Microsoft David' }, man2: { name: 'Microsoft Mark' },
    woman: { name: 'Microsoft Zira' }, woman2: { name: 'Microsoft Zira', pitch: '+14%', rate: '+4%' },
  };
  return {
    narrator: { name: 'Microsoft Mark', rate: '-5%', accent: 'US', narrator: true },
    voice({ accent, gender, label }) {
      const alt = label ? /2$/.test(label) : ACCENTS.indexOf(accent) % 2 === 1;
      const v = gender === 'F' ? (alt ? V.woman2 : V.woman) : (alt ? V.man2 : V.man);
      return { ...v, accent: 'US' };
    },
  };
}

// ---------------------------------------------------------------- script builders per part
// A script is a list of { voice, text } and { pause: seconds } items.
const say = (voice, text) => ({ voice, text });
const pause = (sec) => ({ pause: sec });

const TALK_TYPE = {
  broadcast: 'broadcast', voicemail: 'telephone message', announcement: 'announcement', talk: 'talk',
  meeting: 'excerpt from a meeting', advertisement: 'advertisement', news: 'news report', introduction: 'introduction',
};
const graphicWord = (g) => (g?.type === 'bar-chart' ? 'chart' : g ? 'table' : null);
const choiceLines = (q) => Object.entries(q.choices).map(([label, text]) => [label, text]);

function part1(set, idx, cast) {
  const q = set.questions[0];
  const N = cast.narrator;
  const voice = cast.voice(plan[1](set, idx));
  const items = [say(N, `Number ${q.number}. Look at the picture marked number ${q.number} in your test book.`), pause(1.2)];
  for (const [label, text] of choiceLines(q)) items.push(say(voice, `${label}. ${text}`), pause(1.3));
  return items;
}

function part2(set, idx, cast) {
  const q = set.questions[0];
  const question = set.transcript.split('\n')[0];
  const [asker, responder] = plan[2](set, idx).map((s) => cast.voice(s));
  const items = [say(cast.narrator, `Number ${q.number}.`), pause(0.6), say(asker, question), pause(1.2)];
  for (const [label, text] of choiceLines(q)) items.push(say(responder, `${label}. ${text}`), pause(1.2));
  return items;
}

function questionReadings(set, cast) {
  if (!readQuestions) return [];
  const extra = set.graphic ? 4 : 0;
  return set.questions.flatMap((q) => [say(cast.narrator, `Number ${q.number}. ${q.prompt}`), pause(answerPause + extra)]);
}

function part3(set, idx, cast) {
  const first = set.questions[0].number;
  const last = set.questions.at(-1).number;
  const lines = set.transcript.split('\n').map((l) => l.match(/^(M1|M2|W1|W2|M|W):\s*(.+)$/));
  if (lines.some((m) => !m)) throw new Error(`${set.id}: every Part 3 line must start with M:, W:, M1:, ...`);
  const labels = [...new Set(lines.map((m) => m[1]))];
  const speakers = plan[3](set, idx, labels);
  const voices = Object.fromEntries(labels.map((l) => [l, cast.voice(speakers[l])]));
  const kind = labels.length >= 3 ? 'conversation with three speakers' : 'conversation';
  const g = graphicWord(set.graphic);
  const intro = `Questions ${first} through ${last} refer to the following ${kind}${g ? ` and ${g}` : ''}.`;
  const items = [say(cast.narrator, intro), pause(1)];
  for (const [, who, text] of lines) items.push(say(voices[who], text), pause(0.45));
  items.push(pause(1), ...questionReadings(set, cast));
  return items;
}

function part4(set, idx, cast) {
  const first = set.questions[0].number;
  const last = set.questions.at(-1).number;
  const g = graphicWord(set.graphic);
  const kind = TALK_TYPE[set.passage_type] ?? 'talk';
  const intro = `Questions ${first} through ${last} refer to the following ${kind}${g ? ` and ${g}` : ''}.`;
  const voice = cast.voice(plan[4](set, idx));
  return [say(cast.narrator, intro), pause(1), say(voice, set.transcript), pause(1), ...questionReadings(set, cast)];
}

// speakers (not the narrator) in order of first appearance
function speakersOf(items) {
  const seen = new Map();
  for (const it of items) if (it.voice && !it.voice.narrator) seen.set(it.voice.name + (it.voice.pitch ?? ''), it.voice);
  return [...seen.values()];
}

// ---------------------------------------------------------------- helpers
function run(cmd, cmdArgs, label, opts = {}) {
  const r = spawnSync(cmd, cmdArgs, { encoding: opts.binary ? 'buffer' : 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: opts.inherit ? 'inherit' : 'pipe' });
  if (r.error) throw new Error(`${label}: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`${label} failed (exit ${r.status})${opts.inherit ? '' : `:\n${r.stderr || r.stdout}`}`);
  return r.stdout;
}
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
const sha = (s, n = 16) => createHash('sha1').update(s).digest('hex').slice(0, n);
const round1 = (x) => Math.round(x * 10) / 10;

// ---------------------------------------------------------------- engine: OneCore (offline SSML)
const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// The OneCore engine already appends ~0.85 s of silence after every <voice> element,
// so a requested pause only adds the remainder. Measured with ffmpeg silencedetect.
const VOICE_TAIL_SEC = 0.85;
function toSsml(items) {
  const parts = items.map((it) => {
    if (it.pause !== undefined) {
      const extra = it.pause - VOICE_TAIL_SEC;
      return extra > 0.05 ? `<break time="${Math.round(extra * 1000)}ms"/>` : '';
    }
    const v = it.voice;
    const attrs = [v.pitch && `pitch="${v.pitch}"`, v.rate && `rate="${v.rate}"`].filter(Boolean).join(' ');
    const body = attrs ? `<prosody ${attrs}>${xml(it.text)}</prosody>` : xml(it.text);
    return `<voice name="${v.name}">${body}</voice>`;
  });
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">${parts.join('')}</speak>`;
}

function synthOneCore(jobs, work) {
  const jobsFile = join(work, 'jobs.json');
  writeFileSync(jobsFile, JSON.stringify(jobs.map(({ id, items }) => ({ id, ssml: toSsml(items) }))), 'utf8');
  run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', join(HERE, 'synthesize.ps1'), '-JobsFile', jobsFile, '-OutDir', work], 'TTS');
  for (const job of jobs) {
    const wav = join(work, `${job.id}.wav`);
    const trimmed = join(work, `${job.id}.trim.wav`);
    // Trim leading/trailing silence, then add 0.3 s padding at both ends
    const trim = 'silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse,adelay=300,apad=pad_dur=0.3';
    run(FFMPEG, ['-y', '-loglevel', 'error', '-i', wav, '-af', trim, trimmed], `ffmpeg trim ${job.id}`);
    encodeMp3(trimmed, job, '48k');
    job.duration = wavDuration(trimmed);
  }
}

// ---------------------------------------------------------------- engine: edge-tts (online neural voices)
const SR = 24000; // edge-tts delivers 24 kHz mono MP3
const EDGE_PIPELINE = { v: 1, sr: SR, lead: 0.03, tail: 0.06, gateDb: -50, targetDb: -20, peak: 0.89, edgePad: 0.3, kbps: '64k' };
// Cache inside the project, not a fixed name in the shared OS temp dir: there another
// local user could pre-create the directory or plant symlinks (CodeQL js/insecure-temporary-file).
const EDGE_CACHE = process.env.EDGE_TTS_CACHE || join(HERE, '.cache', 'edge-tts');
const segKey = (it) => `${sha(`${it.voice.name}|${it.voice.rate ?? '+0%'}|${it.voice.pitch ?? '+0Hz'}|${it.text}`, 24)}.mp3`;

function runEdgeTts(segments) {
  mkdirSync(EDGE_CACHE, { recursive: true });
  const todo = segments.filter((s) => !existsSync(join(EDGE_CACHE, s.file)));
  console.log(`  ${segments.length} spoken segments, ${segments.length - todo.length} cached, ${todo.length} to synthesize (cache: ${EDGE_CACHE})`);
  if (!todo.length) return;
  writeFileSync(join(EDGE_CACHE, 'jobs.json'), JSON.stringify(todo), 'utf8');
  if (process.env.EDGE_TTS_PYTHON) {
    run(process.env.EDGE_TTS_PYTHON, [join(HERE, 'edge_synth.py'), join(EDGE_CACHE, 'jobs.json')], 'edge-tts', { inherit: true });
    return;
  }
  const volume = process.env.EDGE_TTS_PIP_VOLUME || 'on-ta-pip';
  const image = process.env.EDGE_TTS_IMAGE || 'python:3.12-slim';
  const env = process.env.EDGE_TTS_CONCURRENCY ? ['-e', `EDGE_TTS_CONCURRENCY=${process.env.EDGE_TTS_CONCURRENCY}`] : [];
  try {
    run('docker', ['run', '--rm', '-v', `${volume}:/pip:ro`, '-v', `${EDGE_CACHE}:/work`, '-v', `${HERE}:/tts:ro`, '-e', 'PYTHONPATH=/pip', ...env,
      image, 'python', '/tts/edge_synth.py', '/work/jobs.json'], 'edge-tts (docker)', { inherit: true });
  } catch (e) {
    throw new Error(`${e.message}\nedge-tts needs Docker Desktop running and the volume "${volume}" with edge-tts installed (see the top of this file),\n` +
      'plus internet access. Re-running resumes from the cache. Offline alternative: --engine onecore');
  }
}

const pcmCache = new Map();
function decodeSegment(file) {
  if (!pcmCache.has(file)) {
    const buf = run(FFMPEG, ['-v', 'error', '-i', join(EDGE_CACHE, file), '-f', 's16le', '-ac', '1', '-ar', String(SR), '-'], `ffmpeg decode ${file}`, { binary: true });
    pcmCache.set(file, new Int16Array(buf.buffer, buf.byteOffset, buf.length >> 1));
  }
  return pcmCache.get(file);
}

// Cut the silence edge-tts leaves around speech (keeping a few ms so no consonant is clipped)
// and bring every segment to the same speech level, so accents/voices sound equally loud.
function prepareSegment(pcm) {
  const win = SR / 100; // 10 ms
  const gate = 32768 * 10 ** (EDGE_PIPELINE.gateDb / 20);
  const active = 32768 * 10 ** (-40 / 20);
  let first = -1, last = -1, energy = 0, activeN = 0, peak = 0;
  for (let w = 0; w * win < pcm.length; w++) {
    let sum = 0;
    const end = Math.min(pcm.length, (w + 1) * win);
    for (let i = w * win; i < end; i++) { sum += pcm[i] * pcm[i]; if (Math.abs(pcm[i]) > peak) peak = Math.abs(pcm[i]); }
    const rms = Math.sqrt(sum / (end - w * win));
    if (rms > gate) { if (first < 0) first = w; last = w; }
    if (rms > active) { energy += sum; activeN += end - w * win; }
  }
  if (first < 0) return { pcm: new Int16Array(0), speechSec: 0, levelDb: -Infinity, gainDb: 0 };
  const start = Math.max(0, first * win - Math.round(EDGE_PIPELINE.lead * SR));
  const stop = Math.min(pcm.length, (last + 1) * win + Math.round(EDGE_PIPELINE.tail * SR));
  const levelDb = activeN ? 10 * Math.log10(energy / activeN / 32768 ** 2) : -60;
  const gain = Math.min(10 ** ((EDGE_PIPELINE.targetDb - levelDb) / 20), (EDGE_PIPELINE.peak * 32767) / Math.max(peak, 1), 4);
  const out = new Int16Array(stop - start);
  for (let i = 0; i < out.length; i++) out[i] = Math.max(-32768, Math.min(32767, Math.round(pcm[start + i] * gain)));
  return { pcm: out, speechSec: (stop - start) / SR, levelDb, gainDb: 20 * Math.log10(gain) };
}

function wavFile(samples) {
  const data = Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

function synthEdge(jobs, work) {
  const segments = new Map();
  for (const job of jobs) for (const it of job.items) if (it.text) {
    const file = segKey(it);
    segments.set(file, { file, voice: it.voice.name, rate: it.voice.rate ?? '+0%', pitch: it.voice.pitch ?? '+0Hz', text: it.text });
  }
  runEdgeTts([...segments.values()]);
  const missing = [...segments.keys()].filter((f) => !existsSync(join(EDGE_CACHE, f)));
  if (missing.length) throw new Error(`edge-tts could not synthesize ${missing.length} segment(s); run again to retry (finished ones are cached)`);

  const report = [];
  for (const job of jobs) {
    // merge consecutive pauses, drop leading/trailing ones (the file gets 0.3 s padding at both ends instead)
    const chunks = [];
    const segStats = [];
    let gap = 0;
    const pad = new Int16Array(Math.round(EDGE_PIPELINE.edgePad * SR));
    chunks.push(pad);
    let started = false;
    for (const it of job.items) {
      if (it.pause !== undefined) { gap += it.pause; continue; }
      const seg = prepareSegment(decodeSegment(segKey(it)));
      if (started && gap > 0) chunks.push(new Int16Array(Math.round(gap * SR)));
      const words = it.text.split(/\s+/).filter(Boolean).length;
      segStats.push({ voice: it.voice.name, words, sec: round1(seg.speechSec), wps: seg.speechSec ? Math.round((words / seg.speechSec) * 100) / 100 : 0, levelDb: round1(seg.levelDb), gainDb: round1(seg.gainDb), gapBefore: started ? round1(gap) : 0, text: it.text.slice(0, 60) });
      chunks.push(seg.pcm);
      started = true;
      gap = 0;
    }
    chunks.push(pad);
    const total = chunks.reduce((n, c) => n + c.length, 0);
    const all = new Int16Array(total);
    let off = 0;
    for (const c of chunks) { all.set(c, off); off += c.length; }
    const wav = join(work, `${job.id}.wav`);
    writeFileSync(wav, wavFile(all));
    encodeMp3(wav, job, EDGE_PIPELINE.kbps);
    job.duration = total / SR;
    report.push({ id: job.id, part: job.part, duration: round1(job.duration), segments: segStats });
  }
  if (reportFile) writeFileSync(reportFile, JSON.stringify(report, null, 1));
}

function encodeMp3(wav, job, kbps) {
  const mp3 = join(ROOT, job.rel);
  mkdirSync(dirname(mp3), { recursive: true });
  run(FFMPEG, ['-y', '-loglevel', 'error', '-i', wav, '-ac', '1', '-codec:a', 'libmp3lame', '-b:a', kbps, mp3], `ffmpeg mp3 ${job.id}`);
}

// ---------------------------------------------------------------- main
const bundlePath = join(ROOT, 'toeic.json');
if (!existsSync(bundlePath)) { console.error('database/toeic.json not found. Run: node database/build.mjs'); process.exit(1); }
const bundle = JSON.parse(readFileSync(bundlePath, 'utf8'));
// Read directly instead of existsSync() + read (check-then-use race, CodeQL js/file-system-race).
function readManifest() {
  try {
    return JSON.parse(readFileSync(MANIFEST, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return {};
    throw e;
  }
}
const manifest = readManifest();

const jobs = [];
const distribution = []; // [test, part, accent, voice] per speaker, to print the rotation
for (const test of bundle.tests) {
  if (onlyTest && test.id !== onlyTest) continue;
  const counters = {};
  const cast = makeCast(engine);
  for (const set of test.sets) {
    if (set.part > 4) continue;
    const idx = (counters[set.part] = (counters[set.part] ?? -1) + 1);
    const build = { 1: part1, 2: part2, 3: part3, 4: part4 }[set.part];
    const items = build(set, idx, cast);
    const speakers = speakersOf(items);
    for (const v of speakers) distribution.push([test.id, set.part, v.accent, v.name]);
    const hash = sha(JSON.stringify({ engine, pipeline: engine === 'edge' ? EDGE_PIPELINE : 'onecore-ssml-v1', items }));
    const rel = `audio/${test.id}/${set.id}.mp3`;
    const fresh = manifest[set.id]?.hash === hash && existsSync(join(ROOT, rel));
    if (fresh && !force) continue;
    jobs.push({ id: set.id, part: set.part, items, hash, rel, testId: test.id, speakers });
  }
}

// Accent distribution (speakers per part; the narrator is not counted)
const tests = [...new Set(distribution.map((d) => d[0]))];
console.log('\nSpeakers per accent (narrator not counted):');
console.log(`  ${'test'.padEnd(14)} part   ${ACCENTS.map((a) => a.padStart(3)).join(' ')}`);
for (const t of tests) {
  for (const p of [1, 2, 3, 4, 'all']) {
    const rows = distribution.filter((d) => d[0] === t && (p === 'all' || d[1] === p));
    console.log(`  ${t.padEnd(14)} ${String(p).padEnd(6)} ${ACCENTS.map((a) => String(rows.filter((d) => d[2] === a).length).padStart(3)).join(' ')}`);
  }
}

if (!jobs.length) {
  console.log('All audio is up to date. Use --force to regenerate.');
} else {
  console.log(`\nSynthesizing ${jobs.length} listening set(s) with engine "${engine}"...`);
  const work = mkdtempSync(join(tmpdir(), 'toeic-tts-'));
  try {
    (engine === 'edge' ? synthEdge : synthOneCore)(jobs, work);
    for (const job of jobs) {
      manifest[job.id] = {
        test_id: job.testId, file: job.rel, hash: job.hash, duration_sec: round1(job.duration),
        engine, voices: job.speakers.map((v) => v.name + (v.pitch ? ` (pitch ${v.pitch})` : '')), accents: job.speakers.map((v) => v.accent),
      };
      console.log(`  ${job.rel}  ${manifest[job.id].duration_sec}s  ${manifest[job.id].accents.join('+')}`);
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  const sorted = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)));
  // Atomic replace: write a fresh sibling temp file (wx = fail if it exists), then rename it over the manifest.
  const tmpManifest = `${MANIFEST}.${process.pid}.tmp`;
  writeFileSync(tmpManifest, JSON.stringify(sorted, null, 2) + '\n', { flag: 'wx' });
  renameSync(tmpManifest, MANIFEST);
}

// Rebuild so audio_url is written into toeic.db / toeic.json
console.log('\nRebuilding database...');
process.stdout.write(run(process.execPath, [join(ROOT, 'build.mjs')], 'build').split('\n').slice(0, 1).join('\n') + '\n');
