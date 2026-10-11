// Copyright (C) 2026 RUSSELL PHILIP SMITHSON <russellsmithson77@outlook.com>
// SPDX-License-Identifier: GPL-3.0-or-later
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function loadNativeTools(directory) {
  const root = process.env.SPINDOCTOR_PLUGIN_ROOT;
  if (!root || !path.isAbsolute(root)) throw new Error('Set SPINDOCTOR_PLUGIN_ROOT to the absolute installed payload directory.');
  const entry = await import(pathToFileURL(path.join(root, '../plugins/spindoctor-qwerty.js')));
  const values = Object.values(entry);
  if (values.length !== 1 || typeof values[0] !== 'function') throw new Error('Entry must export exactly one native plugin factory.');
  const hooks = await values[0]({ directory, worktree: directory });
  const bridge = await import(pathToFileURL(path.join(root, 'lib/bridge.js')));
  return { entry, hooks, bridge, root };
}
