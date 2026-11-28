import { describe, expect, it } from 'vitest';
import { bodyFor, commandsFor, parseResults, planActions, titleFor } from '../../scripts/scheduled-report.mjs';

const ctx = { date: '2026-11-28 19:20 UTC', runUrl: 'https://github.com/o/r/actions/runs/1', repoUrl: 'https://github.com/o/r' };
const r = (job: string, result: string) => ({ job, result });
const needs = (res: Record<string, string>) => JSON.stringify(Object.fromEntries(Object.entries(res).map(([k, v]) => [k, { result: v, outputs: {} }])));

describe('parseResults', () => {
  it('reads toJSON(needs)', () => {
    expect(parseResults(needs({ deps: 'failure', 'site-prod': 'success' }))).toEqual([
      { job: 'deps', result: 'failure' },
      { job: 'site-prod', result: 'success' },
    ]);
  });

  it.each([
    ['not json', 'nope', /not JSON/],
    ['an array', '[]', /object of jobs/],
    ['a bad job name', needs({ 'Deps; rm -rf': 'failure' }), /unexpected job name/],
    ['an unknown result', needs({ deps: 'neutral' }), /unexpected result/],
    ['a missing result', JSON.stringify({ deps: {} }), /unexpected result/],
  ])('rejects %s', (_what, json, message) => {
    expect(() => parseResults(json)).toThrow(message);
  });
});

describe('planActions', () => {
  it('opens one issue for a new failure, nothing for passes without an issue', () => {
    expect(planActions([r('deps', 'failure'), r('site-prod', 'success')], [])).toEqual([
      { kind: 'create', job: 'deps', result: 'failure', title: 'Scheduled: deps failing' },
    ]);
  });

  it('comments on the open issue instead of opening a second one', () => {
    const open = [{ number: 12, title: titleFor('deps') }];
    expect(planActions([r('deps', 'failure')], open)).toEqual([
      { kind: 'comment', job: 'deps', result: 'failure', number: 12, title: 'Scheduled: deps failing' },
    ]);
  });

  it('treats cancelled (e.g. timed out) as failing', () => {
    expect(planActions([r('dast-prod', 'cancelled')], [])[0]).toMatchObject({ kind: 'create', job: 'dast-prod' });
  });

  it('closes the open issue when the job passes again', () => {
    const open = [{ number: 7, title: titleFor('container') }];
    expect(planActions([r('container', 'success')], open)).toEqual([
      { kind: 'close', job: 'container', result: 'success', number: 7, title: 'Scheduled: container failing' },
    ]);
  });

  it('leaves the issue of a skipped job alone (weekly job on a weekday)', () => {
    expect(planActions([r('secrets-history', 'skipped')], [{ number: 3, title: titleFor('secrets-history') }])).toEqual([]);
  });

  it('matches the exact title only', () => {
    const open = [
      { number: 1, title: 'Scheduled: deps failing (old)' },
      { number: 2, title: 'scheduled: deps failing' },
      { number: 3, title: titleFor('deps-x') },
    ];
    expect(planActions([r('deps', 'failure')], open)[0].kind).toBe('create');
  });

  it('comments on the oldest duplicate and closes all of them once green', () => {
    const open = [
      { number: 20, title: titleFor('deps') },
      { number: 9, title: titleFor('deps') },
    ];
    expect(planActions([r('deps', 'failure')], open)).toMatchObject([{ kind: 'comment', number: 9 }]);
    expect(planActions([r('deps', 'success')], open).map((a) => a.number)).toEqual([9, 20]);
  });
});

describe('commands', () => {
  it('ensures the label before creating, passes bodies on stdin, never through a shell', () => {
    const actions = planActions(
      [
        { job: 'deps', result: 'failure' },
        { job: 'container', result: 'failure' },
        { job: 'site-prod', result: 'success' },
      ],
      [
        { number: 4, title: titleFor('container') },
        { number: 5, title: titleFor('site-prod') },
      ],
    );
    const cmds = commandsFor(actions, ctx);
    expect(cmds.map((c) => c.args.slice(0, 3))).toEqual([
      ['label', 'create', 'scheduled'],
      ['issue', 'create', '--title'],
      ['issue', 'comment', '4'],
      ['issue', 'close', '5'],
    ]);
    expect(cmds[0].ensureLabel).toBe(true);
    expect(cmds[1].args).toEqual(['issue', 'create', '--title', 'Scheduled: deps failing', '--label', 'scheduled', '--body-file', '-']);
    expect(cmds[1].input).toContain(ctx.runUrl);
    expect(cmds[1].input).toContain('https://github.com/o/r/blob/main/docs/runbooks/scheduled-job-do.md');
    expect(cmds[2].input).toMatch(/^Still failing on 2026-11-28/);
    expect(cmds[3].args).toContain('--reason');
  });

  it('does not touch labels when nothing is created', () => {
    const cmds = commandsFor(planActions([{ job: 'deps', result: 'success' }], [{ number: 1, title: titleFor('deps') }]), ctx);
    expect(cmds).toHaveLength(1);
    expect(cmds[0].args.slice(0, 2)).toEqual(['issue', 'close']);
  });

  it('body has the job, result, date and run URL', () => {
    const body = bodyFor({ kind: 'create', job: 'secrets-history', result: 'failure', title: titleFor('secrets-history') }, ctx);
    for (const s of ['`secrets-history`', '| Result | failure |', ctx.date, ctx.runUrl, 'gitleaks']) expect(body).toContain(s);
  });
});
