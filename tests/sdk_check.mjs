// SpinDoctor native OpenCode SDK component checks
// Copyright (C) 2026 RUSSELL PHILIP SMITHSON <russellsmithson77@outlook.com>
// SPDX-License-Identifier: GPL-3.0-or-later
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadNativeTools } from './native_host.mjs';

const release = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporary = mkdtempSync(path.join(tmpdir(), 'spindoctor-opencode-'));
const checks = [];
const saved = Object.fromEntries(['SPINDOCTOR_WORKSPACE', 'SPINDOCTOR_PYTHON', 'SPINDOCTOR_PYTHON_ARGS', 'SPINDOCTOR_TOOL_TIMEOUT_MS', 'SPINDOCTOR_TEST_CHILD_MODE', 'SPINDOCTOR_TEST_CHILD_PID'].map((name) => [name, process.env[name]]));
function check(name, pass, detail) { checks.push({ name, pass: Boolean(pass), ...(detail === undefined ? {} : { detail }) }); console.error(`${pass ? 'PASS' : 'FAIL'} ${name}`); }
try {
  process.env.SPINDOCTOR_WORKSPACE = path.join(temporary, 'default');
  const native = await loadNativeTools(temporary);
  const { hooks, bridge, root, entry } = native;
  check('discovery entry exports one factory only', Object.keys(entry).join() === 'SpinDoctorQwerty');
  check('factory startup creates no engine workspace', !existsSync(process.env.SPINDOCTOR_WORKSPACE));
  check('genuine SDK definitions register exactly six native names', Object.keys(hooks.tool).length === 6 && bridge.TOOL_DEFS.every((def) => hooks.tool[def.name]));
  const sdk = await import(pathToFileURL(path.join(root, '../node_modules/@opencode-ai/plugin/dist/index.js')));
  check('actual pinned SDK is 1.19.0', JSON.parse(readFileSync(path.join(root, '../node_modules/@opencode-ai/plugin/package.json'))).version === '1.19.0');
  const z = sdk.tool.schema;
  const execute = async (name, args = {}, signal = new AbortController().signal) => hooks.tool[name].execute(args, { directory: temporary, worktree: temporary, abort: signal });
  const result = async (...args) => (await execute(...args)).metadata.result;
  const functions = await execute('spindoctor_functions');
  check('raw Markdown table is preserved with structured native metadata', functions.metadata.ok && functions.output === functions.metadata.result.markdown && functions.output.includes('Function | What it does | Command to type'));
  check('all 241 presets listed', (await result('spindoctor_list_presets')).count === 241);
  const bell = await result('spindoctor_run_script', { script: 'q.circuit new bell 2\nq.circuit add h 0\nq.circuit add cx 0 1\nq.circuit run shots 64 basis z', workspace: 'relative workspace' });
  check('relative workspace resolves against tool context and creates PDF', bell.ok && existsSync(path.join(temporary, 'relative workspace/reports')) && bell.results.some((item) => item.reports?.some((file) => file.endsWith('.pdf'))));
  const state = await result('spindoctor_run_script', { script: 'q.circuit result', workspace: 'relative workspace' });
  check('separate native calls preserve circuit state', state.ok && state.results[0].result.qubits === 2);
  writeFileSync(path.join(temporary, 'theory.txt'), 'q.circuit new localfile 1\nq.circuit add h 0\nq.circuit run shots 4000 basis z\n');
  const theory = await result('spindoctor_test_theory', { source: 'file', path: 'theory.txt', hypothesis: 'H gives half ones', prediction: 'P(1)=0.5', checks: [{ kind: 'probability', outcome: '1', expected: 0.5, tolerance: 0.05 }] });
  check('relative file resolves against tool context', theory.ok && theory.verdict === 'supported');
  check('report traversal rejected', !(await result('spindoctor_report', { name: '../outside.txt' })).ok);
  check('SDK rejects missing script', !z.object(hooks.tool.spindoctor_run_script.args).safeParse({}).success);
  check('SDK rejects numeric overrides', !z.object(hooks.tool.spindoctor_run_preset.args).safeParse({ preset_id: 'qc-001', overrides: { shots: 10 } }).success);
  check('SDK rejects invalid enum', !z.object(hooks.tool.spindoctor_functions.args).safeParse({ section: 'invalid' }).success);
  check('SDK rejects fractional limit', !z.object(hooks.tool.spindoctor_report.args).safeParse({ limit: 1.5 }).success);
  check('SDK accepts arbitrary check object properties', z.object(hooks.tool.spindoctor_test_theory.args).safeParse({ source: 'text', text: 'theory', checks: [{ kind: 'ok', command: 0, expected: true }] }).success);
  check('wrapper rejects wrong argument type', !(await result('spindoctor_run_script', [])).ok);
  check('wrapper rejects unknown keys', !(await result('spindoctor_functions', { unknown: true })).ok);
  check('wrapper rejects prototype-named unknown key', !(await result('spindoctor_functions', JSON.parse('{"__proto__":{}}'))).ok);
  check('wrapper rejects unsafe integer', !(await result('spindoctor_report', { limit: Number.MAX_SAFE_INTEGER + 1 })).ok);
  check('wrapper rejects oversized input before execution', (await result('spindoctor_run_script', { script: 'X'.repeat(9 * 1024 * 1024) })).error.includes('8 MiB'));
  check('engine failures retain structured false metadata', !(await execute('spindoctor_run_script', { script: 'q.invalid' })).metadata.ok);
  check('299 logical qubits rejected', !(await result('spindoctor_run_script', { script: 'q.circuit new over 299' })).ok);
  const ordered = await Promise.all([result('spindoctor_run_script', { script: 'q.circuit new ordered 1' }), result('spindoctor_run_script', { script: 'q.circuit add x 0\nq.circuit run shots 8 basis z\nq.circuit result' })]);
  check('concurrent native calls serialize persistent state', ordered.every((item) => item.ok) && ordered[1].results.at(-1).result.histogram[0].bitstring === '1');
  const cancelled = new AbortController(); cancelled.abort();
  check('pre-cancelled calls create no workspace', !(await result('spindoctor_run_script', { script: 'q.help', workspace: 'cancelled' }, cancelled.signal)).ok && !existsSync(path.join(temporary, 'cancelled')));
  process.env.SPINDOCTOR_PYTHON_ARGS = JSON.stringify([path.join(release, 'tests/python_fixture.py')]);
  process.env.SPINDOCTOR_TOOL_TIMEOUT_MS = '500';
  process.env.SPINDOCTOR_TEST_CHILD_MODE = 'delay';
  const pidPath = path.join(temporary, 'child.pid');
  process.env.SPINDOCTOR_TEST_CHILD_PID = pidPath;
  const timed = await result('spindoctor_functions');
  check('deterministic delayed child times out', timed.error?.includes('timed out'));
  const pid = Number(readFileSync(pidPath, 'utf8'));
  let alive = true; try { process.kill(pid, 0); } catch { alive = false; }
  check('timed-out child is closed before settlement', !alive);
  process.env.SPINDOCTOR_TOOL_TIMEOUT_MS = '600000';
  const inFlight = new AbortController();
  const pending = result('spindoctor_functions', {}, inFlight.signal);
  setTimeout(() => inFlight.abort(), 500);
  const aborted = await pending;
  check('deterministic in-flight abort is preserved', aborted.error?.includes('cancelled'));
  const abortPid = Number(readFileSync(pidPath, 'utf8'));
  alive = true; try { process.kill(abortPid, 0); } catch { alive = false; }
  check('aborted child is closed before settlement', !alive);
  process.env.SPINDOCTOR_TEST_CHILD_MODE = 'oversized';
  check('oversized child output is bounded and rejected', (await result('spindoctor_functions')).error?.includes('16 MiB'));
  delete process.env.SPINDOCTOR_PYTHON_ARGS;
  check('queue recovers after timeout abort and output limit', (await result('spindoctor_functions')).ok);
  process.env.SPINDOCTOR_PYTHON_ARGS = '"wrong"';
  check('invalid interpreter arguments fail clearly', (await result('spindoctor_functions')).error?.includes('JSON string array'));
  delete process.env.SPINDOCTOR_PYTHON_ARGS;
  process.env.SPINDOCTOR_PYTHON = path.join(temporary, 'missing-python');
  check('missing interpreter fails clearly', (await result('spindoctor_functions')).error?.includes('Python 3.8+'));
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json')));
  check('version license author and full GPL text', pkg.version === '1.1.0' && pkg.license === 'GPL-3.0-or-later' && pkg.author === 'RUSSELL PHILIP SMITHSON <russellsmithson77@outlook.com>' && readFileSync(path.join(root, 'LICENSE'), 'utf8').includes('Version 3, 29 June 2007'));
  const skill = readFileSync(path.join(root, '../skills/spindoctor-qwerty/SKILL.md'), 'utf8');
  check('native skill names six tools and requires chat confirmation', bridge.TOOL_DEFS.every((item) => skill.includes(item.name)) && skill.includes("user's confirmation") && skill.includes('verbatim'));
  const forbidden = [];
  function walk(dir) { for (const item of readdirSync(dir, { withFileTypes: true })) { if (item.name === '.git' || item.name === 'node_modules') continue; const file = path.join(dir, item.name); if (item.name === '__pycache__' || item.name.endsWith('.pyc')) forbidden.push(file); if (item.isDirectory()) walk(file); } }
  walk(root);
  check('installed payload has no Python caches', forbidden.length === 0);
  const summary = { passed: checks.filter((item) => item.pass).length, total: checks.length, checks, boundary: 'Genuine SDK1.19.0 schema objects and native callbacks with supplied context; not the full CLI loader/provider.', node: process.version };
  if (process.argv[2]) { mkdirSync(path.dirname(path.resolve(process.argv[2])), { recursive: true }); writeFileSync(process.argv[2], JSON.stringify(summary, null, 2) + '\n'); }
  console.log(JSON.stringify(summary, null, 2));
  if (summary.passed !== summary.total) process.exitCode = 1;
} finally {
  for (const [name, value] of Object.entries(saved)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  if (path.dirname(temporary) !== path.resolve(tmpdir()) || !path.basename(temporary).startsWith('spindoctor-opencode-')) throw new Error('Unsafe test cleanup path');
  rmSync(temporary, { recursive: true, force: true });
}
