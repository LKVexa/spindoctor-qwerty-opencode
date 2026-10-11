// Genuine OpenCode CLI MCP configuration, schemas and session dispatch checks.
// Copyright (C) 2026 RUSSELL PHILIP SMITHSON <russellsmithson77@outlook.com>
// SPDX-License-Identifier: GPL-3.0-or-later
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { startCliHost } from './cli_host.mjs';

process.env.SPINDOCTOR_TEST_MODE = 'mcp';
const checks = [];
function check(name, pass, detail) { checks.push({ name, pass: Boolean(pass), ...(detail === undefined ? {} : { detail }) }); console.error(`${pass ? 'PASS' : 'FAIL'} ${name}`); }
const host = await startCliHost();
try {
  const status = await host.api('/mcp');
  check('actual CLI connects installed Python MCP server', status['spindoctor-qwerty']?.status === 'connected', status);
  const skills = await host.api('/skill');
  check('actual CLI discovers MCP skill with namespace and confirmation rules', skills.some((skill) => skill.name === 'spindoctor-qwerty' && skill.content.includes("user's confirmation") && skill.content.includes('spindoctor-qwerty_spindoctor_functions')));
  const functions = await host.tool('spindoctor_functions', {});
  check('actual MCP session preserves raw function Markdown', functions.part.state.status === 'completed' && functions.output.includes('Function | What it does | Command to type'));
  const names = ['functions', 'run_script', 'run_preset', 'list_presets', 'report', 'test_theory'].map((name) => 'spindoctor-qwerty_spindoctor_' + name);
  const schemas = host.providerRequests.find((item) => !item.completed)?.toolSchemas || [];
  check('genuine provider request includes six prefixed MCP schemas', names.every((name) => schemas.some((item) => item.function?.name === name && item.function?.parameters?.type === 'object')), schemas.map((item) => item.function?.name).filter((name) => name?.startsWith('spindoctor-qwerty_')));
  check('OpenCode MCP output boundary omits engine structuredContent from native metadata', functions.part.state.metadata?.result === undefined);
  const presets = await host.tool('spindoctor_list_presets', {});
  check('actual MCP session lists 241 presets', presets.result.count === 241);
  const circuit = await host.tool('spindoctor_run_script', { script: 'q.circuit new mcpbell 2\nq.circuit add h 0\nq.circuit add cx 0 1\nq.circuit run shots 1000 basis z' });
  check('actual MCP session creates TXT and PDF reports', circuit.result.ok && circuit.result.results.some((item) => item.reports?.some((file) => file.endsWith('.pdf'))));
  const state = await host.tool('spindoctor_run_script', { script: 'q.circuit result' });
  check('actual MCP sessions preserve workspace state', state.result.ok && state.result.results[0].result.qubits === 2);
  const report = await host.tool('spindoctor_report', {});
  check('actual MCP report dispatch reads persisted reports', report.result.ok && report.result.reports.length > 0);
  const preset = await host.tool('spindoctor_run_preset', { preset_id: 'qc-001' });
  check('actual MCP preset dispatch succeeds', preset.result.ok);
  const theory = await host.tool('spindoctor_test_theory', { source: 'chat', text: 'Confirmed test summary: H on zero gives equal outcomes.', hypothesis: 'H gives half ones', prediction: 'P(1)=0.5', script: 'q.circuit new chat 1\nq.circuit add h 0\nq.circuit run shots 4000 basis z', checks: [{ kind: 'probability', outcome: '1', expected: 0.5, tolerance: 0.05 }] });
  check('actual MCP theory dispatch creates supported PDF report', theory.result.verdict === 'supported' && theory.result.reports.some((file) => file.endsWith('.pdf')));
  const invalid = await host.tool('spindoctor_run_script', { script: 'q.invalid' });
  check('actual MCP engine failure becomes host error state with engine JSON text', invalid.part.state.status === 'error' && invalid.result.ok === false);
  check('loopback stand-in completes genuine tool requests without provider errors', host.providerErrors.length === 0 && host.providerRequests.some((item) => item.completed), host.providerErrors);
  const summary = { host: 'OpenCode 1.19.0', mode: 'mcp', node: process.version, passed: checks.filter((item) => item.pass).length, total: checks.length, checks, profile: host.home, providerRequests: host.providerRequests.length, boundary: 'Genuine Windows CLI MCP install/connection/skill/provider-schema/session dispatch. Loopback model protocol stand-in chooses tools and arguments; real Python engine executes. No real model, interactive UI, Linux or macOS session.' };
  if (process.argv[2]) { await mkdir(path.dirname(path.resolve(process.argv[2])), { recursive: true }); await writeFile(process.argv[2], JSON.stringify(summary, null, 2) + '\n'); }
  console.log(JSON.stringify(summary, null, 2));
  if (summary.passed !== summary.total) process.exitCode = 1;
} finally { await host.close(); }
