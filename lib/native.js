// SpinDoctor Qwerty 1.1.0 - native definitions using the owning config's SDK
// Copyright (C) 2026 RUSSELL PHILIP SMITHSON <russellsmithson77@outlook.com>
// SPDX-License-Identifier: GPL-3.0-or-later
// This program is free software under GPL version 3 or later; see LICENSE. WITHOUT ANY WARRANTY.
import { TOOL_DEFS, callEngine, nativeResult } from './bridge.js';

export async function createTools(host, tool) {
  const z = tool.schema;
  function convert(schema) {
    let result;
    if (schema.enum) result = z.enum(schema.enum);
    else if (schema.type === 'string') result = z.string();
    else if (schema.type === 'integer') result = z.number().int().safe();
    else if (schema.type === 'boolean') result = z.boolean();
    else if (schema.type === 'array') result = z.array(convert(schema.items || {}));
    else if (schema.type === 'object') {
      if (schema.properties) {
        const shape = Object.fromEntries(Object.entries(schema.properties).map(([name, child]) => [name, (schema.required || []).includes(name) ? convert(child) : convert(child).optional()]));
        result = schema.additionalProperties === false ? z.object(shape).strict() : z.object(shape).passthrough();
      } else result = z.record(z.string(), typeof schema.additionalProperties === 'object' ? convert(schema.additionalProperties) : z.unknown());
    } else result = z.unknown();
    return schema.description ? result.describe(schema.description) : result;
  }
  return { tool: Object.fromEntries(TOOL_DEFS.map((def) => {
    const args = Object.fromEntries(Object.entries(def.parameters.properties).map(([name, schema]) => [name, (def.parameters.required || []).includes(name) ? convert(schema) : convert(schema).optional()]));
    return [def.name, tool({ description: def.description, args, async execute(inputs, context) {
      return nativeResult(def.name, await callEngine(def.name, inputs, { ...context, directory: context?.directory || host.directory }));
    } })];
  })) };
}
