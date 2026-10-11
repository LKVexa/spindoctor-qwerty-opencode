---
name: spindoctor-qwerty
description: Run SpinDoctor classical circuits, show its complete function table, use 241 presets, and test theories from local files, text or confirmed chat summaries.
license: GPL-3.0-or-later
metadata:
  author: RUSSELL PHILIP SMITHSON
  version: "1.1.0"
---

# SpinDoctor Qwerty 1.1.0 for OpenCode

Copyright (C) 2026 RUSSELL PHILIP SMITHSON <russellsmithson77@outlook.com>.
This is classical FP64 simulation on this computer. It is not quantum hardware and claims no quantum advantage.

On first use, or when the user asks what this plugin can do or asks for help/functions, call
`spindoctor_functions` and show the returned Markdown table **verbatim**. Its columns are
Function | What it does | Command to type. `section="all"` also includes the 241 presets.

The six tools are listed below. Native installation uses these names directly. With the separate
MCP installation, OpenCode prefixes each name with `spindoctor-qwerty_`, for example
`spindoctor-qwerty_spindoctor_functions`. Use the actual names advertised by the current host.

| Tool | Use |
| --- | --- |
| `spindoctor_functions` | Complete command-family/gate/tool/preset function table |
| `spindoctor_run_script` | Newline-separated q.* commands, at most 200 per call |
| `spindoctor_run_preset` | `qc-001` through `qc-241`; overrides are string-valued |
| `spindoctor_list_presets` | List or filter the presets |
| `spindoctor_report` | List or read workspace TXT reports |
| `spindoctor_test_theory` | Extract/test a file, text or confirmed chat theory; write TXT/JSON/PDF |

For a theory from chat, summarize the claims, assumptions, variables and measurable prediction, then
obtain the **user's confirmation** before running the test. Send that confirmed summary with
`source="chat"`, optional quoted `excerpts`, `hypothesis`, `prediction`, `script` and machine `checks`.
Report supported / not supported / inconclusive with the simulator's limits. The plugin **cannot**
read conversation history or retrieve OpenCode attachments itself. Host attachments need a local
file path or pasted text. Use `action="extract"` first when the theory needs interpretation.

The native wrapper resolves relative file and workspace paths against the active tool
`context.directory`. Use absolute file and workspace paths with MCP; its relative paths depend on
the server's working directory. Persistent reports default to
`~/spindoctor-workspace`; `SPINDOCTOR_WORKSPACE` or a per-call workspace changes it. Keep outputs
outside the installed plugin. Separate processes should use separate workspaces.

The engine supports 298 logical qubits and at most 59 in an entangled factor. Dense storage needs
2^n × 16 bytes and is also memory-limited. Above 29 qubits, prepared-factor sampling is basis Z only;
full joint analysis is limited to 16 qubits. `mcx7` has seven controls and one target. Folder ingestion
is synchronous: up to 128 top-level supported files, 4 MiB each, 128 commands per file and 4096
characters per command. `q.folder cancel` has no background job to cancel. `q.compile synthesize`
is unavailable. This is SpinDoctor 3.1.2 update 3.1.2-298-20261010, engine 1.1.0.

Use the tools advertised by the selected installation mode. A CLI fallback is the installed payload's
`engine/scripts/spindoctor_cli.py`; resolve its absolute path and invoke Python with `-B`.
The optional MCP installation is a separate alternative with the same skill and confirmation rules.
Do not install both routes in the same profile.
