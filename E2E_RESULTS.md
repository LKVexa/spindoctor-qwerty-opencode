# OpenCode validation — 2026-10-11

Release **1.1.0**, SpinDoctor **3.1.2** build `3.1.2-298-20261010`, unchanged engine **1.1.0**.
Copyright (C) 2026 RUSSELL PHILIP SMITHSON <russellsmithson77@outlook.com>.
GPL-3.0-or-later; the complete GPL version 3 text is in LICENSE.

## Test boundary

Windows, genuine OpenCode CLI **1.19.0** from its official release, pinned SDK **1.19.0**,
Node **24.19.0**, Python **3.12.14**. The CLI release archive's SHA-256 was checked:
`17108e9448c4fdad48eb8714c4ed6f5dfc9cf86c2eb8f2ce5d02043fef806eb5`.
Official source pin: `733b2c627e5aec39cb33cc22373bdce33053ef2c`.
All project, XDG, temporary and engine workspace paths were isolated; existing profiles were retained.
No account, sign-in, real model or vendor guard changes were used.

The genuine CLI MCP tests use a loopback OpenAI-compatible protocol stand-in. It returns the requested
tool name and JSON arguments, then stops after receiving the tool result. OpenCode's own loader,
MCP client, permission handling, provider schemas and session dispatcher execute the real engine.
This covers host integration; it does not test a model's reasoning or interactive interface.

## Passed checks

| Suite | Result | What was exercised |
| --- | --- | --- |
| Genuine CLI MCP integration | **13/13** | Installed Python MCP connection, skill discovery and confirmation rules, all six prefixed provider schemas, raw Markdown table, 241 presets, script/preset/report/theory dispatch, persistent state, TXT/PDF creation and engine errors |
| Genuine CLI MCP engine E2E | **12/12**, 71.1 s | Complete engine suite below; every tool call went through genuine CLI MCP session dispatch |
| Genuine SDK component checks | **35/35** | Exact installed discovery entry's single factory; real SDK Zod definitions and six callbacks; native path/state/report handling; strict argument rejection; Python probing; serialized calls; bounds, deterministic timeout/abort child closure and queue recovery |
| SDK callback engine E2E | **12/12**, 34.4 s | Complete engine suite below, through the actual installed SDK callbacks using a test transport |
| Preserve/merge installer | **24/24** | Project paths with spaces, global/XDG selection, unrelated files/dependencies/configuration retained, preflight conflicts, modified-file uninstall rejection, record traversal rejection, MCP command/paths/settings/skill and owned removal |

The SDK component configuration used pre-staged official SDK and Zod dependencies. Native CLI attempts
also pre-staged the official dependency tree through the harness's
`SPINDOCTOR_OPENCODE_NODE_MODULES` option. This is not evidence of a clean network dependency
bootstrap by OpenCode. The MCP mode needs no JavaScript SDK dependency.

OpenCode's MCP session state retains the engine's text output but omits MCP `structuredContent` from
native metadata. The CLI test adapter parses successful JSON text and engine error JSON from actual
history state; it preserves the function table's Markdown. Adapter-derived result fields are test
framing, not a claim that OpenCode copied the engine's native metadata.

The twelve engine checks cover protocol initialization, six-tool discovery, the raw function table,
241-preset listing, a script for every command family, a **298-qubit** circuit including `mcx7`, mixed
folder ingestion, theory tests from a local file, a confirmed chat summary with quoted excerpts and
an exported chat transcript, the first 25 preset references, and report validity. Presets `qc-001`
through `qc-025` matched **20 identically with five documented engine/reference differences**.
Both engine suites each produced **255 structurally valid PDFs and 255 nonempty TXT twins**. PDF header, page,
xref, startxref and EOF checks passed. Optional `pdftotext` content inspection was unavailable;
visual PDF inspection was not performed.

## Native CLI blocker and uncompleted tests

Five genuine native CLI attempts were retained locally with host logs/event evidence. One startup
attempt failed while Bun created its isolated log directory (`EPERM`); precreating the supported XDG
directories allowed later startup. The remaining attempts reached skill discovery but could not load
the six native tools. The captured host event reported that it could not find `@opencode-ai/plugin`
from the owning configuration's discovery entry, despite the installed package's **1.19.0** metadata
and `dist/index.js` being present. A final documented SDK `/tool` import control also failed to load;
a no-SDK control plugin and the skill loaded successfully. Node loaded the same
installed SDK entry and callbacks successfully. These observations establish a Windows CLI SDK
resolution boundary; they do not establish its underlying cause. Native full-CLI tool discovery,
schema registration and execution remain **uncompleted**, while the separate genuine CLI MCP route
passed. No Bun/OpenCode runtime checks were altered.

The external configuration-symlink containment fixture was **skipped** because Windows denied creating
the test symlink (`WinError 1314`). The installer containment preflight was reviewed; the altered
ownership-record traversal test passed. Successful symlink-fixture execution is not claimed.

Also untested: a real model, interactive UI, Linux/macOS sessions, another OpenCode version, native
clean network SDK bootstrap, and retrieval of host attachments or conversation history. Those last
two are not plugin capabilities; tests supplied local files or confirmed text.

The handoff kit reports SpinDoctor 3.1.2's own suite **18/18 with three 29-qubit checks adapted to the
298 limit**, with Russell's approval to publish on that basis. That historical C# suite was not rerun
for this integration and is separate from the Python and host results above.

## Reproduce

Follow README installation instructions using an empty project outside the release checkout.
For SDK checks, install the pinned dependency in the selected config directory and set
`SPINDOCTOR_PLUGIN_ROOT` to its installed payload. Set `SPINDOCTOR_PYTHON` to the Python executable,
and TEMP/TMP to an isolated scratch directory. Run:

```sh
node tests/sdk_check.mjs <sdk-results.json>
python3 -B tests/installer_check.py <installer-results.json>
python3 -B tests/e2e_mcp.py --server node tests/native_bridge.mjs --examples <absolute-engine-examples-theory-directory> --out <sdk-e2e-results.json>
```

For genuine Windows CLI MCP checks, set `SPINDOCTOR_OPENCODE_BINARY` to the external 1.19.0 executable,
keep Python and TEMP/TMP settings, and run `node tests/cli_mcp_check.mjs <cli-mcp-results.json>`.
For the full engine suite, set `SPINDOCTOR_TEST_MODE=mcp` and substitute `tests/cli_bridge.mjs` for
the native bridge above. These harnesses create isolated projects and retain their host/event logs.
`tests/cli_check.mjs` preserves the native diagnostic route, including the documented SDK `/tool`
import control used in the fifth recorded attempt.

The release inventory contains **61 files**, including **35 engine files byte-identical** to the approved
kit. The full GPL LICENSE matches the kit, JSON and source syntax checks pass, the original 21 source
files are preserved and the strict private-path/secret scan is clean. No host binaries/dependencies or
generated reports are bundled. Publication
readback and fresh-clone testing are recorded independently after publishing; this file reports the
prepublication checks.
