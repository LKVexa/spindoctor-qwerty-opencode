// SpinDoctor test-only MCP framing for genuine OpenCode SDK definitions
// Copyright (C) 2026 RUSSELL PHILIP SMITHSON <russellsmithson77@outlook.com>
// SPDX-License-Identifier: GPL-3.0-or-later
import readline from 'node:readline';
import { loadNativeTools } from './native_host.mjs';

const directory = process.env.SPINDOCTOR_TEST_DIRECTORY || process.cwd();
const native = await loadNativeTools(directory);
console.log = (...args) => console.error(...args);
for await (const line of readline.createInterface({ input: process.stdin })) {
  if (!line.trim()) continue;
  let request;
  try {
    request = JSON.parse(line);
    if (request.id === undefined) continue;
    let result;
    if (request.method === 'initialize') result = { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'spindoctor-opencode-native-test-bridge', version: '1.1.0' } };
    else if (request.method === 'tools/list') result = { tools: native.bridge.TOOL_DEFS.map(({ name, description, parameters }) => ({ name, description, inputSchema: parameters })) };
    else if (request.method === 'tools/call') {
      const tool = native.hooks.tool[request.params.name];
      if (!tool) throw new Error('Unknown native tool');
      const controller = new AbortController();
      const response = await tool.execute(request.params.arguments || {}, { directory, worktree: directory, abort: controller.signal });
      result = { content: [{ type: 'text', text: response.output }], structuredContent: response.metadata.result, isError: !response.metadata.ok };
    } else throw new Error('Unsupported method');
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\n');
  } catch (error) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request?.id ?? null, error: { code: -32000, message: error.message } }) + '\n'); }
}
