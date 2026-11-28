# Notes for coding agents

On-TA is a static TOEIC practice site (Vite + React + TypeScript) served by the Cloudflare
Worker in `worker/`. Verification and deployment are done by GitHub Actions, not by agents.
README.md ("CI trên GitHub" and below) describes the pipeline in full; this file is the short
version of what an agent may and may not do.

## Do not

- Deploy anything to Cloudflare: no `wrangler deploy`/`rollback`/`delete`, no Cloudflare API
  calls, no Cloudflare credentials. Staging deploys on merge into `staging`; production deploys
  only from a `vX.Y.Z` tag that the owner pushes and approves.
- Create or move tags, approve deployments, change rulesets, Environments or repo settings.
- Re-run `check-site`, Playwright or ZAP against the staging or production Worker by hand to
  "verify" a change. `staging.yml` runs all three after every merge and posts the
  `staging/verified` status; read that instead.
- Print secrets or enable shell tracing near them: the repo and its Actions logs are public.

## Local checks before a PR

Run only what the change touches; CI runs everything again.

```sh
npm run lint && npm run typecheck && npm test    # always
npm run build                                    # src/, public/, vite or worker changes
npm run db:build                                 # database/ source changes (commit toeic.json)
```

E2E needs a running site (`npm run deploy:staging` = local Docker on 127.0.0.1:8081) and the
Playwright image; run it locally only when changing UI flows or tests in `tests/e2e/`.

## Flow

`feat/…`, `fix/…`, `ci/…` branch from `staging` → PR into `staging` (squash) → `staging.yml`
→ release PR `staging` → `main` (merge commit) → owner tags → `production.yml`.
Hotfixes take the same path. Workflow edits: run actionlint and zizmor (commands in README).

## Reading CI results (compact; do not dump whole logs)

| Question | Command |
|---|---|
| Did the PR pass? | `gh pr checks <n>` |
| Latest runs on a branch | `gh run list --branch staging -L 5` |
| Which job failed | `gh run view <run-id>` |
| Why it failed | `gh run view <run-id> --log-failed \| tail -n 80` |
| Is a commit staging-verified? | `gh api repos/{owner}/{repo}/commits/<sha>/status --jq '.statuses[] \| select(.context=="staging/verified") \| .state'` |
| E2E / ZAP reports | `gh run download <run-id> -n playwright-report` (or `zap-report`) |
| Nightly scan / incident / drill issues | `gh issue list -l scheduled` (or `incident`, `drill`) |

Fix from the failing step's output; download artifacts only when the log is not enough.
Incident procedures: `docs/runbooks/`.
