// Release gate for production.yml: may this tag be deployed to production?
//
//   TAG=v1.2.3 TAG_SHA=<commit> node scripts/release-gate.mjs [--status-json <file>]
//
// Needs a full clone with origin/main and origin/staging (actions/checkout with
// fetch-depth: 0). Reads the commit status of the staging commit from the GitHub
// API (GITHUB_API_URL, GITHUB_REPOSITORY, GH_TOKEN), or from --status-json, a saved
// response of GET /repos/{repo}/commits/{sha}/statuses, for local tests. That list
// endpoint, not the combined /status one: only the list includes each status's
// `creator` (checked against the live API). It is sorted newest first.
//
// A tag passes only when ALL of these hold:
//  1. its name is strict SemVer vMAJOR.MINOR.PATCH (no pre-release, no leading zeros);
//  2. it points at TAG_SHA, a commit on the first-parent history of origin/main;
//  3. that commit is a release merge commit: exactly two parents, the second one (^2)
//     on the first-parent history of origin/staging;
//  4. the tag's tree is identical to the tree of ^2 (what is deployed is byte for byte
//     what staging tested);
//  5. ^2 has the commit status `staging/verified` = success, posted by
//     github-actions[bot] (staging.yml's GITHUB_TOKEN).
//
// A tag directly on a staging commit (fast-forward) is rejected on purpose: every
// staging commit that was ever released is an ancestor of main, so accepting "any
// verified ancestor" would let a tag deploy an old or never-released staging build
// without a release PR (and its ci-ok on main). `main` only accepts merge commits, so
// the normal release flow always produces the merge commit this gate expects.
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

export const SEMVER_TAG = /^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
export const SHA = /^[0-9a-f]{40}$/;
export const STATUS_CONTEXT = 'staging/verified';
export const STATUS_CREATOR = 'github-actions[bot]';

const FLOW =
  'Release flow: PR into staging -> staging.yml sets staging/verified -> release PR staging -> main ' +
  '(merge commit) -> tag that merge commit vX.Y.Z. Hotfixes go through staging too.';

export class GateError extends Error {}

/**
 * Checks the statuses of the staging commit (GET .../commits/{sha}/statuses, newest
 * first). Only the LATEST staging/verified counts: a newer failure, or a newer
 * "success" posted by anyone but staging.yml, overrides an older green one.
 */
export function checkStatus(statuses, sha) {
  const list = Array.isArray(statuses) ? [...statuses] : [];
  list.sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')));
  const s = list.find((x) => x.context === STATUS_CONTEXT);
  if (!s) throw new GateError(`staging commit ${sha} has no ${STATUS_CONTEXT} status: staging.yml never verified it. ${FLOW}`);
  if (s.state !== 'success') throw new GateError(`staging commit ${sha} has ${STATUS_CONTEXT} = ${s.state}, not success. ${FLOW}`);
  if (s.creator?.login !== STATUS_CREATOR) {
    throw new GateError(`${STATUS_CONTEXT} on ${sha} was posted by ${s.creator?.login ?? 'unknown'}, not ${STATUS_CREATOR} (staging.yml)`);
  }
  return s;
}

export function checkTagName(tag) {
  if (!SEMVER_TAG.test(tag ?? '')) {
    throw new GateError(`tag ${JSON.stringify(tag)} is not strict SemVer vMAJOR.MINOR.PATCH (pre-release tags are not deployed)`);
  }
}

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
function gitOk(args, cwd) {
  try {
    execFileSync('git', args, { cwd, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** Git checks 2-4; returns the staging commit (^2). */
export function checkCommits(tag, sha, cwd = process.cwd()) {
  if (!SHA.test(sha ?? '')) throw new GateError(`invalid commit ${JSON.stringify(sha)}`);
  for (const ref of ['origin/main', 'origin/staging']) {
    if (!gitOk(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], cwd)) throw new GateError(`${ref} is missing: fetch with full history`);
  }
  const tagged = git(['rev-parse', '--verify', `refs/tags/${tag}^{commit}`], cwd);
  if (tagged !== sha) throw new GateError(`tag ${tag} points at ${tagged}, but this run is for ${sha}`);

  const firstParents = new Set(git(['rev-list', '--first-parent', 'origin/main'], cwd).split('\n'));
  if (!firstParents.has(sha)) {
    throw new GateError(
      gitOk(['merge-base', '--is-ancestor', sha, 'origin/main'], cwd)
        ? `tag ${tag} is on a commit that reached main through a merge (${sha.slice(0, 7)}), not on a release merge commit of main. ${FLOW}`
        : `tag ${tag} (${sha.slice(0, 7)}) is not on main. ${FLOW}`,
    );
  }

  const parents = git(['rev-list', '--parents', '-n', '1', sha], cwd).split(' ').slice(1);
  if (parents.length !== 2) {
    throw new GateError(`tag ${tag} (${sha.slice(0, 7)}) is not a merge commit (${parents.length} parent(s)). ${FLOW}`);
  }
  const staged = parents[1];
  // First-parent history of staging = the commits staging.yml ran on (staging only
  // takes squash merges). A feature commit that merely became reachable from staging
  // (e.g. via a merge) is not one of them.
  if (!new Set(git(['rev-list', '--first-parent', 'origin/staging'], cwd).split('\n')).has(staged)) {
    throw new GateError(`the merged commit ${staged.slice(0, 7)} (${tag}^2) is not on staging. ${FLOW}`);
  }
  const [tree, stagedTree] = [git(['rev-parse', `${sha}^{tree}`], cwd), git(['rev-parse', `${staged}^{tree}`], cwd)];
  if (tree !== stagedTree) {
    const files = git(['diff', '--name-only', staged, sha], cwd).split('\n').filter(Boolean);
    throw new GateError(
      `${tag} differs from the staging commit it merged (${staged.slice(0, 7)}) in ${files.length} file(s): ` +
        `${files.slice(0, 10).join(', ')}. Main has changes staging never tested: merge them into staging first. ${FLOW}`,
    );
  }
  return staged;
}

async function fetchStatus(sha) {
  const api = process.env.GITHUB_API_URL ?? 'https://api.github.com';
  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo || !process.env.GH_TOKEN) throw new Error('GITHUB_REPOSITORY and GH_TOKEN are required');
  const res = await fetch(`${api}/repos/${repo}/commits/${sha}/statuses?per_page=100`, {
    headers: { Authorization: `Bearer ${process.env.GH_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`GitHub API returned ${res.status} for the status of ${sha}`);
  return res.json();
}

export async function main(argv, env = process.env) {
  const { values } = parseArgs({ args: argv, options: { 'status-json': { type: 'string' } } });
  const tag = env.TAG;
  const sha = env.TAG_SHA;
  checkTagName(tag);
  const staged = checkCommits(tag, sha);
  const statuses = values['status-json'] ? JSON.parse(readFileSync(values['status-json'], 'utf8')) : await fetchStatus(staged);
  const status = checkStatus(statuses, staged);
  return { tag, sha, staged, statusUrl: status.target_url ?? '' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2))
    .then((r) => {
      console.log(`Gate passed: ${r.tag} = ${r.sha}, release merge of staging ${r.staged} (staging/verified: ${r.statusUrl || 'success'})`);
      if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `staged=${r.staged}\n`);
    })
    .catch((e) => {
      console.error(`::error::${String(e.message).replace(/[\r\n]+/g, ' ')}`);
      process.exit(1);
    });
}
