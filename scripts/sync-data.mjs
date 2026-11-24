// Copies the generated database bundle and audio into public/ so Vite can serve them.
// Runs automatically before `npm run dev` and `npm run build`.
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'database');
const out = join(root, 'public', 'data');

if (!existsSync(join(src, 'toeic.json'))) {
  console.error('database/toeic.json is missing. Run: npm run db:build');
  process.exit(1);
}
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(join(src, 'toeic.json'), join(out, 'toeic.json'));
if (existsSync(join(src, 'audio'))) {
  cpSync(join(src, 'audio'), join(out, 'audio'), { recursive: true, filter: (p) => !p.endsWith('manifest.json') });
}
if (existsSync(join(src, 'images'))) {
  // credits.json is build-time provenance (generation prompts, licences) that
  // build.mjs folds into toeic.json; the client never reads it, so it stays private.
  cpSync(join(src, 'images'), join(out, 'images'), { recursive: true, filter: (p) => !p.endsWith('credits.json') });
}
console.log('Synced database/toeic.json, audio and images -> public/data/');
