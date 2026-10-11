#!/usr/bin/env python3
# Deterministic subprocess fixture: probes run genuine Python, only tool calls are delayed or oversized.
# Copyright (C) 2026 RUSSELL PHILIP SMITHSON <russellsmithson77@outlook.com>
# SPDX-License-Identifier: GPL-3.0-or-later
import os
import subprocess
import sys
import time

if "tool" in sys.argv[1:]:
    mode = os.environ.get("SPINDOCTOR_TEST_CHILD_MODE", "delay")
    if mode == "oversized":
        sys.stdout.write("X" * (17 * 1024 * 1024))
        sys.stdout.flush()
    else:
        if os.environ.get("SPINDOCTOR_TEST_CHILD_PID"):
            with open(os.environ["SPINDOCTOR_TEST_CHILD_PID"], "w", encoding="utf-8") as stream:
                stream.write(str(os.getpid()))
        time.sleep(60)
else:
    sys.exit(subprocess.call([sys.executable] + sys.argv[1:]))
