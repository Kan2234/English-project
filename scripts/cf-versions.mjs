// Cloudflare Worker versions for the release pipeline: _release.yml (deploy, smoke,
// auto-rollback), rollback.yml (manual rollback) and drill.yml (rollback drill).
// Every piece of wrangler output the pipeline relies on is parsed here, and only here.
//
//   node scripts/cf-versions.mjs active      --name W --env E           version ID serving 100%, or "none"
//   node scripts/cf-versions.mjs previous    --name W --env E           version that served before the active deployment
//   node scripts/cf-versions.mjs deployed    --file F                   version ID from a WRANGLER_OUTPUT_FILE_PATH file
//   node scripts/cf-versions.mjs wait-active --name W --env E --to ID   poll until ID serves 100%
//   node scripts/cf-versions.mjs rollback    --name W --env E --to ID --message M
//   node scripts/cf-versions.mjs deployments --name W --env E           Markdown table of recent deployments
//   node scripts/cf-versions.mjs delete      --name W --env E           delete a *-drill Worker (absent = fine)
//   node scripts/cf-versions.mjs live-assets --url U                    ./assets/* that U/ serves now ("" if unreachable)
//   node scripts/cf-versions.mjs wait-live   --url U (--html F | --assets "a b")
//   MESSAGE=... node scripts/cf-versions.mjs message                    $MESSAGE made safe for a --message
//
// `--env ""` targets the top-level Worker in wrangler.jsonc (passed to wrangler as
// `--env=`, which also silences its "no target environment" warning).
//
// Verified against wrangler 4.159.0 (node_modules/wrangler/wrangler-dist/cli.js):
// - `deployments status --json` prints the latest deployment as one JSON object,
//   { id, created_on, annotations, versions: [{ version_id, percentage }] }, and
//   no banner (printBanner is off with --json).
// - `deployments list --json` prints up to 10 deployments as a JSON array sorted
//   OLDEST first (handler sorts by created_on ascending).
// - With WRANGLER_OUTPUT_FILE_PATH set, wrangler appends NDJSON entries: `deploy`
//   ({ version_id, worker_name, ... }) after a deploy and `command-failed`
//   ({ code, message }) when a command throws. A missing Worker is Cloudflare API
//   error 10007 (WORKER_NOT_FOUND_ERR_CODE); a Worker without deployments is the
//   UserError "The Worker <name> has no deployments.".
// - `rollback [version-id] --name --message -y`: in CI (non-interactive) wrangler
//   uses the --message as the default of its message prompt and auto-confirms.
// - `delete` does NOT use `wrangler delete`: in 4.159.0 it first lists the account's
//   KV namespaces and aborts on a 403 (code 10000) when the token lacks KV read, which
//   the first drill hit. The pipeline tokens only hold Workers Scripts › Edit, so
//   delete calls DELETE /accounts/{id}/workers/scripts/{name}?force=true directly.
import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const WRANGLER = join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');

export const VERSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const WORKER_NAME = /^[a-z0-9][a-z0-9-]{0,62}$/;
export const WRANGLER_ENV = /^(|[a-z][a-z0-9_-]{0,31})$/;
export const WORKER_NOT_FOUND = 10007;
/** Version and deployment messages are truncated to 100 bytes by the Cloudflare API. */
export const MAX_MESSAGE = 100;

// ------------------------------------------------------------------ pure parsing (unit tested)

/** Entries of a WRANGLER_OUTPUT_FILE_PATH file; lines that are not JSON objects are skipped. */
export function parseNdjson(text) {
  return String(text ?? '')
    .split('\n')
    .map((l) => {
      try {
        const v = JSON.parse(l);
        return v && typeof v === 'object' ? v : null;
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

/** Version ID of the last `deploy` entry; throws when there is none or it is malformed. */
export function deployedVersionId(ndjsonText) {
  const entry = parseNdjson(ndjsonText).filter((e) => e.type === 'deploy').pop();
  if (!entry) throw new Error('wrangler wrote no "deploy" entry: the deploy did not complete');
  if (!VERSION_ID.test(String(entry.version_id))) throw new Error(`unexpected version_id in the deploy entry: ${JSON.stringify(entry.version_id)}`);
  return entry.version_id;
}

/** JSON printed by a `--json` command, tolerating stray lines before it. */
export function parseJsonOutput(stdout) {
  const text = String(stdout ?? '').trim();
  try {
    return JSON.parse(text);
  } catch {
    const start = text.search(/^[[{]/m);
    if (start >= 0) {
      try {
        return JSON.parse(text.slice(start));
      } catch {
        // fall through
      }
    }
  }
  throw new Error(`wrangler did not print JSON: ${text.slice(0, 200)}`);
}

/** The version serving 100% of traffic in one deployment object. */
export function fullVersionOf(deployment) {
  const versions = deployment?.versions;
  if (!Array.isArray(versions) || versions.length === 0) throw new Error('deployment has no versions');
  const full = versions.find((v) => v.percentage === 100);
  if (!full || versions.length !== 1) {
    throw new Error(
      `the deployment splits traffic (${versions.map((v) => `${v.version_id} ${v.percentage}%`).join(', ')}): ` +
        'finish or undo the gradual deployment in the Cloudflare dashboard first',
    );
  }
  if (!VERSION_ID.test(String(full.version_id))) throw new Error(`unexpected version_id: ${JSON.stringify(full.version_id)}`);
  return full.version_id;
}

/** True when a failed wrangler call means "no such Worker" or "Worker without deployments". */
export function isNoWorker(entries) {
  return entries.some(
    (e) => e.type === 'command-failed' && (e.code === WORKER_NOT_FOUND || /has no deployments/.test(String(e.message ?? ''))),
  );
}

/**
 * Outcome of DELETE /accounts/{id}/workers/scripts/{name}: "deleted", "absent" (HTTP 404
 * or API error 10007, so already gone) or an Error to throw. Never echoes the token.
 */
export function deleteOutcome(status, body) {
  const errors = Array.isArray(body?.errors) ? body.errors : [];
  if (status >= 200 && status < 300 && body?.success !== false) return 'deleted';
  if (status === 404 || errors.some((e) => e?.code === WORKER_NOT_FOUND)) return 'absent';
  const detail = errors.map((e) => `${e?.message ?? 'error'} [code ${e?.code ?? '?'}]`).join('; ') || 'no error details';
  return new Error(`Cloudflare API delete failed (HTTP ${status}): ${detail}`);
}

const isRollback = (d) =>
  d?.annotations?.['workers/triggered_by'] === 'rollback' || /^(auto-|manual )?rollback\b/i.test(String(d?.annotations?.['workers/message'] ?? ''));

/**
 * The version a plain "roll back one step" should return to, from `deployments list --json`
 * (oldest first): the 100% version of the newest deployment before the active one whose
 * version differs from the active version. Same idea as wrangler's own default, with one
 * refusal: when the active deployment is itself a rollback, "one step back" would be the
 * release that was just rolled back, so the caller must name a version explicitly.
 */
export function previousVersion(deployments) {
  if (!Array.isArray(deployments) || deployments.length === 0) throw new Error('the Worker has no deployments');
  const newestFirst = [...deployments].sort((a, b) => String(b.created_on).localeCompare(String(a.created_on)));
  const [active, ...older] = newestFirst;
  const activeId = fullVersionOf(active);
  if (isRollback(active)) {
    throw new Error(
      `the active deployment (${active.created_on}, version ${activeId}) is already a rollback; ` +
        'one step back would be the release it rolled back. Pick the version explicitly (version_id).',
    );
  }
  for (const d of older) {
    const full = d.versions?.length === 1 && d.versions[0].percentage === 100 ? d.versions[0].version_id : null;
    if (full && full !== activeId && VERSION_ID.test(full)) return full;
  }
  throw new Error('no earlier version that served 100% of traffic in the last 10 deployments');
}

/** Free text made safe for a wrangler --message: printable ASCII subset, one line, ≤ 100 chars. */
export function sanitizeMessage(text, max = MAX_MESSAGE) {
  return String(text ?? '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '') // accents: "Lỗi" -> "Loi"
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^A-Za-z0-9 .,:;_()#/+-]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s-]+/, '') // never starts like a command-line flag
    .slice(0, max)
    .trim();
}

/** Sorted, de-duplicated ./assets/* references of an index.html (the build's fingerprint). */
export function assetSet(html) {
  return [...new Set(String(html ?? '').match(/\.\/assets\/[A-Za-z0-9_.-]+/g) ?? [])].sort();
}

const cell = (s) => sanitizeMessage(s, 80) || '-';

/** Markdown table of `deployments list --json` (newest first); every cell is sanitised. */
export function deploymentsTable(deployments) {
  const rows = [...deployments]
    .sort((a, b) => String(b.created_on).localeCompare(String(a.created_on)))
    .map((d) => {
      const versions = (d.versions ?? []).map((v) => `\`${cell(v.version_id)}\` ${Number(v.percentage)}%`).join(', ');
      const how = d.annotations?.['workers/triggered_by'] ?? d.source;
      return `| ${cell(d.created_on)} | ${versions || '-'} | ${cell(how)} | ${cell(d.annotations?.['workers/message'])} |`;
    });
  return ['| Created (UTC) | Version(s) | Trigger | Message |', '|---|---|---|---|', ...rows].join('\n');
}

// ------------------------------------------------------------------ wrangler calls

function wrangler(args, { inherit = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'cf-versions-'));
  const out = join(dir, 'out.ndjson');
  try {
    const r = spawnSync(process.execPath, [WRANGLER, ...args], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      stdio: inherit ? ['ignore', 'inherit', 'inherit'] : ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, WRANGLER_OUTPUT_FILE_PATH: out, WRANGLER_SEND_METRICS: 'false' },
    });
    let entries = [];
    try {
      entries = parseNdjson(readFileSync(out, 'utf8'));
    } catch {
      // no output file: wrangler failed before writing anything
    }
    if (r.error) throw r.error;
    return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', entries };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function failed(what, r) {
  const msg = r.entries.filter((e) => e.type === 'command-failed').map((e) => `${e.message ?? ''}${e.code ? ` [code ${e.code}]` : ''}`);
  return new Error(`wrangler ${what} failed (exit ${r.status}): ${msg.join('; ') || r.stderr.trim().split('\n').slice(-5).join(' | ')}`);
}

const target = (o) => [`--name`, o.name, `--env=${o.env}`];

/** Active version ID, or null when the Worker does not exist yet / has never been deployed. */
function activeVersion(o) {
  const r = wrangler(['deployments', 'status', '--json', ...target(o)]);
  if (r.status !== 0) {
    if (isNoWorker(r.entries)) return null;
    throw failed('deployments status', r);
  }
  return fullVersionOf(parseJsonOutput(r.stdout));
}

function deploymentsList(o) {
  const r = wrangler(['deployments', 'list', '--json', ...target(o)]);
  if (r.status !== 0) {
    if (isNoWorker(r.entries)) return [];
    throw failed('deployments list', r);
  }
  const list = parseJsonOutput(r.stdout);
  if (!Array.isArray(list)) throw new Error('deployments list --json did not print an array');
  return list;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitActive(o, id, attempts = 12, intervalMs = 5000) {
  let last;
  for (let i = 1; i <= attempts; i++) {
    last = activeVersion(o);
    if (last === id) {
      log(`Active version is ${id} (attempt ${i}).`);
      return;
    }
    log(`Attempt ${i}: active version ${last ?? 'none'}, waiting for ${id}...`);
    if (i < attempts) await sleep(intervalMs);
  }
  throw new Error(`version ${id} is not active on ${o.name} (active: ${last ?? 'none'})`);
}

function output(key, value) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
}

const log = (s) => console.error(s);

// ------------------------------------------------------------------ live site

async function liveAssets(url, attempt = 0) {
  const u = new URL(url);
  u.searchParams.set('ci', `${process.env.GITHUB_RUN_ID ?? 'local'}-${Date.now()}-${attempt}`);
  const res = await fetch(u, { headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`GET ${url} returned ${res.status}`);
  return assetSet(await res.text());
}

async function waitLive(url, expected, attempts = 30, intervalMs = 10_000) {
  const want = expected.join(' ');
  if (!want) throw new Error('no expected assets to wait for');
  log(`Expected assets: ${want}`);
  for (let i = 1; i <= attempts; i++) {
    let live = '';
    try {
      live = (await liveAssets(url, i)).join(' ');
    } catch (e) {
      live = `(${e.message})`;
    }
    if (live === want) {
      log(`Live after ${i} attempt(s).`);
      return;
    }
    log(`Attempt ${i}: live assets '${live}', waiting...`);
    if (i < attempts) await sleep(intervalMs);
  }
  throw new Error(`${url} did not serve the expected build within ${(attempts * intervalMs) / 1000} s`);
}

// ------------------------------------------------------------------ CLI

function opts(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      name: { type: 'string' },
      env: { type: 'string' },
      to: { type: 'string' },
      message: { type: 'string' },
      file: { type: 'string' },
      url: { type: 'string' },
      html: { type: 'string' },
      assets: { type: 'string' },
      attempts: { type: 'string' },
    },
  });
  return { ...values, positionals };
}

function requireTarget(o) {
  if (!WORKER_NAME.test(o.name ?? '')) throw new Error(`invalid --name ${JSON.stringify(o.name)}`);
  if (o.env === undefined || !WRANGLER_ENV.test(o.env)) throw new Error(`invalid --env ${JSON.stringify(o.env)} (use --env "" for the top level)`);
  return o;
}

function requireVersion(id) {
  if (!VERSION_ID.test(id ?? '')) throw new Error(`invalid version ID ${JSON.stringify(id)}`);
  return id;
}

function requireUrl(url) {
  const u = new URL(url ?? '');
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error(`invalid --url ${url}`);
  return u.href;
}

export async function main(argv) {
  const [cmd, ...rest] = argv;
  const o = opts(rest);
  switch (cmd) {
    case 'active': {
      const id = activeVersion(requireTarget(o));
      log(id ? `${o.name}: version ${id} serves 100% of traffic.` : `${o.name}: the Worker does not exist yet or has no deployments.`);
      console.log(id ?? 'none');
      return;
    }
    case 'previous': {
      console.log(previousVersion(deploymentsList(requireTarget(o))));
      return;
    }
    case 'deployed': {
      console.log(deployedVersionId(readFileSync(o.file ?? '', 'utf8')));
      return;
    }
    case 'wait-active': {
      await waitActive(requireTarget(o), requireVersion(o.to));
      return;
    }
    case 'rollback': {
      requireTarget(o);
      const to = requireVersion(o.to);
      const message = sanitizeMessage(o.message) || 'rollback';
      const before = activeVersion(o);
      if (before === to) {
        log(`${to} is already active on ${o.name}: nothing to roll back.`);
        output('rolled_back', 'false');
        return;
      }
      log(`Rolling ${o.name} back from ${before ?? 'none'} to ${to} ("${message}")`);
      const r = wrangler(['rollback', to, ...target(o), `--message=${message}`, '-y'], { inherit: true });
      if (r.status !== 0) throw failed('rollback', r);
      output('rolled_back', 'true');
      await waitActive(o, to);
      return;
    }
    case 'deployments': {
      console.log(deploymentsTable(deploymentsList(requireTarget(o))));
      return;
    }
    case 'delete': {
      requireTarget(o);
      // Only ever the throwaway drill Worker: this command must never be able to delete production or staging.
      if (!/-drill$/.test(o.name)) throw new Error(`refusing to delete ${o.name}: only *-drill Workers may be deleted here`);
      const account = process.env.CLOUDFLARE_ACCOUNT_ID ?? '';
      const token = process.env.CLOUDFLARE_API_TOKEN ?? '';
      if (!/^[0-9a-f]{32}$/.test(account)) throw new Error('CLOUDFLARE_ACCOUNT_ID is missing or malformed');
      if (!token) throw new Error('CLOUDFLARE_API_TOKEN is missing');
      const res = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/${encodeURIComponent(o.name)}?force=true`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) },
      );
      const body = await res.json().catch(() => null);
      const outcome = deleteOutcome(res.status, body);
      if (outcome instanceof Error) throw outcome;
      log(outcome === 'absent' ? `${o.name} does not exist: nothing to delete.` : `Deleted the Worker ${o.name}.`);
      return;
    }
    case 'live-assets': {
      try {
        console.log((await liveAssets(requireUrl(o.url))).join(' '));
      } catch (e) {
        log(`Could not read ${o.url}: ${e.message}`);
        console.log('');
      }
      return;
    }
    case 'wait-live': {
      const expected = o.html ? assetSet(readFileSync(o.html, 'utf8')) : (o.assets ?? '').split(/\s+/).filter(Boolean).sort();
      await waitLive(requireUrl(o.url), expected, Number(o.attempts ?? 30));
      return;
    }
    case 'message': {
      // read from the environment, never from argv: free text must not be parsed as options
      console.log(sanitizeMessage(process.env.MESSAGE));
      return;
    }
    default:
      throw new Error(`unknown command ${JSON.stringify(cmd)}; see the header of scripts/cf-versions.mjs`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(`::error::${String(e.message).replace(/[\r\n]+/g, ' ')}`);
    process.exit(1);
  });
}
