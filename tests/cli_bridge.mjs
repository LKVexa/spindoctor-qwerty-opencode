// Test-only MCP framing around genuine OpenCode CLI session dispatch.
// Copyright (C) 2026 RUSSELL PHILIP SMITHSON <russellsmithson77@outlook.com>
// SPDX-License-Identifier: GPL-3.0-or-later
import readline from 'node:readline';
import { readFile } from 'node:fs/promises';
import { startCliHost } from './cli_host.mjs';

console.log = (...args) => console.error(...args);
const defs = JSON.parse(await readFile(new URL('../lib/tools.json', import.meta.url), 'utf8'));
const host = await startCliHost();
try {
  for await (const line of readline.createInterface({ input: process.stdin })) {
    if (!line.trim()) continue;
    let request;
    try {
      request = JSON.parse(line);
      if (request.id === undefined) continue;
      let result;
      if (request.method === 'initialize') result = { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'spindoctor-opencode-cli-test-bridge', version: '1.1.0' } };
      else if (request.method === 'tools/list') {
        if (host.mode === 'mcp') {
          const status = await host.api('/mcp');
          if (status['spindoctor-qwerty']?.status !== 'connected') throw new Error('Actual CLI MCP server is not connected: ' + JSON.stringify(status));
          // A genuine session request must advertise all six MCP schemas before this adapter lists them.
          await host.tool('spindoctor_functions', {});
          const advertised = host.providerRequests.find((item) => !item.completed)?.toolSchemas || [];
          result = { tools: defs.filter((def) => advertised.some((item) => item.function?.name === 'spindoctor-qwerty_' + def.name)).map(({ name, description, parameters }) => ({ name, description, inputSchema: parameters })) };
        } else {
          const ids = await host.api('/experimental/tool/ids');
          result = { tools: defs.filter((def) => ids.includes(def.name)).map(({ name, description, parameters }) => ({ name, description, inputSchema: parameters })) };
        }
      } else if (request.method === 'tools/call') {
        const response = await host.tool(request.params.name, request.params.arguments || {});
        result = { content: [{ type: 'text', text: response.output }], structuredContent: response.result, isError: !response.metadata.ok };
      } else throw new Error('Unsupported method');
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\n');
    } catch (error) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request?.id ?? null, error: { code: -32000, message: error.message } }) + '\n'); }
  }
} finally { await host.close(); }
