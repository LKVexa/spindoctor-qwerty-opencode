// SpinDoctor Qwerty 1.1.0 - one native OpenCode plugin factory
// Copyright (C) 2026 RUSSELL PHILIP SMITHSON <russellsmithson77@outlook.com>
// SPDX-License-Identifier: GPL-3.0-or-later
// This program is free software under GPL version 3 or later; see LICENSE. WITHOUT ANY WARRANTY.
import { tool } from '@opencode-ai/plugin';
import { createTools } from '../lib/native.js';

// OpenCode discovers this file and treats every exported value as a plugin factory.
export const SpinDoctorQwerty = async (host) => {
  return createTools(host, tool);
};
