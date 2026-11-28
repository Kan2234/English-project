// Issue bookkeeping for the nightly scans (scheduled.yml, job report).
//
//   RESULTS='{"deps":{"result":"failure"},...}' node scripts/scheduled-report.mjs [--dry-run]
//
// RESULTS is `toJSON(needs)` of the report job. For every job:
//   failure | cancelled  -> one open issue per job, titled "Scheduled: <job> failing" and
//                           labelled `scheduled`: opened if none is open, otherwise a
//                           comment is added to it (never a second issue)
//   success              -> if such an issue is open: comment and close it (self-healing)
//   skipped              -> nothing (e.g. secrets-history on a weekday)
//
// Existing issues are found by label + exact title among the OPEN issues that carry the
// `scheduled` label: only collaborators can label issues, so an issue someone else opens
// with the same title is never picked up. Job names and results are checked against
// fixed patterns before they reach a title, a body or an argument; the bodies contain
// only those, the date and the run URL built from the runner's own GITHUB_* variables.
// gh is called with an argument array (no shell) and bodies go through stdin.
//
// --dry-run (or DRY_RUN=true) prints the gh commands instead of running the writes; the
// read-only `gh issue list` still runs unless OPEN_ISSUES (JSON) is provided, so the
// logic can be exercised with fabricated results and fabricated issues.
import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const LABEL = 'scheduled';
export const LABEL_COLOR = '5319E7';
export const LABEL_DESCRIPTION = 'Opened by the nightly scans (scheduled.yml)';
export const RUNBOOK = 'docs/runbooks/scheduled-job-do.md';
const JOB = /^[a-z][a-z0-9-]{0,40}$/;
const RESULT = new Set(['success', 'failure', 'cancelled', 'skipped']);

/** What each job checks, for the issue body (unknown jobs still get an issue). */
export const DESCRIPTIONS = {
  plan: 'Decides whether the weekly jobs run tonight',
  'site-prod': 'scripts/check-site.mjs against production (https://english-project.leminhkhang2234.workers.dev)',
  'site-staging': 'scripts/check-site.mjs against staging (https://english-project-staging.leminhkhang2234.workers.dev)',
  deps: 'osv-scanner + npm audit --audit-level=high on package-lock.json (new advisories for unchanged dependencies)',
  container: 'docker build -f deploy/Dockerfile + Trivy HIGH/CRITICAL with a fix (new CVEs in the nginx:alpine base)',
  'dast-prod': 'OWASP ZAP baseline against production, gated by scripts/zap-gate.mjs and .zap/rules.tsv',
  'secrets-history': 'gitleaks over the full git history of every branch and tag (weekly)',
};

export const titleFor = (job) => `Scheduled: ${job} failing`;

/** `toJSON(needs)` -> [{ job, result }], refusing anything outside the expected shapes. */
export function parseResults(json) {
  let needs;
  try {
    needs = JSON.parse(String(json ?? ''));
  } catch {
    throw new Error('RESULTS is not JSON (expected toJSON(needs))');
  }
  if (!needs || typeof needs !== 'object' || Array.isArray(needs)) throw new Error('RESULTS must be an object of jobs');
  return Object.entries(needs).map(([job, n]) => {
    if (!JOB.test(job)) throw new Error(`unexpected job name ${JSON.stringify(job)}`);
    const result = n?.result;
    if (!RESULT.has(result)) throw new Error(`unexpected result ${JSON.stringify(result)} for ${job}`);
    return { job, result };
  });
}

/**
 * Pure decision step. `openIssues`: [{ number, title }] of OPEN issues labelled `scheduled`.
 * Returns a list of actions: { kind: 'create' | 'comment' | 'close', job, result, number?, title }.
 */
export function planActions(results, openIssues) {
  const byTitle = new Map();
  for (const i of openIssues ?? []) {
    if (!Number.isInteger(i?.number) || typeof i?.title !== 'string') continue;
    (byTitle.get(i.title) ?? byTitle.set(i.title, []).get(i.title)).push(i.number);
  }
  for (const nums of byTitle.values()) nums.sort((a, b) => a - b);
  const actions = [];
  for (const { job, result } of results) {
    const title = titleFor(job);
    const open = byTitle.get(title) ?? [];
    if (result === 'failure' || result === 'cancelled') {
      // the oldest one carries the history; duplicates (should not exist) are left alone
      actions.push(open.length ? { kind: 'comment', job, result, number: open[0], title } : { kind: 'create', job, result, title });
    } else if (result === 'success') {
      for (const number of open) actions.push({ kind: 'close', job, result, number, title });
    }
  }
  return actions;
}

/** Issue body / comment text for one action. ctx: { date, runUrl, repoUrl }. */
export function bodyFor(action, ctx) {
  const what = DESCRIPTIONS[action.job] ?? 'Scheduled job';
  if (action.kind === 'close') {
    return [`**${action.job}** passed again on ${ctx.date}: ${ctx.runUrl}`, '', 'Closed automatically by scheduled.yml.'].join('\n');
  }
  const table = [
    '| | |',
    '|---|---|',
    `| Job | \`${action.job}\` |`,
    `| Checks | ${what} |`,
    `| Result | ${action.result} |`,
    `| Date | ${ctx.date} |`,
    `| Run | ${ctx.runUrl} |`,
  ];
  if (action.kind === 'comment') return [`Still failing on ${ctx.date}.`, '', ...table].join('\n');
  return [
    `The nightly job \`${action.job}\` failed.`,
    '',
    ...table,
    '',
    `How to read and fix it: ${ctx.repoUrl}/blob/main/${RUNBOOK}. A new comment is added`,
    'for every night it still fails; the issue closes itself on the first night it passes.',
  ].join('\n');
}

/** gh invocations for the actions, in order: [{ args, input? }]. */
export function commandsFor(actions, ctx) {
  const cmds = [];
  if (actions.some((a) => a.kind === 'create')) {
    // create the label only when missing (never rewrite the owner's colour/description)
    cmds.push({ ensureLabel: true, args: ['label', 'create', LABEL, '--color', LABEL_COLOR, '--description', LABEL_DESCRIPTION] });
  }
  for (const a of actions) {
    const input = bodyFor(a, ctx);
    if (a.kind === 'create') cmds.push({ args: ['issue', 'create', '--title', a.title, '--label', LABEL, '--body-file', '-'], input });
    if (a.kind === 'comment') cmds.push({ args: ['issue', 'comment', String(a.number), '--body-file', '-'], input });
    if (a.kind === 'close') cmds.push({ args: ['issue', 'close', String(a.number), '--reason', 'completed', '--comment', input] });
  }
  return cmds;
}

function gh(args, input) {
  const r = spawnSync('gh', args, { encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'] });
  if (r.error) throw r.error;
  return r;
}

export function listOpenIssues() {
  const r = gh(['issue', 'list', '--label', LABEL, '--state', 'open', '--limit', '200', '--json', 'number,title']);
  if (r.status !== 0) throw new Error(`gh issue list failed: ${r.stderr.trim()}`);
  return JSON.parse(r.stdout);
}

const quote = (a) => (/^[\w./:=@-]+$/.test(a) ? a : `'${a.replace(/'/g, `'\\''`)}'`);

export function main(argv) {
  const dryRun = argv.includes('--dry-run') || process.env.DRY_RUN === 'true';
  const results = parseResults(process.env.RESULTS);
  const e = process.env;
  const repo = e.GH_REPO || e.GITHUB_REPOSITORY || 'Kan2234/English-project';
  const repoUrl = `${e.GITHUB_SERVER_URL || 'https://github.com'}/${repo}`;
  const runUrl = e.GITHUB_RUN_ID ? `${repoUrl}/actions/runs/${e.GITHUB_RUN_ID}` : '(local run)';
  const now = new Date();
  const ict = new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 16).replace('T', ' ');
  const ctx = { date: `${now.toISOString().slice(0, 16).replace('T', ' ')} UTC (${ict} Asia/Ho_Chi_Minh)`, runUrl, repoUrl };
  const open = e.OPEN_ISSUES ? JSON.parse(e.OPEN_ISSUES) : listOpenIssues();
  const actions = planActions(results, open);

  const lines = ['### Scheduled scans', '', '| Job | Result | Issue |', '|---|---|---|'];
  for (const { job, result } of results) {
    const a = actions.filter((x) => x.job === job);
    const issue = a.map((x) => (x.kind === 'create' ? 'open new' : `${x.kind} #${x.number}`)).join(', ') || '-';
    lines.push(`| ${job} | ${result} | ${issue} |`);
  }
  if (dryRun) lines.push('', '_Dry run: no issue was changed._');
  const md = lines.join('\n');
  console.log(md);
  if (e.GITHUB_STEP_SUMMARY) appendFileSync(e.GITHUB_STEP_SUMMARY, `${md}\n`);

  for (const c of commandsFor(actions, ctx)) {
    if (dryRun) {
      const prefix = c.ensureLabel ? `gh api repos/{repo}/labels/${LABEL} --silent || ` : '';
      console.log(`DRY RUN: ${prefix}gh ${c.args.map(quote).join(' ')}${c.input ? ' <<BODY' : ''}`);
      if (c.input) console.log(`${c.input}\nBODY`);
      continue;
    }
    if (c.ensureLabel && gh(['api', `repos/${repo}/labels/${LABEL}`, '--silent']).status === 0) continue;
    const r = gh(c.args, c.input);
    if (r.status !== 0) throw new Error(`gh ${c.args.slice(0, 2).join(' ')} failed: ${r.stderr.trim()}`);
    console.log(r.stdout.trim());
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    console.error(`::error::${String(err.message).replace(/[\r\n]+/g, ' ')}`);
    process.exit(1);
  }
}
