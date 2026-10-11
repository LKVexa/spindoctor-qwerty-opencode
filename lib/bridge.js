// SpinDoctor Qwerty 1.1.0 - OpenCode Python bridge
// Copyright (C) 2026 RUSSELL PHILIP SMITHSON <russellsmithson77@outlook.com>
// SPDX-License-Identifier: GPL-3.0-or-later
// This program is free software under GPL version 3 or later; see LICENSE. WITHOUT ANY WARRANTY.
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const TOOL_DEFS = JSON.parse(readFileSync(new URL('./tools.json', import.meta.url), 'utf8'));
const MAX_INPUT = 8 * 1024 * 1024;
const MAX_OUTPUT = 16 * 1024 * 1024;
const MAX_ERROR = 128 * 1024;
let queue = Promise.resolve();
let interpreter;

function invalid(schema, value, at = 'arguments') {
  const type = schema.type;
  if (type === 'object' && (!value || typeof value !== 'object' || Array.isArray(value))) return `${at} must be an object.`;
  if (type === 'array' && !Array.isArray(value)) return `${at} must be an array.`;
  if (type === 'string' && typeof value !== 'string') return `${at} must be a string.`;
  if (type === 'boolean' && typeof value !== 'boolean') return `${at} must be a boolean.`;
  if (type === 'integer' && !Number.isSafeInteger(value)) return `${at} must be an integer.`;
  if (schema.enum && !schema.enum.includes(value)) return `${at} must be one of ${schema.enum.join(', ')}.`;
  if (type === 'object') {
    for (const key of schema.required || []) if (!Object.hasOwn(value, key)) return `${at}.${key} is required.`;
    for (const [key, item] of Object.entries(value)) {
      const child = schema.properties && Object.hasOwn(schema.properties, key) ? schema.properties[key] : schema.additionalProperties;
      if (child === false) return `${at}.${key} is not supported.`;
      if (child && typeof child === 'object') { const error = invalid(child, item, `${at}.${key}`); if (error) return error; }
    }
  }
  if (type === 'array' && schema.items) for (let i = 0; i < value.length; i++) { const error = invalid(schema.items, value[i], `${at}[${i}]`); if (error) return error; }
  return null;
}

function pythonCommand() {
  const explicit = process.env.SPINDOCTOR_PYTHON;
  const key = `${explicit || ''}\0${process.env.SPINDOCTOR_PYTHON_ARGS || ''}`;
  if (interpreter?.key === key) return interpreter.command;
  let args = [];
  if (process.env.SPINDOCTOR_PYTHON_ARGS) {
    args = JSON.parse(process.env.SPINDOCTOR_PYTHON_ARGS);
    if (!Array.isArray(args) || args.some((item) => typeof item !== 'string')) throw new Error('SPINDOCTOR_PYTHON_ARGS must be a JSON string array.');
  }
  const choices = explicit ? [[explicit, args]] : process.platform === 'win32' ? [['py', ['-3']], ['python', []], ['python3', []]] : [['python3', []], ['python', []]];
  for (const [executable, prefix] of choices) {
    const probe = spawnSync(executable, [...prefix, '-B', '-c', 'import sys;print("SPINDOCTOR-PYTHON",sys.version_info.major,sys.version_info.minor)'], {
      encoding: 'utf8', shell: false, windowsHide: true, timeout: 5000, maxBuffer: 65536,
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1', PYTHONUTF8: '1' },
    });
    const version = /SPINDOCTOR-PYTHON (\d+) (\d+)/.exec(probe.stdout || '');
    if (!probe.error && probe.status === 0 && version && Number(version[1]) === 3 && Number(version[2]) >= 8) {
      const command = { executable, args: prefix };
      interpreter = { key, command }; return command;
    }
  }
  throw new Error('Python 3.8+ could not start. Set SPINDOCTOR_PYTHON to a working executable; optional SPINDOCTOR_PYTHON_ARGS is a JSON argument array.');
}

function executePython(name, args, context) {
  return new Promise((resolve) => {
    const signal = context?.abort;
    if (signal?.aborted) { resolve({ ok: false, error: 'SpinDoctor tool call was cancelled.' }); return; }
    let command;
    try { command = pythonCommand(); } catch (error) { resolve({ ok: false, error: error.message }); return; }
    const cwd = context?.directory && path.isAbsolute(context.directory) ? context.directory : ROOT;
    const configured = Number(process.env.SPINDOCTOR_TOOL_TIMEOUT_MS || 600000);
    const timeout = Number.isFinite(configured) && configured >= 50 ? configured : 600000;
    let child, timer, stopped, settled = false, out = [], err = [], outBytes = 0, errBytes = 0;
    const finish = (result) => { if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort); resolve(result); };
    const stop = (message) => { if (settled || stopped) return; stopped = message; try { child.kill(); } catch (error) { finish({ ok: false, error: `${message} ${error.message}` }); } };
    const abort = () => stop('SpinDoctor tool call was cancelled.');
    try {
      child = spawn(command.executable, [...command.args, '-B', path.join(ROOT, 'engine/scripts/spindoctor_cli.py'), 'tool', name], {
        cwd, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, shell: false,
        env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1', PYTHONUTF8: '1' },
      });
    } catch (error) { finish({ ok: false, error: `Could not start Python: ${error.message}` }); return; }
    signal?.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => stop(`SpinDoctor tool call timed out after ${timeout} ms.`), timeout);
    child.stdout.on('data', (data) => { outBytes += data.length; if (outBytes > MAX_OUTPUT) stop('SpinDoctor output exceeded 16 MiB.'); else out.push(data); });
    child.stderr.on('data', (data) => { errBytes += data.length; if (errBytes <= MAX_ERROR) err.push(data); });
    child.stdin.on('error', (error) => { if (!settled && !stopped && error.code !== 'EPIPE') stop(`Could not send tool arguments: ${error.message}`); });
    child.on('error', (error) => finish({ ok: false, error: `Could not start Python: ${error.message}` }));
    child.on('close', (code) => {
      if (stopped) { finish({ ok: false, error: stopped }); return; }
      try {
        const result = JSON.parse(Buffer.concat(out).toString('utf8').trim());
        if (!result || typeof result !== 'object' || Array.isArray(result) || typeof result.ok !== 'boolean') throw new Error('missing boolean ok');
        finish(code !== 0 && result.ok ? { ok: false, error: `Python exited with code ${code} after reporting success.` } : result);
      } catch { finish({ ok: false, error: Buffer.concat(err).toString('utf8').trim() || `Python exited with code ${code}; invalid tool result.` }); }
    });
    child.stdin.end(JSON.stringify(args));
  });
}

export async function callEngine(name, args = {}, context = {}) {
  const def = TOOL_DEFS.find((item) => item.name === name);
  if (!def) return { ok: false, error: `Unknown SpinDoctor tool: ${name}` };
  const error = invalid(def.parameters, args);
  if (error) return { ok: false, error };
  let payload;
  try { payload = JSON.stringify(args); } catch (failure) { return { ok: false, error: `Arguments must be JSON: ${failure.message}` }; }
  if (Buffer.byteLength(payload) > MAX_INPUT) return { ok: false, error: 'Tool arguments exceeded 8 MiB.' };
  const inputs = JSON.parse(payload);
  for (const field of ['workspace', 'path']) if (inputs[field] && !path.isAbsolute(inputs[field])) {
    if (!context.directory || !path.isAbsolute(context.directory)) return { ok: false, error: `${field} needs an absolute path or a host directory context.` };
    inputs[field] = path.resolve(context.directory, inputs[field]);
  }
  if (!inputs.workspace && process.env.SPINDOCTOR_WORKSPACE && !path.isAbsolute(process.env.SPINDOCTOR_WORKSPACE)) {
    if (!context.directory || !path.isAbsolute(context.directory)) return { ok: false, error: 'A relative SPINDOCTOR_WORKSPACE needs the host directory context.' };
    inputs.workspace = path.resolve(context.directory, process.env.SPINDOCTOR_WORKSPACE);
  }
  const run = queue.then(() => executePython(name, inputs, context));
  queue = run.then(() => undefined, () => undefined);
  try { return await run; } catch (failure) { return { ok: false, error: failure.message }; }
}

export function nativeResult(name, result) {
  return { title: name, output: result.ok && typeof result.markdown === 'string' ? result.markdown : JSON.stringify(result, null, 2), metadata: { ok: result.ok === true, result } };
}
