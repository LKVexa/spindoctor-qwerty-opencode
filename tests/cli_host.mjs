// Genuine isolated OpenCode CLI plus loopback model-protocol stand-in, without an account or LLM.
// Copyright (C) 2026 RUSSELL PHILIP SMITHSON <russellsmithson77@outlook.com>
// SPDX-License-Identifier: GPL-3.0-or-later
import http from 'node:http';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const release = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
async function copyTree(source, target) {
  await mkdir(target, { recursive: true });
  for (const item of await readdir(source, { withFileTypes: true })) {
    if (item.name === '.bin' || item.isSymbolicLink()) continue;
    const from = path.join(source, item.name), to = path.join(target, item.name);
    if (item.isDirectory()) await copyTree(from, to);
    else if (item.isFile()) await copyFile(from, to);
  }
}
async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
function contentText(content) { return typeof content === 'string' ? content : Array.isArray(content) ? content.map((part) => part.text || '').join('\n') : ''; }
function sendStream(response, name, args) {
  response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
  const chunk = (delta, finish) => response.write('data: ' + JSON.stringify({ id: 'chatcmpl-spindoctor-test', object: 'chat.completion.chunk', created: 0, model: 'spindoctor-test', choices: [{ index: 0, delta, finish_reason: finish ?? null }] }) + '\n\n');
  if (name) {
    chunk({ role: 'assistant', tool_calls: [{ index: 0, id: 'call_spindoctor_test', type: 'function', function: { name, arguments: JSON.stringify(args) } }] });
    chunk({}, 'tool_calls');
  } else {
    chunk({ role: 'assistant', content: 'Local integration test completed.' });
    chunk({}, 'stop');
  }
  response.end('data: [DONE]\n\n');
}

export async function startCliHost() {
  const binary = process.env.SPINDOCTOR_OPENCODE_BINARY;
  const python = process.env.SPINDOCTOR_PYTHON;
  const mode = process.env.SPINDOCTOR_TEST_MODE || 'native';
  if (!['native', 'mcp'].includes(mode)) throw new Error('SPINDOCTOR_TEST_MODE must be native or mcp.');
  if (!binary || !path.isAbsolute(binary) || !python) throw new Error('Set SPINDOCTOR_OPENCODE_BINARY and SPINDOCTOR_PYTHON to external runtime executables.');
  const home = mkdtempSync(path.join(tmpdir(), 'spindoctor-opencode-cli-'));
  const project = path.join(home, 'project'), config = path.join(project, '.opencode');
  await mkdir(project, { recursive: true });
  for (const name of ['temp', 'data', 'config', 'state', 'cache']) await mkdir(path.join(home, name), { recursive: true });
  // Prepare the supported XDG subdirectories so native Windows startup need not create them.
  for (const name of ['data/opencode/log', 'config/opencode', 'cache/opencode', 'state/opencode']) await mkdir(path.join(home, name), { recursive: true });
  const installed = spawnSync(python, ['-B', path.join(release, 'tools/install_opencode.py'), 'install', '--project', project, '--mode', mode, '--python', python, '--workspace', path.join(home, 'workspace')], { encoding: 'utf8', windowsHide: true, env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
  if (installed.status !== 0) throw new Error(`Isolated installer failed: ${installed.stderr}`);
  if (mode === 'native' && process.env.SPINDOCTOR_OPENCODE_NODE_MODULES) await copyTree(process.env.SPINDOCTOR_OPENCODE_NODE_MODULES, path.join(config, 'node_modules'));
  await mkdir(path.join(config, 'plugins'), { recursive: true });
  await writeFile(path.join(config, 'plugins/spindoctor-test-control.js'), 'export const Control = async () => ({tool:{spindoctor_test_control:{description:"No-SDK test control",args:{},execute:async()=>({output:"control",metadata:{ok:true,result:{ok:true,control:true}}})}}});\n');
  if (mode === 'native') await writeFile(path.join(config, 'plugins/spindoctor-sdk-control.js'), "import {tool} from '@opencode-ai/plugin/tool';\nexport const Control = async () => ({tool:{spindoctor_test_sdk_control:tool({description:'Documented SDK import control',args:{},execute:async()=> 'sdk-control'})}});\n");
  const providerRequests = [];
  const providerErrors = [];
  const standin = http.createServer(async (request, response) => {
    try {
      if (request.method !== 'POST' || request.url !== '/v1/chat/completions') throw new Error('Unexpected local provider route: ' + request.url);
      const chunks = []; let bytes = 0;
      for await (const chunk of request) { bytes += chunk.length; if (bytes > 32 * 1024 * 1024) throw new Error('Provider request too large'); chunks.push(chunk); }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const messages = body.messages || [];
      let last = -1, instruction;
      for (let index = 0; index < messages.length; index++) {
        if (messages[index].role !== 'user') continue;
        const match = /\[SPINDOCTOR-TEST\]([\s\S]*?)\[\/SPINDOCTOR-TEST\]/.exec(contentText(messages[index].content));
        if (match) { last = index; instruction = JSON.parse(match[1]); }
      }
      if (!instruction) throw new Error('Missing deterministic test instruction');
      const completed = messages.slice(last + 1).some((message) => message.role === 'tool');
      const available = (body.tools || []).map((item) => item.function?.name);
      if (!completed && !available.includes(instruction.name)) throw new Error('Host tool absent from provider request: ' + instruction.name);
      providerRequests.push({ name: instruction.name, completed, schemas: available, toolSchemas: body.tools || [] });
      sendStream(response, completed ? null : instruction.name, instruction.args);
    } catch (error) { providerErrors.push(error.message); response.writeHead(400, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ error: { message: error.message } })); }
  });
  await new Promise((resolve, reject) => { standin.once('error', reject); standin.listen(0, '127.0.0.1', resolve); });
  const standinPort = standin.address().port;
  const settings = {
    model: 'local/spindoctor-test', small_model: 'local/spindoctor-test', enabled_providers: ['local'], autoupdate: false, share: 'disabled',
    provider: { local: { npm: '@ai-sdk/openai-compatible', name: 'Local integration stand-in', options: { baseURL: `http://127.0.0.1:${standinPort}/v1`, apiKey: 'test', timeout: 600000 },
      models: { 'spindoctor-test': { name: 'SpinDoctor test stand-in', tool_call: true, reasoning: false, limit: { context: 131072, output: 16384 }, modalities: { input: ['text'], output: ['text'] } } } } },
    permission: { '*': 'deny', 'spindoctor_*': 'allow', 'spindoctor-qwerty_*': 'allow' }, tool_output: { max_lines: 100000, max_bytes: 16777216 },
  };
  const settingsPath = path.join(home, 'test-opencode.json');
  await writeFile(settingsPath, JSON.stringify(settings, null, 2));
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  let logs = '';
  const environment = { ...process.env, XDG_DATA_HOME: path.join(home, 'data'), XDG_CONFIG_HOME: path.join(home, 'config'), XDG_STATE_HOME: path.join(home, 'state'), XDG_CACHE_HOME: path.join(home, 'cache'),
    OPENCODE_CONFIG: settingsPath, OPENCODE_DISABLE_AUTOUPDATE: 'true', OPENCODE_DISABLE_MODELS_FETCH: 'true', OPENCODE_DISABLE_DEFAULT_PLUGINS: 'true', OPENCODE_DISABLE_LSP_DOWNLOAD: 'true',
    TEMP: path.join(home, 'temp'), TMP: path.join(home, 'temp'), SPINDOCTOR_WORKSPACE: path.join(home, 'workspace'), PYTHONDONTWRITEBYTECODE: '1', PYTHONUTF8: '1' };
  const child = spawn(binary, ['serve', '--hostname', '127.0.0.1', '--port', String(port)], { cwd: project, env: environment, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (data) => { logs += data; }); child.stderr.on('data', (data) => { logs += data; });
  let spawnError;
  child.on('error', (error) => { spawnError = error; });
  let ready = false;
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (spawnError || child.exitCode !== null) { child.kill(); standin.close(); throw new Error(`OpenCode stopped: ${spawnError?.message || child.exitCode}\n${logs}`); }
    try { const response = await fetch(url + '/global/health', { signal: AbortSignal.timeout(1000) }); if (response.ok) { ready = true; break; } } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  if (!ready) { child.kill(); standin.close(); throw new Error('OpenCode did not start within 60 seconds. ' + logs); }
  const events = [];
  const eventAbort = new AbortController();
  const eventResponse = await fetch(url + '/global/event', { signal: eventAbort.signal });
  const eventTask = (async () => {
    try {
      let pending = '';
      const decoder = new TextDecoder();
      for await (const chunk of eventResponse.body) {
        pending += decoder.decode(chunk, { stream: true });
        let boundary;
        while ((boundary = pending.indexOf('\n\n')) !== -1) {
          const item = pending.slice(0, boundary); pending = pending.slice(boundary + 2);
          const data = item.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n');
          if (data) { try { events.push(JSON.parse(data)); } catch {} }
        }
      }
    } catch (error) { if (!eventAbort.signal.aborted) events.push({ readerError: error.message }); }
  })();
  const api = async (route, body) => {
    const target = new URL(route, url); target.searchParams.set('directory', project);
    const response = await fetch(target, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(600000) });
    const text = await response.text();
    if (!response.ok) throw new Error(`OpenCode ${route}: ${response.status} ${text.slice(0, 1500)}`);
    return text ? JSON.parse(text) : null;
  };
  return { home, project, config, mode, api, providerRequests, providerErrors, events, logs: () => logs,
    async tool(name, args) {
      const hostName = mode === 'mcp' ? 'spindoctor-qwerty_' + name : name;
      const session = await api('/session', { title: 'SpinDoctor integration test' });
      await api(`/session/${session.id}/message`, { model: { providerID: 'local', modelID: 'spindoctor-test' }, parts: [{ type: 'text', text: '[SPINDOCTOR-TEST]' + JSON.stringify({ name: hostName, args }) + '[/SPINDOCTOR-TEST]' }] });
      const history = await api(`/session/${session.id}/message`);
      const parts = history.flatMap((message) => message.parts || []).filter((part) => part.type === 'tool' && part.tool === hostName);
      const part = parts.find((item) => item.state.status === 'completed');
      if (mode === 'mcp') {
        const failed = parts.find((item) => item.state.status === 'error');
        if (!part && failed) return { result: JSON.parse(failed.state.error), output: failed.state.error, metadata: { ok: false }, part: failed };
        if (!part) throw new Error('Genuine host did not complete MCP tool: ' + JSON.stringify(parts).slice(0, 1500));
        // OpenCode preserves MCP text, but does not copy structuredContent into native metadata.
        const result = name === 'spindoctor_functions' ? { ok: true, markdown: part.state.output } : JSON.parse(part.state.output);
        return { result, output: part.state.output, metadata: { ok: result.ok }, part };
      }
      if (!part) throw new Error('Genuine host did not complete requested tool: ' + JSON.stringify(parts).slice(0, 1500));
      if (!part.state.metadata?.result || typeof part.state.metadata.ok !== 'boolean') throw new Error('Genuine native metadata missing: ' + JSON.stringify(part).slice(0, 1500));
      return { result: part.state.metadata.result, output: part.state.output, metadata: part.state.metadata, part };
    },
    async close() {
      eventAbort.abort(); await eventTask;
      const closed = new Promise((resolve) => { if (child.exitCode !== null) resolve(); else child.once('close', resolve); });
      child.kill(); await closed;
      await new Promise((resolve) => standin.close(resolve));
      await writeFile(path.join(home, 'host.log'), logs);
      await writeFile(path.join(home, 'events.json'), JSON.stringify(events, null, 2));
    },
  };
}
