# SpinDoctor Qwerty for OpenCode 1.1.0

Six native tools and a skill for SpinDoctor **3.1.2**, updated build `3.1.2-298-20261010`, with the
unchanged Python engine **1.1.0**. This is classical FP64 simulation on an ordinary computer; it
connects to no quantum hardware and claims no quantum advantage.

## Install

Use OpenCode **1.19.0** and Python **3.8+**. Compatibility with other OpenCode versions is untested.
The genuine Windows CLI MCP route passed 13/13 integration checks and the full 12/12 engine suite
with a loopback model protocol stand-in and the real Python engine. The native SDK definitions passed
component tests, but this Windows CLI could not resolve the installed SDK package even when its
files were present; native
CLI discovery and execution remain unverified. Use the [MCP installation](#alternative-mcp-route)
for the route exercised through the real CLI. See the test record for the precise boundary.
Clone this repository, then install into an existing project outside this checkout:

```sh
git clone https://github.com/LKVexa/spindoctor-qwerty-opencode
cd spindoctor-qwerty-opencode
python3 -B tools/install_opencode.py install --project <absolute-project-directory>
```

On Windows use `python`, or `py -3`, instead of `python3`. For a global installation use
`python3 -B tools/install_opencode.py install --scope global`. The global destination respects
`XDG_CONFIG_HOME`; the default is `~/.config/opencode`. `--config-dir` selects an explicit config
directory for an isolated profile. Start OpenCode in the selected project after installation.

The installer creates an owned payload, one discovery entry in `plugins/`, and a skill in
`skills/spindoctor-qwerty/`. It merges the pinned `@opencode-ai/plugin` dependency into the config
directory's package.json. OpenCode installs declared dependencies at startup. Existing unrelated
files/settings are retained; conflicting files or a different SDK pin stop installation before writes.
The entry imports the required SDK directly. Missing dependencies produce a host load error naming
the missing package; allow startup dependency installation before retrying.

To remove it, use the same destination options:

```sh
python3 -B tools/install_opencode.py uninstall --project <absolute-project-directory>
```

Uninstall removes only unchanged owned files and the dependency it added. Modified owned files stop
removal; unrelated files, other dependencies and configuration remain. Uninstall before upgrading.
The installer makes no network requests and does not start the simulator.

## Tools and reports

| Native tool | Purpose |
| --- | --- |
| `spindoctor_functions` | Raw Markdown function table and runnable examples |
| `spindoctor_run_script` | Newline-separated q.* commands |
| `spindoctor_run_preset` | One of `qc-001` through `qc-241`, with string-valued overrides |
| `spindoctor_list_presets` | List or filter all 241 presets |
| `spindoctor_report` | List/read workspace TXT reports |
| `spindoctor_test_theory` | Extract/test local files, text, confirmed chat summaries or exported chats |

Ask OpenCode to show the function table on first use. For example:

```text
q.circuit new bell 2
q.circuit add h 0
q.circuit add cx 0 1
q.circuit run shots 1000 basis z
q.circuit result
```

Reports default to `~/spindoctor-workspace`. Set `SPINDOCTOR_WORKSPACE` before starting OpenCode or
provide a per-call workspace. Native relative file and workspace paths resolve against the active tool's
`context.directory`. Outputs include absolute TXT/JSON/PDF paths and CSV where applicable. Keep
the workspace outside the plugin installation. One module serializes its calls; separate processes
should use separate workspaces. OpenCode may apply its own output truncation; full results remain
in reports, and native tool metadata retains the engine result.

The wrapper probes Python 3.8+ on first tool use. Windows tries `py -3`, then `python` and `python3`;
other platforms try `python3`, then `python`. To select an interpreter, set `SPINDOCTOR_PYTHON` to its
executable path. Optional `SPINDOCTOR_PYTHON_ARGS` is a JSON string array, such as `["-3"]` for `py`.
Executable and arguments remain separate, including paths containing spaces. Python caching is
disabled, arguments use JSON stdin without a shell, child output is bounded and cancellation follows
the host's abort signal. Calls time out after ten minutes; `SPINDOCTOR_TOOL_TIMEOUT_MS` changes it
(minimum 50 ms).

The tools cannot retrieve OpenCode attachments or read conversation history. Supply a local path or
the text. For a chat theory, have the AI summarize claims, assumptions, variables and a measurable
prediction, obtain the **user's confirmation**, then call the theory tool with the confirmed summary
and optional quoted excerpts. Reports state supported / not supported / inconclusive within simulation
limits. See [FUNCTIONS.md](FUNCTIONS.md) for the complete command reference.

## Alternative MCP route

Use this route separately from the native installation:

```sh
python3 -B tools/install_opencode.py install --mode mcp --project <absolute-project-directory>
```

The installer merges a local MCP entry into the config directory's opencode.json, using the current
installer Python executable and actual installed script path. `--python` and repeatable `--python-arg`
select another executable/argument list; for `py`, use `--python py --python-arg=-3`.
`--workspace` selects a persistent workspace. It preserves unrelated plain-JSON settings and refuses
to overwrite an existing server entry or to rewrite opencode.jsonc. Use a separate config directory
when existing JSONC must be retained. The MCP route installs the same confirmation skill and does
not install the native discovery entry or require the JavaScript SDK. OpenCode prefixes each tool
with `spindoctor-qwerty_`, for example `spindoctor-qwerty_spindoctor_functions`.
Use absolute MCP file and workspace paths; relative paths depend on the server's working directory.
OpenCode preserves MCP text output but does not copy the engine's `structuredContent` into native
tool metadata; successful engine JSON remains in that text, and engine failures become host error
states. Avoid both routes in the same profile, which would expose duplicate tools.

## Limits and verification

At most **298 logical qubits** and **59 in an entangled factor**. Dense storage needs `2^n × 16` bytes
and is also restricted by the memory budget. Wide prepared/factorized states do not allocate 2^298
amplitudes. Above 29 qubits, sampling is basis Z only; full joint analysis is limited to 16 qubits.
Folder ingestion is synchronous: 128 top-level supported files, 4 MiB per file, 128 commands per file
and 4096 characters per command. `q.folder cancel` has no background job to cancel. One tool script
allows 200 commands. `q.compile synthesize` is unavailable; Python does not reproduce OpenCL/GPU
timings or C# internal work-accounting counters. Seeded measurements have ordinary shot noise.

See [E2E_RESULTS.md](E2E_RESULTS.md) for the actual test results and remaining coverage. Tests use
external OpenCode/SDK installations; no host code or dependencies are vendored. For SDK component
checks and the engine suite, install into an isolated config directory, install its declared dependency,
set `SPINDOCTOR_PLUGIN_ROOT` to the installed payload, `SPINDOCTOR_PYTHON` to Python and TEMP/TMP
to a scratch directory, then run from this checkout:

```sh
node tests/sdk_check.mjs <results-json-path>
python3 -B tests/e2e_mcp.py --server node tests/native_bridge.mjs --examples <absolute-engine-examples-theory-directory> --out <results-json-path>
```

The native bridge invokes genuine SDK definitions as component coverage. For real CLI MCP checks,
set `SPINDOCTOR_OPENCODE_BINARY` to the external Windows CLI executable, `SPINDOCTOR_PYTHON` to
Python, and TEMP/TMP to an isolated scratch directory, then run:

```sh
node tests/cli_mcp_check.mjs <results-json-path>
```

For the engine suite through genuine CLI MCP dispatch, also set `SPINDOCTOR_TEST_MODE=mcp` and use
`tests/cli_bridge.mjs` in place of `tests/native_bridge.mjs` above. The CLI harness creates its own
project and XDG profile; its loopback model protocol stand-in chooses tool names/arguments and the
real engine executes them. It requires no account or real model. It retains the isolated profile,
host log and event stream for inspection. Native diagnostic checks are `tests/cli_check.mjs`; their
known SDK-resolution failure is recorded separately. Installer checks are
`python3 -B tests/installer_check.py <results-json-path>`.
Official contracts: [plugins](https://opencode.ai/docs/plugins/),
[custom tools](https://opencode.ai/docs/custom-tools/), [skills](https://opencode.ai/docs/skills/),
[MCP](https://opencode.ai/docs/mcp-servers/), source release
[`v1.19.0`](https://github.com/anomalyco/opencode/tree/733b2c627e5aec39cb33cc22373bdce33053ef2c).

## Author and license

Copyright (C) 2026 **RUSSELL PHILIP SMITHSON <russellsmithson77@outlook.com>**.
GNU General Public License **v3.0 or later** (`GPL-3.0-or-later`); see LICENSE, NOTICE and COPYRIGHT.
OpenCode and its SDK are separate dependencies.
