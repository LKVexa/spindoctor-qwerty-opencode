// Genuine OpenCode CLI loader, discovery and native dispatch checks with a loopback stand-in.
// Copyright (C) 2026 RUSSELL PHILIP SMITHSON <russellsmithson77@outlook.com>
// SPDX-License-Identifier: GPL-3.0-or-later
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { startCliHost } from './cli_host.mjs';

const checks = [];
function check(name, pass, detail) { checks.push({ name, pass: Boolean(pass), ...(detail === undefined ? {} : { detail }) }); console.error(`${pass ? 'PASS' : 'FAIL'} ${name}`); }
const host = await startCliHost();
try {
  const ids = await host.api('/experimental/tool/ids');
  check('actual CLI loads no-SDK control plugin', ids.includes('spindoctor_test_control'));
  check('actual CLI loads documented SDK /tool import control', ids.includes('spindoctor_test_sdk_control'));
  const names = ['spindoctor_functions', 'spindoctor_run_script', 'spindoctor_run_preset', 'spindoctor_list_presets', 'spindoctor_report', 'spindoctor_test_theory'];
  check('actual CLI discovers all six native tools', names.every((name) => ids.includes(name)), ids.filter((name) => name.startsWith('spindoctor_')));
  const schemas = await host.api('/experimental/tool?provider=local&model=spindoctor-test');
  check('actual CLI publishes all six native schemas', names.every((name) => schemas.some((item) => item.id === name)), schemas.filter((item) => names.includes(item.id)).map((item) => item.id));
  const skills = await host.api('/skill');
  check('actual CLI discovers skill with confirmation rules', skills.some((skill) => skill.name === 'spindoctor-qwerty' && skill.content.includes("user's confirmation")));
  const functions = await host.tool('spindoctor_functions', {});
  check('actual session dispatch returns raw Markdown and engine metadata', functions.result.ok && functions.output === functions.result.markdown);
  const presets = await host.tool('spindoctor_list_presets', {});
  check('actual session dispatch lists 241 presets', presets.result.count === 241);
  const circuit = await host.tool('spindoctor_run_script', { script: 'q.circuit new nativebell 2\nq.circuit add h 0\nq.circuit add cx 0 1\nq.circuit run shots 1000 basis z' });
  check('actual session dispatch creates native TXT and PDF reports', circuit.result.ok && circuit.result.results.some((item) => item.reports?.some((file) => file.endsWith('.pdf'))));
  const state = await host.tool('spindoctor_run_script', { script: 'q.circuit result' });
  check('actual sessions preserve workspace state', state.result.ok && state.result.results[0].result.qubits === 2);
  const report = await host.tool('spindoctor_report', {});
  check('actual report tool dispatch returns persisted reports', report.result.ok && report.result.reports.length > 0);
  const preset = await host.tool('spindoctor_run_preset', { preset_id: 'qc-001' });
  check('actual preset tool dispatch succeeds', preset.result.ok);
  const theory = await host.tool('spindoctor_test_theory', { source: 'chat', text: 'Confirmed test summary: H on zero gives equal outcomes.', hypothesis: 'H gives half ones', prediction: 'P(1)=0.5', script: 'q.circuit new chat 1\nq.circuit add h 0\nq.circuit run shots 4000 basis z', checks: [{ kind: 'probability', outcome: '1', expected: 0.5, tolerance: 0.05 }] });
  check('actual theory tool dispatch creates supported PDF report', theory.result.verdict === 'supported' && theory.result.reports.some((file) => file.endsWith('.pdf')));
  const invalid = await host.tool('spindoctor_run_script', { script: 'q.invalid' });
  check('actual session retains engine failure metadata', invalid.result.ok === false && invalid.metadata.ok === false);
  check('stand-in receives genuine six-tool schemas without provider errors', host.providerErrors.length === 0 && host.providerRequests.some((request) => !request.completed && names.every((name) => request.schemas.includes(name))), host.providerErrors);
  const summary = { host: 'OpenCode 1.19.0', node: process.version, passed: checks.filter((item) => item.pass).length, total: checks.length, checks,
    providerRequests: host.providerRequests.length, profile: host.home, boundary: 'Genuine Windows CLI install/loader/skill/schema/session dispatch with a loopback model protocol stand-in. No real model, interactive UI, Linux or macOS session.' };
  if (process.argv[2]) { await mkdir(path.dirname(path.resolve(process.argv[2])), { recursive: true }); await writeFile(process.argv[2], JSON.stringify(summary, null, 2) + '\n'); }
  console.log(JSON.stringify(summary, null, 2));
  if (summary.passed !== summary.total) process.exitCode = 1;
} finally { await host.close(); }
