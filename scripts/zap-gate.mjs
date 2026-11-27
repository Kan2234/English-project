// Risk gate for an OWASP ZAP baseline report (staging.yml, job dast).
// Usage: node scripts/zap-gate.mjs <report.json> <rules.tsv>
//
// Exits 1 when
//   - an alert of risk High or Medium comes from a rule that rules.tsv does not
//     explicitly downgrade (WARN, INFO or IGNORE, each with a written reason), or
//   - any alert comes from a rule that rules.tsv sets to FAIL.
// Low and Informational alerts never fail. Prints a Markdown table of every alert,
// also appended to $GITHUB_STEP_SUMMARY when it is set.
import { appendFileSync, readFileSync } from 'node:fs';

const [reportPath, rulesPath] = process.argv.slice(2);
if (!reportPath || !rulesPath) {
  console.error('Usage: node scripts/zap-gate.mjs <report.json> <rules.tsv>');
  process.exit(2);
}

// Same format ZAP reads with -c: "<id>\t<LEVEL>\t<text>", # comments, blank lines.
const levels = new Map();
for (const line of readFileSync(rulesPath, 'utf8').split(/\r?\n/)) {
  if (line.startsWith('#') || !line.trim()) continue;
  const [id, level] = line.split('\t');
  levels.set(id.trim(), level?.trim());
}

let report;
try {
  report = JSON.parse(readFileSync(reportPath, 'utf8'));
} catch (e) {
  console.error(`No usable ZAP report at ${reportPath}: ${e.message}`);
  process.exit(1);
}

const RISK = ['Informational', 'Low', 'Medium', 'High'];
const DOWNGRADED = new Set(['WARN', 'INFO', 'IGNORE']);
const rows = [];
let blocking = 0;
for (const site of report.site ?? []) {
  for (const a of site.alerts ?? []) {
    const risk = Number(a.riskcode);
    const level = levels.get(String(a.pluginid)) ?? '';
    const blocks = level === 'FAIL' || (risk >= 2 && !DOWNGRADED.has(level));
    if (blocks) blocking++;
    const urls = (a.instances ?? []).map((i) => i.uri);
    rows.push({ id: a.pluginid, name: a.alert ?? a.name, risk: RISK[risk] ?? String(a.riskcode), count: Number(a.count ?? urls.length), level: level || '-', blocks, urls });
  }
}
rows.sort((x, y) => Number(y.blocks) - Number(x.blocks) || RISK.indexOf(y.risk) - RISK.indexOf(x.risk));

// Alert names and URLs come from the scanned site: keep table-breaking characters out.
const cell = (s) => String(s).replace(/[|\r\n`]/g, ' ');
const md = [
  '### ZAP baseline',
  '',
  rows.length ? '| Rule | Alert | Risk | Count | rules.tsv | Gate |' : 'No alerts.',
  ...(rows.length ? ['|---|---|---|---:|---|---|'] : []),
  ...rows.map((r) => `| ${cell(r.id)} | ${cell(r.name)} | ${r.risk} | ${r.count} | ${r.level} | ${r.blocks ? '**FAIL**' : 'ok'} |`),
  '',
  blocking ? `**${blocking} blocking alert(s).** Fix them, or downgrade the rule in \`.zap/rules.tsv\` with a one-line reason.` : 'No blocking alerts (High/Medium fail unless downgraded in `.zap/rules.tsv`).',
  '',
].join('\n');

console.log(md);
for (const r of rows.filter((x) => x.blocks)) console.log(`BLOCKING [${r.id}] ${r.name}: ${r.urls.slice(0, 5).join(', ')}`);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${md}\n`);
process.exit(blocking ? 1 : 0);
